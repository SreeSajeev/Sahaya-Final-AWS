/**
 * Pure helpers for ticket rejection email content.
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function textToHtmlPreservingNewlines(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br/>");
}

export function formatDetail(value) {
  if (value == null) return "Not provided";
  const s = String(value).trim();
  return s !== "" ? s : "Not provided";
}

export function pickInitialRemarks(ticket) {
  const remarks = ticket?.remarks != null ? String(ticket.remarks).trim() : "";
  if (remarks) return remarks;
  const short = ticket?.short_description != null ? String(ticket.short_description).trim() : "";
  return short || null;
}

/**
 * @param {object} args
 */
export function buildRejectionEmailPlainText({
  ticket,
  clientName = null,
  reportedByDisplay = null,
  initialRemarks = null,
  rejectionReason = null,
  rejectedAt = null,
  complaintId = null,
  issueType = null,
  location = null,
}) {
  const lines = [
    "Ticket Rejected",
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
  lines.push(`Vehicle Number: ${formatDetail(ticket?.vehicle_number)}`);
  if (ticket?.vehicle_name) lines.push(`Vehicle Name: ${formatDetail(ticket.vehicle_name)}`);
  if (ticket?.vehicle_type) lines.push(`Vehicle Type: ${formatDetail(ticket.vehicle_type)}`);
  if (ticket?.registration_number) {
    lines.push(`Registration Number: ${formatDetail(ticket.registration_number)}`);
  }
  lines.push(
    `Issue Type: ${formatDetail(
      issueType != null && String(issueType).trim() !== "" ? issueType : ticket?.issue_type
    )}`
  );
  lines.push(
    `Location: ${formatDetail(
      location != null && String(location).trim() !== "" ? location : ticket?.location
    )}`
  );
  lines.push(`Status: REJECTED`);
  if (rejectedAt) lines.push(`Rejected At: ${formatDetail(rejectedAt)}`);

  lines.push("", "Original Remarks:");
  lines.push(formatDetail(initialRemarks));
  lines.push("", "Rejection Reason:");
  lines.push(formatDetail(rejectionReason));
  lines.push("---------------------------------");
  return lines.join("\n");
}

export function buildRejectionEmailHtml(args) {
  const plain = buildRejectionEmailPlainText(args);
  return `<div style="font-family:Georgia,serif;font-size:14px;line-height:1.45;color:#111">${textToHtmlPreservingNewlines(plain)}</div>`;
}
