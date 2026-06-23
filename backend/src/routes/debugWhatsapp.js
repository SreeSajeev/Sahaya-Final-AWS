/**
 * Isolated WhatsApp debug routes (INTERNAL_TRIGGER_SECRET via X-Internal-Secret).
 * Does not import smsService.js.
 */

import express from "express";
import { z } from "zod";
import { jsonRes, jsonOk } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import {
  sanitizePhoneForWhatsApp,
  toWhatsAppMsisdn,
} from "../services/whatsapp/phone.js";
import {
  buildAirtelWaRequestBody,
  sendWhatsAppToPhone,
} from "../services/whatsapp/airtelWhatsAppService.js";
import {
  collectAirtelWaEnvParts,
  whatsappConfigSnapshot,
  airtelWaMsisdnPrefixFromEnv,
} from "../services/whatsapp/whatsappConfig.js";

const router = express.Router();

function requireInternalTriggerSecret(req, res, next) {
  const configured = String(process.env.INTERNAL_TRIGGER_SECRET || "").trim();
  if (!configured) {
    logEvent("debug_whatsapp_auth", { ok: false, reason: "INTERNAL_TRIGGER_SECRET_unset" });
    return jsonRes(res, 503, { error: "debug routes disabled (INTERNAL_TRIGGER_SECRET unset)" });
  }
  const secret = req.headers["x-internal-secret"];
  if (secret !== configured) {
    logEvent("debug_whatsapp_auth", { ok: false, reason: "bad_secret" });
    return jsonRes(res, 401, { error: "unauthorized" });
  }
  next();
}

const sendTestBodySchema = z.object({
  phone: z.string().min(10).max(32),
  templateId: z.string().min(1).max(256).optional(),
  variables: z.record(z.string()).optional().default({}),
});

router.get("/debug/whatsapp-config", requireInternalTriggerSecret, (req, res) => {
  const requestId = req.requestId ?? null;
  return jsonOk(res, {
    debug: "whatsapp-config",
    requestId,
    config: whatsappConfigSnapshot(),
  });
});

router.post("/debug/whatsapp-send-test", requireInternalTriggerSecret, async (req, res) => {
  const requestId = req.requestId ?? null;
  const parsed = sendTestBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return jsonRes(res, 400, {
      error: "invalid body",
      details: parsed.error.flatten(),
      requestId,
    });
  }

  const clean = sanitizePhoneForWhatsApp(parsed.data.phone);
  if (clean.length !== 10) {
    return jsonRes(res, 400, {
      error: "phone must normalize to 10-digit Indian mobile",
      normalized_len: clean.length,
      requestId,
    });
  }

  const envParts = collectAirtelWaEnvParts();
  if (!envParts.ok) {
    return jsonRes(res, 400, {
      error: "missing Airtel WA env",
      missing: envParts.missing,
      requestId,
      config: whatsappConfigSnapshot(),
    });
  }

  const templateId = parsed.data.templateId?.trim() || envParts.defaultTemplateId;
  const templateVariables = parsed.data.variables ?? {};
  const destinationMsisdn = toWhatsAppMsisdn(clean, airtelWaMsisdnPrefixFromEnv());
  const requestPayload = buildAirtelWaRequestBody({
    destinationMsisdn,
    sourceAddress: envParts.sourceAddress,
    templateId,
    templateVariables,
    customerId: envParts.customerId,
  });

  logEvent("debug_whatsapp_send_test_start", {
    requestId,
    template_id: templateId,
    phone_suffix: clean.slice(-4),
    config: whatsappConfigSnapshot(),
  });

  const outcome = await sendWhatsAppToPhone({
    phoneNumber: parsed.data.phone,
    templateId,
    templateVariables,
    requestId,
    /** Debug may run before WHATSAPP_ENABLED is flipped for assignment traffic. */
    allowWhenGloballyDisabled: true,
  });

  logEvent("debug_whatsapp_send_test_end", {
    requestId,
    ok: outcome.ok,
    reason_code: outcome.reason_code,
    skipped: Boolean(outcome.skipped),
    timing_ms: outcome.timingMs ?? null,
    attempts: outcome.attempts ?? null,
    provider_message_id: outcome.providerMessageId ?? null,
  });

  const httpStatus = outcome.ok ? 200 : outcome.skipped ? 200 : 502;

  return jsonRes(res, httpStatus, {
    debug: "whatsapp-send-test",
    requestId,
    ok: outcome.ok,
    skipped: Boolean(outcome.skipped),
    reason_code: outcome.reason_code,
    error: outcome.error,
    timing_ms: outcome.timingMs ?? null,
    attempts: outcome.attempts ?? null,
    http_status: outcome.httpStatus ?? null,
    provider_message_id: outcome.providerMessageId ?? null,
    request_payload: requestPayload,
    config: whatsappConfigSnapshot(),
  });
});

export default router;
