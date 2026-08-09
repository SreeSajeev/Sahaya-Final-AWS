/**
 * Plugin / Integration Engine — lifecycle metadata only.
 */

export const PLUGIN_STATUSES = Object.freeze(["installed", "configured", "enabled", "disabled"]);

export function validatePluginConfig(config) {
  if (!config?.key) return { ok: false, error: "key required" };
  if (!config.provider && !config.name) return { ok: false, error: "provider or name required" };
  return { ok: true };
}

export function validateWebhook(wh) {
  if (!wh?.url) return { ok: false, error: "url required" };
  try {
    const u = new URL(String(wh.url));
    if (!["http:", "https:"].includes(u.protocol)) return { ok: false, error: "invalid protocol" };
  } catch {
    return { ok: false, error: "invalid url" };
  }
  return { ok: true };
}

export function buildWebhookPayload(event, ticket, extra = {}) {
  return {
    event,
    ticket_number: ticket?.ticket_number,
    status: ticket?.status_key,
    data: ticket?.data_json || ticket?.data || {},
    at: new Date().toISOString(),
    ...extra,
  };
}
