import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake } from "./db/rowMapper.js";

/**
 * Atomically submit a public complaint — mirrors submit_public_complaint RPC.
 *
 * @param {Record<string, unknown>} payload
 * @returns {Promise<Record<string, unknown>>}
 */
export async function submitPublicComplaintTransaction(payload) {
  const otpSessionId = String(payload.otp_session_id || "").trim();
  const orgId = String(payload.organisation_id || "").trim();
  const cpId = String(payload.complaint_point_id || "").trim();
  const ticketNumber = String(payload.ticket_number || "").trim();

  if (!otpSessionId || !orgId || !cpId || !ticketNumber) {
    return { ok: false, code: "INVALID_PAYLOAD" };
  }

  return prisma.$transaction(async (tx) => {
    const sessions = await tx.$queryRaw`
      SELECT *
      FROM public.public_otp_sessions
      WHERE id = ${otpSessionId}::uuid
      FOR UPDATE
    `;
    const vSession = Array.isArray(sessions) ? sessions[0] : null;

    if (!vSession) {
      return { ok: false, code: "SESSION_NOT_FOUND" };
    }

    if (vSession.organisation_id !== orgId || vSession.complaint_point_id !== cpId) {
      return { ok: false, code: "SESSION_BINDING_MISMATCH" };
    }

    if (vSession.status === "consumed") {
      if (vSession.ticket_id) {
        const tickets = await tx.$queryRaw`
          SELECT t.ticket_number, t.status
          FROM public.tickets t
          WHERE t.id = ${vSession.ticket_id}::uuid
        `;
        const t = Array.isArray(tickets) ? tickets[0] : null;
        return {
          ok: true,
          idempotent: true,
          ticket_number: t?.ticket_number,
          status: t?.status,
          otp_session_id: String(vSession.id),
          ticket_id: String(vSession.ticket_id),
        };
      }
      return { ok: false, code: "SESSION_INVALID" };
    }

    if (vSession.status !== "verified") {
      return { ok: false, code: "SESSION_INVALID" };
    }

    const points = await tx.$queryRaw`
      SELECT tcp.status
      FROM public.tenant_complaint_points tcp
      WHERE tcp.id = ${vSession.complaint_point_id}::uuid
    `;
    const pointStatus = Array.isArray(points) ? points[0]?.status : null;
    if (!pointStatus || pointStatus !== "active") {
      return { ok: false, code: "COMPLAINT_POINT_INACTIVE" };
    }

    const complaintId = payload.complaint_id
      ? String(payload.complaint_id).trim() || null
      : null;

    if (complaintId) {
      const existing = await tx.$queryRaw`
        SELECT t.ticket_number
        FROM public.tickets t
        WHERE t.organisation_id = ${vSession.organisation_id}::uuid
          AND t.complaint_id = ${complaintId}
        LIMIT 1
      `;
      const ex = Array.isArray(existing) ? existing[0] : null;
      if (ex) {
        return {
          ok: false,
          code: "COMPLAINT_ID_EXISTS",
          ticket_number: ex.ticket_number,
        };
      }
    }

    let reporterName = payload.reporter_name
      ? String(payload.reporter_name).trim() || null
      : null;
    if (!reporterName) reporterName = vSession.reporter_name;

    let priorityLevel = payload.priority_level
      ? String(payload.priority_level).trim().toUpperCase()
      : "";
    if (!priorityLevel || !["LOW", "MEDIUM", "HIGH"].includes(priorityLevel)) {
      priorityLevel = payload.priority ? "HIGH" : "LOW";
    }

    const vNow = new Date();
    const responseSlaMinutes =
      payload.response_sla_minutes != null ? Number(payload.response_sla_minutes) : null;
    const resolutionSlaMinutes =
      payload.resolution_sla_minutes != null ? Number(payload.resolution_sla_minutes) : null;
    const responseDueAt = payload.response_due_at ? new Date(String(payload.response_due_at)) : null;
    const resolutionDueAt = payload.resolution_due_at
      ? new Date(String(payload.resolution_due_at))
      : null;

    try {
      const inserted = await tx.$queryRaw`
        INSERT INTO public.tickets (
          ticket_number,
          status,
          organisation_id,
          complaint_id,
          vehicle_number,
          category,
          issue_type,
          location,
          short_description,
          opened_by_email,
          opened_at,
          confidence_score,
          needs_review,
          source,
          client_slug,
          priority,
          priority_level,
          response_sla_minutes,
          resolution_sla_minutes,
          response_due_at,
          resolution_due_at,
          updated_at
        ) VALUES (
          ${ticketNumber},
          ${String(payload.status || "").trim()},
          ${vSession.organisation_id}::uuid,
          ${complaintId},
          ${payload.vehicle_number ? String(payload.vehicle_number).trim() || null : null},
          ${String(payload.category || "").trim()},
          ${String(payload.issue_type || "").trim()},
          ${payload.location ? String(payload.location).trim() || null : null},
          ${payload.short_description ? String(payload.short_description).trim() || null : null},
          NULL,
          ${vNow},
          ${Number(payload.confidence_score ?? 100)},
          ${Boolean(payload.needs_review ?? false)},
          'PUBLIC_QR',
          ${payload.client_slug ? String(payload.client_slug).trim() || null : null},
          ${priorityLevel === "HIGH"},
          ${priorityLevel},
          ${responseSlaMinutes},
          ${resolutionSlaMinutes},
          ${responseDueAt},
          ${resolutionDueAt},
          ${vNow}
        )
        RETURNING id, ticket_number, status
      `;
      const ticket = Array.isArray(inserted) ? inserted[0] : null;
      if (!ticket?.id) {
        return { ok: false, code: "SUBMIT_FAILED" };
      }

      await tx.$executeRaw`
        INSERT INTO public.public_complaint_submissions (
          ticket_id,
          complaint_point_id,
          organisation_id,
          otp_session_id,
          reporter_name,
          reporter_mobile
        ) VALUES (
          ${ticket.id}::uuid,
          ${vSession.complaint_point_id}::uuid,
          ${vSession.organisation_id}::uuid,
          ${vSession.id}::uuid,
          ${reporterName},
          ${vSession.reporter_mobile}
        )
      `;

      await tx.$executeRaw`
        UPDATE public.public_otp_sessions
        SET
          status = 'consumed',
          consumed_at = ${vNow},
          ticket_id = ${ticket.id}::uuid,
          reporter_name = ${reporterName},
          updated_at = ${vNow}
        WHERE id = ${vSession.id}::uuid
      `;

      return {
        ok: true,
        idempotent: false,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        otp_session_id: String(vSession.id),
        ticket_id: String(ticket.id),
      };
    } catch (err) {
      const code = String(err?.code || "");
      if (code === "P2002" || code === "23505") {
        const dup = await tx.$queryRaw`
          SELECT t.ticket_number, t.status, pcs.ticket_id, pcs.otp_session_id
          FROM public.public_complaint_submissions pcs
          JOIN public.tickets t ON t.id = pcs.ticket_id
          WHERE pcs.otp_session_id = ${vSession.id}::uuid
          LIMIT 1
        `;
        const row = Array.isArray(dup) ? dup[0] : null;
        if (row) {
          return {
            ok: true,
            idempotent: true,
            ticket_number: row.ticket_number,
            status: row.status,
            otp_session_id: String(row.otp_session_id ?? vSession.id),
            ticket_id: String(row.ticket_id),
          };
        }
      }
      throw err;
    }
  });
}
