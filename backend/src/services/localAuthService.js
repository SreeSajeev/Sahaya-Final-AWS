import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake } from "../repositories/db/rowMapper.js";
import { hashPassword, normalizeEmail, verifyPassword } from "./passwordService.js";
import { signAccessToken } from "./jwtAccessService.js";
import {
  createAuthSession,
  findAuthSessionByRawRefresh,
  revokeAllAuthSessionsForUser,
  revokeAuthSessionByRawRefresh,
  rotateAuthSession,
} from "./authSessionService.js";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  hashIp,
} from "./passwordResetTokenService.js";
import { sendPasswordResetEmail } from "./emailService.js";
import { resolvePasswordResetRedirectTo } from "../utils/passwordResetRedirect.js";
import { APP_BASE_URL } from "../config/appConfig.js";
import { logEvent } from "../utils/structuredLog.js";
import { redactEmail } from "../utils/redact.js";

const GENERIC_AUTH_FAIL = "Invalid email or password";

function isUserActive(user) {
  if (!user) return false;
  if (user.is_active === false || user.active === false) return false;
  if (user.approval_status === "pending" || user.approval_status === "rejected") return false;
  return true;
}

function publicProfile(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false,
    is_active: user.is_active !== false,
    client_slug: user.client_slug ?? null,
    organisation_id: user.organisation_id ?? null,
    approval_status: user.approval_status ?? null,
    created_at: user.created_at ?? null,
  };
}

async function findUserForLogin(email) {
  const normalized = normalizeEmail(email);
  const row = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
  });
  return mapPrismaRowToSnake(row);
}

async function issueSessionForUser(user, req) {
  const { data: sess, error } = await createAuthSession({
    userId: user.id,
    userAgent: req?.headers?.["user-agent"] ?? null,
    ipHash: hashIp(req?.ip || req?.headers?.["x-forwarded-for"] || null),
  });
  if (error || !sess) throw new Error(error?.message || "Failed to create session");

  const { token, expiresIn } = await signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    organisationId: user.organisation_id ?? null,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    accessToken: token,
    accessExpiresIn: expiresIn,
    refreshToken: sess.rawRefresh,
    profile: publicProfile(user),
  };
}

export async function loginWithPassword({ email, password, req }) {
  const user = await findUserForLogin(email);
  if (!user?.password_hash) {
    return { ok: false, status: 401, message: GENERIC_AUTH_FAIL };
  }
  const valid = await verifyPassword(user.password_hash, password);
  if (!valid) {
    return { ok: false, status: 401, message: GENERIC_AUTH_FAIL };
  }
  if (!isUserActive(user)) {
    if (user.approval_status === "pending" || user.approval_status === "rejected") {
      return {
        ok: false,
        status: 403,
        message: "Account awaiting approval",
        code: "APPROVAL_REQUIRED",
        approvalStatus: user.approval_status,
      };
    }
    return {
      ok: false,
      status: 403,
      message: "Account deactivated. Contact administrator.",
      code: "ACCOUNT_DEACTIVATED",
    };
  }

  const issued = await issueSessionForUser(user, req);
  return { ok: true, status: 200, ...issued };
}

export async function refreshSession({ rawRefresh, req }) {
  if (!rawRefresh) {
    return { ok: false, status: 401, message: "Missing refresh session" };
  }
  const { data: session, error } = await findAuthSessionByRawRefresh(rawRefresh);
  if (error || !session) {
    return { ok: false, status: 401, message: "Invalid refresh session" };
  }
  if (session.revoked_at) {
    return { ok: false, status: 401, message: "Refresh session revoked" };
  }
  if (new Date(session.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 401, message: "Refresh session expired" };
  }

  const userRow = await prisma.user.findUnique({ where: { id: session.user_id } });
  const user = mapPrismaRowToSnake(userRow);
  if (!isUserActive(user)) {
    await revokeAuthSessionByRawRefresh(rawRefresh);
    return { ok: false, status: 403, message: "Account deactivated. Contact administrator." };
  }

  const { data: rotated, error: rotErr } = await rotateAuthSession({
    sessionId: session.id,
    userId: user.id,
    userAgent: req?.headers?.["user-agent"] ?? null,
    ipHash: hashIp(req?.ip || null),
  });
  if (rotErr || !rotated) {
    return { ok: false, status: 401, message: rotErr?.message || "Refresh failed" };
  }

  const { token, expiresIn } = await signAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    organisationId: user.organisation_id ?? null,
  });

  return {
    ok: true,
    status: 200,
    accessToken: token,
    accessExpiresIn: expiresIn,
    refreshToken: rotated.rawRefresh,
    profile: publicProfile(user),
  };
}

