import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { isPrismaDbMode } from "./db/mode.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

function auditRowToPrismaCreate(row) {
  return {
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    action: row.action,
    metadata: row.metadata ?? undefined,
    organisationId: row.organisation_id ?? null,
    performedBy: row.performed_by ?? null,
    actorUserId: row.actor_user_id ?? null,
    actorFeId: row.actor_fe_id ?? null,
    actorRole: row.actor_role ?? null,
    requestId: row.request_id ?? null,
    summary: row.summary ?? null,
  };
}

export async function insertAuditLogRow(row) {
  if (isPrismaDbMode()) {
    try {
      await prisma.auditLog.create({ data: auditRowToPrismaCreate(row) });
      return { error: null };
    } catch (err) {
      return { error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("audit_logs").insert(row);
}

export async function findOrganisationIdBySlug(slug) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.organisation.findFirst({
        where: { slug },
        select: { id: true },
      });
      return row?.id ?? null;
    } catch {
      return null;
    }
  }
  const { data, error } = await supabase.from("organisations").select("id").eq("slug", slug).maybeSingle();
  if (error || !data?.id) return null;
  return data.id;
}

export async function listTicketIdsByOrganisation(organisationId, limit = 5000) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticket.findMany({
        where: { organisationId },
        select: { id: true },
        take: limit,
      });
      return { data: rows.map((r) => ({ id: r.id })), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("tickets").select("id").eq("organisation_id", organisationId).limit(limit);
}

export async function listAssignmentIdsByTicketIds(ticketIds, limit = 5000) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticketAssignment.findMany({
        where: { ticketId: { in: ticketIds } },
        select: { id: true },
        take: limit,
      });
      return { data: rows.map((r) => ({ id: r.id })), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("ticket_assignments").select("id").in("ticket_id", ticketIds).limit(limit);
}

export async function listTicketsForAuditBackfill(limit) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticket.findMany({
        select: {
          id: true,
          ticketNumber: true,
          status: true,
          organisationId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return {
        data: mapPrismaRowsToSnake(rows),
        error: null,
      };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase
    .from("tickets")
    .select("id, ticket_number, status, organisation_id, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);
}

export async function listAssignmentsForAuditBackfill(ticketIds, limit) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticketAssignment.findMany({
        where: { ticketId: { in: ticketIds } },
        select: {
          id: true,
          ticketId: true,
          feId: true,
          assignedAt: true,
          organisationId: true,
        },
        orderBy: { assignedAt: "desc" },
        take: limit,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase
    .from("ticket_assignments")
    .select("id, ticket_id, fe_id, assigned_at, organisation_id")
    .in("ticket_id", ticketIds)
    .order("assigned_at", { ascending: false })
    .limit(limit);
}
