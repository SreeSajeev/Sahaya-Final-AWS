// src/services/assignmentService.js
// Isolated ticket assignment logic (single + bulk callers).

import {
  countAssignmentsForTicket,
  getAssignmentById,
  insertAssignment,
  updateAssignmentById,
  getAssignmentNotificationSentAt,
} from "../repositories/assignmentRepository.js";
import {
  getTicketByIdForAssign,
  setTicketAssigned,
  updateTicketById,
} from "../repositories/ticketQueryRepository.js";
import { getFieldExecutiveContactById, getFieldExecutiveById } from "../repositories/fieldExecutiveRepository.js";
import {
  issueAssignmentTokenPair,
  revokeTokensForTicket,
} from "./tokenService.js";
import { sendFEAssignmentWorkflowEmail } from "./emailService.js";
import { setAssignmentDeadline } from "./slaService.js";
import { sendFESmsWithResult, sanitizePhoneForSms, renderAssignmentSms } from "./smsService.js";
import { hasPublicColumn } from "./schemaCompatService.js";
import {
  denyTenantMismatch,
  isTenantAllowed,
  scopeQueryByTenant,
} from "../middleware/tenantContext.js";
import { maskTokenForLog } from "../utils/tokenRedact.js";
import { safeDbErrorForClient } from "../utils/http.js";
import { normalizeTicketState } from "../utils/normalizeTicketState.js";
import { logEvent } from "../utils/structuredLog.js";
import { insertAuditLog } from "./auditLogService.js";

export const BULK_ASSIGN_MAX_TICKETS = 25;
export const BULK_ASSIGNABLE_STATUSES = ["OPEN", "FE_ATTEMPT_FAILED"];

/** Statuses eligible for explicit reassignment (ticket must have current_assignment_id). */
export const REASSIGNABLE_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "EN_ROUTE",
  "ON_SITE",
  "FE_ATTEMPT_FAILED",
];

const REASSIGN_BLOCKED_STATUSES = [
  "RESOLVED",
  "RESOLVED_PENDING_VERIFICATION",
  "REJECTED",
  "NEEDS_REVIEW",
];

