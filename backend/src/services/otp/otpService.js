import { randomUUID } from "node:crypto";
import { supabase } from "../../supabaseClient.js";
import {
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_MOBILE,
  OTP_MAX_RESENDS,
  OTP_REQUEST_WINDOW_MINUTES,
} from "../../config/appConfig.js";
import { sanitizePhoneForSms } from "../smsService.js";
import { insertAuditLog } from "../auditLogService.js";
import { logEvent } from "../../utils/structuredLog.js";
import {
  generateOtpCode,
  hashClientFingerprint,
  hashOtp,
  issueVerificationToken,
  otpExpiresAt,
  verifyOtpHash,
} from "./otpCrypto.js";
import { sendOtpSms } from "./smsTransport.js";

/** Phase 4 placeholder until complaint form captures name (Phase 5). */
const PENDING_REPORTER_NAME = "Pending";

/**
 * @param {string} publicToken
 */
export async function getActiveComplaintPointByToken(publicToken) {
  const token = String(publicToken || "").trim();
  if (!token) return { data: null, error: null };
  const { data, error } = await supabase
    .from("tenant_complaint_points")
    .select("id, organisation_id, name, status, public_token")
    .eq("public_token", token)
    .maybeSingle();
  if (error) return { data: null, error };
  if (!data || data.status !== "active") return { data: null, error: null };
  return { data, error: null };
}

