/**
 * Pure helpers for client resolution / closure email content.
 * Keeps HTML escaping and field semantics unit-testable without Postmark.
 */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape HTML then convert newlines to <br/> for safe multiline display. */
export function textToHtmlPreservingNewlines(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br/>");
}

export function formatDetail(value) {
  if (value == null) return "Not provided";
  const s = String(value).trim();
  return s !== "" ? s : "Not provided";
}

/**
 * Pick initial remarks for email: ticket.remarks, else short_description.
 */
export function pickInitialRemarks(ticket) {
  const remarks = ticket?.remarks != null ? String(ticket.remarks).trim() : "";
  if (remarks) return remarks;
  const short = ticket?.short_description != null ? String(ticket.short_description).trim() : "";
  return short || null;
}

/**
 * Build plain-text resolution details block with corrected field semantics.
 */
export function buildResolutionEmailPlainText({
  ticket,
  complaintId = null,
  clientName = null,
  reportedByDisplay = null,
  initialRemarks = null,
  resolutionRemarks = null,
  resolutionCategory = null,
  location = null,
  closureLocation = null,
  resolvedAt = null,
  assignedFeName = null,
  priority = null,
  closeFormSnapshot = null,
  timelineSummary = null,
  tenantResolutionInstructions = null,
}) {
  const issueType =
    resolutionCategory != null && String(resolutionCategory).trim() !== ""
      ? String(resolutionCategory).trim() === "OTHER"
        ? "Other"
        : String(resolutionCategory).trim()
      : ticket?.issue_type;

  const incidentTitle =
    ticket?.incident_title != null && String(ticket.incident_title).trim() !== ""
      ? String(ticket.incident_title).trim()
      : null;

  const loc =
    location != null && String(location).trim() !== ""
      ? String(location).trim()
      : ticket?.location;

  const lines = [
    "Ticket Resolved",
    "---------------------------------",
    `Ticket: ${formatDetail(ticket?.ticket_number)}`,
  ];

  const cid =
    complaintId != null && String(complaintId).trim() !== ""
      ? String(complaintId).trim()
      : ticket?.complaint_id != null
        ? String(ticket.complaint_id).trim()
        : "";
  if (cid) lines.push(`Complaint ID: ${cid}`);

  lines.push(`Client: ${formatDetail(clientName)}`);
  lines.push(`Reported By: ${formatDetail(reportedByDisplay)}`);
  lines.push(`Priority: ${formatDetail(priority ?? ticket?.priority)}`);
  lines.push(`Vehicle Number: ${formatDetail(ticket?.vehicle_number)}`);
  if (ticket?.vehicle_name) lines.push(`Vehicle Name: ${formatDetail(ticket.vehicle_name)}`);
  if (ticket?.vehicle_type) lines.push(`Vehicle Type: ${formatDetail(ticket.vehicle_type)}`);
  if (ticket?.registration_number) {
    lines.push(`Registration Number: ${formatDetail(ticket.registration_number)}`);
  }
  lines.push(`Issue Type: ${formatDetail(issueType)}`);
  if (incidentTitle) lines.push(`Incident Title: ${incidentTitle}`);
  lines.push(`Reported Location: ${formatDetail(loc)}`);
  if (closureLocation != null && String(closureLocation).trim() !== "") {
    lines.push(`Resolution Location: ${String(closureLocation).trim()}`);
  }
  lines.push(`Assigned FE: ${formatDetail(assignedFeName)}`);
  lines.push(`Status: ${formatDetail(ticket?.status ?? "RESOLVED")}`);
  if (resolvedAt) lines.push(`Resolved At: ${formatDetail(resolvedAt)}`);

  lines.push("", "Initial Remarks:");
  lines.push(formatDetail(initialRemarks));
  if (tenantResolutionInstructions != null && String(tenantResolutionInstructions).trim() !== "") {
    lines.push("", "Resolution Instructions:");
    lines.push(String(tenantResolutionInstructions).trim());
  }
  lines.push("", "Resolution Remarks:");
  lines.push(formatDetail(resolutionRemarks));
  if (closeFormSnapshot?.fields && Array.isArray(closeFormSnapshot.fields)) {
    lines.push("", "Verification Details:");
    for (const field of closeFormSnapshot.fields) {
      lines.push(`${formatDetail(field?.label)}: ${formatDetail(closeFormSnapshot.values?.[field?.id])}`);
    }
  }
  if (timelineSummary != null && String(timelineSummary).trim()) {
    lines.push("", "Timeline Summary:", String(timelineSummary).trim());
  }
  lines.push("---------------------------------");

  return lines.join("\n");
}

/**
 * Build HTML fragment for the same fields (escaped).
 */
export function buildResolutionEmailHtml({
  ticket,
  complaintId = null,
  clientName = null,
  reportedByDisplay = null,
  initialRemarks = null,
  resolutionRemarks = null,
  resolutionCategory = null,
  location = null,
  closureLocation = null,
  resolvedAt = null,
  assignedFeName = null,
  priority = null,
  closeFormSnapshot = null,
  timelineSummary = null,
  tenantResolutionInstructions = null,
}) {
  const plain = buildResolutionEmailPlainText({
    ticket,
    complaintId,
    clientName,
    reportedByDisplay,
    initialRemarks,
    resolutionRemarks,
    resolutionCategory,
    location,
    closureLocation,
    resolvedAt,
    assignedFeName,
    priority,
    closeFormSnapshot,
    timelineSummary,
    tenantResolutionInstructions,
  });
  return `<div style="font-family:Georgia,serif;font-size:14px;line-height:1.45;color:#111">${textToHtmlPreservingNewlines(plain)}</div>`;
}
