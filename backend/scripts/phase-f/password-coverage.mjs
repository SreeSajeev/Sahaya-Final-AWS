#!/usr/bin/env node
/**
 * Phase F password coverage audit — TEST PostgreSQL users only.
 * Does NOT print password hashes or secrets. Optionally verifies login for hash holders
 * when AUTH_SET_PASSWORD matches (bootstrap samples only).
 */
import "dotenv/config";
import { prisma } from "../../src/db/prisma.js";
import {
  loadCreds,
  login,
  redactEmail,
  writeJson,
  ensureOutDir,
} from "./lib.mjs";

async function main() {
  ensureOutDir();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      isActive: true,
      approvalStatus: true,
      organisationId: true,
      passwordHash: true,
      passwordChangedAt: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  const creds = (() => {
    try {
      return loadCreds();
    } catch {
      return { password: null, emails: {} };
    }
  })();

  const rows = [];
  for (const u of users) {
    const hasPassword = Boolean(u.passwordHash);
    const algorithm = u.passwordHash?.startsWith("$argon2id$")
      ? "argon2id"
      : u.passwordHash
        ? "other"
        : null;
    const active =
      u.isActive !== false && (u.approvalStatus == null || u.approvalStatus === "approved");
    let loginProbe = "skipped";
    const isBootstrap = Object.values(creds.emails || {}).includes(u.email);
    if (active && hasPassword && isBootstrap && creds.password) {
      await new Promise((r) => setTimeout(r, 400));
      const sess = await login(u.email, creds.password);
      loginProbe = sess.status === 200 && sess.accessToken ? "ok" : `fail:${sess.status}`;
    } else if (active && !hasPassword) {
      loginProbe = "needs_migration";
    } else if (!active) {
      loginProbe = "inactive_or_unapproved";
    } else if (active && hasPassword && !isBootstrap) {
      loginProbe = "has_hash_unverified_password";
    }

    rows.push({
      email: redactEmail(u.email),
      role: u.role,
      org: u.organisationId ? "set" : "null",
      isActive: u.isActive,
      approvalStatus: u.approvalStatus,
      hasPassword,
      algorithm,
      passwordChangedAt: u.passwordChangedAt,
      loginProbe,
      classification: !active
        ? "inactive_or_pending"
        : hasPassword
          ? isBootstrap
            ? "active_bootstrap_verified_or_attempted"
            : "active_with_hash"
          : "active_missing_password",
    });
  }

  const total = rows.length;
  const withHash = rows.filter((r) => r.hasPassword).length;
  const active = rows.filter(
    (r) => r.isActive !== false && (r.approvalStatus == null || r.approvalStatus === "approved")
  );
  const activeMissing = active.filter((r) => !r.hasPassword);
  const activeWithHash = active.filter((r) => r.hasPassword);
  const verifiedOk = rows.filter((r) => r.loginProbe === "ok").length;

  const migrationPlan = {
    steps: [
      "Inventory complete: classify inactive/pending vs active users needing password_hash.",
      "For each active_missing_password: issue controlled password set via set-test-password.js or admin provision (TEST only).",
      "Revoke all auth_sessions after password set (already done by set-test-password).",
      "Verify login per role batch; do not email real credentials in chat/logs.",
      "Remove or deactivate orphan test accounts that are unused.",
      "Production cutover: require password set / invite flow before first login; never copy TEST hashes to prod.",
    ],
    activeMissingCount: activeMissing.length,
    recommendedBatchSize: 5,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      users: total,
      withPasswordHash: withHash,
      withoutPasswordHash: total - withHash,
      coveragePct: total ? Number(((withHash / total) * 100).toFixed(1)) : 0,
      activeUsers: active.length,
      activeWithHash: activeWithHash.length,
      activeMissingPassword: activeMissing.length,
      bootstrapLoginOk: verifiedOk,
    },
    byRole: {},
    rows,
    migrationPlan,
  };

  for (const r of rows) {
    const bucket = (report.byRole[r.role] ||= {
      total: 0,
      withHash: 0,
      activeMissing: 0,
    });
    bucket.total += 1;
    if (r.hasPassword) bucket.withHash += 1;
    if (r.classification === "active_missing_password") bucket.activeMissing += 1;
  }

  const out = writeJson("password-coverage.json", report);
  console.log(
    JSON.stringify({
      event: "password_coverage_done",
      out,
      totals: report.totals,
      byRole: report.byRole,
    })
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
