/**
 * Unauthenticated endpoints for login/signup and password reset request.
 */
import express from "express";
import rateLimit from "express-rate-limit";
import { supabaseAuth } from "../supabaseAuthClient.js";
import { findAccessTokenByHash } from "../repositories/accessTokenRepository.js";
import { sendPasswordResetEmail } from "../services/emailService.js";
import {
  resolvePasswordResetRedirectTo,
  rewriteActionLinkRedirect,
} from "../utils/passwordResetRedirect.js";
import { jsonError, jsonOk, safeTrim } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { redactEmail } from "../utils/redact.js";
import { listActiveOrganisationsPublic } from "../repositories/organisationRepository.js";

const router = express.Router();

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * Request password reset — generates Supabase recovery link, sends via Postmark only.
 * POST /auth/public/forgot-password  { email, redirectTo? }
 */
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const startedAt = Date.now();
  const email = safeTrim(req.body?.email);
  if (!email || !SIMPLE_EMAIL_RE.test(email)) {
    return jsonError(res, 400, "Valid email required");
  }

  const redirectTo = resolvePasswordResetRedirectTo(req.body?.redirectTo);
  const genericOk = () =>
    jsonOk(res, {
      message: "If an account exists for that email, we sent a password reset link.",
    });

  try {
    const { data, error } = await supabaseAuth.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (error) {
      logEvent("auth.forgotPassword.generateLinkFailed", {
        email: redactEmail(email),
        code: error.code ?? null,
        ms: Date.now() - startedAt,
      });
      return genericOk();
    }

    let actionLink = data?.properties?.action_link;
    if (!actionLink || typeof actionLink !== "string") {
      logEvent("auth.forgotPassword.noActionLink", {
        email: redactEmail(email),
        ms: Date.now() - startedAt,
      });
      return genericOk();
    }

    actionLink = rewriteActionLinkRedirect(actionLink, redirectTo);

    const sendResult = await sendPasswordResetEmail({
      toEmail: email,
      resetLink: actionLink,
    });

    if (!sendResult.ok) {
      logEvent("auth.forgotPassword.emailFailed", {
        email: redactEmail(email),
        reason: sendResult.reason,
        ms: Date.now() - startedAt,
      });
      return jsonError(res, 503, "Unable to send reset email. Please try again later.");
    }

    logEvent("auth.forgotPassword.sent", {
      email: redactEmail(email),
      redirectHost: (() => {
        try {
          return new URL(redirectTo).host;
        } catch {
          return null;
        }
      })(),
      ms: Date.now() - startedAt,
    });
    return genericOk();
  } catch (err) {
    logEvent("auth.forgotPassword.error", {
      email: redactEmail(email),
      message: err?.message || "unknown",
      ms: Date.now() - startedAt,
    });
    return jsonError(res, 503, "Unable to send reset email. Please try again later.");
  }
});

/** Legacy magic-link validation (no JWT). */
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
