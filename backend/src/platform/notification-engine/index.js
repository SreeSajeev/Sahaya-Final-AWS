/**
 * Notification template escaping — prevent stored XSS via {{variables}}.
 */

const DANGEROUS_URL_RE = /^(?:\s)*(?:javascript|data|vbscript)\s*:/i;

/**
 * Escape for HTML text nodes / element body.
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape for HTML attribute context (stricter quote handling).
 */
export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

/**
 * Escape / sanitize URL values — block javascript:/data: and normalize.
 */
export function escapeUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (DANGEROUS_URL_RE.test(raw)) return "";
  // Encode angle brackets and quotes that break out of href
  return escapeAttr(raw);
}

/**
 * Escape for Markdown (disable raw HTML injection via vars).
 */
export function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/([\\`*_{}[\]()#+.!|-])/g, "\\$1")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Plain text context — strip control chars; no HTML decode tricks.
 */
export function escapeText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * @param {"html"|"attr"|"url"|"markdown"|"text"} mode
 */
export function escapeByMode(value, mode) {
  switch (mode) {
    case "attr":
      return escapeAttr(value);
    case "url":
      return escapeUrl(value);
    case "markdown":
      return escapeMarkdown(value);
    case "text":
      return escapeText(value);
    case "html":
    default:
      return escapeHtml(value);
  }
}

function resolvePath(vars, path) {
  const parts = String(path).split(".");
  let cur = vars;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return "";
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return "";
    cur = cur[p];
  }
  return cur == null ? "" : cur;
}

/**
 * Render {{path}} with mandatory escaping.
 * Syntax extensions (optional): {{path|url}} {{path|attr}} {{path|markdown}} {{path|text}}
 */
export function renderTemplateString(input, vars, defaultMode = "html") {
  const src = String(input ?? "");
  return src.replace(/\{\{\s*([a-zA-Z0-9_.]+)(?:\|(html|attr|url|markdown|text))?\s*\}\}/g, (_m, path, mode) => {
    const raw = resolvePath(vars, path);
    return escapeByMode(raw, mode || defaultMode);
  });
}

export function validateTemplate(template) {
  if (!template || typeof template !== "object") return { ok: false, error: "template required" };
  if (!template.channel) return { ok: false, error: "channel required" };
  return { ok: true };
}

export function renderNotification(template, vars) {
  const v = validateTemplate(template);
  if (!v.ok) return { ok: false, error: v.error };
  return {
    ok: true,
    channel: template.channel,
    subject: renderTemplateString(template.subject_template || template.subject || "", vars, "text"),
    bodyHtml: renderTemplateString(template.body_html || template.bodyHtml || "", vars, "html"),
    bodyText: renderTemplateString(template.body_text || template.bodyText || "", vars, "text"),
  };
}

export function shouldSend(trigger, context) {
  if (!trigger) return true;
  if (trigger.event && trigger.event !== context.event) return false;
  if (trigger.condition?.field != null) {
    const actual = context.data?.[trigger.condition.field];
    if (
      Object.prototype.hasOwnProperty.call(trigger.condition, "equals") &&
      String(actual) !== String(trigger.condition.equals)
    ) {
      return false;
    }
  }
  return true;
}
