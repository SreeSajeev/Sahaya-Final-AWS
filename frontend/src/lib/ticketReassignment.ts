import type { Ticket, TicketStatus } from "@/lib/types";

/** Statuses where staff may reassign when a current assignment exists. */
export const REASSIGN_UI_STATUSES: TicketStatus[] = [
  "OPEN",
  "ASSIGNED",
  "EN_ROUTE",
  "ON_SITE",
  "FE_ATTEMPT_FAILED",
];

const REASSIGN_BLOCKED_STATUSES: TicketStatus[] = [
  "RESOLVED",
  "RESOLVED_PENDING_VERIFICATION",
  "REJECTED",
  "NEEDS_REVIEW",
];

/** First-time assignment (no active assignment row on ticket). */
export function canFirstAssignTicket(
  ticket: Pick<Ticket, "status" | "current_assignment_id">
): boolean {
  if (REASSIGN_BLOCKED_STATUSES.includes(ticket.status)) return false;
  return ticket.status === "OPEN" && !ticket.current_assignment_id;
}

/** Reassign an existing assignment to a different FE. */
export function canReassignTicket(
  ticket: Pick<Ticket, "status" | "current_assignment_id">
): boolean {
  if (!ticket.current_assignment_id) return false;
  if (REASSIGN_BLOCKED_STATUSES.includes(ticket.status)) return false;
  return REASSIGN_UI_STATUSES.includes(ticket.status);
}
