import { formatInstantInIst } from "../utils/reportDateWindow.js";
import { priorityDisplayLabel } from "../utils/normalizeTicketPriority.js";

const CSV_HEADERS = [
  "Ticket Number",
  "Complaint ID",
  "Vehicle Number",
  "Category",
  "Issue Type",
  "Priority",
  "Priority Level",
  "Status",
  "State",
  "Location",
  "Customer Name",
  "Customer Email",
  "Customer Phone",
  "Assigned FE",
  "FE Email",
  "Created At",
  "Assigned At",
  "Resolved At",
  "Closed At",
  "Resolution Notes",
  "Closure Remarks",
  "Organisation",
  "Source",
  "SLA Assignment Breached",
  "SLA Resolution Breached",
  "Activity Types",
  "Assignment Count",
  "Last Assignment Date",
  "Assignment Outcome",
  "Proof Submitted",
  "Proof Submitted Date",
  "Proof Count",
  "SLA Onsite Breached",
  "Assignment Deadline",
  "Resolution Deadline",
  "Resolution Time Hours",
  "Resolution Category",
  "Resolution Other Details",
  "Resolution Category Display",
];

function escapeCsv(value) {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function extractResolutionOtherDetails(resolutionCategory, verificationRemarks) {
  const cat = String(resolutionCategory ?? "").trim().toUpperCase();
  if (cat !== "OTHER") return "";
  const remarks = String(verificationRemarks ?? "").trim();
  if (!remarks) return "";
  return remarks.split(/\n\n/)[0]?.trim() || remarks;
}

function formatResolutionCategoryDisplay(resolutionCategory, verificationRemarks) {
  const raw = String(resolutionCategory ?? "").trim();
  if (!raw) return "";
  if (raw.toUpperCase() === "OTHER") {
    const details = extractResolutionOtherDetails(raw, verificationRemarks);
    return details ? `Other: ${details}` : "Other";
  }
  return raw;
}

function legacyPriorityYesNo(priority) {
  return priority === true ? "Yes" : "No";
}

function priorityLevelLabel(ticket) {
  return priorityDisplayLabel(ticket?.priority_level, ticket?.priority);
}

function boolLabel(value) {
  return value === true ? "Yes" : "No";
}

/**
 * @param {string} orgName
 * @param {{ fileDate: string }} reportDay
 */
export function buildDailyReportCsvFilename(orgName, reportDay) {
  const safe = String(orgName || "Organisation")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80) || "Organisation";
  return `${safe}_Daily_Ticket_Report_${reportDay.fileDate}.csv`;
}

function resolutionTimeHours(ticket) {
  const opened = ticket.opened_at ?? ticket.created_at;
  const closed = ticket.resolved_at ?? null;
  if (!opened || !closed) return "";
  const ms = new Date(closed).getTime() - new Date(opened).getTime();
  if (Number.isNaN(ms) || ms < 0) return "";
  return String(Math.round((ms / 36e5) * 100) / 100);
}

function countProofImages(attachments) {
  if (!attachments || typeof attachments !== "object") return 0;
  if (Array.isArray(attachments.images)) return attachments.images.length;
  if (Array.isArray(attachments)) return attachments.length;
  let n = 0;
  for (const v of Object.values(attachments)) {
    if (v && typeof v === "object") n += 1;
  }
  return n;
}

/**
 * @param {object} params
 * @param {string} params.orgName
 * @param {Array<Record<string, unknown>>} params.tickets
 * @param {Map<string, { name?: string | null, email?: string | null }>} params.feById
 * @param {Map<string, { assigned_at?: string | null, fe_id?: string | null }>} params.currentAssignmentByTicketId
 * @param {Map<string, { reporter_name?: string, reporter_mobile?: string }>} params.publicSubmissionByTicketId
 * @param {Map<string, { contact_name?: string | null, contact_email?: string | null, contact_phone?: string | null }>} params.tenantClientBySlug
 * @param {Map<string, { assignment_breached?: boolean, resolution_breached?: boolean, onsite_breached?: boolean, assignment_deadline?: string | null, resolution_deadline?: string | null }>} params.slaByTicketId
 * @param {Map<string, string[]>} params.activityTypesByTicketId
 * @param {Map<string, { count: number, lastAssignedAt: string, latestOutcome: string }>} [params.assignmentStatsByTicketId]
 * @param {Map<string, { proofCount: number, proofSubmittedAt: string }>} [params.proofStatsByTicketId]
 */