export async function logoutSession(rawRefresh) {
  if (rawRefresh) await revokeAuthSessionByRawRefresh(rawRefresh);
  return { ok: true };
}

export async function logoutAllSessions(userId) {
  await revokeAllAuthSessionsForUser(userId);
  return { ok: true };
}

export async function getMeProfile(userId) {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  return publicProfile(mapPrismaRowToSnake(row));
}

export async function changePassword({ userId, currentPassword, newPassword }) {
  const row = await prisma.user.findUnique({ where: { id: userId } });
  const user = mapPrismaRowToSnake(row);
  if (!user?.password_hash) {
    return { ok: false, status: 400, message: "Password not set for this account" };
  }
  const ok = await verifyPassword(user.password_hash, currentPassword);
  if (!ok) return { ok: false, status: 401, message: "Current password is incorrect" };

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
  await revokeAllAuthSessionsForUser(userId);
  return { ok: true, status: 200 };
}

export async function forgotPassword({ email, redirectTo, req }) {
  const generic = {
    ok: true,
    status: 200,
    message: "If an account exists for that email, we sent a password reset link.",
  };
  const user = await findUserForLogin(email);
  // Anti-enumeration: always return generic. Skip token only when no user or inactive.
  if (!user?.id || !isUserActive(user)) {
    return generic;
  }

  // First-login setup OR reset: allow tokens when password_hash is null (legacy imports).
  const { data: tokenData, error } = await createPasswordResetToken(user.id);
  if (error || !tokenData?.raw) {
    logEvent("auth.forgotPassword.tokenFailed", { email: redactEmail(email) });
    return generic;
  }

  const base = resolvePasswordResetRedirectTo(redirectTo) || `${APP_BASE_URL}/reset-password`;
  const url = new URL(base);
  url.searchParams.set("token", tokenData.raw);

  const dryRun =
    String(process.env.PASSWORD_RESET_DRY_RUN || "true").toLowerCase() === "true" ||
    String(process.env.MAIL_DRY_RUN || "").toLowerCase() === "true";

  const purpose = user.password_hash ? "password_reset" : "first_login_password_setup";

  if (dryRun) {
    logEvent("auth.forgotPassword.dryRun", {
      email: redactEmail(email),
      purpose,
      redirectHost: url.host,
      requestId: req?.requestId ?? null,
    });
    // TEST-only capture: never log raw token; optional secure file when explicitly enabled.
    if (String(process.env.PASSWORD_RESET_CAPTURE_TOKEN || "").toLowerCase() === "true") {
      return {
        ...generic,
        // Returned only when CAPTURE flag set (TEST harness). Production must leave flag unset.
        _testCapture: { purpose, expiresAt: tokenData.expiresAt, token: tokenData.raw },
      };
    }
    return generic;
  }

  const sendResult = await sendPasswordResetEmail({
    toEmail: user.email,
    resetLink: url.toString(),
  });
  if (!sendResult.ok) {
    logEvent("auth.forgotPassword.emailFailed", {
      email: redactEmail(email),
      reason: sendResult.reason,
    });
    return { ok: false, status: 503, message: "Unable to send reset email. Please try again later." };
  }
  logEvent("auth.forgotPassword.sent", {
    email: redactEmail(email),
    purpose,
    redirectHost: url.host,
  });
  return generic;
}

export async function resetPasswordWithToken({ token, newPassword }) {
  const { data, error } = await consumePasswordResetToken(token);
  if (error || !data) {
    return { ok: false, status: 400, message: error?.message || "Invalid reset token", code: error?.code };
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: data.user_id },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
  await revokeAllAuthSessionsForUser(data.user_id);
  return { ok: true, status: 200 };
}

export async function setLocalPasswordForUser({ userId, password }) {
  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
  return { ok: true };
}

export { publicProfile, isUserActive, findUserForLogin };
