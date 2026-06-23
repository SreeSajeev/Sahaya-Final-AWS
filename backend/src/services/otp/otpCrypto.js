import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import {
  OTP_EXPIRY_MINUTES,
  OTP_VERIFICATION_TOKEN_TTL_MINUTES,
} from "../../config/appConfig.js";
import { isNodeProduction } from "../../config/publicOtpSecurity.js";

function resolveOtpSecret() {
  const explicit = String(process.env.PUBLIC_OTP_HMAC_SECRET || "").trim();
  if (explicit) return explicit;

  if (isNodeProduction()) {
    throw new Error(
      "PUBLIC_OTP_HMAC_SECRET is required in production (INTERNAL_TRIGGER_SECRET is not used for public OTP)"
    );
  }

  const fallback = String(process.env.INTERNAL_TRIGGER_SECRET || "").trim();
  if (fallback) return fallback;
  if (process.env.NODE_ENV === "development") {
    return "dev-public-otp-hmac-secret-change-in-production";
  }
  throw new Error("PUBLIC_OTP_HMAC_SECRET or INTERNAL_TRIGGER_SECRET required for public OTP");
}

/** @returns {string} 6-digit OTP */
export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * @param {string} sessionId
 * @param {string} otp
 */
export function hashOtp(sessionId, otp) {
  const secret = resolveOtpSecret();
  return createHmac("sha256", secret).update(`${sessionId}:${otp}`).digest("hex");
}

/**
 * @param {string} sessionId
 * @param {string} otp
 * @param {string} storedHash
 */
export function verifyOtpHash(sessionId, otp, storedHash) {
  const expected = hashOtp(sessionId, otp);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(storedHash || ""), "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function otpExpiresAt(fromDate = new Date()) {
  return new Date(fromDate.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

/**
 * HMAC-signed verification token for post-OTP flows (Phase 5+).
 * @param {{ sessionId: string, organisationId: string, complaintPointId: string, mobile10: string }} params
 */
export function issueVerificationToken({ sessionId, organisationId, complaintPointId, mobile10 }) {
  const secret = resolveOtpSecret();
  const exp = Math.floor(Date.now() / 1000) + OTP_VERIFICATION_TOKEN_TTL_MINUTES * 60;
  const payload = {
    v: 1,
    sid: sessionId,
    oid: organisationId,
    cpid: complaintPointId,
    m: mobile10,
    exp,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `pv1.${body}.${sig}`;
}

/**
 * @param {string} token
 * @returns {{ ok: true, payload: object } | { ok: false, reason: string }}
 */
export function parseVerificationToken(token) {
  const raw = String(token || "").trim();
  if (!raw.startsWith("pv1.")) return { ok: false, reason: "invalid_format" };
  const parts = raw.split(".");
  if (parts.length !== 3) return { ok: false, reason: "invalid_format" };
  const [, body, sig] = parts;
  const secret = resolveOtpSecret();
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid_signature" };
    }
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid_payload" };
  }
  if (!payload?.sid || !payload?.exp) return { ok: false, reason: "invalid_payload" };
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, payload };
}

/**
 * @param {import('express').Request} req
 */
export function hashClientFingerprint(req) {
  const secret = resolveOtpSecret();
  const ip =
    String(req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() || req.ip || "";
  const ua = String(req.headers["user-agent"] || "").slice(0, 512);
  const ipHash = createHmac("sha256", secret).update(`ip:${ip}`).digest("hex");
  const uaHash = createHmac("sha256", secret).update(`ua:${ua}`).digest("hex");
  return { ipHash, uaHash };
}
