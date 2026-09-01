import { safeTrim } from "./http.js";

const MAX_LEN = 500;

/**
 * Resolve incident_title from explicit value or established ticket fields.
 * Used when the source does not always carry a dedicated Incident Title column
 * (email parse, bulk import, public complaint).
 *
 * Priority: explicit incident_title → first line of description/short_description
 * → issue_type → category.
 *
 * @param {{
 *   incident_title?: unknown,
 *   description?: unknown,
 *   short_description?: unknown,
 *   issue_type?: unknown,
 *   category?: unknown,
 * }} input
 * @returns {string | null}
 */
export function resolveIncidentTitle(input = {}) {
  const explicit = safeTrim(input.incident_title);
  if (explicit) return explicit.slice(0, MAX_LEN);

  const desc = safeTrim(input.description) || safeTrim(input.short_description);
  if (desc) {
    const first = desc.split(/\r?\n/)[0]?.trim();
    if (first) return first.slice(0, MAX_LEN);
  }

  const issue = safeTrim(input.issue_type);
  if (issue) return issue.slice(0, MAX_LEN);

  const cat = safeTrim(input.category);
  if (cat) return cat.slice(0, MAX_LEN);

  return null;
}
