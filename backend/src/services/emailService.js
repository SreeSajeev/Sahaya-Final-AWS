// src/services/emailService.js
import { APP_BASE_URL } from "../config/appConfig.js";
import { redactEmail } from "../utils/redact.js";
import { priorityDisplayLabel } from "../utils/normalizeTicketPriority.js";
import { findUserByEmailForLookup } from "../repositories/userRepository.js";
import { getFieldExecutiveById } from "../repositories/fieldExecutiveRepository.js";
import { findTicketByTicketNumber, getTicketByIdUnscoped } from "../repositories/ticketQueryRepository.js";
import { listSlaRowsByTicketIds } from "../repositories/slaRepository.js";

const POSTMARK_URL = "https://api.postmarkapp.com/email";

/** From address: FROM_EMAIL or MAIL_FROM_EMAIL (trimmed). */
function getFromEmail() {
  const v = process.env.FROM_EMAIL || process.env.MAIL_FROM_EMAIL;
  return v != null && String(v).trim() !== "" ? String(v).trim() : null;
}

/** From header value: "Name <email>" if MAIL_FROM_NAME set, else email. */
function getFromAddress() {
  const email = getFromEmail();
  if (!email) return null;
  const name = process.env.MAIL_FROM_NAME && String(process.env.MAIL_FROM_NAME).trim();
  return name ? `${name} <${email}>` : email;
}

function canSendEmail() {
  const token = process.env.POSTMARK_SERVER_TOKEN && String(process.env.POSTMARK_SERVER_TOKEN).trim();
  return Boolean(token && getFromEmail());
}

/** Temporary: log env presence for debugging (no secret values). */
function logEmailEnvStatus(tag) {
  const hasToken = Boolean(process.env.POSTMARK_SERVER_TOKEN && String(process.env.POSTMARK_SERVER_TOKEN).trim());
  const fromEmail = getFromEmail();
  const hasFrom = Boolean(fromEmail);
  console.log(`[EMAIL ENV] ${tag} — POSTMARK_SERVER_TOKEN=${hasToken ? "set" : "MISSING"}, FROM=${hasFrom ? "set" : "MISSING"} (FROM_EMAIL/MAIL_FROM_EMAIL)`);
}

function isValidTicketNumber(ticketNumber) {
  return typeof ticketNumber === "string" && ticketNumber.trim().length > 0;
}

function isValidToEmail(toEmail) {
  return typeof toEmail === "string" && toEmail.trim().length > 0;
}

function generateTicketSubjectTag(ticketNumber) {
  return `[Ticket ID: ${String(ticketNumber).trim()}]`;
}

/** Optional vehicle suffix for customer-facing subjects; omitted when blank. */
function formatVehicleSubjectSuffix(vehicleNumber) {
  if (vehicleNumber == null) return "";
  const v = String(vehicleNumber).trim();
  return v === "" ? "" : ` - Related to ${v}`;
}

/**
 * Customer-facing ticket email subject: "{Event} - {TicketNumber}" with optional vehicle suffix.
 * Reply-threading emails keep using generateTicketSubjectTag() separately.
 */
function buildCustomerTicketEmailSubject(eventLabel, ticketNumber, vehicleNumber) {
  const tn = String(ticketNumber).trim();
  return `${eventLabel} - ${tn}${formatVehicleSubjectSuffix(vehicleNumber)}`;
}

/** For email body detail lines: null/undefined/empty -> "Not provided" */
function formatDetail(value) {
  if (value == null) return "Not provided";
  const s = String(value).trim();
  return s === "" ? "Not provided" : s;
}

/** Password reset emails always send from support@pariskq.in unless overridden. */
function getPasswordResetFromAddress() {
  const email = String(
    process.env.PASSWORD_RESET_FROM_EMAIL ||
      process.env.FROM_EMAIL ||
      process.env.MAIL_FROM_EMAIL ||
      "support@pariskq.in"
  ).trim();
  const name = String(
    process.env.PASSWORD_RESET_FROM_NAME || process.env.MAIL_FROM_NAME || "Sahaya Support"
  ).trim();
  return name ? `${name} <${email}>` : email;
}

