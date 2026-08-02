/**
 * Unauthenticated helpers still mounted at /auth/public.
 * Forgot-password is implemented by local auth (no Supabase).
 */
import express from "express";
import rateLimit from "express-rate-limit";
import { findAccessTokenByHash } from "../repositories/accessTokenRepository.js";
import { jsonError, jsonOk, safeTrim } from "../utils/http.js";
import { listActiveOrganisationsPublic } from "../repositories/organisationRepository.js";
import { forgotPassword, resetPasswordWithToken } from "../services/localAuthService.js";
import { z } from "zod";

const router = express.Router();

const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine((s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^\w\s]/.test(s));

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

router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const email = safeTrim(req.body?.email);
  if (!email) return jsonError(res, 400, "Valid email required");
  const result = await forgotPassword({
    email,
    redirectTo: req.body?.redirectTo,
    req,
  });
  if (!result.ok) return jsonError(res, result.status, result.message);
  return jsonOk(res, { message: result.message });
});

router.post("/reset-password", forgotPasswordLimiter, async (req, res) => {
  const token = safeTrim(req.body?.token);
  const newPassword = req.body?.password ?? req.body?.newPassword;
  const parsed = passwordSchema.safeParse(newPassword);
  if (!token) return jsonError(res, 400, "Reset token required");
  if (!parsed.success) return jsonError(res, 400, "Password does not meet requirements");
  const result = await resetPasswordWithToken({ token, newPassword: parsed.data });
  if (!result.ok) {
    return jsonError(res, result.status, result.message, { code: result.code ?? null });
  }
  return jsonOk(res, { ok: true, message: "Password updated. You can sign in." });
});

/** Legacy magic-link validation (no JWT). FE action access_tokens — unchanged. */
router.get("/access-tokens/by-hash", async (req, res) => {
  const tokenHash = safeTrim(req.query.tokenHash);
  if (!tokenHash) return jsonError(res, 400, "tokenHash required");
  try {
    const { data, error } = await findAccessTokenByHash(tokenHash);
    if (error) return jsonError(res, 500, error.message);
    if (!data) return jsonError(res, 404, "Invalid token");
    if (data.revoked) return jsonError(res, 410, "Token revoked");
    if (new Date(data.expires_at) < new Date()) return jsonError(res, 410, "Token expired");
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Lookup failed");
  }
});

export default router;
