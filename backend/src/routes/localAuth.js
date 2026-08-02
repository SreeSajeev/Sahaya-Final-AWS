/**
 * Sahaya local auth routes (no Supabase Auth).
 */
import express from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { attachTenantContext } from "../middleware/tenantContext.js";
import { jsonError, jsonOk, safeTrim } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import {
  changePassword,
  forgotPassword,
  getMeProfile,
  loginWithPassword,
  logoutAllSessions,
  logoutSession,
  refreshSession,
  resetPasswordWithToken,
} from "../services/localAuthService.js";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "../utils/authCookies.js";
import { listActiveOrganisationsPublic } from "../repositories/organisationRepository.js";
import { hashPassword, normalizeEmail } from "../services/passwordService.js";
import { insertUser, findUserByEmail } from "../repositories/userRepository.js";
import { prisma } from "../db/prisma.js";

const router = express.Router();

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be less than 72 characters")
  .refine(
    (s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^\w\s]/.test(s),
    "Password must include uppercase, lowercase, a number, and a special character"
  );

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset requests. Try again later." },
});

router.get("/organisations", async (_req, res) => {
  try {
    const { data, error } = await listActiveOrganisationsPublic();
    if (error) return jsonError(res, 500, error.message);
    return jsonOk(res, { items: data || [] });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to list organisations");
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  const startedAt = Date.now();
  try {
    const email = safeTrim(req.body?.email);
    const password = req.body?.password;
    if (!email || !password) return jsonError(res, 400, "Email and password required");

    const result = await loginWithPassword({ email, password, req });
    if (!result.ok) {
      return jsonError(res, result.status, result.message, {
        code: result.code ?? null,
        approvalStatus: result.approvalStatus ?? null,
      });
    }

    setRefreshCookie(res, result.refreshToken);
    logEvent("auth.login.success", {
      userId: result.profile?.id ?? null,
      ms: Date.now() - startedAt,
    });
    return jsonOk(res, {
      accessToken: result.accessToken,
      expiresIn: result.accessExpiresIn,
      profile: result.profile,
      user: result.profile,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Login failed");
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const raw = readRefreshCookie(req);
    const result = await refreshSession({ rawRefresh: raw, req });
    if (!result.ok) {
      clearRefreshCookie(res);
      return jsonError(res, result.status, result.message);
    }
    setRefreshCookie(res, result.refreshToken);
    return jsonOk(res, {
      accessToken: result.accessToken,
      expiresIn: result.accessExpiresIn,
      profile: result.profile,
      user: result.profile,
    });
  } catch (err) {
    clearRefreshCookie(res);
    return jsonError(res, 500, err?.message || "Refresh failed");
  }
});

router.post("/logout", async (req, res) => {
  try {
    const raw = readRefreshCookie(req);
    await logoutSession(raw);
    clearRefreshCookie(res);
    return jsonOk(res, { ok: true });
  } catch (err) {
    clearRefreshCookie(res);
    return jsonError(res, 500, err?.message || "Logout failed");
  }
});

router.post(
  "/logout-all",
  attachTenantContext({ requireAuthenticated: true }),
  requireAuth,
  requireAppUser,
  async (req, res) => {
    try {
      await logoutAllSessions(req.appUser.id);
      clearRefreshCookie(res);
      return jsonOk(res, { ok: true });
    } catch (err) {
      return jsonError(res, 500, err?.message || "Logout-all failed");
    }
  }
);

router.get(
  "/me",
  attachTenantContext({ requireAuthenticated: true }),
  requireAuth,
  async (req, res) => {
    try {
      const profile = await getMeProfile(req.user.id);
      return jsonOk(res, { profile });
    } catch (err) {
      return jsonError(res, 500, err?.message || "Failed to load profile");
    }
  }
);

router.post(
  "/change-password",
  attachTenantContext({ requireAuthenticated: true }),
  requireAuth,
  requireAppUser,
  async (req, res) => {
    try {
      const currentPassword = req.body?.currentPassword ?? req.body?.current_password;
      const newPassword = req.body?.newPassword ?? req.body?.new_password;
      const parsed = passwordSchema.safeParse(newPassword);
      if (!parsed.success) {
        return jsonError(res, 400, parsed.error.errors.map((e) => e.message).join("; "));
      }
      if (!currentPassword) return jsonError(res, 400, "Current password required");

      const result = await changePassword({
        userId: req.appUser.id,
        currentPassword,
        newPassword: parsed.data,
      });
      if (!result.ok) return jsonError(res, result.status, result.message);

      clearRefreshCookie(res);
      return jsonOk(res, {
        ok: true,
        message: "Password updated. Please sign in again.",
      });
    } catch (err) {
      return jsonError(res, 500, err?.message || "Password change failed");
    }
  }
);

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const email = safeTrim(req.body?.email);
    if (!email) return jsonError(res, 400, "Valid email required");
    const result = await forgotPassword({
      email,
      redirectTo: req.body?.redirectTo,
      req,
    });
    if (!result.ok) return jsonError(res, result.status, result.message);
    return jsonOk(res, { message: result.message });
  } catch (err) {
    return jsonError(res, 503, "Unable to send reset email. Please try again later.");
  }
});

router.post("/reset-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const token = safeTrim(req.body?.token);
    const newPassword = req.body?.password ?? req.body?.newPassword;
    const parsed = passwordSchema.safeParse(newPassword);
    if (!token) return jsonError(res, 400, "Reset token required");
    if (!parsed.success) {
      return jsonError(res, 400, parsed.error.errors.map((e) => e.message).join("; "));
    }
    const result = await resetPasswordWithToken({
      token,
      newPassword: parsed.data,
    });
    if (!result.ok) {
      return jsonError(res, result.status, result.message, { code: result.code ?? null });
    }
    clearRefreshCookie(res);
    return jsonOk(res, { ok: true, message: "Password updated. You can sign in." });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Reset failed");
  }
});

/**
 * Public signup — creates local PostgreSQL user only (no Supabase Auth).
 * Pending until admin approval.
 */
router.post("/signup", loginLimiter, async (req, res) => {
  try {
    const name = safeTrim(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const role = safeTrim(req.body?.role) || "STAFF";
    const organisationId = safeTrim(req.body?.organisationId);

    if (!["STAFF", "FIELD_EXECUTIVE"].includes(role)) {
      return jsonError(res, 400, "Role not allowed for public signup");
    }
    if (!organisationId || !email || !password) {
      return jsonError(res, 400, "Name, email, password and tenant are required.");
    }
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      return jsonError(res, 400, parsed.error.errors.map((e) => e.message).join("; "));
    }

    const { data: existing } = await findUserByEmail(email);
    if (existing) {
      return jsonError(res, 409, "Unable to create account");
    }

    const passwordHash = await hashPassword(parsed.data);
    const { data: created, error } = await insertUser({
      email,
      name: name || email,
      role,
      organisation_id: organisationId,
      approval_status: "pending",
      active: false,
      is_active: false,
      password_hash: passwordHash,
    });
    if (error) return jsonError(res, 400, error.message);

    // Ensure password_hash persisted (insertUser maps snake→camel including password_hash)
    if (created?.id) {
      await prisma.user.update({
        where: { id: created.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
    }

    return jsonOk(res, {
      ok: true,
      message: "Account created and pending approval.",
      userId: created?.id ?? null,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Signup failed");
  }
});

export default router;