/** @returns {Promise<{ ok: boolean; reason: string }>} Postmark send outcome */
async function sendEmail(payload, tag, options = {}) {
  logEmailEnvStatus(tag);
  const fromAddr = options.from || getFromAddress();
  if (!canSendEmail() || !fromAddr) {
    const msg = `Email not configured: missing POSTMARK_SERVER_TOKEN or FROM_EMAIL/MAIL_FROM_EMAIL`;
    console.error(`[EMAIL SKIPPED] ${tag} — ${msg}`);
    return { ok: false, reason: "email_not_configured" };
  }
  const payloadWithFrom = { ...payload, From: fromAddr };

  try {
    console.log(`[EMAIL_TRIGGER] ${tag} To=${redactEmail(payloadWithFrom.To) || "?"}`);
    // Avoid hanging the process (and any awaited callers) on a stuck Postmark connection
    const timeoutMs = Number(process.env.POSTMARK_FETCH_TIMEOUT_MS) || 20000;
    let signal;
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      signal = AbortSignal.timeout(timeoutMs);
    } else {
      const c = new AbortController();
      setTimeout(() => c.abort(), timeoutMs);
      signal = c.signal;
    }
    const res = await fetch(POSTMARK_URL, {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payloadWithFrom),
      signal,
    });

    const text = await res.text();
    if (!res.ok) {
      console.error(
        `[EMAIL FAILED] ${tag} status=${res.status} body=`,
        text.length > 200 ? `${text.slice(0, 200)}…` : text
      );
      return { ok: false, reason: `postmark_http_${res.status}` };
    }
    console.log(`[EMAIL SENT] ${tag} To=${redactEmail(payloadWithFrom.To) || "?"}`);
    return { ok: true, reason: "sent" };
  } catch (err) {
    console.error(`[EMAIL ERROR] ${tag}`, err.message);
    return { ok: false, reason: "fetch_error" };
  }
}

/** Build short issue summary from category, issueType, location; max 200 chars. */
function buildShortIssueSummary(category, issueType, location) {
  const parts = [category, issueType, location].filter(
    (v) => v != null && String(v).trim() !== ""
  ).map((v) => String(v).trim());
  if (parts.length === 0) return "Not provided";
  const summary = parts.join(" · ");
  return summary.length > 200 ? summary.slice(0, 197) + "..." : summary;
}

