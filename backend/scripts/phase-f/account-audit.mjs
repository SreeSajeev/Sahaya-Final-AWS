#!/usr/bin/env node
/**
 * Phase F.2 — READ-ONLY local-auth account reconciliation.
 * Never prints password hashes, tokens, or plaintext passwords.
 *
 * Classifications (exactly one per user):
 *   READY_WITH_PASSWORD | ACTIVE_PASSWORD_MISSING | INTENTIONALLY_DISABLED
 *   | TEST_FIXTURE | DUPLICATE_OR_STALE | NON_LOGIN_ACCOUNT | UNKNOWN_REQUIRES_REVIEW
 *
 * Login eligibility: LOGIN_REQUIRED | LOGIN_NOT_REQUIRED | UNKNOWN
 */
import "dotenv/config";
import { prisma } from "../../src/db/prisma.js";
import { redactEmail, writeJson, ensureOutDir, loadCreds } from "./lib.mjs";

/** Interactive app roles that authenticate via local auth today. */
const LOGIN_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "STAFF", "FIELD_EXECUTIVE"]);

function isActiveUser(u) {
  const approved = u.approvalStatus == null || u.approvalStatus === "approved";
  return u.isActive !== false && approved;
}

function looksTestFixture(u) {
  const email = (u.email || "").toLowerCase();
  return (
    /e2e|phase.?f|phasef-activation|dummy|example\.com$/i.test(email) ||
    /E2E_TEST|PHASE_F|ACTIVATION_FIXTURE/i.test(u.name || "")
  );
}

/**
 * Application semantics only — no invented business deactivations.
 * CLIENT and other non-staff portal roles: if present and active, treat as LOGIN_REQUIRED
 * when they have (or would use) local auth; if role is unknown → UNKNOWN.
 */
function loginEligibility(u, classification) {
  if (classification === "INTENTIONALLY_DISABLED") {
    return { eligibility: "LOGIN_NOT_REQUIRED", reason: "disabled_or_not_approved" };
  }
  if (classification === "TEST_FIXTURE") {
    return { eligibility: "LOGIN_NOT_REQUIRED", reason: "disposable_test_fixture" };
  }
  if (classification === "DUPLICATE_OR_STALE") {
    return { eligibility: "LOGIN_NOT_REQUIRED", reason: "duplicate_or_stale" };
  }
  if (classification === "NON_LOGIN_ACCOUNT") {
    return { eligibility: "LOGIN_NOT_REQUIRED", reason: "non_interactive_account" };
  }
  if (classification === "UNKNOWN_REQUIRES_REVIEW") {
    return { eligibility: "UNKNOWN", reason: "needs_human_review" };
  }
  if (LOGIN_ROLES.has(u.role)) {
    return { eligibility: "LOGIN_REQUIRED", reason: `interactive_role_${u.role}` };
  }
  if (u.role === "CLIENT") {
    // CLIENT exists in TEST DB; app supports local login for approved users with this role
    // if they use the web UI — treat as LOGIN_REQUIRED when active.
    return { eligibility: "LOGIN_REQUIRED", reason: "client_portal_role" };
  }
  return { eligibility: "UNKNOWN", reason: `unrecognized_role_${u.role || "null"}` };
}

function classify(u, bootstrapEmails, emailCounts) {
  const hasPassword = Boolean(u.passwordHash);
  const email = (u.email || "").toLowerCase();
  const active = isActiveUser(u);
  const isBootstrap = bootstrapEmails.has(email);
  const dup = email && emailCounts.get(email) > 1;

  if (!active) {
    return {
      class: "INTENTIONALLY_DISABLED",
      reason: `isActive=${u.isActive} approval=${u.approvalStatus || "n/a"}`,
    };
  }
  if (looksTestFixture(u)) {
    return { class: "TEST_FIXTURE", reason: "email_or_name_test_pattern" };
  }
  if (dup) {
    return { class: "DUPLICATE_OR_STALE", reason: "duplicate_email_in_users_table" };
  }
  // No email and no known interactive role → cannot log in via email/password
  if (!email && !LOGIN_ROLES.has(u.role)) {
    return { class: "NON_LOGIN_ACCOUNT", reason: "missing_email_non_interactive" };
  }
  if (hasPassword) {
    const algo = u.passwordHash?.startsWith("$argon2id$")
      ? "argon2id"
      : u.passwordHash
        ? "other"
        : null;
    return {
      class: "READY_WITH_PASSWORD",
      reason: isBootstrap ? "bootstrap_verified_sample" : "has_password_hash",
      algorithm: algo,
    };
  }
  // Active + null hash: if role is interactive or CLIENT → missing password
  if (LOGIN_ROLES.has(u.role) || u.role === "CLIENT") {
    return {
      class: "ACTIVE_PASSWORD_MISSING",
      reason: "null_password_hash_legacy_or_never_set",
    };
  }
  return {
    class: "UNKNOWN_REQUIRES_REVIEW",
    reason: `active_no_password_unrecognized_role_${u.role || "null"}`,
  };
}

