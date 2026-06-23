import { supabase } from "../supabaseClient.js";
import { parseVerificationToken } from "./otp/otpCrypto.js";

/**
 * Resolve verification token and load OTP session with tenant checks.
 * @param {string} verificationToken
 */
export async function resolveVerifiedPublicSession(verificationToken) {
  const parsed = parseVerificationToken(verificationToken);
  if (!parsed.ok) {
    const status = parsed.reason === "expired" ? 410 : 401;
    const message =
      parsed.reason === "expired"
        ? "Verification session has expired"
        : "Invalid verification session";
    return { ok: false, status, message, reason: parsed.reason };
  }

  const { sid, oid, cpid, m, exp } = parsed.payload;

  const { data: session, error } = await supabase
    .from("public_otp_sessions")
    .select(
      "id, complaint_point_id, organisation_id, reporter_mobile, reporter_name, status, verified_at, expires_at"
    )
    .eq("id", sid)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: "Failed to load verification session" };
  }
  if (!session) {
    return { ok: false, status: 404, message: "Verification session not found" };
  }

  if (session.organisation_id !== oid) {
    return { ok: false, status: 401, message: "Invalid verification session" };
  }
  if (session.complaint_point_id !== cpid) {
    return { ok: false, status: 401, message: "Invalid verification session" };
  }
  if (session.reporter_mobile !== m) {
    return { ok: false, status: 401, message: "Invalid verification session" };
  }

  if (session.status === "locked") {
    return { ok: false, status: 423, message: "Verification session is locked" };
  }
  if (session.status === "expired") {
    return { ok: false, status: 410, message: "Verification session has expired" };
  }
  if (session.status === "consumed") {
    return { ok: false, status: 410, message: "Verification session is no longer valid" };
  }
  if (session.status !== "verified") {
    return { ok: false, status: 401, message: "OTP verification required" };
  }

  const { data: point, error: pointErr } = await supabase
    .from("tenant_complaint_points")
    .select("name, building, floor, site_name, status")
    .eq("id", cpid)
    .maybeSingle();

  if (pointErr) {
    return { ok: false, status: 500, message: "Failed to load complaint point" };
  }
  if (!point || point.status !== "active") {
    return { ok: false, status: 404, message: "This link is not available" };
  }

  const verificationExpiresAt = new Date(exp * 1000).toISOString();
  const mobile = String(session.reporter_mobile || "");
  const mobileLast4 = mobile.length >= 4 ? mobile.slice(-4) : null;

  return {
    ok: true,
    session,
    point,
    verificationExpiresAt,
    mobileLast4,
  };
}

/**
 * @param {string} verificationToken
 */
export async function validatePublicSession(verificationToken) {
  const resolved = await resolveVerifiedPublicSession(verificationToken);
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status,
      message: resolved.message,
    };
  }

  const { session, point, verificationExpiresAt, mobileLast4 } = resolved;

  return {
    ok: true,
    data: {
      valid: true,
      status: session.status,
      otp_session_id: session.id,
      verified_at: session.verified_at,
      verification_expires_at: verificationExpiresAt,
      mobile_last4: mobileLast4,
      complaint_point: {
        name: point.name,
        building: point.building ?? null,
        floor: point.floor ?? null,
        site_name: point.site_name ?? null,
      },
    },
  };
}

/**
 * @param {string} verificationToken
 * @param {string} reporterName
 */
export async function patchPublicSessionProfile(verificationToken, reporterName) {
  const resolved = await resolveVerifiedPublicSession(verificationToken);
  if (!resolved.ok) {
    return {
      ok: false,
      status: resolved.status,
      message: resolved.message,
    };
  }

  const { session } = resolved;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("public_otp_sessions")
    .update({
      reporter_name: reporterName,
      updated_at: now,
    })
    .eq("id", session.id)
    .eq("status", "verified");

  if (error) {
    return { ok: false, status: 500, message: "Failed to update profile" };
  }

  return {
    ok: true,
    data: {
      success: true,
      otp_session_id: session.id,
      reporter_name: reporterName,
    },
  };
}
