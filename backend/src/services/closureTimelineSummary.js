/**
 * Build a compact activity summary for closure emails / audit.
 * Pure helper — safe for unit tests.
 */

/**
 * @param {object} opts
 * @param {Array<{ created_at?: string|null, source?: string|null, body?: string|null, attachments?: unknown }>|null|undefined} opts.comments
 * @param {string|null|undefined} opts.closedByName
 * @param {string|null|undefined} opts.resolutionLocationName
 * @param {{ fields?: Array<{ label?: unknown }>, values?: Record<string, unknown> }|null|undefined} opts.closeFormSnapshot
 * @param {number} [opts.maxLines]
 */
export function buildClosureTimelineSummary({
  comments,
  closedByName = null,
  resolutionLocationName = null,
  closeFormSnapshot = null,
  maxLines = 40,
} = {}) {
  /** @type {string[]} */
  const lines = [];

  const sorted = [...(comments ?? [])].sort((a, b) =>
    String(a?.created_at ?? "").localeCompare(String(b?.created_at ?? ""))
  );

  for (const c of sorted) {
    const body = c?.body != null ? String(c.body).trim() : "";
    if (!body) continue;
    const at = c?.created_at ? String(c.created_at) : "Date unavailable";
    const src = c?.source != null ? String(c.source).toUpperCase() : "COMMENT";
    const clipped = body.length > 400 ? `${body.slice(0, 400)}…` : body;
    lines.push(`${at} · ${src}: ${clipped}`);
  }

  if (resolutionLocationName != null && String(resolutionLocationName).trim() !== "") {
    lines.push(`Resolution location selected: ${String(resolutionLocationName).trim()}`);
  }

  if (closeFormSnapshot?.fields && Array.isArray(closeFormSnapshot.fields) && closeFormSnapshot.fields.length > 0) {
    lines.push(`Verify & Close form submitted (${closeFormSnapshot.fields.length} field(s))`);
    for (const field of closeFormSnapshot.fields) {
      const label = field?.label != null ? String(field.label).trim() : "Field";
      const raw = closeFormSnapshot.values?.[field?.id];
      const value = raw == null || String(raw).trim() === "" ? "—" : String(raw).trim();
      lines.push(`  · ${label}: ${value}`);
    }
  }

  if (closedByName != null && String(closedByName).trim() !== "") {
    lines.push(`Closed by ${String(closedByName).trim()}`);
  }

  if (lines.length === 0) {
    return closedByName
      ? `Ticket resolved by ${String(closedByName).trim()}`
      : "Ticket resolved";
  }

  return lines.slice(-Math.max(1, maxLines)).join("\n");
}