export function buildDailyTicketReportCsv({
  orgName,
  tickets,
  feById,
  currentAssignmentByTicketId,
  publicSubmissionByTicketId,
  tenantClientBySlug,
  slaByTicketId,
  activityTypesByTicketId,
  assignmentStatsByTicketId = new Map(),
  proofStatsByTicketId = new Map(),
}) {
  const lines = [CSV_HEADERS.join(",")];

  for (const ticket of tickets) {
    const ticketId = String(ticket.id);
    const assignment = currentAssignmentByTicketId.get(ticketId);

    const pub = publicSubmissionByTicketId.get(ticketId);
    const client =
      ticket.client_slug != null
        ? tenantClientBySlug.get(String(ticket.client_slug).toLowerCase())
        : null;

    const customerName = pub?.reporter_name ?? client?.contact_name ?? "";
    const customerEmail = ticket.opened_by_email ?? client?.contact_email ?? "";
    const customerPhone = pub?.reporter_mobile ?? client?.contact_phone ?? "";

    const assignedAt = assignment?.assigned_at ?? "";
    const resolvedAt = ticket.resolved_at ?? "";
    const remarks = ticket.verification_remarks ?? "";
    const resolutionCategory = ticket.resolution_category ?? "";
    const resolutionOtherDetails = extractResolutionOtherDetails(
      resolutionCategory,
      remarks
    );
    const resolutionCategoryDisplay = formatResolutionCategoryDisplay(
      resolutionCategory,
      remarks
    );
    const sla = slaByTicketId.get(ticketId);
    const activityTypes = (activityTypesByTicketId.get(ticketId) || []).join("; ");
    const assignStats = assignmentStatsByTicketId.get(ticketId);
    const proofStats = proofStatsByTicketId.get(ticketId);

    const assignFe = assignment?.fe_id ? feById.get(String(assignment.fe_id)) : null;
    const assignedFeName = assignFe?.name ?? "";
    const assignedFeEmail = assignFe?.email ?? "";

    lines.push(
      [
        ticket.ticket_number,
        ticket.complaint_id,
        ticket.vehicle_number,
        ticket.category,
        ticket.issue_type,
        legacyPriorityYesNo(ticket.priority),
        priorityLevelLabel(ticket),
        ticket.status,
        ticket.state,
        ticket.location,
        customerName,
        customerEmail,
        customerPhone,
        assignedFeName,
        assignedFeEmail,
        formatInstantInIst(ticket.created_at ?? ticket.opened_at),
        formatInstantInIst(assignedAt),
        formatInstantInIst(resolvedAt),
        formatInstantInIst(resolvedAt),
        remarks,
        remarks,
        orgName,
        ticket.source,
        boolLabel(sla?.assignment_breached),
        boolLabel(sla?.resolution_breached),
        activityTypes,
        assignStats?.count != null ? String(assignStats.count) : "",
        formatInstantInIst(assignStats?.lastAssignedAt ?? ""),
        assignStats?.latestOutcome ?? "",
        proofStats && proofStats.proofCount > 0 ? "Yes" : proofStats ? "No" : "",
        formatInstantInIst(proofStats?.proofSubmittedAt ?? ""),
        proofStats?.proofCount != null && proofStats.proofCount > 0 ? String(proofStats.proofCount) : "",
        boolLabel(sla?.onsite_breached),
        formatInstantInIst(sla?.assignment_deadline ?? ""),
        formatInstantInIst(sla?.resolution_deadline ?? ""),
        resolutionTimeHours(ticket),
        resolutionCategory,
        resolutionOtherDetails,
        resolutionCategoryDisplay,
      ]
        .map(escapeCsv)
        .join(",")
    );
  }

  return lines.join("\n");
}
