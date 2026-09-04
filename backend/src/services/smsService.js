/**
 * SMS service — Airtel IQ prepaid SMS (`POST .../api/v1/send-prepaid-sms`).
 *
 * Verified request shape (Airtel IQ rejects unknown / wrong-typed fields with HTTP 400
 * "Failed to read request" during JSON binding). Required JSON fields:
 * - customerId (UUID string)
 * - messageType (must match DLT registration, e.g. "SERVICE_IMPLICIT" or "TRANSACTIONAL")
 * - destinationAddress (array of MSISDN strings — NOT a single string)
 * - message (exact DLT template text)
 * - sourceAddress (DLT header / sender id)
 * - entityId (DLT entity id)
 * - dltTemplateId (DLT template id)
 *
 * Uses env:
 * - SMS_ENABLED (default false)
 * - SMS_TEST_MODE (default false)
 * - AIRTEL_IQ_BASE_URL (required)
 * - AIRTEL_IQ_SMS_PATH (required)
 * - AIRTEL_IQ_USERNAME (required)
 * - AIRTEL_IQ_PASSWORD (required)
 * - AIRTEL_IQ_CUSTOMER_ID (required)
 * - AIRTEL_IQ_SOURCE_ADDRESS (required)
 * - AIRTEL_IQ_DLT_TEMPLATE_ID (required)
 * - AIRTEL_IQ_ENTITY_ID (required)
 * - AIRTEL_IQ_MESSAGE_TYPE (optional; default SERVICE_IMPLICIT — set to your registered type)
 * - AIRTEL_IQ_MSISDN_PREFIX (optional; default "91" → destinationAddress 91XXXXXXXXXX like manual curl)
 * - AIRTEL_IQ_TIMEOUT_MS (optional; default 30000 — raise on Render if Airtel is slow; max clamp 180000)
 * - SMS_ASSIGNMENT_TEMPLATE (optional; used by assignment flow)
 * FE action links use APP_BASE_URL from appConfig.
 */

import axios from "axios";
import dns from "node:dns";
import https from "node:https";
import { APP_BASE_URL } from "../config/appConfig.js";
import { logEvent } from "../utils/structuredLog.js";
import { redactFeActionUrls, redactMsisdn } from "../utils/redact.js";

/**
 * Cloud hosts (Render, etc.) often prefer IPv6; routes to some Indian APIs can stall until
 * the client times out. Force IPv4 for Airtel IQ only.
 */
export const airtelHttpsAgent = new https.Agent({
  keepAlive: true,
  family: 4,
});

/** Axios custom lookup — IPv4 only + one structured log per send for egress debugging. */
export function airtelIpv4Lookup(hostname, _options, callback) {
  dns.lookup(hostname, { family: 4 }, (err, address, family) => {
    if (!err && address) {
      logEvent("airtel_sms_dns_ipv4", { hostname, address, family });
    }
    callback(err, address, family);
  });
}

/**
 * Shared axios options for Airtel IQ (matches production SMS sends).
 * @param {number} timeoutMs
 */
export function buildAirtelAxiosOptions(timeoutMs) {
  const t = Number(timeoutMs);
  const timeout = Number.isFinite(t) && t >= 5000 ? Math.min(t, 180_000) : 30_000;
  return {
    httpsAgent: airtelHttpsAgent,
    proxy: false,
    maxRedirects: 0,
    family: 4,
    lookup: airtelIpv4Lookup,
    timeout,
    validateStatus: () => true,
  };
}

/**
 * Build URL + JSON body + auth for Airtel prepaid SMS (10-digit national `cleanPhone10` after sanitize).
 * @param {{ cleanPhone10: string, message: string }} params
 * @returns {{ ok: false, missing: string[] } | { ok: true, url: string, body: object, username: string, password: string, timeoutMs: number, messageType: string, destinationMsisdn: string }}
 */
