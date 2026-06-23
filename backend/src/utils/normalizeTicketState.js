import { BY_LOWER } from "../constants/indianStates.js";

/**
 * Normalize ticket.state for storage. Returns canonical name or null when blank.
 * Unknown values are stored trimmed as-is (forward-compatible).
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeTicketState(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (s === "") return null;
  return BY_LOWER.get(s.toLowerCase()) ?? s;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidTicketState(value) {
  if (value == null) return true;
  const s = String(value).trim();
  if (s === "") return true;
  return BY_LOWER.has(s.toLowerCase());
}