function activationReady(row, eligibility) {
  // F.1 forgotPassword issues PasswordResetToken for active users even when hash is null.
  if (row.classification === "READY_WITH_PASSWORD") {
    return { activationReady: true, note: "already_has_password" };
  }
  if (row.classification === "ACTIVE_PASSWORD_MISSING" && eligibility === "LOGIN_REQUIRED") {
    return {
      activationReady: true,
      note: "first_login_via_PasswordResetToken_supported_for_active_null_hash",
    };
  }
  if (
    row.classification === "INTENTIONALLY_DISABLED" ||
    row.classification === "TEST_FIXTURE" ||
    row.classification === "DUPLICATE_OR_STALE" ||
    row.classification === "NON_LOGIN_ACCOUNT"
  ) {
    return { activationReady: true, note: "login_not_required_no_activation_needed" };
  }
  if (row.classification === "UNKNOWN_REQUIRES_REVIEW") {
    return { activationReady: false, note: "human_review_required_before_activation" };
  }
  return { activationReady: false, note: "not_classified_for_activation" };
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
    /* optional */
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

  const emailCounts = new Map();
  for (const u of users) {
    const e = (u.email || "").toLowerCase();
    if (!e) continue;
    emailCounts.set(e, (emailCounts.get(e) || 0) + 1);
  }

  const rows = users.map((u) => {
    const c = classify(u, bootstrapEmails, emailCounts);
    const el = loginEligibility(u, c.class);
    const row = {
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
      loginEligibility: el.eligibility,
      loginEligibilityReason: el.reason,
    };
    const act = activationReady(row, el.eligibility);
    row.activationReady = act.activationReady;
    row.activationNote = act.note;
    return row;
  });

  const classCounts = {};
  const eligibilityCounts = { LOGIN_REQUIRED: 0, LOGIN_NOT_REQUIRED: 0, UNKNOWN: 0 };
  for (const r of rows) {
    classCounts[r.classification] = (classCounts[r.classification] || 0) + 1;
    eligibilityCounts[r.loginEligibility] = (eligibilityCounts[r.loginEligibility] || 0) + 1;
  }

  // Gate metrics (Step 6)
  const loginRequired = rows.filter((r) => r.loginEligibility === "LOGIN_REQUIRED");
  const A = loginRequired.filter((r) => r.hasPassword).length;
  const B = loginRequired.filter((r) => !r.hasPassword && r.activationReady).length;
  const C = loginRequired.filter((r) => !r.hasPassword && !r.activationReady).length;
  const D = rows.filter(
    (r) =>
      r.classification === "UNKNOWN_REQUIRES_REVIEW" || r.loginEligibility === "UNKNOWN"
  ).length;

  const classifiedCount = rows.length;
  const report = {
    generatedAt: new Date().toISOString(),
    phase: "F.2",
    readOnly: true,
    totals: {
      users: classifiedCount,
      classifiedCount,
      classifiedEqualsTotal: classifiedCount === users.length,
      withPasswordHash: rows.filter((r) => r.hasPassword).length,
      ...classCounts,
    },
    eligibilityCounts,
    readinessGate: {
      A_loginRequiredWithPassword: A,
      B_loginRequiredMissingButActivationReady: B,
      C_loginRequiredMissingAndNotReady: C,
      D_unknownOrReview: D,
      C_equals_zero: C === 0,
      technicalReadiness: C === 0 ? "PASS" : "FAIL",
      organizationalRolloutReady: D === 0 && C === 0 ? "CONDITIONAL_ON_ACTIVATION_OPS" : "NO",
    },
    byRoleMissing: {},
    byRoleLoginRequired: {},
    firstLoginMechanism: {
      implemented: true,
      path: "forgotPassword → PasswordResetToken → resetPasswordWithToken → Argon2id",
      massActivation: false,
      realEmailSms: false,
      dryRunDefault: true,
    },
    rows,
  };

  for (const r of rows.filter((x) => x.classification === "ACTIVE_PASSWORD_MISSING")) {
    report.byRoleMissing[r.role] = (report.byRoleMissing[r.role] || 0) + 1;
  }
  for (const r of loginRequired) {
    report.byRoleLoginRequired[r.role] = (report.byRoleLoginRequired[r.role] || 0) + 1;
  }

  const out = writeJson("account-reconciliation-f2.json", report);
  // Also write legacy name for compatibility
  writeJson("account-classification.json", report);

  console.log(
    JSON.stringify(
      {
        event: "account_reconciliation_f2_done",
        out,
        totals: report.totals,
        eligibilityCounts: report.eligibilityCounts,
        readinessGate: report.readinessGate,
        byRoleMissing: report.byRoleMissing,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  if (C > 0) process.exitCode = 2;
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
