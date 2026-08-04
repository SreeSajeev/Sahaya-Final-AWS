#!/usr/bin/env node
/**
 * Phase F.1 — READ-ONLY local-auth account classification (34 users).
 * Never prints password hashes or secrets.
 */
import "dotenv/config";
import { prisma } from "../../src/db/prisma.js";
import { redactEmail, writeJson, ensureOutDir, loadCreds } from "./lib.mjs";

function classify(u, bootstrapEmails) {
  const hasPassword = Boolean(u.passwordHash);
  const approved = u.approvalStatus == null || u.approvalStatus === "approved";
  const active = u.isActive !== false && approved;
  const email = (u.email || "").toLowerCase();
  const isBootstrap = bootstrapEmails.has(email);
  const looksTest =
    /e2e|phase.?f|test|dummy|example\.com$/i.test(email) ||
    /E2E_TEST|PHASE_F/i.test(u.name || "");

  if (!active && !approved) {
    return {
      class: "DISABLED",
      reason: `inactive_or_approval=${u.approvalStatus || "n/a"} isActive=${u.isActive}`,
    };
  }
  if (!active) {
    return { class: "DISABLED", reason: "is_active_false" };
  }
  if (looksTest) {
    return {
      class: hasPassword ? "TEST_ACCOUNT" : "TEST_ACCOUNT",
      reason: "email_or_name_test_pattern",
      needsLocalAuth: hasPassword || true,
    };
  }
  if (hasPassword) {
    return {
      class: isBootstrap ? "ACTIVE_LOCAL_AUTH_READY" : "ACTIVE_LOCAL_AUTH_READY",
      reason: isBootstrap ? "bootstrap_verified_sample" : "has_argon2_or_hash",
      algorithm: u.passwordHash?.startsWith("$argon2id$") ? "argon2id" : "other",
    };
  }
  // Active, no password — legacy import from pre-local-auth era
  return {
    class: "ACTIVE_PASSWORD_MISSING",
    reason: "null_password_hash_legacy_or_never_set",
  };
}

async function main() {
  ensureOutDir();
  let bootstrapEmails = new Set();
  try {
    const c = loadCreds();
    bootstrapEmails = new Set(
      Object.values(c.emails || [])
        .filter(Boolean)
        .map((e) => String(e).toLowerCase())
    );
  } catch {
    /* creds optional for classification */
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
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

  const rows = users.map((u) => {
    const c = classify(u, bootstrapEmails);
    return {
      id: u.id,
      email: redactEmail(u.email),
      role: u.role,
      orgSet: Boolean(u.organisationId),
      isActive: u.isActive,
      approvalStatus: u.approvalStatus,
      hasPassword: Boolean(u.passwordHash),
      passwordChangedAt: u.passwordChangedAt,
      createdAt: u.createdAt,
      classification: c.class,
      reason: c.reason,
      algorithm: c.algorithm || null,
    };
  });

  const counts = {};
  for (const r of rows) {
    counts[r.classification] = (counts[r.classification] || 0) + 1;
  }

  const activeMissing = rows.filter((r) => r.classification === "ACTIVE_PASSWORD_MISSING");
  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    totals: {
      users: rows.length,
      ...counts,
      withPasswordHash: rows.filter((r) => r.hasPassword).length,
    },
    whyOnlyFourHavePasswords: [
      "Phase D bootstrap_role_samples set password_hash for exactly one user per role (4 roles).",
      "Remaining users were imported/created without local password_hash (legacy Supabase Auth era).",
      "Pre-F.1 forgotPassword skipped null password_hash users; F.1 reuses PasswordResetToken for first-login setup (DRY_RUN + optional TEST capture).",
    ],
    migrationStrategy: {
      prefer: "D_reuse_password_reset_token_for_first_login",
      mechanism: "PasswordResetToken (opaque random, hashed at rest, expiring, single-use) via forgot-password when password_hash IS NULL",
      massMutation: false,
      realEmailSms: false,
    },
    migrationEligibleActiveMissing: activeMissing.length,
    byRoleMissing: {},
    rows,
  };
  for (const r of activeMissing) {
    report.byRoleMissing[r.role] = (report.byRoleMissing[r.role] || 0) + 1;
  }

  const out = writeJson("account-classification.json", report);
  console.log(
    JSON.stringify({
      event: "account_audit_done",
      out,
      totals: report.totals,
      byRoleMissing: report.byRoleMissing,
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
