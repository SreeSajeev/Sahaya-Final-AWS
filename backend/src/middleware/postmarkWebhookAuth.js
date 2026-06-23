import { jsonRes } from "../utils/http.js";
import { logJson } from "../utils/jsonLog.js";

/**
 * Optional shared secret for inbound Postmark webhook.
 * If POSTMARK_WEBHOOK_SECRET is unset or empty → no check (backward compatible).
 * If set → require matching header (X-Postmark-Webhook-Secret or X-Webhook-Secret).
 */
export function optionalPostmarkWebhookSecret(req, res, next) {
  const expected = process.env.POSTMARK_WEBHOOK_SECRET;
  if (expected == null || String(expected).trim() === "") {
    return next();
  }
  const got =
    req.headers["x-postmark-webhook-secret"] || req.headers["x-webhook-secret"];
  if (got !== expected) {
    logJson("warn", "postmark_webhook_secret_rejected", {
      requestId: req.requestId,
    });
    return jsonRes(res, 401, { error: "Unauthorized" });
  }
  next();
}