function isSmsAssignmentEnabled() {
  const v = String(process.env.SMS_ASSIGNMENT_ENABLED ?? "true").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** Default false: SMS on every assign/reassign. Set SMS_ASSIGNMENT_FIRST_ONLY=true to only SMS the first assignment per ticket. */
function isAssignmentSmsFirstOnly() {
  const v = String(process.env.SMS_ASSIGNMENT_FIRST_ONLY ?? "false").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function describeAssignmentEmailFailure(code, rawDetail) {
  const c = String(code || "").trim();
  if (c === "no_fe_email") return "No email address configured for this field executive";
  if (c === "missing_params") return "Assignment email could not be built (missing internal parameters)";
  if (c === "email_not_configured") return "Server email not configured (POSTMARK_SERVER_TOKEN or FROM_EMAIL/MAIL_FROM_EMAIL)";
  if (c === "email_not_delivered") return "Email could not be delivered via Postmark";
  if (c.startsWith("postmark_http_")) {
    const st = c.replace("postmark_http_", "");
    return `Email provider returned HTTP ${st}`;
  }
  if (c === "fetch_error") return "Email send failed (network error or timeout)";
  if (rawDetail && String(rawDetail).trim() !== "" && c === "unknown") return String(rawDetail).slice(0, 400);
  if (rawDetail && String(rawDetail).length > 0 && !["no_fe_email", "missing_params"].includes(c))
    return String(rawDetail).slice(0, 400);
  return c ? `Assignment email failed (${c})` : "Assignment email failed";
}

export function normalizeAssignmentDueAtIso(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function withTenantScope(query, req, orgColumn = "organisation_id") {
  return scopeQueryByTenant(query, req, orgColumn);
}

async function updateAssignmentNotificationSafely({ assignmentId, value }) {
  const hasSentAt = await hasPublicColumn("ticket_assignments", "assignment_notification_sent_at");
  const hasNotifId = await hasPublicColumn("ticket_assignments", "assignment_notification_id");
  const payload = {};
  if (hasSentAt) payload.assignment_notification_sent_at = new Date().toISOString();
  if (hasNotifId) payload.assignment_notification_id = value;

  if (Object.keys(payload).length === 0) {
    console.warn("[ASSIGN] notification metadata columns missing; skipping safe write");
    return;
  }

  await updateAssignmentById(assignmentId, payload);
}

async function wasAssignmentEmailAlreadySent({ assignmentId }) {
  const hasSentAt = await hasPublicColumn("ticket_assignments", "assignment_notification_sent_at");
  if (!hasSentAt) return false;
  const { data } = await getAssignmentNotificationSentAt(assignmentId);
  return Boolean(data?.assignment_notification_sent_at);
}

/**
 * Runs Postmark + Airtel side effects; never throws. Returns { email, sms } for API + logging.
 */
async function collectAssignmentNotifications({
  rid,
  ticketId,
  feId,
  assignment,
  ticket,
  onSiteToken,
  resolutionToken,
  assignment_due_at,
  isFirstAssignment,
  assignmentCount,
}) {
  const email = { success: false, error: null };
  const sms = { success: false, error: null };

  const { data: feContact, error: feContactErr } = await getFieldExecutiveContactById(feId);

  if (feContactErr) {
    console.error(
      JSON.stringify({
        event: "assignment_fe_contact_lookup_failed",
        requestId: rid,
        fe_id: feId,
        message: feContactErr.message,
      })
    );
    logEvent("assignment_notification_fe_lookup_failed", {
      requestId: rid,
      fe_id: feId,
      ticket_id: ticketId,
      message: feContactErr.message,
    });
  }

  const hasEmail = Boolean(feContact?.email && String(feContact.email).trim());
  const phoneDigits = feContact?.phone ? sanitizePhoneForSms(String(feContact.phone)) : "";
  const hasValidSmsPhone = phoneDigits.length === 10;

  if (!feContactErr && !hasEmail && !hasValidSmsPhone) {
    console.warn(
      JSON.stringify({
        event: "assignment_notify_no_reachable_contact",
        requestId: rid,
        fe_id: feId,
        ticket_id: ticketId,
        hint: "Set field_executives.email and/or a 10-digit Indian mobile for SMS",
      })
    );
  }

  console.log(
    JSON.stringify({
      event: "assignment_fe_notify_channels",
      requestId: rid,
      fe_id: feId,
      ticket_id: ticketId,
      has_fe_email: hasEmail,
      has_valid_sms_phone: hasValidSmsPhone,
    })
  );

  const alreadySent = await wasAssignmentEmailAlreadySent({ assignmentId: assignment.id });
  if (alreadySent) {
    email.success = false;
    email.error = "Assignment email skipped: already sent for this assignment";
    logEvent("assignment_notification_email_skipped", {
      requestId: rid,
      ticket_id: ticketId,
      assignment_id: assignment.id,
      reason: "duplicate_assignment_email",
    });
    console.log(
      JSON.stringify({
        event: "assignment_email_skipped_duplicate",
        requestId: rid,
        assignment_id: assignment.id,
      })
    );
  } else {
    logEvent("assignment_notification_email_attempt", {
      requestId: rid,
      ticket_id: ticketId,
      fe_id: feId,
      ticket_number: ticket.ticket_number ?? null,
    });

    const emailResult = await sendFEAssignmentWorkflowEmail({
      feId,
      ticketNumber: ticket.ticket_number,
      onSiteToken,
      resolutionToken,
      assignmentDueAt: assignment_due_at ?? assignment?.assignment_due_at ?? null,
    }).catch((e) => {
      console.error(
        JSON.stringify({
          event: "assignment_email_exception",
          requestId: rid,
          error: e?.message || String(e),
        })
      );
      logEvent("assignment_notification_email_exception", {
        requestId: rid,
        message: e?.message || String(e),
      });
      return { sent: false, error: e?.message || "exception" };
    });

    if (emailResult?.sent) {
      email.success = true;
      email.error = null;
      logEvent("assignment_notification_email_sent", {
        requestId: rid,
        ticket_id: ticketId,
        assignment_id: assignment.id,
        fe_id: feId,
      });
      await updateAssignmentNotificationSafely({
        assignmentId: assignment.id,
        value: `assignment:${assignment.id}`,
      });
    } else {
      const code = emailResult?.error ?? "unknown";
      email.error = describeAssignmentEmailFailure(code, emailResult?.error);
      logEvent("assignment_notification_email_failed", {
        requestId: rid,
        ticket_id: ticketId,
        assignment_id: assignment.id,
        fe_id: feId,
        reason_code: code,
        message: email.error,
      });
      console.error(
        JSON.stringify({
          event: "assignment_email_failed",
          requestId: rid,
          ticket_id: ticketId,
          assignment_id: assignment.id,
          fe_id: feId,
          error: code,
        })
      );
    }
  }

  if (feContactErr) {
    sms.success = false;
    sms.error = `SMS skipped: could not load field executive contact (${feContactErr.message})`;
    logEvent("assignment_notification_sms_skipped", {
      requestId: rid,
      ticket_id: ticketId,
      reason: "fe_lookup_failed",
      detail: feContactErr.message,
    });
  } else if (!isSmsAssignmentEnabled()) {
    sms.success = false;
    sms.error = "SMS skipped: assignment SMS is disabled (SMS_ASSIGNMENT_ENABLED=false)";
    logEvent("assignment_notification_sms_skipped", {
      requestId: rid,
      ticket_id: ticketId,
      reason: "sms_assignment_disabled",
    });
  } else if (isAssignmentSmsFirstOnly() && !isFirstAssignment) {
    sms.success = false;
    sms.error = `SMS skipped: only first assignment per ticket sends SMS (count=${assignmentCount}). Set SMS_ASSIGNMENT_FIRST_ONLY=false to send on every assign.`;
    logEvent("assignment_notification_sms_skipped", {
      requestId: rid,
      ticket_id: ticketId,
      reason: "not_first_assignment",
      assignmentCount: assignmentCount ?? 0,
    });
  } else if (!hasValidSmsPhone) {
    const blank = !feContact?.phone || !String(feContact.phone).trim();
    sms.success = false;
    sms.error = blank
      ? "SMS skipped: no phone number configured for this field executive"
      : "SMS skipped: invalid phone number (expected 10-digit Indian mobile)";
    logEvent("assignment_notification_sms_skipped", {
      requestId: rid,
      ticket_id: ticketId,
      reason: blank ? "no_fe_phone" : "invalid_phone",
      phoneLen: phoneDigits.length,
    });
  } else {
    const smsMessage = renderAssignmentSms({ ticketNumber: ticket.ticket_number ?? "" });
    logEvent("assignment_notification_sms_attempt", {
      requestId: rid,
      ticket_id: ticketId,
      fe_id: feId,
      ticket_number: ticket.ticket_number ?? null,
      phone_suffix: phoneDigits.slice(-4),
    });
    logEvent("sms_attempt", {
      requestId: rid,
      ticket_id: ticketId,
      fe_id: feId,
      ticket_number: ticket.ticket_number ?? null,
      phone_suffix: phoneDigits.slice(-4),
    });

    const smsRes = await sendFESmsWithResult({
      phoneNumber: feContact.phone,
      message: smsMessage,
    });

    if (smsRes.ok) {
      sms.success = true;
      sms.error = null;
      logEvent("assignment_notification_sms_sent", { requestId: rid, ticket_id: ticketId, fe_id: feId });
      logEvent("sms_success", { requestId: rid, ticket_id: ticketId, fe_id: feId });
    } else {
      sms.success = false;
      sms.error = smsRes.error || "SMS failed";
      if (smsRes.skipped) {
        logEvent("assignment_notification_sms_skipped", {
          requestId: rid,
          ticket_id: ticketId,
          fe_id: feId,
          reason_code: smsRes.reason_code,
          message: smsRes.error,
        });
      } else {
        logEvent("assignment_notification_sms_failed", {
          requestId: rid,
          ticket_id: ticketId,
          fe_id: feId,
          reason_code: smsRes.reason_code,
          skipped: false,
          message: smsRes.error,
        });
        logEvent("sms_failure", {
          requestId: rid,
          ticket_id: ticketId,
          fe_id: feId,
          reason_code: smsRes.reason_code,
        });
      }
    }
  }

  logEvent("assignment_notifications_summary", {
    requestId: rid,
    ticket_id: ticketId,
    email_success: email.success,
    email_error: email.error,
    sms_success: sms.success,
    sms_error: sms.error,
  });

  return { email, sms };
}

/**
 * Human-readable reason when reassignment rejects a ticket by status.
 */
export function getReassignStatusRejectionReason(status) {
  const s = String(status || "").trim();
  if (s === "RESOLVED") return "Ticket is resolved and cannot be reassigned";
  if (s === "RESOLVED_PENDING_VERIFICATION") {
    return "Ticket is pending verification and cannot be reassigned";
  }
  if (s === "REJECTED") return "Ticket has been rejected";
  if (s === "NEEDS_REVIEW") return "Ticket needs review before assignment";
  if (!REASSIGNABLE_STATUSES.includes(s)) {
    return `Ticket status ${s || "unknown"} cannot be reassigned`;
  }
  return null;
}

/**
 * Human-readable reason when bulk assign rejects a ticket by status.
 */
export function getBulkAssignStatusRejectionReason(status) {
  const s = String(status || "").trim();
  if (s === "REJECTED") return "Ticket has been rejected";
  if (s === "ASSIGNED") return "Ticket is already assigned";
  if (s === "ON_SITE") return "Ticket is on site";
  if (s === "RESOLVED") return "Ticket is resolved";
  if (s === "RESOLVED_PENDING_VERIFICATION") return "Ticket is pending verification";
  if (s === "NEEDS_REVIEW") return "Ticket needs review before assignment";
  if (!BULK_ASSIGNABLE_STATUSES.includes(s)) {
    return `Ticket status ${s || "unknown"} cannot be bulk-assigned (only OPEN or FE_ATTEMPT_FAILED)`;
  }
  return null;
}

/**
 * Assign one ticket to an FE. Preserves legacy single-assign semantics (only REJECTED blocked).
 *
 * @returns {Promise<{ ok: true, data: object } | { ok: false, statusCode: number, error: string, details?: object }>}
 */
export async function assignOneTicket({ req, ticketId, feId, assignmentDueAt, state: stateInput }) {
  const assignment_due_at = assignmentDueAt ?? null;

  const { data: ticket, error: ticketError } = await getTicketByIdForAssign(req, ticketId);

  if (ticketError || !ticket) {
    return { ok: false, statusCode: 404, error: "Ticket not found" };
  }

  if (ticket.status === "REJECTED") {
    return { ok: false, statusCode: 400, error: "Ticket has been rejected" };
  }

  if (!isTenantAllowed(req, ticket.organisation_id)) {
    return { ok: false, statusCode: 403, error: "Tenant mismatch", tenantMismatch: true };
  }

  const { data: feRow, error: feLookupErr } = await getFieldExecutiveById(
    feId,
    "id, organisation_id, active"
  );
  if (feLookupErr || !feRow) {
    return { ok: false, statusCode: 404, error: "Field executive not found" };
  }
  if (feRow.active === false) {
    return { ok: false, statusCode: 400, error: "Field executive is inactive" };
  }
  if (
    ticket.organisation_id &&
    feRow.organisation_id &&
    String(ticket.organisation_id) !== String(feRow.organisation_id)
  ) {
    return {
      ok: false,
      statusCode: 403,
      error: "Field executive does not belong to this ticket's organisation",
      tenantMismatch: true,
    };
  }

  if (stateInput !== undefined) {
    const normalizedState = normalizeTicketState(stateInput);
    const { error: stateUpdateError } = await updateTicketById(ticketId, {
      state: normalizedState,
      updated_at: new Date().toISOString(),
    });
    if (stateUpdateError) {
      return {
        ok: false,
        statusCode: 400,
        error: safeDbErrorForClient(stateUpdateError, "Failed to update ticket state"),
      };
    }
    ticket.state = normalizedState;
  }

  await revokeTokensForTicket({ ticketId, reason: "reassigned" });

  const hasAssignmentDueAt = await hasPublicColumn("ticket_assignments", "assignment_due_at");

  const { data: assignment, error: assignmentError } = await insertAssignment({
    ticket_id: ticketId,
    fe_id: feId,
    ...(ticket.organisation_id ? { organisation_id: ticket.organisation_id } : {}),
    ...(hasAssignmentDueAt && assignment_due_at ? { assignment_due_at } : {}),
  });

  if (assignmentError || !assignment) {
    console.error("Assignment insert error:", assignmentError?.code || "unknown");
    return {
      ok: false,
      statusCode: 400,
      error: safeDbErrorForClient(
        assignmentError,
        "Failed to create assignment. Check that the Field Executive exists and the ticket is not already assigned."
      ),
    };
  }

  await setTicketAssigned(ticketId, assignment.id);

  setAssignmentDeadline(ticketId, assignment_due_at ?? null).catch((err) =>
    console.error("[SLA] setAssignmentDeadline after assign", ticketId, err.message)
  );

  const { onSiteToken, resolutionToken } = await issueAssignmentTokenPair({
    ticketId,
    feId,
    idempotencyKey: `assign:${assignment.id}`,
  });

  const { count: assignmentCount } = await countAssignmentsForTicket(ticketId);
  const isFirstAssignment = (assignmentCount ?? 0) <= 1;

  console.log(
    JSON.stringify({
      event: "assignment_tokens_issued",
      requestId: req.requestId,
      ticket_id: ticketId,
      assignment_id: assignment.id,
      fe_id: feId,
      on_site_token_id: maskTokenForLog(onSiteToken),
      resolution_token_id: maskTokenForLog(resolutionToken),
      resolution_state: "LOCKED",
    })
  );

  const rid = req.requestId ?? null;
  let notifications = {
    email: { success: false, error: "Notifications did not run" },
    sms: { success: false, error: "Notifications did not run" },
  };
  try {
    notifications = await collectAssignmentNotifications({
      rid,
      ticketId,
      feId,
      assignment,
      ticket,
      onSiteToken,
      resolutionToken,
      assignment_due_at,
      isFirstAssignment,
      assignmentCount,
    });
  } catch (notifyErr) {
    const msg = notifyErr?.message ? String(notifyErr.message).slice(0, 400) : "Notification pipeline failed";
    console.error(
      JSON.stringify({
        event: "assignment_notifications_fatal",
        requestId: rid,
        error: msg,
      })
    );
    logEvent("assignment_notifications_fatal", { requestId: rid, message: msg });
    notifications = {
      email: { success: false, error: msg },
      sms: { success: false, error: msg },
    };
  }

  void insertAuditLog({
    req,
    entity_type: "assignment",
    entity_id: assignment.id,
    action: "ticket_assigned",
    ticket_organisation_id: ticket.organisation_id ?? null,
    client_slug: ticket.client_slug ?? null,
    actor_fe_id: feId,
    metadata: {
      ticket_id: ticketId,
      fe_id: feId,
      ticket_number: ticket.ticket_number ?? null,
      assignment_id: assignment.id,
    },
  });

  void insertAuditLog({
    req,
    entity_type: "ticket",
    entity_id: ticketId,
    action: "status_changed_to_ASSIGNED",
    ticket_organisation_id: ticket.organisation_id ?? null,
    client_slug: ticket.client_slug ?? null,
    metadata: {
      fe_id: feId,
      assignment_id: assignment.id,
      ticket_number: ticket.ticket_number ?? null,
    },
  });

  return {
    ok: true,
    data: {
      success: true,
      token: onSiteToken,
      onSiteToken,
      resolutionToken,
      notifications,
      assignment_id: assignment.id,
      ticket_number: ticket.ticket_number ?? null,
      organisation_id: ticket.organisation_id ?? null,
    },
  };
}

/**
 * Reassign a ticket from one FE to another. Inserts a new assignment row, revokes prior tokens,
 * updates current_assignment_id, notifies the new FE only, and writes ticket_reassigned audit.
 *
 * @returns {Promise<{ ok: true, data: object } | { ok: false, statusCode: number, error: string, details?: object }>}
 */
export async function reassignOneTicket({ req, ticketId, feId, assignmentDueAt, state: stateInput }) {
  const assignment_due_at = assignmentDueAt ?? null;
  const reassignedAt = new Date().toISOString();

  const { data: ticket, error: ticketError } = await getTicketByIdForAssign(req, ticketId);

  if (ticketError || !ticket) {
    return { ok: false, statusCode: 404, error: "Ticket not found" };
  }

  if (!isTenantAllowed(req, ticket.organisation_id)) {
    return { ok: false, statusCode: 403, error: "Tenant mismatch", tenantMismatch: true };
  }

  const statusReason = getReassignStatusRejectionReason(ticket.status);
  if (statusReason) {
    return { ok: false, statusCode: 400, error: statusReason };
  }

  if (!ticket.current_assignment_id) {
    return {
      ok: false,
      statusCode: 400,
      error: "Ticket has no active assignment to reassign. Use assign instead.",
    };
  }

  const { data: feRowRe, error: feLookupReErr } = await getFieldExecutiveById(
    feId,
    "id, organisation_id, active"
  );
  if (feLookupReErr || !feRowRe) {
    return { ok: false, statusCode: 404, error: "Field executive not found" };
  }
  if (feRowRe.active === false) {
    return { ok: false, statusCode: 400, error: "Field executive is inactive" };
  }
  if (
    ticket.organisation_id &&
    feRowRe.organisation_id &&
    String(ticket.organisation_id) !== String(feRowRe.organisation_id)
  ) {
    return {
      ok: false,
      statusCode: 403,
      error: "Field executive does not belong to this ticket's organisation",
      tenantMismatch: true,
    };
  }

  const hasAssignmentDueAt = await hasPublicColumn("ticket_assignments", "assignment_due_at");
  const priorSelect = hasAssignmentDueAt
    ? "id, fe_id, assignment_due_at, field_executives(id, name)"
    : "id, fe_id, field_executives(id, name)";

  const { data: priorAssignment, error: priorErr } = await getAssignmentById(
    ticket.current_assignment_id,
    priorSelect
  );

  if (priorErr) {
    return {
      ok: false,
      statusCode: 500,
      error: safeDbErrorForClient(priorErr, "Failed to load current assignment"),
    };
  }

  if (!priorAssignment) {
    return {
      ok: false,
      statusCode: 400,
      error: "Current assignment record not found. Cannot reassign.",
    };
  }

  const oldFeId = priorAssignment.fe_id != null ? String(priorAssignment.fe_id) : null;
  const oldFeName =
    priorAssignment.field_executives?.name != null
      ? String(priorAssignment.field_executives.name).trim()
      : null;
  const oldDueDate =
    hasAssignmentDueAt && priorAssignment.assignment_due_at != null
      ? String(priorAssignment.assignment_due_at)
      : null;

  if (stateInput !== undefined) {
    const normalizedState = normalizeTicketState(stateInput);
    const { error: stateUpdateError } = await updateTicketById(ticketId, {
      state: normalizedState,
      updated_at: reassignedAt,
    });
    if (stateUpdateError) {
      return {
        ok: false,
        statusCode: 400,
        error: safeDbErrorForClient(stateUpdateError, "Failed to update ticket state"),
      };
    }
    ticket.state = normalizedState;
  }

  await revokeTokensForTicket({ ticketId, reason: "reassigned" });

  const { data: assignment, error: assignmentError } = await insertAssignment({
    ticket_id: ticketId,
    fe_id: feId,
    ...(ticket.organisation_id ? { organisation_id: ticket.organisation_id } : {}),
    ...(hasAssignmentDueAt && assignment_due_at ? { assignment_due_at } : {}),
  });

  if (assignmentError || !assignment) {
    console.error("Reassignment insert error:", assignmentError?.code || "unknown");
    return {
      ok: false,
      statusCode: 400,
      error: safeDbErrorForClient(
        assignmentError,
        "Failed to create reassignment. Check that the Field Executive exists."
      ),
    };
  }

  const priorStatus = ticket.status;
  await updateTicketById(ticketId, {
    status: "ASSIGNED",
    current_assignment_id: assignment.id,
    updated_at: reassignedAt,
  });

  if (assignment_due_at != null) {
    setAssignmentDeadline(ticketId, assignment_due_at).catch((err) =>
      console.error("[SLA] setAssignmentDeadline after reassign", ticketId, err.message)
    );
  }

  const { onSiteToken, resolutionToken } = await issueAssignmentTokenPair({
    ticketId,
    feId,
    idempotencyKey: `assign:${assignment.id}`,
  });

  const { count: assignmentCount } = await countAssignmentsForTicket(ticketId);
  const isFirstAssignment = (assignmentCount ?? 0) <= 1;

  console.log(
    JSON.stringify({
      event: "reassignment_tokens_issued",
      requestId: req.requestId,
      ticket_id: ticketId,
      prior_assignment_id: priorAssignment.id,
      assignment_id: assignment.id,
      old_fe_id: oldFeId,
      new_fe_id: feId,
      on_site_token_id: maskTokenForLog(onSiteToken),
      resolution_token_id: maskTokenForLog(resolutionToken),
    })
  );

  const rid = req.requestId ?? null;
  let notifications = {
    email: { success: false, error: "Notifications did not run" },
    sms: { success: false, error: "Notifications did not run" },
  };
  try {
    notifications = await collectAssignmentNotifications({
      rid,
      ticketId,
      feId,
      assignment,
      ticket,
      onSiteToken,
      resolutionToken,
      assignment_due_at,
      isFirstAssignment,
      assignmentCount,
    });
  } catch (notifyErr) {
    const msg = notifyErr?.message ? String(notifyErr.message).slice(0, 400) : "Notification pipeline failed";
    console.error(
      JSON.stringify({
        event: "reassignment_notifications_fatal",
        requestId: rid,
        error: msg,
      })
    );
    logEvent("reassignment_notifications_fatal", { requestId: rid, message: msg });
    notifications = {
      email: { success: false, error: msg },
      sms: { success: false, error: msg },
    };
  }

  const { data: newFeRow } = await getFieldExecutiveById(feId, "name");
  const newFeName = newFeRow?.name != null ? String(newFeRow.name).trim() : null;
  const newDueDate =
    hasAssignmentDueAt && (assignment.assignment_due_at ?? assignment_due_at)
      ? String(assignment.assignment_due_at ?? assignment_due_at)
      : null;

  const reassignedBy = req?.appUser?.id ?? null;

  void insertAuditLog({
    req,
    entity_type: "ticket",
    entity_id: ticketId,
    action: "ticket_reassigned",
    ticket_organisation_id: ticket.organisation_id ?? null,
    client_slug: ticket.client_slug ?? null,
    metadata: {
      ticket_id: ticketId,
      ticket_number: ticket.ticket_number ?? null,
      old_fe_id: oldFeId,
      old_fe_name: oldFeName,
      new_fe_id: feId,
      new_fe_name: newFeName,
      old_due_date: oldDueDate,
      new_due_date: newDueDate,
      reassigned_by: reassignedBy,
      reassigned_at: reassignedAt,
      prior_assignment_id: priorAssignment.id,
      new_assignment_id: assignment.id,
      prior_status: priorStatus,
    },
  });

  void insertAuditLog({
    req,
    entity_type: "assignment",
    entity_id: assignment.id,
    action: "ticket_assigned",
    ticket_organisation_id: ticket.organisation_id ?? null,
    client_slug: ticket.client_slug ?? null,
    metadata: {
      ticket_id: ticketId,
      fe_id: feId,
      ticket_number: ticket.ticket_number ?? null,
      assignment_id: assignment.id,
      reassignment: true,
      prior_assignment_id: priorAssignment.id,
    },
  });

  if (priorStatus !== "ASSIGNED") {
    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: ticketId,
      action: "status_changed_to_ASSIGNED",
      ticket_organisation_id: ticket.organisation_id ?? null,
      client_slug: ticket.client_slug ?? null,
      metadata: {
        fe_id: feId,
        assignment_id: assignment.id,
        ticket_number: ticket.ticket_number ?? null,
        prior_status: priorStatus,
        reassignment: true,
      },
    });
  }

  return {
    ok: true,
    data: {
      success: true,
      reassignment: true,
      token: onSiteToken,
      onSiteToken,
      resolutionToken,
      notifications,
      assignment_id: assignment.id,
      prior_assignment_id: priorAssignment.id,
      ticket_number: ticket.ticket_number ?? null,
      organisation_id: ticket.organisation_id ?? null,
    },
  };
}

/**
 * Resolve tenant mismatch for HTTP handlers.
 */
export function respondTenantMismatchIfNeeded(res, result) {
  if (result.ok === false && result.tenantMismatch) {
    return denyTenantMismatch(res);
  }
  return null;
}
