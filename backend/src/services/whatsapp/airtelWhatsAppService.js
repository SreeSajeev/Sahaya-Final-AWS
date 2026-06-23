/**
 * Airtel IQ WhatsApp — isolated from SMS (smsService.js must not be imported here).
 *
 * Env: WHATSAPP_*, AIRTEL_WA_* (see whatsappConfig.js).
 * Adjust buildAirtelWaRequestBody() once Airtel confirms the exact JSON schema.
 */

import axios from "axios";
import dns from "node:dns";
import https from "node:https";
import { performance } from "node:perf_hooks";
import { logEvent } from "../../utils/structuredLog.js";
import {
  airtelWaMsisdnPrefixFromEnv,
  collectAirtelWaEnvParts,
  isWhatsAppEnabled,
  isWhatsAppTestMode,
  logWhatsAppConfigInDevelopment,
} from "./whatsappConfig.js";
import { sanitizePhoneForWhatsApp, toWhatsAppMsisdn } from "./phone.js";
import { redactMsisdn } from "../../utils/redact.js";

/** IPv4-only egress (same class of fix as SMS; duplicated here to avoid coupling). */
const airtelWaHttpsAgent = new https.Agent({
  keepAlive: true,
  family: 4,
});

function airtelWaIpv4Lookup(hostname, _options, callback) {
  dns.lookup(hostname, { family: 4 }, (err, address, family) => {
    if (!err && address) {
      logEvent("airtel_wa_dns_ipv4", { hostname, address, family });
    }
    callback(err, address, family);
  });
}

/**
 * @param {number} timeoutMs
 */
export function buildAirtelWaAxiosOptions(timeoutMs) {
  const t = Number(timeoutMs);
  const timeout = Number.isFinite(t) && t >= 5000 ? Math.min(t, 180_000) : 30_000;
  return {
    httpsAgent: airtelWaHttpsAgent,
    proxy: false,
    maxRedirects: 0,
    family: 4,
    lookup: airtelWaIpv4Lookup,
    timeout,
    validateStatus: () => true,
  };
}

/**
 * Build provider JSON body. Field names may need tuning per Airtel WA contract.
 * @param {{
 *   destinationMsisdn: string,
 *   sourceAddress: string,
 *   templateId: string,
 *   templateVariables: Record<string, string>,
 *   customerId: string | null,
 * }} params
 */
export function buildAirtelWaRequestBody({
  destinationMsisdn,
  sourceAddress,
  templateId,
  templateVariables,
  customerId,
}) {
  const body = {
    sourceAddress,
    destinationAddress: [destinationMsisdn],
    templateId,
    templateParams: templateVariables,
  };
  if (customerId) {
    body.customerId = customerId;
  }
  return body;
}

function previewPayloadForLog(body) {
  try {
    const params =
      body?.templateParams && typeof body.templateParams === "object"
        ? body.templateParams
        : {};
    const paramPreview = Object.fromEntries(
      Object.entries(params).map(([k, v]) => [
        k,
        typeof v === "string" && v.length > 120 ? `${v.slice(0, 120)}…` : v,
      ])
    );
    return {
      customerId: body?.customerId ?? null,
      sourceAddress: body?.sourceAddress ?? null,
      destinationAddress: redactMsisdn(body?.destinationAddress ?? null),
      templateId: body?.templateId ?? null,
      templateParams: paramPreview,
    };
  } catch {
    return { error: "preview_failed" };
  }
}

function providerErrorText(data) {
  if (data == null) return "";
  if (typeof data === "string") return data;
  return String(
    data.errorMessage ??
      data.message ??
      data.msg ??
      data.error ??
      data.displayMessage ??
      data.detail ??
      data.statusText ??
      ""
  );
}

function extractProviderMessageId(data) {
  if (!data || typeof data !== "object") return null;
  const candidates = [
    data.messageId,
    data.message_id,
    data.msgId,
    data.id,
    data.requestId,
    data.transactionId,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() !== "") return String(c).trim();
  }
  return null;
}

function isRetryableHttpStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

