/**
 * Role-based ticket visibility for /data/* APIs.
 * CLIENT → own client_slug only.
 * FIELD_EXECUTIVE → currently assigned tickets only.
 * STAFF/ADMIN/SUPER_ADMIN → tenant (or global) scope unchanged.
 */
import { prisma } from "../db/prisma.js";

export function getAppUserRole(req) {
  return String(req?.tenantRole || req?.appUser?.role || "").toUpperCase();
}

export function getClientSlugForScope(req) {
  const slug = req?.appUser?.client_slug ?? req?.appUser?.clientSlug ?? null;
  if (slug == null) return null;
  const s = String(slug).trim();
  return s !== "" ? s : null;
}

/**
 * Mutates/extends a Prisma ticket WHERE with role constraints.
 * Returns { ok: false, status, error } when the role cannot access ticket lists.
 *
 * @param {object} req
 * @param {Record<string, unknown>} where
 * @param {{ feId?: string | null }} [opts]
 */
export async function applyRoleTicketListScope(req, where, opts = {}) {
  const role = getAppUserRole(req);
  if (role === "CLIENT") {
    const slug = getClientSlugForScope(req);
    if (!slug) {
      return { ok: false, status: 403, error: "Client profile is missing client_slug" };
    }
    // Force client scope — ignore caller-supplied clientSlug overrides.
    where.clientSlug = { equals: slug, mode: "insensitive" };
    return { ok: true };
  }
  if (role === "FIELD_EXECUTIVE") {
    const feId = opts.feId != null ? String(opts.feId).trim() : "";
    if (!feId) {
      return { ok: false, status: 403, error: "Field executive profile not linked" };
    }
    const assignments = await prisma.ticketAssignment.findMany({
      where: {
        feId,
        ...(req?.tenantId && !req?.isSuperAdmin ? { organisationId: req.tenantId } : {}),
      },
      select: { id: true },
    });
    const assignmentIds = assignments.map((a) => a.id).filter(Boolean);
    if (assignmentIds.length === 0) {
      where.id = { in: [] };
      return { ok: true };
    }
    // Only the FE's *current* assignment — no historical leakage.
    where.currentAssignmentId = { in: assignmentIds };
    return { ok: true };
  }
  return { ok: true };
}

/**
 * After loading a single ticket, enforce CLIENT/FE ownership.
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export async function assertRoleCanAccessTicket(req, ticket, opts = {}) {
  if (!ticket) return { ok: false, status: 404, error: "Ticket not found" };
  const role = getAppUserRole(req);
  if (role === "CLIENT") {
    const slug = getClientSlugForScope(req);
    if (!slug) return { ok: false, status: 403, error: "Client profile is missing client_slug" };
    const ticketSlug = ticket.client_slug != null ? String(ticket.client_slug).trim().toLowerCase() : "";
    if (!ticketSlug || ticketSlug !== slug.toLowerCase()) {
      return { ok: false, status: 404, error: "Ticket not found" };
    }
    return { ok: true };
  }
  if (role === "FIELD_EXECUTIVE") {
    const feId = opts.feId != null ? String(opts.feId).trim() : "";
    if (!feId) return { ok: false, status: 403, error: "Field executive profile not linked" };
    const currentId = ticket.current_assignment_id ?? ticket.currentAssignmentId ?? null;
    if (!currentId) return { ok: false, status: 404, error: "Ticket not found" };
    const row = await prisma.ticketAssignment.findFirst({
      where: {
        id: String(currentId),
        feId,
        ticketId: String(ticket.id),
      },
      select: { id: true },
    });
    if (!row) return { ok: false, status: 404, error: "Ticket not found" };
    return { ok: true };
  }
  return { ok: true };
}
