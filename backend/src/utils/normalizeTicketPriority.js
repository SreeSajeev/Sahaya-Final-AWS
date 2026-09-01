/** Canonical ticket priority levels (source of truth: priority_level). */
export const PRIORITY_LEVELS = ["LOW", "MEDIUM", "HIGH"];

/**
 * Derive legacy boolean from priority_level.
 * HIGH → true; LOW and MEDIUM → false.
 * @param {string} level
 */
export function booleanFromPriorityLevel(level) {
  return String(level).toUpperCase() === "HIGH";
}

/**
 * Derive priority_level from legacy boolean (API backward compat).
 * @param {boolean} priority
 */
export function priorityLevelFromBoolean(priority) {
  return priority === true ? "HIGH" : "LOW";
}

/**
 * Human-readable label for emails/reports.
 * @param {string|null|undefined} level
 * @param {boolean|null|undefined} [legacyPriority]
 */
export function priorityDisplayLabel(level, legacyPriority) {
  const normalized = normalizePriorityLevelString(level);
  if (normalized) {
    if (normalized === "HIGH") return "High";
    if (normalized === "MEDIUM") return "Medium";
    return "Low";
  }
  if (legacyPriority === true) return "High";
  if (legacyPriority === false) return "Low";
  return "Not provided";
}

/**
 * @param {unknown} value
 * @returns {'LOW'|'MEDIUM'|'HIGH'|null}
 */
export function normalizePriorityLevelString(value) {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase();
  // Legacy DB rows may still carry CRITICAL — map to HIGH for display/API sync without DB mutation.
  if (s === "CRITICAL") return "HIGH";
  if (PRIORITY_LEVELS.includes(s)) return s;
  return null;
}

/**
 * Normalize request/import input into synced { priority_level, priority }.
 * priority_level wins when both are provided.
 *
 * @param {{
 *   priority?: unknown,
 *   priority_level?: unknown,
 *   defaultLevel?: 'LOW'|'MEDIUM'|'HIGH',
 * }} input
 * @returns {{ ok: true, priority_level: string, priority: boolean } | { ok: false, error: string }}
 */
export function normalizeTicketPriorityInput(input = {}) {
  const defaultLevel =
    input.defaultLevel && PRIORITY_LEVELS.includes(input.defaultLevel)
      ? input.defaultLevel
      : "LOW";

  const hasLevel =
    input.priority_level !== undefined &&
    input.priority_level !== null &&
    String(input.priority_level).trim() !== "";

  if (hasLevel) {
    const level = normalizePriorityLevelString(input.priority_level);
    if (!level) {
      return {
        ok: false,
        error: `priority_level must be one of: ${PRIORITY_LEVELS.join(", ")}`,
      };
    }
    return { ok: true, priority_level: level, priority: booleanFromPriorityLevel(level) };
  }

  const hasBool =
    input.priority !== undefined &&
    input.priority !== null &&
    String(input.priority).trim() !== "";

  if (hasBool) {
    const p =
      input.priority === true ||
      input.priority === "true" ||
      input.priority === 1 ||
      input.priority === "1";
    const level = priorityLevelFromBoolean(p);
    return { ok: true, priority_level: level, priority: p };
  }

  return {
    ok: true,
    priority_level: defaultLevel,
    priority: booleanFromPriorityLevel(defaultLevel),
  };
}

/**
 * Apply normalized priority fields to a DB patch object (mutates copy).
 * @param {Record<string, unknown>} patch
 * @param {{ priority?: unknown, priority_level?: unknown, defaultLevel?: string }} input
 */
export function applyPriorityToPatch(patch, input) {
  const normalized = normalizeTicketPriorityInput(input);
  if (!normalized.ok) return normalized;
  patch.priority_level = normalized.priority_level;
  patch.priority = normalized.priority;
  return normalized;
}
