/** Max length for organisations.short_name (operator-friendly label, not slug). */
export const ORG_SHORT_NAME_MAX_LEN = 80;

/**
 * Normalize short_name: trim; empty → null; enforce max length.
 * @param {unknown} value
 * @returns {{ ok: true, value: string | null } | { ok: false, error: string }}
 */
export function normalizeOrganisationShortName(value) {
  if (value == null) return { ok: true, value: null };
  const s = String(value).trim();
  if (s === "") return { ok: true, value: null };
  if (s.length > ORG_SHORT_NAME_MAX_LEN) {
    return { ok: false, error: `short_name must be at most ${ORG_SHORT_NAME_MAX_LEN} characters` };
  }
  return { ok: true, value: s };
}
