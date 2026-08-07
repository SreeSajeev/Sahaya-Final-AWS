/**
 * Enrich thin resolution-email callers (legacy hooks) with full ticket context.
 * Primary close path already passes curated fields; this backfills alternate senders.
 */

import { getTicketByIdUnscopedSingle } from "../repositories/ticketQueryRepository.js";
import { getAssignmentById } from "../repositories/assignmentRepository.js";
import { getFieldExecutiveById } from "../repositories/fieldExecutiveRepository.js";
import { listCommentsForTicketUnscoped } from "../repositories/commentRepository.js";
import { priorityDisplayLabel } from "../utils/normalizeTicketPriority.js";
import { buildClosureTimelineSummary } from "./closureTimelineSummary.js";

const TICKET_SELECT =
  "id, ticket_number, status, opened_by_email, complaint_id, vehicle_number, vehicle_name, vehicle_type, registration_number, category, issue_type, location, organisation_id, client_slug, remarks, short_description, priority, priority_level, verification_remarks, review_notes, resolution_category, resolution_location_name, close_form_snapshot, current_assignment_id, resolved_at";

/**
 * @param {string} ticketId
 * @returns {Promise<{
 *   toEmail: string|null,
 *   ticketNumber: string|null,
 *   args: Record<string, unknown>,
 * }>}
 */
export async function buildResolutionEmailArgsFromTicketId(ticketId) {
  const { data: ticket, error } = await getTicketByIdUnscopedSingle(ticketId, TICKET_SELECT);
  if (error || !ticket) {
    return { toEmail: null, ticketNumber: null, args: {} };
  }

  let assignedFeName = null;
  if (ticket.current_assignment_id) {
    const { data: assignment } = await getAssignmentById(ticket.current_assignment_id, "fe_id");
    if (assignment?.fe_id) {
      const { data: fe } = await getFieldExecutiveById(assignment.fe_id);
      assignedFeName = fe?.name?.trim() || null;
    }
  }

  const { data: comments } = await listCommentsForTicketUnscoped(ticketId, { limit: 200, offset: 0 });
  const timelineSummary = buildClosureTimelineSummary({
    comments: comments ?? [],
    closedByName: null,
    resolutionLocationName: ticket.resolution_location_name ?? null,
    closeFormSnapshot: ticket.close_form_snapshot ?? null,
  });

  const priorityLabel = priorityDisplayLabel(ticket.priority_level, ticket.priority);

  return {
    toEmail: ticket.opened_by_email ?? null,
    ticketNumber: ticket.ticket_number ?? null,
    args: {
      toEmail: ticket.opened_by_email ?? null,
      ticketNumber: ticket.ticket_number,
      verificationRemarks: ticket.verification_remarks ?? null,
      resolutionRemarks: ticket.verification_remarks ?? null,
      resolutionCategory: ticket.resolution_category ?? null,
      reviewNotes: ticket.review_notes ?? null,
      complaintId: ticket.complaint_id ?? null,
      vehicleNumber: ticket.vehicle_number ?? null,
      category: ticket.category ?? null,
      issueType: ticket.resolution_category || ticket.issue_type || null,
      location: ticket.location ?? null,
      assignedFeName,
      priority: priorityLabel,
      resolutionLocationName: ticket.resolution_location_name ?? null,
      closeFormSnapshot: ticket.close_form_snapshot ?? null,
      timelineSummary,
    },
  };
}