export function collectAirtelSendParts({
  cleanPhone10,
  message,
  dltTemplateId: dltTemplateIdOverride = null,
  messageType: messageTypeOverride = null,
} = {}) {
  const baseUrl = truthyEnv("AIRTEL_IQ_BASE_URL");
  const smsPath = truthyEnv("AIRTEL_IQ_SMS_PATH");
  const username = truthyEnv("AIRTEL_IQ_USERNAME");
  const password = truthyEnv("AIRTEL_IQ_PASSWORD");
  const customerId = truthyEnv("AIRTEL_IQ_CUSTOMER_ID");
  const sourceAddress = truthyEnv("AIRTEL_IQ_SOURCE_ADDRESS");
  const dltTemplateId =
    safeTrimOverride(dltTemplateIdOverride) || truthyEnv("AIRTEL_IQ_DLT_TEMPLATE_ID");
  const entityId = truthyEnv("AIRTEL_IQ_ENTITY_ID");
  const messageType =
    safeTrimOverride(messageTypeOverride) || truthyEnv("AIRTEL_IQ_MESSAGE_TYPE", "SERVICE_IMPLICIT");
  const msisdnPrefix = airtelMsisdnPrefixFromEnv();
  const rawTimeout = Number(truthyEnv("AIRTEL_IQ_TIMEOUT_MS", "30000"));
  const timeoutMs =
    Number.isFinite(rawTimeout) && rawTimeout >= 5000 ? Math.min(rawTimeout, 180_000) : 30_000;

  const missing = [];
  if (!baseUrl) missing.push("AIRTEL_IQ_BASE_URL");
  if (!smsPath) missing.push("AIRTEL_IQ_SMS_PATH");
  if (!username) missing.push("AIRTEL_IQ_USERNAME");
  if (!password) missing.push("AIRTEL_IQ_PASSWORD");
  if (!customerId) missing.push("AIRTEL_IQ_CUSTOMER_ID");
  if (!sourceAddress) missing.push("AIRTEL_IQ_SOURCE_ADDRESS");
  if (!dltTemplateId) missing.push("AIRTEL_IQ_DLT_TEMPLATE_ID");
  if (!entityId) missing.push("AIRTEL_IQ_ENTITY_ID");
  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const url = new URL(smsPath, baseUrl).toString();
  const text = message ?? "";
  const destinationMsisdn = msisdnPrefix ? `${msisdnPrefix}${cleanPhone10}` : cleanPhone10;
  const body = {
    customerId,
    messageType,
    destinationAddress: [destinationMsisdn],
    message: text,
    sourceAddress,
    entityId,
    dltTemplateId,
  };
  return {
    ok: true,
    url,
    body,
    username,
    password,
    timeoutMs,
    messageType,
    destinationMsisdn,
  };
}

function truthyEnv(name, fallback = "") {
  const v = process.env[name];
  const s = v != null ? String(v).trim() : "";
  return s !== "" ? s : String(fallback);
}

function safeTrimOverride(value) {
  if (value == null) return "";
  const s = String(value).trim();
  return s !== "" ? s : "";
}

/** Unset → "91" (matches manual curl). Explicit empty string → no prefix (10-digit national). */
function airtelMsisdnPrefixFromEnv() {
  const v = process.env.AIRTEL_IQ_MSISDN_PREFIX;
  if (v === undefined || v === null) return "91";
  return String(v).trim();
}

