/** Max length for tenant_clients.company_short_name (operator-friendly label, not slug). */
export const COMPANY_SHORT_NAME_MAX_LEN = 80;

const REMOVABLE_SUFFIX_WORDS = new Set([
  "pvt",
  "ltd",
  "limited",
  "inc",
  "llc",
  "corp",
  "company",
  "services",
  "energy",
  "india",
  "private",
]);

/**
 * Normalize company_short_name: trim; empty → null; enforce max length.
 * @param {unknown} value
 * @returns {{ ok: true, value: string | null } | { ok: false, error: string }}
 */
export function normalizeCompanyShortName(value) {
  if (value == null) return { ok: true, value: null };
  const s = String(value).trim();
  if (s === "") return { ok: true, value: null };
  if (s.length > COMPANY_SHORT_NAME_MAX_LEN) {
    return {
      ok: false,
      error: `company_short_name must be at most ${COMPANY_SHORT_NAME_MAX_LEN} characters`,
    };
  }
  return { ok: true, value: s };
}

/**
 * Suggest a user-editable company label from its official name.
 * @param {unknown} officialName
 * @returns {string | null}
 */
export function suggestCompanyShortName(officialName) {
  const words = String(officialName ?? "")
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
    .filter(Boolean);
  if (words.length === 0) return null;

  const significant = [...words];
  while (
    significant.length > 1 &&
    REMOVABLE_SUFFIX_WORDS.has(significant[significant.length - 1].toLowerCase())
  ) {
    significant.pop();
  }

  if (significant.length === 0) return words[0];

  // Multi-word company names with substantial words are easier to scan as an acronym.
  // Retain "Services" for this purpose (e.g. Tata Consultancy Services → TCS).
  const acronymWords =
    significant.length === 2 &&
    words.length >= 3 &&
    words[2]?.toLowerCase() === "services"
      ? [...significant, words[2]]
      : significant;
  if (acronymWords.length >= 2 && acronymWords.every((word) => word.length >= 4)) {
    return acronymWords.map((word) => word[0].toUpperCase()).join("");
  }

  return significant[0];
}
