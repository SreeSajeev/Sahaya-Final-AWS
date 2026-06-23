/**
 * WhatsApp / Airtel IQ WA environment (isolated from SMS AIRTEL_IQ_* vars).
 */

import { logEvent } from "../../utils/structuredLog.js";

function truthyEnv(name, fallback = "") {
  const v = process.env[name];
  const s = v != null ? String(v).trim() : "";
  return s !== "" ? s : String(fallback);
}

function envFlag(name, defaultFalse = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return !defaultFalse;
  }
  const v = String(raw).trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function isWhatsAppEnabled() {
  return envFlag("WHATSAPP_ENABLED", true);
}

export function isWhatsAppTestMode() {
  return envFlag("WHATSAPP_TEST_MODE", true);
}

export function airtelWaMsisdnPrefixFromEnv() {
  const v = process.env.AIRTEL_WA_MSISDN_PREFIX;
  if (v === undefined || v === null) return "91";
  return String(v).trim();
}

export function airtelWaTimeoutMsFromEnv() {
  const raw = Number(truthyEnv("AIRTEL_WA_TIMEOUT_MS", "30000"));
  if (Number.isFinite(raw) && raw >= 5000) return Math.min(raw, 180_000);
  return 30_000;
}

/**
 * @returns {{ ok: false, missing: string[] } | {
 *   ok: true,
 *   url: string,
 *   username: string,
 *   password: string,
 *   timeoutMs: number,
 *   sourceAddress: string,
 *   defaultTemplateId: string,
 *   customerId: string | null,
 * }}
 */
export function collectAirtelWaEnvParts() {
  const baseUrl = truthyEnv("AIRTEL_WA_BASE_URL");
  const sendPath = truthyEnv("AIRTEL_WA_SEND_PATH");
  const username = truthyEnv("AIRTEL_WA_USERNAME");
  const password = truthyEnv("AIRTEL_WA_PASSWORD");
  const sourceAddress = truthyEnv("AIRTEL_WA_SOURCE");
  const defaultTemplateId = truthyEnv("AIRTEL_WA_TEMPLATE_ID");

  const missing = [];
  if (!baseUrl) missing.push("AIRTEL_WA_BASE_URL");
  if (!sendPath) missing.push("AIRTEL_WA_SEND_PATH");
  if (!username) missing.push("AIRTEL_WA_USERNAME");
  if (!password) missing.push("AIRTEL_WA_PASSWORD");
  if (!sourceAddress) missing.push("AIRTEL_WA_SOURCE");
  if (!defaultTemplateId) missing.push("AIRTEL_WA_TEMPLATE_ID");

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const customerIdRaw = truthyEnv("AIRTEL_WA_CUSTOMER_ID");
  const customerId = customerIdRaw ? customerIdRaw : null;

  return {
    ok: true,
    url: new URL(sendPath, baseUrl).toString(),
    username,
    password,
    timeoutMs: airtelWaTimeoutMsFromEnv(),
    sourceAddress,
    defaultTemplateId,
    customerId,
  };
}

/** One-line config snapshot for logs (no secrets). */
export function whatsappConfigSnapshot() {
  const parts = collectAirtelWaEnvParts();
  return {
    whatsapp_enabled: isWhatsAppEnabled(),
    whatsapp_test_mode: isWhatsAppTestMode(),
    airtel_wa_configured: parts.ok,
    airtel_wa_missing: parts.ok ? [] : parts.missing,
    airtel_wa_base_host: parts.ok
      ? (() => {
          try {
            return new URL(parts.url).host;
          } catch {
            return null;
          }
        })()
      : null,
    timeout_ms: parts.ok ? parts.timeoutMs : airtelWaTimeoutMsFromEnv(),
    default_template_id: parts.ok ? parts.defaultTemplateId : null,
  };
}

let devConfigLogged = false;

export function logWhatsAppConfigInDevelopment() {
  if (process.env.NODE_ENV === "production") return;
  if (devConfigLogged) return;
  devConfigLogged = true;
  logEvent("whatsapp_config_dev", whatsappConfigSnapshot());
}
