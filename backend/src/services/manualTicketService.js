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
import { resolveTicketVehicleFields } from "./clientVehicleService.js";
import { loadSlaSnapshotForOrg } from "./tenantSlaService.js";
import { createSlaRow } from "./slaService.js";

const optionalTrimmedString = (max) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => {
      if (v == null) return null;
      const t = String(v).trim();
      return t === "" ? null : t;
    });

/** Shared with POST /tickets — behaviour must stay identical. */
export const createTicketBodySchema = z.object({
  ticket_number: z.string().max(120).optional().nullable(),
  vehicle_number: optionalTrimmedString(80),
  vehicle_id: z.preprocess(
    (v) => (v == null || String(v).trim() === "" ? null : String(v).trim()),
    z.string().uuid().nullable().optional()
  ),
  category: optionalTrimmedString(200),
  issue_type: optionalTrimmedString(200),
  incident_title: z
    .string({ required_error: "Incident title is required." })
    .trim()
    .min(1, { message: "Incident title is required." })
    .max(500),
  location: z
    .string({ required_error: "Location is required" })
    .trim()
    .min(1, { message: "Location is required" })
    .max(500),
  state: optionalTrimmedString(100),
  complaint_id: optionalTrimmedString(120),
  priority: z.boolean().optional(),
  priority_level: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  opened_by_email: optionalTrimmedString(320),
  client_slug: optionalTrimmedString(120),
  /** Persisted on tickets.short_description */
  short_description: optionalTrimmedString(2000),
  /** Optional staff comment body; also backfills short_description when that field is absent */
  description: optionalTrimmedString(20000),
  organisation_id: z.string().uuid().optional().nullable(),
  notify_emails: z.array(z.string().max(320)).max(50).optional(),
});

const SUBSTANTIVE_KEYS = [
  "short_description",
  "description",
  "category",
  "issue_type",
  "vehicle_number",
  "location",
  "complaint_id",
  "client_slug",
];

/**
 * Manual ticket creation (same logic as legacy POST /tickets handler).
 * @returns {{ ok: true, ticket: object } | { ok: false, error: string, status?: number, details?: object }}
 */
export async function createManualTicketFromBody(req, body) {
  const raw = body ?? {};
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, status: 400, error: "Request body must be a JSON object" };
  }

  const parsed = createTicketBodySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "Invalid request body",
      details: parsed.error.flatten(),
    };
  }

  const data = parsed.data;

  const hasSubstantive = SUBSTANTIVE_KEYS.some((k) => {
    const v = data[k];
    return v != null && String(v).trim() !== "";
  });
  if (!hasSubstantive) {
    return {
      ok: false,
      status: 400,
      error:
        "Ticket requires at least one of: short_description, description, category, issue_type, vehicle_number, location, complaint_id, client_slug",
    };
  }

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

  const shortFromField =
    data.short_description != null && String(data.short_description).trim() !== ""
      ? String(data.short_description).trim()
      : null;
  const descriptionTrimmed =
    data.description != null && String(data.description).trim() !== ""
      ? String(data.description).trim()
      : null;
  const shortDescription =
    shortFromField ||
    (descriptionTrimmed ? descriptionTrimmed.slice(0, 2000) : null);

  const vehicleResolved = await resolveTicketVehicleFields(req, {
    clientSlug: data.client_slug,
    organisationId,
    vehicleId: data.vehicle_id,
    vehicleNumber: data.vehicle_number,
  });
  if (vehicleResolved.error) {
    return {
      ok: false,
      status: vehicleResolved.error.status,
      error: vehicleResolved.error.message,
    };
  }

  const slaSnapshot = await loadSlaSnapshotForOrg(organisationId);

  const insertPayload = {
    ticket_number: ticketNumber,
    vehicle_number: vehicleResolved.vehicle_number ?? null,
    vehicle_id: vehicleResolved.vehicle_id ?? null,
    vehicle_name: vehicleResolved.vehicle_name ?? null,
    vehicle_type: vehicleResolved.vehicle_type ?? null,
    registration_number: vehicleResolved.registration_number ?? null,
    category: data.category ?? null,
    issue_type: data.issue_type ?? null,
    incident_title: data.incident_title ?? null,
    location: normalizeLocation(data.location),
    state: normalizeTicketState(data.state),
    complaint_id: data.complaint_id ?? null,
    short_description: shortDescription,
    source: "MANUAL",
    needs_review: false,
    confidence_score: 100,
    priority: priorityNorm.priority,
    priority_level: priorityNorm.priority_level,
    status: "OPEN",
    opened_at: nowIso,
    updated_at: nowIso,
    response_sla_minutes: slaSnapshot.response_sla_minutes,
    resolution_sla_minutes: slaSnapshot.resolution_sla_minutes,
    response_due_at: slaSnapshot.response_due_at,
    resolution_due_at: slaSnapshot.resolution_due_at,
    escalation_level: null,
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

  void createSlaRow(ticket.id).catch((err) =>
    console.error("[SLA] createSlaRow after manual ticket", ticket.id, err?.message)
  );

  if (descriptionTrimmed) {
    await insertComment({
      ticket_id: ticket.id,
      body: descriptionTrimmed,
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
          vehicleName: ticket.vehicle_name,
          vehicleType: ticket.vehicle_type,
          registrationNumber: ticket.registration_number,
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
      short_description: ticket.short_description ?? null,
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
