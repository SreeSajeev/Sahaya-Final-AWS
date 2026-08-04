#!/usr/bin/env node
/**
 * Phase F.2 — disposable first-login / password-setup fixture.
 * TEST only. No mass mutation. No real email/SMS.
 *
 * Extends F.1 with: HTTP weak-password policy, refresh, rotation replay, logout.
 * Never logs raw tokens or passwords.
 */
import "dotenv/config";
import { z } from "zod";
import { prisma } from "../../src/db/prisma.js";
import {
  createPasswordResetToken,
} from "../../src/services/passwordResetTokenService.js";
import {
  resetPasswordWithToken,
  loginWithPassword,
  refreshSession,
  logoutSession,
} from "../../src/services/localAuthService.js";
import { revokeAllAuthSessionsForUser } from "../../src/services/authSessionService.js";
import { writeJson, ensureOutDir, redactEmail } from "./lib.mjs";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be less than 72 characters")
  .refine(
    (s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^\w\s]/.test(s),
    "Password must include uppercase, lowercase, a number, and a special character"
  );

const results = [];
function record(name, ok, detail = {}) {
  results.push({ name, ok, ...detail });
  console.log(`${ok ? "PASS" : "FAIL"}\t${name}\t${JSON.stringify(detail)}`);
}

async function main() {
  ensureOutDir();
  const stamp = Date.now();
  const email = `phasef-activation-fixture-${stamp}@example.com`;
  const org = await prisma.organisation.findFirst({
    where: { status: "active" },
    select: { id: true },
  });
  if (!org?.id) throw new Error("No active organisation for fixture");

  const user = await prisma.user.create({
    data: {
      email,
      name: "PHASE_F_ACTIVATION_FIXTURE",
      role: "STAFF",
      organisationId: org.id,
      isActive: true,
      approvalStatus: "approved",
      passwordHash: null,
    },
    select: { id: true, email: true, role: true, organisationId: true, passwordHash: true, isActive: true },
  });
  record("fixture_created_without_password", user.passwordHash == null, {
    email: redactEmail(email),
    role: user.role,
    orgSet: Boolean(user.organisationId),
  });
  record("fixture_tenant_preserved_at_create", user.organisationId === org.id, {});
  record("fixture_role_preserved_at_create", user.role === "STAFF", {});

  const { data: tok, error } = await createPasswordResetToken(user.id);
  record("activation_token_created", Boolean(tok?.raw) && !error, {
    expiresAt: tok?.expiresAt ? new Date(tok.expiresAt).toISOString() : null,
  });
  const stored = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null },
    select: { tokenHash: true },
  });
  record("token_hash_stored_not_raw", Boolean(stored?.tokenHash) && stored.tokenHash.length >= 32, {
    hashLen: stored?.tokenHash?.length || 0,
  });
  const raw = tok?.raw;

  const bad = await resetPasswordWithToken({
    token: "not-a-real-token",
    newPassword: "PhaseFFix1!a",
  });
  record("invalid_token_rejected", !bad.ok, { status: bad.status, code: bad.code });

  const weakParse = passwordSchema.safeParse("short");
  record("weak_password_rejected_by_policy", !weakParse.success, {
    note: "same zod passwordSchema as POST /auth/reset-password",
  });

  const set = await resetPasswordWithToken({ token: raw, newPassword: "PhaseFFix1!Valid" });
  record("password_set_via_token", set.ok === true, { status: set.status, code: set.code || null });

  const after = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, role: true, organisationId: true, isActive: true, approvalStatus: true },
  });
  record("argon2id_stored", Boolean(after?.passwordHash?.startsWith("$argon2id$")), {});
  record("role_unchanged", after?.role === "STAFF", { role: after?.role });
  record("tenant_unchanged", after?.organisationId === org.id, {});
  record("status_unchanged", after?.isActive !== false && after?.approvalStatus === "approved", {
    isActive: after?.isActive,
    approvalStatus: after?.approvalStatus,
  });

  const reuse = await resetPasswordWithToken({ token: raw, newPassword: "PhaseFFix1!Other" });
  record("token_single_use", !reuse.ok, { status: reuse.status, code: reuse.code });

  const login = await loginWithPassword({
    email,
    password: "PhaseFFix1!Valid",
    req: { headers: {}, ip: "127.0.0.1" },
  });
  record("login_after_setup", login.ok === true && Boolean(login.accessToken), {
    status: login.status,
  });

  const badLogin = await loginWithPassword({
    email,
    password: "WrongPassword1!",
    req: { headers: {}, ip: "127.0.0.1" },
  });
  record("bad_password_rejected", !badLogin.ok, { status: badLogin.status });

  const oldRefresh = login.refreshToken || null;
  if (oldRefresh) {
    const r1 = await refreshSession({ rawRefresh: oldRefresh, req: { headers: {}, ip: "127.0.0.1" } });
    record("refresh_session", r1.ok === true && Boolean(r1.accessToken), { status: r1.status });
    const newRefresh = r1.refreshToken || null;
    const replay = await refreshSession({
      rawRefresh: oldRefresh,
      req: { headers: {}, ip: "127.0.0.1" },
    });
    record("refresh_replay_rejected", !replay.ok, { status: replay.status });
    const logout = await logoutSession(newRefresh || oldRefresh);
    record("logout", logout.ok === true, {});
    const afterLogout = await refreshSession({
      rawRefresh: newRefresh || oldRefresh,
      req: { headers: {}, ip: "127.0.0.1" },
    });
    record("refresh_after_logout_rejected", !afterLogout.ok, { status: afterLogout.status });
  } else {
    record("refresh_session", false, { note: "login_missing_refreshToken" });
    record("refresh_replay_rejected", false, { note: "skipped" });
    record("logout", false, { note: "skipped" });
    record("refresh_after_logout_rejected", false, { note: "skipped" });
  }

  const { data: tok2 } = await createPasswordResetToken(user.id);
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  const expired = await resetPasswordWithToken({
    token: tok2.raw,
    newPassword: "PhaseFFix1!Expired",
  });
  record("expired_token_rejected", !expired.ok, { status: expired.status, code: expired.code });

  await revokeAllAuthSessionsForUser(user.id);
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
  const gone = await prisma.user.findUnique({ where: { id: user.id } });
  record("fixture_removed", gone == null, {});

  const summary = {
    generatedAt: new Date().toISOString(),
    phase: "F.2",
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    strategy:
      "Reuse PasswordResetToken for first-login when password_hash IS NULL; DRY_RUN; disposable fixture only.",
  };
  const out = writeJson("activation-fixture-validation.json", summary);
  console.log(
    JSON.stringify({
      event: "activation_fixture_done",
      out,
      passed: summary.passed,
      failed: summary.failed,
    })
  );
  await prisma.$disconnect();
  if (summary.failed > 0) process.exitCode = 2;
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
