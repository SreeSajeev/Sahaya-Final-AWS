import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

function requireSecret(name) {
  const v = String(process.env[name] || "").trim();
  if (!v || v.length < 32) {
    throw new Error(`${name} must be set to a strong secret (≥32 chars)`);
  }
  return new TextEncoder().encode(v);
}

export function getAccessTtlSec() {
  const n = Number(process.env.JWT_ACCESS_TTL_SEC || 900);
  return Math.min(Math.max(Number.isFinite(n) ? n : 900, 60), 3600);
}

export function getRefreshTtlSec() {
  const n = Number(process.env.JWT_REFRESH_TTL_SEC || 604800);
  return Math.min(Math.max(Number.isFinite(n) ? n : 604800, 3600), 60 * 60 * 24 * 30);
}

export function getPasswordResetTtlSec() {
  const n = Number(process.env.PASSWORD_RESET_TOKEN_TTL_SEC || 3600);
  return Math.min(Math.max(Number.isFinite(n) ? n : 3600, 300), 86400);
}

/**
 * @param {{ userId: string, email: string, role: string, organisationId: string | null }} claims
 */
export async function signAccessToken(claims) {
  const secret = requireSecret("JWT_ACCESS_SECRET");
  const ttl = getAccessTtlSec();
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    email: claims.email,
    role: claims.role,
    organisation_id: claims.organisationId,
    typ: "access",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(claims.userId))
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .setIssuer("sahaya-test-auth")
    .setAudience("sahaya-api")
    .sign(secret);
  return { token, expiresIn: ttl };
}

export async function verifyAccessToken(token) {
  const secret = requireSecret("JWT_ACCESS_SECRET");
  const { payload } = await jwtVerify(String(token || ""), secret, {
    issuer: "sahaya-test-auth",
    audience: "sahaya-api",
  });
  if (payload.typ !== "access") {
    throw new Error("Invalid token type");
  }
  if (!payload.sub) throw new Error("Missing subject");
  return {
    userId: String(payload.sub),
    email: payload.email != null ? String(payload.email) : null,
    role: payload.role != null ? String(payload.role) : null,
    organisationId:
      payload.organisation_id != null && String(payload.organisation_id).trim() !== ""
        ? String(payload.organisation_id)
        : null,
    exp: payload.exp ?? null,
  };
}

export function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashOpaqueToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}
