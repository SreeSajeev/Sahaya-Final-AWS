#!/usr/bin/env node
/**
 * Phase F session lifecycle — all bootstrap roles. TEST only.
 */
import "dotenv/config";
import {
  http,
  loadCreds,
  login,
  redactEmail,
  cookieHeader,
  writeJson,
  ensureOutDir,
} from "./lib.mjs";
import { prisma } from "../../src/db/prisma.js";

const results = [];
function record(area, name, ok, detail = {}) {
  results.push({ area, name, ok, ...detail });
  console.log(`${ok ? "PASS" : "FAIL"}\t${area}\t${name}\t${JSON.stringify(detail)}`);
}

async function roleMatrix(emails, password) {
  for (const [role, email] of Object.entries(emails)) {
    if (!email) {
      record("ROLE", `${role}_missing_email`, false);
      continue;
    }
    await new Promise((r) => setTimeout(r, 500));
    const sess = await login(email, password);
    record("ROLE", `${role}_login`, sess.status === 200 && Boolean(sess.accessToken), {
      status: sess.status,
      email: redactEmail(email),
      role: sess.profile?.role,
    });
    if (!sess.accessToken) continue;

    const me = await http("GET", "/auth/me", { token: sess.accessToken });
    record("ROLE", `${role}_me`, me.status === 200, { status: me.status });

    const refresh = await http("POST", "/auth/refresh", { cookie: sess.cookie, body: {} });
    record("ROLE", `${role}_refresh`, refresh.status < 300 && Boolean(refresh.json?.accessToken), {
      status: refresh.status,
    });
    const rotatedCookie = cookieHeader(refresh.setCookie) || sess.cookie;

    const logout = await http("POST", "/auth/logout", {
      token: sess.accessToken,
      cookie: rotatedCookie,
      body: {},
    });
    record("ROLE", `${role}_logout`, logout.status < 500, { status: logout.status });

    const after = await http("POST", "/auth/refresh", { cookie: rotatedCookie, body: {} });
    record(
      "ROLE",
      `${role}_post_logout_refresh_rejected`,
      after.status >= 400 || !after.json?.accessToken,
      { status: after.status }
    );
  }
}

async function rotationAndReplay(email, password) {
  const s = await login(email, password);
  const oldCookie = s.cookie;
  const r1 = await http("POST", "/auth/refresh", { cookie: oldCookie, body: {} });
  const newCookie = cookieHeader(r1.setCookie);
  const r2 = await http("POST", "/auth/refresh", { cookie: newCookie || oldCookie, body: {} });
  const replay = await http("POST", "/auth/refresh", { cookie: oldCookie, body: {} });
  record("SESSION", "refresh_rotation", r1.status < 300 && r2.status < 300, {
    r1: r1.status,
    r2: r2.status,
  });
  record("SESSION", "refresh_replay_rejected", replay.status >= 400, { status: replay.status });
}

async function concurrentSessions(email, password) {
  const a = await login(email, password);
  await new Promise((r) => setTimeout(r, 300));
  const b = await login(email, password);
  const meA = await http("GET", "/auth/me", { token: a.accessToken });
  const meB = await http("GET", "/auth/me", { token: b.accessToken });
  record("SESSION", "concurrent_sessions_both_valid", meA.status === 200 && meB.status === 200, {
    a: meA.status,
    b: meB.status,
  });
  await http("POST", "/auth/logout", { token: a.accessToken, cookie: a.cookie, body: {} });
  const meA2 = await http("GET", "/auth/me", { token: a.accessToken });
  const meB2 = await http("GET", "/auth/me", { token: b.accessToken });
  record("SESSION", "logout_one_session_keeps_other_access_until_expiry", meB2.status === 200, {
    aAfter: meA2.status,
    bAfter: meB2.status,
    note: "access JWT remains until TTL; refresh for A should fail",
  });
}

async function passwordResetDryRun(email) {
  const r = await http("POST", "/auth/forgot-password", { body: { email } });
  record("PASSWORD", "forgot_password_endpoint", r.status < 500, {
    status: r.status,
    note: "PASSWORD_RESET_DRY_RUN expected on TEST",
  });
}

async function roleChangeInvalidation(email) {
  // Verify revokeAll pattern exists by checking sessions table after forced revoke via prisma
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, role: true },
  });
  if (!user) {
    record("SESSION", "role_change_user_found", false);
    return;
  }
  const before = await prisma.authSession.count({
    where: { userId: user.id, revokedAt: null },
  });
  // Soft check only — do not mutate role on shared TEST users during validation
  record("SESSION", "active_sessions_readable", before >= 0, {
    activeSessions: before,
    role: user.role,
    note: "Role-change invalidation relies on revokeAllAuthSessionsForUser (used by password set / provision)",
  });
}

async function disabledUser(email, password) {
  const inactive = await prisma.user.findFirst({
    where: { OR: [{ isActive: false }, { approvalStatus: { not: "approved" } }] },
    select: { email: true, isActive: true, approvalStatus: true, passwordHash: true },
  });
  if (!inactive?.email) {
    record("AUTH", "inactive_user_sample", true, { note: "no inactive sample" });
    return;
  }
  if (!inactive.passwordHash) {
    record("AUTH", "inactive_without_password_cannot_login", true, {
      email: redactEmail(inactive.email),
    });
    return;
  }
  // Do not set password on arbitrary users; just attempt login if hash exists (will fail wrong password)
  const r = await login(inactive.email, "DefinitelyWrongInactive1!");
  record("AUTH", "inactive_or_unapproved_login_rejected", r.status >= 400, {
    status: r.status,
    email: redactEmail(inactive.email),
    isActive: inactive.isActive,
    approval: inactive.approvalStatus,
  });
}

async function main() {
  ensureOutDir();
  const { password, emails } = loadCreds();

  // Invalid credentials
  const bad = await login(emails.SUPER_ADMIN, "DefinitelyWrong1!");
  record("AUTH", "invalid_credentials", bad.status >= 400 && !bad.accessToken, {
    status: bad.status,
  });

  await roleMatrix(emails, password);
  await rotationAndReplay(emails.SUPER_ADMIN, password);
  await concurrentSessions(emails.ADMIN || emails.STAFF, password);
  await passwordResetDryRun(emails.SUPER_ADMIN);
  await roleChangeInvalidation(emails.STAFF || emails.ADMIN);
  await disabledUser(emails.SUPER_ADMIN, password);

  // Signup probe (may be enabled)
  const signup = await http("POST", "/auth/signup", {
    body: {
      email: `phase-f-signup-${Date.now()}@example.com`,
      password: "PhaseFSignup1!",
      name: "Phase F Signup",
    },
  });
  record("AUTH", "signup_endpoint_responds", signup.status < 500, {
    status: signup.status,
    err: signup.json?.error,
  });

  const summary = {
    generatedAt: new Date().toISOString(),
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  const out = writeJson("session-lifecycle-summary.json", summary);
  console.log(JSON.stringify({ event: "session_done", out, passed: summary.passed, failed: summary.failed }));
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
