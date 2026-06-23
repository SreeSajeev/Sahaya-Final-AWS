import { jsonError, jsonOk } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { parseSendOtpBody, parseVerifyOtpBody } from "../services/otp/publicOtpValidation.js";
import { sendPublicOtp, verifyPublicOtp } from "../services/otp/otpService.js";

export async function sendOtpHandler(req, res) {
  const startedAt = Date.now();
  const parsed = parseSendOtpBody(req.body);
  if (!parsed.ok) {
    return jsonError(res, parsed.status, parsed.message, parsed.details ? { details: parsed.details } : {});
  }

  try {
    const result = await sendPublicOtp({
      mobile: parsed.data.mobile,
      complaintPointToken: parsed.data.complaint_point_token,
      req,
    });
    if (!result.ok) {
      return jsonError(res, result.status, result.message);
    }
    logEvent("publicOtp.sendOtpHandler", { ms: Date.now() - startedAt });
    return jsonOk(res, result.data);
  } catch (err) {
    logEvent("publicOtp.sendOtpHandler.error", { message: err?.message || "unknown" });
    return jsonError(res, 500, "Failed to send OTP");
  }
}

export async function verifyOtpHandler(req, res) {
  const startedAt = Date.now();
  const parsed = parseVerifyOtpBody(req.body);
  if (!parsed.ok) {
    return jsonError(res, parsed.status, parsed.message, parsed.details ? { details: parsed.details } : {});
  }

  try {
    const result = await verifyPublicOtp({
      otpSessionId: parsed.data.otp_session_id,
      otp: parsed.data.otp,
      req,
    });
    if (!result.ok) {
      return jsonError(res, result.status, result.message);
    }
    logEvent("publicOtp.verifyOtpHandler", { ms: Date.now() - startedAt });
    return jsonOk(res, result.data);
  } catch (err) {
    logEvent("publicOtp.verifyOtpHandler.error", { message: err?.message || "unknown" });
    return jsonError(res, 500, "Failed to verify OTP");
  }
}