async function countRecentOtpRequests(complaintPointId, mobile10) {
  const since = new Date(Date.now() - OTP_REQUEST_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("public_otp_sessions")
    .select("id", { count: "exact", head: true })
    .eq("complaint_point_id", complaintPointId)
    .eq("reporter_mobile", mobile10)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function findPendingSession(complaintPointId, mobile10) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("public_otp_sessions")
    .select("*")
    .eq("complaint_point_id", complaintPointId)
    .eq("reporter_mobile", mobile10)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function expireSessionIfNeeded(row) {
  if (!row || row.status !== "pending") return row;
  if (new Date(row.expires_at) > new Date()) return row;
  await supabase
    .from("public_otp_sessions")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending");
  return { ...row, status: "expired" };
}

function auditOtpEvent({ action, organisationId, sessionId, metadata, req }) {
  void insertAuditLog({
    req,
    entity_type: "public_otp_session",
    entity_id: sessionId,
    action,
    organisation_id: organisationId,
    metadata,
    actor_role: "PUBLIC",
    summary: action.replace(/_/g, " "),
  });
}

/**
 * @param {{ mobile: string, complaintPointToken: string, req: import('express').Request }} params
 */
export async function sendPublicOtp({ mobile, complaintPointToken, req }) {
  const mobile10 = sanitizePhoneForSms(mobile);
  if (mobile10.length !== 10) {
    return { ok: false, status: 400, message: "Invalid mobile number" };
  }

  const { data: point, error: pointErr } = await getActiveComplaintPointByToken(complaintPointToken);
  if (pointErr) {
    return { ok: false, status: 500, message: "Failed to resolve complaint point" };
  }
  if (!point) {
    return { ok: false, status: 404, message: "Complaint point not found or inactive" };
  }

  const recentCount = await countRecentOtpRequests(point.id, mobile10);
  if (recentCount >= OTP_MAX_REQUESTS_PER_MOBILE) {
    return {
      ok: false,
      status: 429,
      message: "Too many OTP requests. Try again later.",
    };
  }

  const { ipHash, uaHash } = hashClientFingerprint(req);
  const otp = generateOtpCode();
  const expiresAt = otpExpiresAt();

  let pending = await findPendingSession(point.id, mobile10);
  pending = pending ? await expireSessionIfNeeded(pending) : null;

  let sessionId;
  let isResend = false;

  if (pending && pending.status === "pending") {
    if ((pending.resend_count ?? 0) >= OTP_MAX_RESENDS) {
      return {
        ok: false,
        status: 429,
        message: "Maximum OTP resends reached. Request a new code later.",
      };
    }
    isResend = true;
    sessionId = pending.id;
    const otpHash = hashOtp(sessionId, otp);
    // Resend issues a new OTP and extends expiry but preserves attempt_count so resend
    // cannot reset the per-session brute-force counter (security review FIX 4).
    const { error: updErr } = await supabase
      .from("public_otp_sessions")
      .update({
        otp_hash: otpHash,
        resend_count: (pending.resend_count ?? 0) + 1,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
        ip_hash: ipHash,
        user_agent_hash: uaHash,
      })
      .eq("id", sessionId)
      .eq("status", "pending");
    if (updErr) {
      return { ok: false, status: 500, message: "Failed to update OTP session" };
    }
  } else {
    sessionId = randomUUID();
    const otpHash = hashOtp(sessionId, otp);
    const { error: insErr } = await supabase.from("public_otp_sessions").insert({
      id: sessionId,
      complaint_point_id: point.id,
      organisation_id: point.organisation_id,
      reporter_name: PENDING_REPORTER_NAME,
      reporter_mobile: mobile10,
      otp_hash: otpHash,
      status: "pending",
      attempt_count: 0,
      resend_count: 0,
      expires_at: expiresAt.toISOString(),
      ip_hash: ipHash,
      user_agent_hash: uaHash,
    });
    if (insErr) {
      return { ok: false, status: 500, message: "Failed to create OTP session" };
    }
  }

  const sms = await sendOtpSms({ phoneNumber: mobile10, otp });
  const smsAcceptable =
    sms.delivered ||
    (sms.skipped &&
      (sms.reason_code === "SMS_TEST_MODE" ||
        sms.reason_code === "SMS_DISABLED" ||
        process.env.PUBLIC_OTP_ALLOW_SMS_SKIP === "true"));

  if (!smsAcceptable) {
    logEvent("publicOtp.smsFailed", {
      sessionId,
      reason_code: sms.reason_code,
      isResend,
    });
    return {
      ok: false,
      status: 503,
      message: "Unable to send OTP. Please try again later.",
    };
  }

  auditOtpEvent({
    action: "otp_sent",
    organisationId: point.organisation_id,
    sessionId,
    req,
    metadata: {
      complaint_point_id: point.id,
      is_resend: isResend,
      mobile_last4: mobile10.slice(-4),
      sms_reason_code: sms.reason_code,
    },
  });

  logEvent("publicOtp.sent", {
    sessionId,
    complaintPointId: point.id,
    isResend,
    smsSkipped: sms.skipped,
  });

  return {
    ok: true,
    data: {
      success: true,
      otp_session_id: sessionId,
      expires_at: expiresAt.toISOString(),
    },
  };
}

/**
 * @param {{ otpSessionId: string, otp: string, req: import('express').Request }} params
 */
export async function verifyPublicOtp({ otpSessionId, otp, req }) {
  const { data: row, error } = await supabase
    .from("public_otp_sessions")
    .select("*")
    .eq("id", otpSessionId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: "Failed to load OTP session" };
  }
  if (!row) {
    return { ok: false, status: 404, message: "OTP session not found" };
  }

  let session = await expireSessionIfNeeded(row);

  if (session.status === "locked") {
    auditOtpEvent({
      action: "otp_locked",
      organisationId: session.organisation_id,
      sessionId: session.id,
      req,
      metadata: { reason: "verify_while_locked", mobile_last4: session.reporter_mobile?.slice(-4) },
    });
    return { ok: false, status: 423, message: "OTP session is locked" };
  }

  if (session.status === "verified" || session.status === "consumed") {
    const token = issueVerificationToken({
      sessionId: session.id,
      organisationId: session.organisation_id,
      complaintPointId: session.complaint_point_id,
      mobile10: session.reporter_mobile,
    });
    return {
      ok: true,
      data: {
        success: true,
        otp_session_id: session.id,
        status: session.status,
        verification_token: token,
        verified_at: session.verified_at,
      },
    };
  }

  if (session.status !== "pending") {
    return { ok: false, status: 410, message: "OTP session is no longer valid" };
  }

  if (new Date(session.expires_at) <= new Date()) {
    await supabase
      .from("public_otp_sessions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", session.id);
    return { ok: false, status: 410, message: "OTP has expired" };
  }

  const attempts = session.attempt_count ?? 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await supabase
      .from("public_otp_sessions")
      .update({ status: "locked", updated_at: new Date().toISOString() })
      .eq("id", session.id);
    auditOtpEvent({
      action: "otp_locked",
      organisationId: session.organisation_id,
      sessionId: session.id,
      req,
      metadata: { reason: "max_attempts", mobile_last4: session.reporter_mobile?.slice(-4) },
    });
    return { ok: false, status: 423, message: "OTP session is locked" };
  }

  const valid = verifyOtpHash(session.id, otp, session.otp_hash);
  if (!valid) {
    const nextAttempts = attempts + 1;
    const updates = {
      attempt_count: nextAttempts,
      updated_at: new Date().toISOString(),
    };
    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      updates.status = "locked";
    }
    await supabase.from("public_otp_sessions").update(updates).eq("id", session.id);
    if (updates.status === "locked") {
      auditOtpEvent({
        action: "otp_locked",
        organisationId: session.organisation_id,
        sessionId: session.id,
        req,
        metadata: { reason: "wrong_otp", mobile_last4: session.reporter_mobile?.slice(-4) },
      });
      return { ok: false, status: 423, message: "OTP session is locked" };
    }
    return { ok: false, status: 401, message: "Invalid OTP" };
  }

  const verifiedAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("public_otp_sessions")
    .update({
      status: "verified",
      verified_at: verifiedAt,
      updated_at: verifiedAt,
    })
    .eq("id", session.id)
    .eq("status", "pending");

  if (updErr) {
    return { ok: false, status: 500, message: "Failed to verify OTP" };
  }

  const verificationToken = issueVerificationToken({
    sessionId: session.id,
    organisationId: session.organisation_id,
    complaintPointId: session.complaint_point_id,
    mobile10: session.reporter_mobile,
  });

  auditOtpEvent({
    action: "otp_verified",
    organisationId: session.organisation_id,
    sessionId: session.id,
    req,
    metadata: {
      complaint_point_id: session.complaint_point_id,
      mobile_last4: session.reporter_mobile?.slice(-4),
    },
  });

  logEvent("publicOtp.verified", { sessionId: session.id });

  return {
    ok: true,
    data: {
      success: true,
      otp_session_id: session.id,
      status: "verified",
      verification_token: verificationToken,
      verified_at: verifiedAt,
    },
  };
}
