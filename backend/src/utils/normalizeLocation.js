/**
 * Normalize location strings for storage: trim and uppercase.
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeLocation(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === "") return null;
  return s.toUpperCase();
}