function formatDateTime(value) {
  if (value == null) return "Not provided";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Not provided";
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function deriveClientName(openedByEmail) {
  if (openedByEmail == null) return "Not provided";
  const email = String(openedByEmail).trim();
  if (!email) return "Not provided";
  const local = email.includes("@") ? email.split("@")[0] : email;
  return local.replace(/[._-]+/g, " ").trim() || "Not provided";
}

/** Staff / reporter line for FE emails (uses public.users when possible). */
async function resolveReporterDisplayForEmail(openedByEmail) {
  if (openedByEmail == null) return null;
  const em = String(openedByEmail).trim();
  if (!em) return null;
  const { data, error } = await findUserByEmailForLookup(em);
  if (!error && data?.name && String(data.name).trim()) {
    return `${String(data.name).trim()} reported this ticket (${em})`;
  }
  const derived = deriveClientName(em);
  if (derived && derived !== "Not provided") {
    return `${derived} reported this ticket (${em})`;
  }
  return `Ticket reporter / contact: ${em}`;
}

function formatAssignmentDueEmailIntro(iso) {
  if (iso == null || String(iso).trim() === "") {
    return "Assignment due (manager): Not specified.";
  }
  const line = formatDateTime(iso);
  if (line === "Not provided") return "Assignment due (manager): Not specified.";
  return `Assignment due (manager): ${line}`;
}

async function fetchTicketByNumber(ticketNumber) {
  if (!ticketNumber) return null;
  const row = await findTicketByTicketNumber(ticketNumber);
  if (!row?.id) return null;

  const { data: ticket, error } = await getTicketByIdUnscoped(
    row.id,
    "id, ticket_number, status, category, issue_type, location, state, vehicle_number, opened_by_email, opened_at, created_at, priority, priority_level, short_description, complaint_id"
  );

  if (error) {
    console.error("[EMAIL] Ticket fetch failed:", error.message);
    return null;
  }

  return ticket ?? null;
}

async function fetchSlaDeadlines(ticketId) {
  if (!ticketId) return null;
  const { data: slaRows, error } = await listSlaRowsByTicketIds(
    [ticketId],
    "assignment_deadline, onsite_deadline, resolution_deadline"
  );

  if (error) {
    console.error("[EMAIL] SLA fetch failed:", error.message);
    return null;
  }

  return slaRows?.[0] ?? null;
}

function buildTicketDetailsTable({
  ticket,
  sla,
  complaintId = null,
  verificationRemarks = null,
  resolutionCategory = null,
  /** Optional ISO from ticket_assignments.assignment_due_at (manager-selected). */
  assignmentDueAt = null,
  /** Human-readable reporter line (staff / email). */
  reportedByDisplay = null,
}) {
  const clientName = deriveClientName(ticket?.opened_by_email);

  const priorityLabel = priorityDisplayLabel(ticket?.priority_level, ticket?.priority);

  const createdAt =
    ticket?.opened_at != null
      ? formatDateTime(ticket.opened_at)
      : ticket?.created_at != null
        ? formatDateTime(ticket.created_at)
        : "Not provided";

  const shortDesc = ticket?.short_description != null ? String(ticket.short_description).trim() : null;

  const assignmentDeadline = sla?.assignment_deadline ? formatDateTime(sla.assignment_deadline) : "Not provided";
  const onsiteDeadline = sla?.onsite_deadline ? formatDateTime(sla.onsite_deadline) : "Not provided";
  const resolutionDeadline = sla?.resolution_deadline ? formatDateTime(sla.resolution_deadline) : "Not provided";

  const hasResolutionCategory = resolutionCategory != null && String(resolutionCategory).trim() !== "";
  const hasVerificationRemarks =
    verificationRemarks != null && String(verificationRemarks).trim() !== "";

  const lines = [
    "Ticket Information",
    "---------------------------------",
    `Ticket Number: ${formatDetail(ticket?.ticket_number)}`,
    `Issue Category: ${formatDetail(ticket?.category)}`,
    `Issue Type: ${formatDetail(ticket?.issue_type)}`,
    `Location / Address: ${formatDetail(ticket?.location)}`,
    `State: ${formatDetail(ticket?.state)}`,
    `Vehicle Number / Device ID: ${formatDetail(ticket?.vehicle_number)}`,
    `Priority: ${formatDetail(priorityLabel)}`,
    `Client Name: ${formatDetail(clientName)}`,
    `Reported by: ${formatDetail(reportedByDisplay)}`,
    `Ticket Created Time: ${formatDetail(createdAt)}`,
    `Current Status: ${formatDetail(ticket?.status)}`,
    `Remarks / Description: ${formatDetail(shortDesc)}`,
  ];

  if (complaintId != null && String(complaintId).trim() !== "") {
    // Insert after Ticket Number, before Issue Category.
    lines.splice(3, 0, `Complaint ID: ${formatDetail(complaintId)}`);
  }

  lines.push("");
  lines.push("SLA Deadlines (if available)");
  const managerDue =
    assignmentDueAt != null && String(assignmentDueAt).trim() !== ""
      ? formatDateTime(assignmentDueAt)
      : null;
  lines.push(`Manager-set Assignment Due: ${formatDetail(managerDue)}`);
  lines.push(`Assignment: ${formatDetail(assignmentDeadline)}`);
  lines.push(`On-Site: ${formatDetail(onsiteDeadline)}`);
  lines.push(`Resolution: ${formatDetail(resolutionDeadline)}`);

  if (hasResolutionCategory) {
    const rawCat = String(resolutionCategory).trim();
    let categoryLabel = rawCat === "OTHER" ? "Other" : rawCat;
    if (rawCat === "OTHER" && hasVerificationRemarks) {
      const details = String(verificationRemarks)
        .trim()
        .split(/\n\n/)[0]
        ?.trim();
      if (details) categoryLabel = `Other: ${details}`;
    }
    lines.push("", "Resolution Category", `- ${categoryLabel}`);
  }
  if (hasVerificationRemarks) {
    lines.push("", "Staff Verification Notes", String(verificationRemarks).trim());
  }

  lines.push("---------------------------------");

  return lines.join("\n");
}

/**
 * Password reset link (Supabase recovery action_link) via Postmark — not Supabase SMTP.
 * @returns {Promise<{ ok: boolean; reason: string }>}
 */
export async function sendPasswordResetEmail({ toEmail, resetLink }) {
  if (!isValidToEmail(toEmail)) {
    return { ok: false, reason: "invalid_to_email" };
  }
  const link = resetLink != null ? String(resetLink).trim() : "";
  if (!link) {
    return { ok: false, reason: "missing_reset_link" };
  }

  const textBody = [
    "Hello,",
    "",
    "We received a request to reset your Sahaya account password.",
    "",
    "Reset your password using the link below (this link expires after a short time):",
    link,
    "",
    "If you did not request this, you can ignore this email. Your password will not change.",
    "",
    "Thank you,",
    "Sahaya Support",
    "support@pariskq.in",
  ].join("\n");

  const htmlBody = [
    "<p>Hello,</p>",
    "<p>We received a request to reset your Sahaya account password.</p>",
    "<p><a href=\"",
    link.replace(/&/g, "&amp;").replace(/"/g, "&quot;"),
    "\">Reset your password</a></p>",
    "<p>If you did not request this, you can ignore this email.</p>",
    "<p>Thank you,<br/>Sahaya Support</p>",
  ].join("");

  return sendEmail(
    {
      To: toEmail.trim(),
      Subject: "Reset your Sahaya password",
      TextBody: textBody,
      HtmlBody: htmlBody,
    },
    "PASSWORD_RESET",
    { from: getPasswordResetFromAddress() }
  );
}

export async function sendTicketConfirmation({
  toEmail,
  ticketNumber,
  complaintId = null,
  vehicleNumber = null,
  category = null,
  issueType = null,
  location = null,
}) {
  if (!isValidToEmail(toEmail)) return { ok: false, reason: "invalid_to_email" };
  if (!isValidTicketNumber(ticketNumber)) return { ok: false, reason: "invalid_ticket_number" };

  try {
    const shortSummary = buildShortIssueSummary(category, issueType, location);
    const detailsBlock = `
Ticket Details:
---------------------------------
Complaint ID: ${formatDetail(complaintId)}
Vehicle Number: ${formatDetail(vehicleNumber)}
Category: ${formatDetail(category)}
Issue Type: ${formatDetail(issueType)}
Location: ${formatDetail(location)}
Short issue summary: ${formatDetail(shortSummary)}
---------------------------------
`.trim();

    const textBody = [
      "Hello,",
      "",
      `Your ticket ${ticketNumber} has been successfully created.`,
      "",
      detailsBlock,
      "",
      "If you need to reference this request, please mention the ticket ID above.",
      "Our operations team will review it shortly.",
      "",
      "Thank you,",
      "Pariskq Operations Team",
    ].join("\n");

    return await sendEmail(
      {
        To: toEmail.trim(),
        Subject: buildCustomerTicketEmailSubject("Ticket Created", ticketNumber, vehicleNumber),
        TextBody: textBody,
      },
      "TICKET_CONFIRMATION"
    );
  } catch (err) {
    console.error("[EMAIL:TICKET_CONFIRMATION]", err.message);
    return { ok: false, reason: "exception" };
  }
}

function formatOptional(value) {
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

export async function sendMissingDetailsEmail({ toEmail, ticketNumber, missingDetails, receivedDetails, subject, complaintId, category, issueType, location }) {
  if (!isValidToEmail(toEmail)) return;
  if (!isValidTicketNumber(ticketNumber)) return;

  try {
    const subjectTag = generateTicketSubjectTag(ticketNumber);
    const receivedList = Array.isArray(receivedDetails) && receivedDetails.length > 0
      ? receivedDetails.map((d) => `• ${d}`).join("\n")
      : "• None listed";
    const missingList = Array.isArray(missingDetails) && missingDetails.length > 0
      ? missingDetails.map((d) => `• ${d}`).join("\n")
      : "• Additional information to help us process your request";

    const summaryLines = [];
    if (formatOptional(subject)) summaryLines.push(`Subject: ${formatOptional(subject)}`);
    if (formatOptional(complaintId)) summaryLines.push(`Complaint ID: ${formatOptional(complaintId)}`);
    if (formatOptional(category)) summaryLines.push(`Category: ${formatOptional(category)}`);
    if (formatOptional(issueType)) summaryLines.push(`Issue type: ${formatOptional(issueType)}`);
    if (formatOptional(location)) summaryLines.push(`Location: ${formatOptional(location)}`);
    const complaintSummary = summaryLines.length > 0 ? summaryLines.join("\n") : "—";

    const body = `
Hello,

Your ticket ${ticketNumber} has been created. We need a few more details to proceed.

Reference (what we have so far):
${complaintSummary}

Fields we received:
${receivedList}

Fields we need:
${missingList}

When replying, please include [Ticket ID: ${ticketNumber}] in the subject line.

Thank you,
Pariskq Operations Team
    `.trim();

    await sendEmail(
      {
        To: toEmail.trim(),
        Subject: `Re: ${subjectTag} Additional Details Required`,
        TextBody: body,
      },
      "MISSING_DETAILS"
    );
  } catch (err) {
    console.error("[EMAIL:MISSING_DETAILS]", err.message);
  }
}

export async function sendFEAssignmentEmail({
  feId,
  ticketNumber,
}) {
  try {
    console.log("[FE ASSIGN EMAIL] FE lookup feId=", feId, "ticketNumber=", ticketNumber);
    if (!feId) {
      console.error("[FE ASSIGN EMAIL] Missing feId");
      return;
    }
    if (!isValidTicketNumber(ticketNumber)) {
      console.error("[FE ASSIGN EMAIL] Invalid ticketNumber");
      return;
    }

    const { data: fe, error } = await getFieldExecutiveById(feId, "email, name");

    if (error || !fe?.email) {
      console.error("[FE ASSIGN EMAIL] FE email not found:", feId, error?.message || "no email");
      return;
    }
    console.log("[FE ASSIGN EMAIL] FE found email=", redactEmail(fe.email), "name=", fe.name || "(none)");

    const ticket = await fetchTicketByNumber(ticketNumber);
    const sla = ticket?.id ? await fetchSlaDeadlines(ticket.id) : null;
    const detailsBlock = ticket ? buildTicketDetailsTable({ ticket, sla }) : "Ticket details unavailable.";

    const subjectTag = generateTicketSubjectTag(ticketNumber);
    console.log("EMAIL_TRIGGER_ASSIGNMENT", redactEmail(fe.email), "ticketNumber=", ticketNumber);
    await sendEmail(
      {
        To: fe.email,
        Subject: `New Ticket Assigned - ${subjectTag}`,
        TextBody: `
Hello ${fe.name || ""},

You have been assigned Ticket ${ticketNumber}.

${detailsBlock}

Please log into the Field Ops dashboard to begin the work.

Thank you,
Pariskq Operations Team
        `.trim(),
      },
      "FE_ASSIGNMENT"
    );
    console.log("[FE ASSIGN EMAIL] Sent to", redactEmail(fe.email));
  } catch (err) {
    console.error("[FE ASSIGN EMAIL ERROR]", err.message);
  }
}

export async function sendFEAssignmentWorkflowEmail({
  feId,
  ticketNumber,
  onSiteToken,
  resolutionToken,
  assignmentDueAt = null,
}) {
  try {
    if (!feId || !isValidTicketNumber(ticketNumber) || !onSiteToken || !resolutionToken) {
      console.error("[FE WORKFLOW EMAIL] Missing params");
      return { sent: false, error: "missing_params" };
    }

    const { data: fe, error } = await getFieldExecutiveById(feId, "email, name");

    if (error || !fe?.email) {
      console.error("[FE WORKFLOW EMAIL] FE email not found:", feId, error?.message || "no email");
      return { sent: false, error: "no_fe_email" };
    }

    const ticket = await fetchTicketByNumber(ticketNumber);
    const sla = ticket?.id ? await fetchSlaDeadlines(ticket.id) : null;
    const reportedByDisplay = ticket ? await resolveReporterDisplayForEmail(ticket.opened_by_email) : null;
    const detailsBlock = ticket
      ? buildTicketDetailsTable({ ticket, sla, assignmentDueAt, reportedByDisplay })
      : "Ticket details unavailable.";
    const assignmentDueIntro = formatAssignmentDueEmailIntro(assignmentDueAt);

    const onSiteUrl = `${APP_BASE_URL}/fe/action/${onSiteToken}`;
    const resolutionUrl = `${APP_BASE_URL}/fe/action/${resolutionToken}`;
    const subjectTag = generateTicketSubjectTag(ticketNumber);
    const vehicleSubjectSuffix = formatVehicleSubjectSuffix(ticket?.vehicle_number);

    const sendResult = await sendEmail(
      {
        To: fe.email,
        Subject: `Ticket Assigned - Action Links Included ${subjectTag}${vehicleSubjectSuffix}`,
        TextBody: `
Hello ${fe.name || ""},

You have been assigned Ticket ${ticketNumber}.

${assignmentDueIntro}

${detailsBlock}

On-Site Link: ${onSiteUrl}
Resolution Link: ${resolutionUrl}

Important: Resolution is locked until on-site is marked and proof is uploaded successfully.

Thank you,
Pariskq Operations Team
        `.trim(),
      },
      "FE_ASSIGNMENT_WORKFLOW"
    );

    if (!sendResult.ok) {
      return { sent: false, error: sendResult.reason || "email_not_delivered" };
    }
    return { sent: true };
  } catch (err) {
    console.error("[FE WORKFLOW EMAIL ERROR]", err.message);
    return { sent: false, error: err.message };
  }
}

export async function sendFETokenEmail({ feId, ticketNumber, token, type }) {
  try {
    console.log("[FE TOKEN EMAIL] FE lookup feId=", feId, "type=", type);
    if (!feId || !isValidTicketNumber(ticketNumber) || !token) {
      console.error("[FE TOKEN EMAIL] Missing feId, ticketNumber, or token");
      return;
    }

    const { data: fe, error } = await getFieldExecutiveById(feId, "email, name");

    if (error || !fe?.email) {
      console.error("[FE TOKEN EMAIL] FE not found or no email:", feId, error?.message || "no email");
      return;
    }
    console.log("[FE TOKEN EMAIL] FE found email=", redactEmail(fe.email));

    const ticket = await fetchTicketByNumber(ticketNumber);
    const sla = ticket?.id ? await fetchSlaDeadlines(ticket.id) : null;
    const detailsBlock = ticket ? buildTicketDetailsTable({ ticket, sla }) : "Ticket details unavailable.";

    const actionLabel = type === "RESOLUTION" ? "Resolution" : "On-Site";
    const actionUrl = `${APP_BASE_URL}/fe/action/${token}`;
    const subjectTag = generateTicketSubjectTag(ticketNumber);
    console.log("EMAIL_TRIGGER_FE_TOKEN", redactEmail(fe.email), "type=", type, "ticketNumber=", ticketNumber);

    await sendEmail(
      {
        To: fe.email,
        Subject: `${actionLabel} proof required - ${subjectTag}`,
        TextBody: `
Hello ${fe.name || ""},

Please submit your ${actionLabel.toLowerCase()} proof for Ticket ${ticketNumber}.

Link: ${actionUrl}

${detailsBlock}

Thank you,
Pariskq Operations Team
        `.trim(),
      },
      "FE_TOKEN_EMAIL"
    );
    console.log("[FE TOKEN EMAIL] Sent to", redactEmail(fe.email));
  } catch (err) {
    console.error("[FE TOKEN EMAIL ERROR]", err.message);
  }
}

export async function sendClientResolutionEmail({
  toEmail,
  ticketNumber,
  verificationRemarks = null,
  resolutionCategory = null,
  complaintId = null,
  vehicleNumber = null,
  category = null,
  issueType = null,
  location = null,
}) {
  /** @type {{ attempted: boolean; sent: boolean; skipped: boolean; reason: string | null }} */
  const out = {
    attempted: false,
    sent: false,
    skipped: true,
    reason: null,
  };

  if (!isValidToEmail(toEmail)) {
    out.reason = "invalid_recipient";
    return out;
  }
  if (!isValidTicketNumber(ticketNumber)) {
    out.reason = "invalid_ticket_number";
    return out;
  }

  try {
    const ticket = await fetchTicketByNumber(ticketNumber);
    const sla = ticket?.id ? await fetchSlaDeadlines(ticket.id) : null;

    const mergedTicket = ticket || {
      ticket_number: ticketNumber,
      status: null,
      category,
      issue_type: issueType,
      location,
      vehicle_number: vehicleNumber,
      opened_by_email: toEmail,
      priority: null,
      opened_at: null,
      created_at: null,
      short_description: null,
      complaint_id: complaintId,
    };

    const resolvedVehicleNumber =
      vehicleNumber != null && String(vehicleNumber).trim() !== ""
        ? vehicleNumber
        : mergedTicket.vehicle_number;

    const detailsBlock = buildTicketDetailsTable({
      ticket: mergedTicket,
      sla,
      complaintId,
      verificationRemarks,
      resolutionCategory,
    });

    let textBody = `
Your ticket ${ticketNumber} has been successfully resolved.

${detailsBlock}

If you have further issues, feel free to raise a new ticket.

Thank you,
Pariskq Operations Team
    `.trim();
    console.log("EMAIL_TRIGGER_RESOLUTION", redactEmail(toEmail), "ticketNumber=", ticketNumber);
    out.attempted = true;
    out.skipped = false;
    const sendResult = await sendEmail(
      {
        To: toEmail.trim(),
        Subject: buildCustomerTicketEmailSubject(
          "Ticket Resolved",
          ticketNumber,
          resolvedVehicleNumber
        ),
        TextBody: textBody,
      },
      "CLIENT_RESOLUTION"
    );
    if (sendResult.ok) {
      out.sent = true;
      out.reason = "sent";
    } else {
      out.sent = false;
      out.reason = sendResult.reason || "provider_failure";
    }
    return out;
  } catch (err) {
    console.error("[EMAIL:CLIENT_RESOLUTION]", err.message);
    out.attempted = true;
    out.skipped = false;
    out.sent = false;
    out.reason = "exception";
    return out;
  }
}

/**
 * Daily tenant operations report for Tenant Admins (ADMIN role only).
 * Separate from customer notification emails — do not use for ticket lifecycle notices.
 */
export async function sendDailyTenantReportEmail({
  toEmail,
  adminName,
  orgName,
  reportDay,
  summary,
  categories,
  locations,
  fePerformance,
  csvFilename,
  csvContent,
}) {
  if (!isValidToEmail(toEmail)) {
    return { ok: false, reason: "invalid_recipient" };
  }

  const greeting = adminName && String(adminName).trim() ? `Hello ${String(adminName).trim()},` : "Hello,";
  const lines = [
    greeting,
    "",
    `Daily Operations Report — ${orgName}`,
    `Report period: ${reportDay.displayLabel} (00:00–23:59 IST)`,
    "",
    "=== Ticket Summary ===",
    `Tickets Created: ${summary.createdToday}`,
    `Tickets Closed: ${summary.closedToday}`,
    `Tickets Open (activity set): ${summary.openTickets}`,
    `Tickets Pending Review (activity set): ${summary.pendingReview}`,
    `Tickets Assigned (activity set): ${summary.assignedTickets}`,
    `Tickets Unassigned (activity set): ${summary.unassignedTickets}`,
    `Tickets with Activity: ${summary.totalActivityTickets}`,
    "",
    "=== Category Breakdown ===",
    ...(categories.length > 0
      ? categories.map(([name, count]) => `${name}: ${count}`)
      : ["No tickets with activity in this period."]),
    "",
    "=== Top Locations ===",
    ...(locations.length > 0
      ? locations.map(([name, count]) => `${name}: ${count}`)
      : ["No location data for this period."]),
    "",
    "=== Field Executive Activity ===",
    ...(fePerformance.length > 0
      ? fePerformance.map(
          (fe) =>
            `${fe.name} — Assigned: ${fe.assigned}, Closed: ${fe.closed}`
        )
      : ["No field executive activity recorded for this period."]),
    "",
    "=== Optional Highlights ===",
    `High Priority Tickets (activity set): ${summary.highPriority}`,
    `SLA Breaches (activity set): ${summary.slaBreaches}`,
    `Aging Tickets (activity set): ${summary.agingTickets}`,
    "",
    "A detailed CSV export is attached. Customer name/phone may be blank for email-originated tickets.",
    "",
    "— Sahaya Operations",
  ];

  const textBody = lines.join("\n");
  const subject = `Daily Operations Report — ${orgName} — ${reportDay.displayLabel}`;
  const csvBase64 = Buffer.from(csvContent, "utf8").toString("base64");

  return sendEmail(
    {
      To: toEmail.trim(),
      Subject: subject,
      TextBody: textBody,
      Attachments: [
        {
          Name: csvFilename,
          Content: csvBase64,
          ContentType: "text/csv",
        },
      ],
    },
    "DAILY_TENANT_REPORT"
  );
}

export const sendResolutionEmail = sendClientResolutionEmail;
export const sendClientClosureEmail = sendClientResolutionEmail;
