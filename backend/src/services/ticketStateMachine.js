export const TICKET_STATES = {
  OPEN: "OPEN",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  ASSIGNED: "ASSIGNED",
  ON_SITE: "ON_SITE",
  RESOLVED_PENDING_VERIFICATION: "RESOLVED_PENDING_VERIFICATION",
  RESOLVED: "RESOLVED",
}

/** Core transitions (unchanged semantics for legacy callers). */
const ALLOWED_TRANSITIONS = {
  OPEN: ["ASSIGNED"],
  NEEDS_REVIEW: ["OPEN"],
  ASSIGNED: ["ON_SITE"],
  ON_SITE: ["RESOLVED_PENDING_VERIFICATION"],
  RESOLVED_PENDING_VERIFICATION: ["RESOLVED"],
}

/**
 * Additive extensions for production statuses used outside the generic status API.
 * Does not widen generic /data/tickets/:id/status — see validateDataApiStatusTransition.
 */
const EXTENDED_TRANSITIONS = {
  ...ALLOWED_TRANSITIONS,
  FE_ATTEMPT_FAILED: ["ASSIGNED", "OPEN"],
  EN_ROUTE: ["ON_SITE"],
  REOPENED: ["OPEN", "ASSIGNED"],
  REJECTED: [],
  RESOLVED: [],
}

/** Terminal — no outbound transitions via generic status API. */
const TERMINAL_STATUSES = new Set(["REJECTED", "RESOLVED"])

/**
 * Statuses that must use dedicated routes (close / reject / assign / FE proof).
 */
const DEDICATED_ROUTE_ONLY_TARGETS = new Set(["RESOLVED", "REJECTED", "ASSIGNED"])

export function assertValidTransition(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] || []
  if (!allowed.includes(to)) {
    throw new Error(`Invalid ticket transition: ${from} → ${to}`)
  }
}

export function getAllowedTransitions(from) {
  return EXTENDED_TRANSITIONS[from] ? [...EXTENDED_TRANSITIONS[from]] : []
}

/**
 * Validates transitions for POST /data/tickets/:id/status only.
 * Preserves approve flow (NEEDS_REVIEW → OPEN) and blocks arbitrary jumps.
 *
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateDataApiStatusTransition(fromStatus, toStatus) {
  const from = fromStatus != null ? String(fromStatus).trim() : ""
  const to = toStatus != null ? String(toStatus).trim() : ""

  if (!from || !to) {
    return { ok: false, error: "Current and target status are required" }
  }

  if (from === to) {
    return { ok: true }
  }

  if (DEDICATED_ROUTE_ONLY_TARGETS.has(to)) {
    if (to === "RESOLVED") {
      return { ok: false, error: "Use POST /tickets/:id/close to resolve tickets" }
    }
    if (to === "REJECTED") {
      return { ok: false, error: "Use POST /tickets/:id/reject to reject tickets" }
    }
    if (to === "ASSIGNED") {
      return { ok: false, error: "Use POST /tickets/:id/assign to assign tickets" }
    }
  }

  if (TERMINAL_STATUSES.has(from)) {
    return { ok: false, error: `Cannot change status from terminal state ${from}` }
  }

  const allowed = getAllowedTransitions(from)
  if (!allowed.includes(to)) {
    return { ok: false, error: `Invalid ticket transition: ${from} → ${to}` }
  }

  return { ok: true }
}
