/**
 * Closure (Verify & Close) email recipient helpers.
 * Selected recipients are validated via listClientNotificationEmails +
 * validateNotifyEmailsAgainstAllowed (same as rejection). Additional emails
 * are format-validated only and merged/deduped with the selection.
 */

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse optional free-text additional notify addresses (comma/semicolon).
 * Blank → empty list. Any non-blank token that fails format → error.
 *
 * @param {unknown} raw
 * @returns {{ ok: true; emails: string[] } | { ok: false; error: string }}
 */
export function parseAdditionalNotifyEmails(raw) {
  if (raw == null) return { ok: true, emails: [] };
  const s = String(raw).trim();
  if (!s) return { ok: true, emails: [] };

  const parts = s
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  /** @type {string[]} */
  const emails = [];
  const seen = new Set();

  for (const part of parts) {
    if (!SIMPLE_EMAIL_RE.test(part)) {
      return { ok: false, error: "One or more additional emails have an invalid format" };
    }
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    emails.push(part);
  }

  return { ok: true, emails };
}

/**
 * Merge selected (already validated against client allow-list) with additional
 * (format-validated) addresses. Dedupes case-insensitively; selected order first.
 *
 * @param {string[]} selectedValidated
 * @param {string[]} additionalEmails
 * @returns {string[]}
 */
export function mergeCloseEmailRecipients(selectedValidated, additionalEmails) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();

  function push(email) {
    const t = email == null ? "" : String(email).trim();
    if (!t || !SIMPLE_EMAIL_RE.test(t)) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  }

  for (const e of selectedValidated ?? []) push(e);
  for (const e of additionalEmails ?? []) push(e);
  return out;
}

/**
 * Map listClientNotificationEmails items to the UI/context recipient shape
 * used by rejection-context and closure-context.
 *
 * @param {{ email: string; source: string }[]} items
 * @param {{ name?: string | null } | null} client
 * @returns {{ id: string; email: string; name: string | null; source: string }[]}
 */
export function mapNotificationEmailsForContext(items, client = null) {
  return (items ?? []).map((item) => ({
    id: String(item.email).toLowerCase(),
    email: item.email,
    name: item.source === "contact_email" && client?.name ? String(client.name) : null,
    source: item.source,
  }));
}