function isSmsEnabled() {
  const v = truthyEnv("SMS_ENABLED", "false").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function isSmsTestMode() {
  const v = truthyEnv("SMS_TEST_MODE", "false").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Build FE action page URL for SMS/email.
 * @param {string} tokenId - fe_action_tokens.id (UUID)
 * @returns {string}
 */
export function buildFEActionURL(tokenId) {
  return `${APP_BASE_URL}/fe/action/${tokenId}`;
}

/**
 * Sanitize Indian mobile to 10 national digits (spaces / + / - removed).
 * Handles +91 / 91 / 00… international prefixes; rejects if fewer than 10 national digits.
 * @param {string} phone
 * @returns {string} 10-digit or empty
 */
export function sanitizePhoneForSms(phone) {
  if (phone == null || phone === "") return "";
  const raw = String(phone).trim();
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (!d) return "";
  // International access code(s), e.g. 0091… (slice(-10) alone would corrupt these)
  while (d.startsWith("00") && d.length > 10) {
    d = d.slice(2);
  }
  // Drop India CC 91 when present (…91XXXXXXXXXX → 10-digit national)
  if (d.startsWith("91") && d.length >= 12) {
    d = d.slice(2);
  }
  // National trunk 0 (less common in DB)
  if (d.startsWith("0") && d.length === 11) {
    d = d.slice(1);
  }
  if (d.length > 10) {
    d = d.slice(-10);
  }
  return d.length === 10 ? d : "";
}

/**
 * Render the DLT-registered assignment SMS message.
 * Template default: "Login to sahaya.pariskq.in for ticket no {#alphanumeric}"
 * Override via SMS_ASSIGNMENT_TEMPLATE when DLT-registered copy differs.
 * @param {{ ticketNumber: string }} params
 */
export function renderAssignmentSms({ ticketNumber }) {
  const tmpl = truthyEnv(
    "SMS_ASSIGNMENT_TEMPLATE",
    "Login to sahaya.pariskq.in for ticket no {#alphanumeric}"
  );
  const tn = ticketNumber != null ? String(ticketNumber).trim() : "";
  return tmpl.replace("{#alphanumeric}", tn);
}

/**
 * DLT OTP template (public complaint intake). Swap AIRTEL_IQ_DLT_OTP_TEMPLATE_ID when approved.
 * @param {{ otp: string }} params
 */
export function renderOtpSms({ otp }) {
  const tmpl = truthyEnv(
    "SMS_OTP_TEMPLATE",
    "Sahaya OTP: {#OTP#}. Valid for 5 minutes. Do not share this code with anyone."
  );
  const code = otp != null ? String(otp).trim() : "";
  return tmpl.replace("{#OTP#}", code);
}

/** Default per-send overrides for public OTP (env-swappable without code changes). */
export function resolveOtpSmsProviderOverrides() {
  return {
    dltTemplateId: truthyEnv("AIRTEL_IQ_DLT_OTP_TEMPLATE_ID", "TEST_OTP_TEMPLATE"),
    messageType: truthyEnv("AIRTEL_IQ_OTP_MESSAGE_TYPE", "TRANSACTIONAL"),
  };
}

/** Placeholder for OTP SMS bodies in logs — never log the real code. */
export const OTP_MESSAGE_REDACT_PLACEHOLDER = "[OTP_REDACTED]";

/**
 * Strip OTP values from SMS text before logging (assignment SMS unchanged when redactOtp=false).
 * @param {string} message
 */
export function redactOtpFromMessageForLog(message) {
  if (message == null || message === "") return "";
  let s = String(message);
  s = s.replace(/\{#OTP#\}/gi, OTP_MESSAGE_REDACT_PLACEHOLDER);
  s = s.replace(/(?:OTP|otp|code)\s*[:\-]?\s*\d{6}\b/gi, (match) =>
    match.replace(/\d{6}/, OTP_MESSAGE_REDACT_PLACEHOLDER)
  );
  s = s.replace(/\b\d{6}\b/g, OTP_MESSAGE_REDACT_PLACEHOLDER);
  return s;
}

function truncateForLog(text, maxLen = 160) {
  const s = text != null ? String(text) : "";
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

function redactMessageForLog(message, { redactOtp = false } = {}) {
  let msg = message != null ? String(message) : "";
  if (redactOtp) msg = redactOtpFromMessageForLog(msg);
  return redactFeActionUrls(msg);
}

/** Redact / truncate for debug logs. OTP sends must pass redactOtp=true. */
function previewPayloadForLog(body, { redactOtp = false } = {}) {
  try {
    const rawMsg = body?.message != null ? String(body.message) : "";
    const msg = redactMessageForLog(rawMsg, { redactOtp });
    return {
      customerId: body?.customerId ?? null,
      messageType: body?.messageType ?? null,
      destinationAddress: redactMsisdn(body?.destinationAddress ?? null),
      sourceAddress: body?.sourceAddress ?? null,
      entityId: body?.entityId ?? null,
      dltTemplateId: body?.dltTemplateId ?? null,
      message_redacted: redactOtp,
      message_preview: truncateForLog(msg),
    };
  } catch {
    return { error: "preview_failed" };
  }
}

function previewProviderBodyForLog(data, { redactOtp = false } = {}) {
  const bodyStr = typeof data === "string" ? data : JSON.stringify(data ?? {});
  const text = redactMessageForLog(bodyStr, { redactOtp });
  return text.length > 800 ? `${text.slice(0, 800)}…` : text;
}

/**
 * @typedef {{ ok: boolean; success: boolean; error: string | null; reason_code: string | null; skipped?: boolean }} SmsSendResult
 */

/**
 * Send SMS to Airtel IQ; returns structured outcome for APIs and logs.
 * @param {{ phoneNumber: string, message: string }} params
 * @returns {Promise<SmsSendResult>}
 */
export async function sendFESmsWithResult({
  phoneNumber,
  message,
  dltTemplateId = null,
  messageType = null,
  /** When true, OTP SMS bodies are never written to logs (public complaint intake). */
  logRedactOtp = false,
}) {
  /** @returns {SmsSendResult} */
  const r = (ok, reason_code, error, skipped = false) => ({ ok, success: ok, error, reason_code, skipped });

  if (!isSmsEnabled()) {
    logEvent("sms_skipped_reason", { reason: "sms_enabled_false", reason_code: "SMS_DISABLED" });
    console.log("[SMS] Skipped: SMS_ENABLED=false");
    return r(false, "SMS_DISABLED", "SMS is disabled (SMS_ENABLED is not true)", true);
  }

  const rawPhone = phoneNumber != null ? String(phoneNumber).trim() : "";
  const cleanPhone = sanitizePhoneForSms(rawPhone);

  console.log(
    "[SMS] phone last4=",
    cleanPhone.length === 10 ? cleanPhone.slice(-4) + "****" : "invalid",
    "len=",
    cleanPhone.length
  );

  if (cleanPhone.length !== 10) {
    logEvent("invalid_phone", {
      reason: "not_10_digits_after_sanitize",
      reason_code: "INVALID_PHONE",
      len: cleanPhone.length,
    });
    console.error("[SMS] Skipped: invalid or missing 10-digit phone");
    return r(
      false,
      "INVALID_PHONE",
      "Invalid phone number: expected 10-digit Indian mobile after normalization",
      true
    );
  }

  const parts = collectAirtelSendParts({
    cleanPhone10: cleanPhone,
    message: message ?? "",
    dltTemplateId,
    messageType,
  });
  if (!parts.ok) {
    logEvent("sms_skipped_reason", { reason: "missing_airtel_env", missing: parts.missing, reason_code: "MISSING_AIRTEL_ENV" });
    console.error("[SMS] Failed: missing Airtel IQ env vars:", parts.missing.join(", "));
    return r(
      false,
      "MISSING_AIRTEL_ENV",
      `SMS provider not configured; missing environment variables: ${parts.missing.join(", ")}`,
      true
    );
  }

  const { url, body, username, password, timeoutMs } = parts;

  try {
    if (isSmsTestMode()) {
      logEvent("sms_skipped_reason", {
        reason: "sms_test_mode",
        reason_code: "SMS_TEST_MODE",
        url,
        phone_suffix: cleanPhone.slice(-4),
      });
      console.log("[SMS] TEST MODE: not sending; would POST Airtel IQ", {
        url,
        phoneSuffix: cleanPhone.slice(-4),
      });
      return r(false, "SMS_TEST_MODE", "SMS test mode is on (SMS_TEST_MODE); message was not sent to Airtel", true);
    }

    logEvent("airtel_sms_payload_preview", previewPayloadForLog(body, { redactOtp: logRedactOtp }));

    console.log(">>> About to call Airtel IQ SMS (json)", logRedactOtp ? { otp_redacted: true } : {});
    const resp = await axios.post(url, body, {
      auth: { username, password },
      headers: { "Content-Type": "application/json" },
      ...buildAirtelAxiosOptions(timeoutMs),
    });

    const { data, status } = resp;
    const bodyPreview = previewProviderBodyForLog(data, { redactOtp: logRedactOtp });
    logEvent("airtel_sms_response", {
      status,
      body_preview: bodyPreview,
      message_redacted: logRedactOtp,
    });
    logEvent("sms_provider_response", {
      status,
      body_preview: bodyPreview,
      message_redacted: logRedactOtp,
    });
    console.log("[SMS] Airtel IQ response status=", status, { body_preview: bodyPreview });

    if (status >= 200 && status < 300) {
      const errText =
        data && typeof data === "object"
          ? String(
              data.message ??
                data.msg ??
                data.error ??
                data.errorMessage ??
                data.displayMessage ??
                data.detail ??
                data.statusText ??
                ""
            )
          : typeof data === "string"
            ? data
            : "";
      const errCode = data && typeof data === "object" && data.errorCode != null ? String(data.errorCode) : "";
      if (/insufficient_balance/i.test(errText) || /INSUFFICIENT_BALANCE/i.test(errCode)) {
        logEvent("airtel_sms_insufficient_balance", {
          status,
          errorCode: errCode || null,
          message: errText.slice(0, 200),
          reason_code: "INSUFFICIENT_BALANCE",
        });
        console.error(
          "[SMS] Airtel IQ returned success HTTP but business refusal (INSUFFICIENT_BALANCE). Top up prepaid / SMS credits in Airtel IQ."
        );
        return r(false, "INSUFFICIENT_BALANCE", "Airtel IQ refused: insufficient SMS balance / credits");
      }
      if (typeof data === "object" && data && data.success === false) {
        logEvent("airtel_sms_provider_refusal", {
          status,
          message: errText.slice(0, 200),
          reason_code: "PROVIDER_REFUSED",
        });
        console.error(
          "[SMS] Airtel IQ success HTTP but success=false:",
          errText ? errText.slice(0, 200) : previewProviderBodyForLog(data, { redactOtp: logRedactOtp })
        );
        const detail = errText.slice(0, 240) || "provider returned success=false";
        return r(false, "PROVIDER_REFUSED", `Airtel IQ rejected the request: ${detail}`);
      }
      console.log("[SMS] Sent successfully");
      logEvent("sms_sent_ok", { reason_code: "OK" });
      return r(true, "OK", null);
    }

    const errMsg =
      data && typeof data === "object"
        ? String(
            data.errorMessage ||
              data.message ||
              data.msg ||
              data.error ||
              data.detail ||
              data.displayMessage ||
              "unknown_provider_error"
          )
        : `HTTP ${status}`;
    if (data && typeof data === "object") {
      const errorCode = data.errorCode != null ? String(data.errorCode) : "";
      logEvent("airtel_sms_error_response", {
        httpStatus: status,
        errorCode: errorCode || null,
        errorMessage: errMsg.slice(0, 300),
        reason_code: "PROVIDER_HTTP_ERROR",
      });
      if (
        /INSUFFICIENT_BALANCE/i.test(errorCode) ||
        /insufficient_balance/i.test(errMsg) ||
        /not enough credits/i.test(errMsg.toLowerCase())
      ) {
        logEvent("airtel_sms_insufficient_balance", {
          httpStatus: status,
          errorCode: errorCode || null,
          message: errMsg.slice(0, 200),
        });
        console.error(
          "[SMS] Airtel IQ refused send (credits / balance). errorCode=INSUFFICIENT_BALANCE — top up prepaid wallet in Airtel IQ."
        );
        return r(false, "INSUFFICIENT_BALANCE", `Airtel IQ refused: ${errMsg.slice(0, 200)}`);
      }
    }
    console.error("[SMS] Provider error:", errMsg);
    return r(false, "PROVIDER_HTTP_ERROR", `Airtel IQ returned HTTP ${status}: ${errMsg.slice(0, 200)}`);
  } catch (err) {
    const code = err?.code || err?.cause?.code;
    const isTimeout = code === "ECONNABORTED" || /timeout/i.test(String(err?.message || ""));
    if (err.response) {
      const d = err.response.data;
      const ds = previewProviderBodyForLog(d, { redactOtp: logRedactOtp });
      logEvent("airtel_sms_response", {
        status: err.response.status,
        body_preview: ds,
        transport: "error",
        reason_code: "PROVIDER_HTTP_ERROR",
        message_redacted: logRedactOtp,
      });
      console.error("[SMS] Provider response status=", err.response.status, { body_preview: ds });
      return r(
        false,
        "PROVIDER_HTTP_ERROR",
        `Airtel request failed (HTTP ${err.response.status})`
      );
    }
    const errMsg = err?.message || String(err);
    console.error("[SMS] Request failed:", errMsg);
    if (isTimeout) {
      logEvent("sms_transport_error", { reason_code: "PROVIDER_TIMEOUT", message: errMsg.slice(0, 200) });
      return r(
        false,
        "PROVIDER_TIMEOUT",
        "SMS provider request timed out. From cloud hosts this often means TLS or TCP never completes to Airtel (geo/IP allowlist, firewall). Try Render Shell: curl -4 -m 15 -v https://iqsms.airtel.in/ ; if that hangs too, use an India egress relay or ask Airtel to allow your egress IPs. You can raise AIRTEL_IQ_TIMEOUT_MS (max 180000) if responses are genuinely slow."
      );
    }
    logEvent("sms_transport_error", { reason_code: "NETWORK_ERROR", message: errMsg.slice(0, 200) });
    return r(false, "NETWORK_ERROR", `SMS send failed: ${errMsg.slice(0, 200)}`);
  }
}

/**
 * @returns {Promise<boolean>} true if sent successfully; false otherwise
 */
export async function sendFESms(params) {
  const out = await sendFESmsWithResult(params);
  return out.ok;
}