function isRetryableTransportError(err) {
  const code = err?.code || err?.cause?.code;
  if (code === "ECONNABORTED" || code === "ECONNRESET" || code === "ETIMEDOUT") return true;
  return /timeout/i.test(String(err?.message || ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @typedef {{
 *   ok: boolean;
 *   success: boolean;
 *   error: string | null;
 *   reason_code: string | null;
 *   skipped?: boolean;
 *   httpStatus?: number | null;
 *   providerMessageId?: string | null;
 *   timingMs?: number;
 *   attempts?: number;
 * }} WhatsAppSendResult
 */

/**
 * @param {{
 *   cleanPhone10: string,
 *   templateId: string,
 *   templateVariables?: Record<string, string>,
 *   requestId?: string | null,
 *   allowWhenGloballyDisabled?: boolean,
 * }} params
 * @returns {Promise<WhatsAppSendResult>}
 */
export async function sendWhatsAppWithResult({
  cleanPhone10,
  templateId,
  templateVariables = {},
  requestId = null,
  allowWhenGloballyDisabled = false,
}) {
  /** @type {(ok: boolean, reason_code: string, error: string | null, extra?: object, skipped?: boolean) => WhatsAppSendResult} */
  const result = (ok, reason_code, error, extra = {}, skipped = false) => ({
    ok,
    success: ok,
    error,
    reason_code,
    skipped,
    httpStatus: extra.httpStatus ?? null,
    providerMessageId: extra.providerMessageId ?? null,
    timingMs: extra.timingMs ?? undefined,
    attempts: extra.attempts ?? undefined,
  });

  logWhatsAppConfigInDevelopment();

  if (!allowWhenGloballyDisabled && !isWhatsAppEnabled()) {
    logEvent("whatsapp_skipped", {
      reason: "whatsapp_enabled_false",
      reason_code: "WHATSAPP_DISABLED",
      requestId,
    });
    return result(
      false,
      "WHATSAPP_DISABLED",
      "WhatsApp is disabled (WHATSAPP_ENABLED is not true)",
      {},
      true
    );
  }

  if (!cleanPhone10 || cleanPhone10.length !== 10) {
    logEvent("whatsapp_invalid_phone", { reason_code: "INVALID_PHONE", requestId, len: cleanPhone10?.length ?? 0 });
    return result(false, "INVALID_PHONE", "Invalid phone: expected 10-digit Indian mobile after normalization", {}, true);
  }

  const envParts = collectAirtelWaEnvParts();
  if (!envParts.ok) {
    logEvent("whatsapp_skipped", {
      reason: "missing_airtel_wa_env",
      missing: envParts.missing,
      reason_code: "MISSING_AIRTEL_WA_ENV",
      requestId,
    });
    return result(
      false,
      "MISSING_AIRTEL_WA_ENV",
      `WhatsApp provider not configured; missing: ${envParts.missing.join(", ")}`,
      {},
      true
    );
  }

  const templateIdFinal = String(templateId || envParts.defaultTemplateId).trim();
  if (!templateIdFinal) {
    return result(false, "MISSING_TEMPLATE_ID", "templateId is required", {}, true);
  }

  const msisdnPrefix = airtelWaMsisdnPrefixFromEnv();
  const destinationMsisdn = toWhatsAppMsisdn(cleanPhone10, msisdnPrefix);
  const body = buildAirtelWaRequestBody({
    destinationMsisdn,
    sourceAddress: envParts.sourceAddress,
    templateId: templateIdFinal,
    templateVariables: templateVariables ?? {},
    customerId: envParts.customerId,
  });

  const { url, username, password, timeoutMs } = envParts;

  if (isWhatsAppTestMode()) {
    logEvent("whatsapp_test_mode", {
      reason_code: "WHATSAPP_TEST_MODE",
      requestId,
      url,
      template_id: templateIdFinal,
      phone_suffix: cleanPhone10.slice(-4),
      payload_preview: previewPayloadForLog(body),
    });
    return result(
      false,
      "WHATSAPP_TEST_MODE",
      "WHATSAPP_TEST_MODE is on; message was not sent to Airtel",
      { timingMs: 0, attempts: 0 },
      true
    );
  }

  const maxAttempts = 2;
  let lastOutcome = null;
  const t0 = performance.now();

  logEvent("whatsapp_send_start", {
    requestId,
    url_host: (() => {
      try {
        return new URL(url).host;
      } catch {
        return null;
      }
    })(),
    template_id: templateIdFinal,
    phone_suffix: cleanPhone10.slice(-4),
    payload_preview: previewPayloadForLog(body),
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      logEvent("whatsapp_send_retry", { requestId, attempt, template_id: templateIdFinal });
      await sleep(500);
    }

    try {
      const resp = await axios.post(url, body, {
        auth: { username, password },
        headers: { "Content-Type": "application/json" },
        ...buildAirtelWaAxiosOptions(timeoutMs),
      });

      const { data, status } = resp;
      const bodyStr = typeof data === "string" ? data : JSON.stringify(data ?? {});
      const timingMs = Math.round(performance.now() - t0);

      logEvent("airtel_wa_response", {
        requestId,
        attempt,
        http_status: status,
        timing_ms: timingMs,
        template_id: templateIdFinal,
        body_preview: bodyStr.length > 800 ? `${bodyStr.slice(0, 800)}…` : bodyStr,
        provider_message_id: extractProviderMessageId(data),
      });

      if (status >= 200 && status < 300) {
        const errText = providerErrorText(data);
        const errCode = data && typeof data === "object" && data.errorCode != null ? String(data.errorCode) : "";
        if (/insufficient_balance/i.test(errText) || /INSUFFICIENT_BALANCE/i.test(errCode)) {
          lastOutcome = result(false, "INSUFFICIENT_BALANCE", `Airtel WA refused: ${errText.slice(0, 200)}`, {
            httpStatus: status,
            timingMs,
            attempts: attempt,
          });
          break;
        }
        if (typeof data === "object" && data && data.success === false) {
          lastOutcome = result(false, "PROVIDER_REFUSED", `Airtel WA rejected: ${errText.slice(0, 240)}`, {
            httpStatus: status,
            timingMs,
            attempts: attempt,
          });
          break;
        }
        logEvent("whatsapp_send_ok", {
          requestId,
          template_id: templateIdFinal,
          timing_ms: timingMs,
          provider_message_id: extractProviderMessageId(data),
        });
        return result(true, "OK", null, {
          httpStatus: status,
          providerMessageId: extractProviderMessageId(data),
          timingMs,
          attempts: attempt,
        });
      }

      const errMsg = providerErrorText(data) || `HTTP ${status}`;
      lastOutcome = result(false, "PROVIDER_HTTP_ERROR", `Airtel WA HTTP ${status}: ${errMsg.slice(0, 200)}`, {
        httpStatus: status,
        timingMs,
        attempts: attempt,
      });

      if (!isRetryableHttpStatus(status) || attempt >= maxAttempts) {
        break;
      }
    } catch (err) {
      const timingMs = Math.round(performance.now() - t0);
      const code = err?.code || err?.cause?.code;
      const isTimeout = code === "ECONNABORTED" || /timeout/i.test(String(err?.message || ""));

      if (err.response) {
        const d = err.response.data;
        const ds = typeof d === "string" ? d : JSON.stringify(d ?? {});
        logEvent("airtel_wa_response", {
          requestId,
          attempt,
          http_status: err.response.status,
          transport: "axios_error_with_response",
          body_preview: ds.length > 800 ? `${ds.slice(0, 800)}…` : ds,
          timing_ms: timingMs,
        });
        lastOutcome = result(
          false,
          "PROVIDER_HTTP_ERROR",
          `Airtel WA request failed (HTTP ${err.response.status})`,
          { httpStatus: err.response.status, timingMs, attempts: attempt }
        );
        if (!isRetryableHttpStatus(err.response.status) || attempt >= maxAttempts) {
          break;
        }
        continue;
      }

      logEvent("whatsapp_transport_error", {
        requestId,
        attempt,
        reason_code: isTimeout ? "PROVIDER_TIMEOUT" : "NETWORK_ERROR",
        code: code || null,
        message: String(err?.message || err).slice(0, 300),
        timing_ms: timingMs,
      });

      lastOutcome = result(
        false,
        isTimeout ? "PROVIDER_TIMEOUT" : "NETWORK_ERROR",
        isTimeout
          ? "WhatsApp provider request timed out"
          : `WhatsApp send failed: ${String(err?.message || err).slice(0, 200)}`,
        { timingMs, attempts: attempt }
      );

      if (!isRetryableTransportError(err) || attempt >= maxAttempts) {
        break;
      }
    }
  }

  logEvent("whatsapp_send_failed", {
    requestId,
    reason_code: lastOutcome?.reason_code ?? "UNKNOWN",
    timing_ms: lastOutcome?.timingMs ?? Math.round(performance.now() - t0),
    attempts: lastOutcome?.attempts ?? maxAttempts,
  });

  return (
    lastOutcome ??
    result(false, "UNKNOWN", "WhatsApp send failed with no outcome", {
      timingMs: Math.round(performance.now() - t0),
      attempts: maxAttempts,
    })
  );
}

/**
 * @param {{ phoneNumber: string, templateId?: string, templateVariables?: Record<string, string>, requestId?: string | null, allowWhenGloballyDisabled?: boolean }} params
 */
export async function sendWhatsAppToPhone(params) {
  const clean = sanitizePhoneForWhatsApp(params.phoneNumber);
  return sendWhatsAppWithResult({
    cleanPhone10: clean,
    templateId: params.templateId ?? "",
    templateVariables: params.templateVariables ?? {},
    requestId: params.requestId ?? null,
    allowWhenGloballyDisabled: Boolean(params.allowWhenGloballyDisabled),
  });
}
