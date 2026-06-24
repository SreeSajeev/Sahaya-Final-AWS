import { z } from "zod";
import { insertAuditLog } from "./auditLogService.js";
import { safeDbErrorForClient } from "../utils/http.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { normalizeTicketState } from "../utils/normalizeTicketState.js";
import { normalizeTicketPriorityInput } from "../utils/normalizeTicketPriority.js";
import { sendTicketConfirmation } from "./emailService.js";
import { redactEmail } from "../utils/redact.js";
import {
  listClientNotificationEmails,
  validateNotifyEmailsAgainstAllowed,
} from "./clientNotificationEmailResolver.js";
import { generateTicketNumberForCreation } from "../utils/ticketNumber.js";
import { insertTicket } from "../repositories/ticketQueryRepository.js";
import { insertComment } from "../repositories/commentRepository.js";

/** Shared with POST /tickets — behaviour must stay identical. */
export const createTicketBodySchema = z.object({
  ticket_number: z.string().max(120).optional().nullable(),
  vehicle_number: z.string().max(80).optional().nullable(),
  category: z.string().max(200).optional().nullable(),
  issue_type: z.string().max(200).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  complaint_id: z.string().max(120).optional().nullable(),
  priority: z.boolean().optional(),
  priority_level: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  opened_by_email: z.string().max(320).optional().nullable(),
  client_slug: z.string().max(120).optional().nullable(),
  description: z.string().max(20000).optional().nullable(),
  organisation_id: z.string().uuid().optional().nullable(),
  notify_emails: z.array(z.string().max(320)).max(50).optional(),
});

/**
 * Manual ticket creation (same logic as legacy POST /tickets handler).
 * @returns {{ ok: true, ticket: object } | { ok: false, error: string, status?: number }}
 */
export async function createManualTicketFromBody(req, body) {
  const parsed = createTicketBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "Invalid request body",
      details: parsed.error.flatten(),
    };
  }

  const data = parsed.data;
  const nowIso = new Date().toISOString();

  const organisationId =
    req.isSuperAdmin && data.organisation_id ? String(data.organisation_id) : (req.tenantId ?? null);
  if (!req.isSuperAdmin && !organisationId) {
    return { ok: false, status: 403, error: "Tenant context missing" };
  }

  const hasPriorityInput =
    data.priority_level != null ||
    (data.priority !== undefined && data.priority !== null);
  const priorityNorm = normalizeTicketPriorityInput({
    priority: data.priority,
    priority_level: data.priority_level,
    defaultLevel: hasPriorityInput ? "LOW" : "MEDIUM",
  });
  if (!priorityNorm.ok) {
    return { ok: false, status: 400, error: priorityNorm.error };
  }

  const clientSlugForNotify = data.client_slug != null ? String(data.client_slug).trim() : "";
  let validatedNotifyEmails = [];

  if (Array.isArray(data.notify_emails) && data.notify_emails.length > 0) {
    if (!clientSlugForNotify) {
      return { ok: false, status: 400, error: "client_slug is required when notify_emails is provided" };
    }
    const allowedResult = await listClientNotificationEmails(req, {
      clientSlug: clientSlugForNotify,
      organisationId: organisationId,
    });
    if (allowedResult.error) {
      return { ok: false, status: allowedResult.status ?? 400, error: allowedResult.error };
    }
    const check = validateNotifyEmailsAgainstAllowed(data.notify_emails, allowedResult.items);
    if (!check.ok) {
      return { ok: false, status: 400, error: check.error };
    }
    validatedNotifyEmails = check.validated;
  }

  let ticketNumber;
  try {
    ticketNumber = await generateTicketNumberForCreation("MANUAL");
  } catch (allocErr) {
    console.error("[manual-ticket] ticket number allocation failed:", allocErr?.message || allocErr);
    return {
      ok: false,
      status: 500,
      error: "Unable to allocate ticket number",
    };
  }

  const insertPayload = {
    ticket_number: ticketNumber,
    vehicle_number: data.vehicle_number ?? null,
    category: data.category ?? null,
    issue_type: data.issue_type ?? null,
    location: normalizeLocation(data.location),
    state: normalizeTicketState(data.state),
    complaint_id: data.complaint_id ?? null,
    source: "MANUAL",
    needs_review: false,
    confidence_score: 100,
    priority: priorityNorm.priority,
    priority_level: priorityNorm.priority_level,
    status: "OPEN",
    opened_at: nowIso,
    updated_at: nowIso,
    opened_by_email:
      data.opened_by_email != null && String(data.opened_by_email).trim() !== ""
        ? String(data.opened_by_email).trim()
        : req.appUser?.email != null && String(req.appUser.email).trim() !== ""
          ? String(req.appUser.email).trim()
          : null,
    client_slug: data.client_slug ?? null,
    ...(organisationId ? { organisation_id: organisationId } : {}),
  };

  let ticket;
  try {
    ticket = await insertTicket(insertPayload);
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: safeDbErrorForClient(error, "Unable to create ticket"),
    };
  }

  if (data.description && String(data.description).trim() !== "") {
    await insertComment({
      ticket_id: ticket.id,
      body: String(data.description).trim(),
      source: "STAFF",
      author_id: req.appUser?.id ?? null,
      ...(organisationId ? { organisation_id: organisationId } : {}),
    });
  }

  const notifySent = [];
  const notifyFailed = [];

  if (validatedNotifyEmails.length > 0) {
    for (const toEmail of validatedNotifyEmails) {
      try {
        const result = await sendTicketConfirmation({
          toEmail,
          ticketNumber: ticket.ticket_number,
          complaintId: ticket.complaint_id,
          vehicleNumber: ticket.vehicle_number,
          category: ticket.category,
          issueType: ticket.issue_type,
          location: ticket.location,
        });
        if (result?.ok) {
          notifySent.push(redactEmail(toEmail));
        } else {
          notifyFailed.push({
            email: redactEmail(toEmail),
            reason: result?.reason ?? "not_sent",
          });
        }
      } catch (err) {
        notifyFailed.push({
          email: redactEmail(toEmail),
          reason: err?.message || "exception",
        });
      }
    }
  }

  void insertAuditLog({
    req,
    entity_type: "ticket",
    entity_id: ticket.id,
    action: data.opened_by_email ? "client_ticket_created" : "manual_ticket_created",
    organisation_id: organisationId ?? ticket.organisation_id ?? null,
    metadata: {
      source: "MANUAL",
      ticket_number: ticket.ticket_number ?? null,
      client_slug: ticket.client_slug ?? null,
      ...(validatedNotifyEmails.length > 0
        ? {
            notify_emails_requested: validatedNotifyEmails.map((e) => redactEmail(e)),
            notify_emails_sent: notifySent,
            notify_emails_failed: notifyFailed,
          }
        : {}),
    },
  });

  return { ok: true, ticket };
}
