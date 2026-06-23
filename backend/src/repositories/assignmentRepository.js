import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { scopeQueryByTenant } from "../middleware/tenantContext.js";
import { isPrismaDbMode } from "./db/mode.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";
import { buildPrismaOrgWhere } from "./db/tenantScope.js";

function assignmentInsertToPrisma(insert) {
  /** @type {Record<string, unknown>} */
  const data = {
    ticketId: insert.ticket_id,
    feId: insert.fe_id,
  };
  if (insert.organisation_id) data.organisationId = insert.organisation_id;
  if (insert.assignment_due_at) data.assignmentDueAt = new Date(String(insert.assignment_due_at));
  return data;
}

function assignmentPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  if (Object.prototype.hasOwnProperty.call(patch, "assignment_notification_sent_at")) {
    data.assignmentNotificationSentAt = patch.assignment_notification_sent_at
      ? new Date(String(patch.assignment_notification_sent_at))
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "assignment_notification_id")) {
    data.assignmentNotificationId = patch.assignment_notification_id;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "proof_storage_path")) {
    data.proofStoragePath = patch.proof_storage_path;
  }
  return data;
}

function mapAssignmentWithFe(row) {
  const mapped = mapPrismaRowToSnake(row);
  if (!mapped) return null;
  if (row.fe && typeof row.fe === "object") {
    mapped.field_executives = mapPrismaRowToSnake(/** @type {Record<string, unknown>} */ (row.fe));
  }
  delete mapped.fe;
  return mapped;
}

export async function updateAssignmentById(assignmentId, patch) {
  if (isPrismaDbMode()) {
    try {
      await prisma.ticketAssignment.update({
        where: { id: assignmentId },
        data: assignmentPatchToPrisma(patch),
      });
      return { error: null };
    } catch (err) {
      return { error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("ticket_assignments").update(patch).eq("id", assignmentId);
}

export async function getAssignmentNotificationSentAt(assignmentId) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.ticketAssignment.findUnique({
        where: { id: assignmentId },
        select: { assignmentNotificationSentAt: true },
      });
      return {
        data: row
          ? { assignment_notification_sent_at: row.assignmentNotificationSentAt?.toISOString() ?? null }
          : null,
        error: null,
      };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase
    .from("ticket_assignments")
    .select("assignment_notification_sent_at")
    .eq("id", assignmentId)
    .maybeSingle();
}

export async function insertAssignment(insert) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.ticketAssignment.create({
        data: assignmentInsertToPrisma(insert),
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("ticket_assignments").insert(insert).select().single();
}

export async function countAssignmentsForTicket(ticketId) {
  if (isPrismaDbMode()) {
    try {
      const count = await prisma.ticketAssignment.count({ where: { ticketId } });
      return { count, error: null };
    } catch (err) {
      return { count: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("ticket_assignments").select("*", { count: "exact", head: true }).eq("ticket_id", ticketId);
}

export async function getAssignmentById(assignmentId, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const includeFe = String(selectCols).includes("field_executives");
      const row = await prisma.ticketAssignment.findUnique({
        where: { id: assignmentId },
        include: includeFe ? { fe: true } : undefined,
      });
      if (!row) return { data: null, error: null };
      return {
        data: includeFe ? mapAssignmentWithFe(/** @type {Record<string, unknown>} */ (row)) : mapPrismaRowToSnake(row),
        error: null,
      };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("ticket_assignments").select(selectCols).eq("id", assignmentId).maybeSingle();
}

export async function listAssignmentsForTicket(req, ticketId, { limit, offset, includeFe = true }) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticketAssignment.findMany({
        where: { ticketId, ...buildPrismaOrgWhere(req) },
        include: includeFe ? { fe: true } : undefined,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      });
      const data = includeFe
        ? rows.map((r) => mapAssignmentWithFe(/** @type {Record<string, unknown>} */ (r))).filter(Boolean)
        : mapPrismaRowsToSnake(rows);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase
    .from("ticket_assignments")
    .select(includeFe ? "*, field_executives (*)" : "*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  q = scopeQueryByTenant(q, req);
  return q;
}

export async function listAssignmentsWithTicketsScoped(req, { limit, offset }) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticketAssignment.findMany({
        where: buildPrismaOrgWhere(req),
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase
    .from("ticket_assignments")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  q = scopeQueryByTenant(q, req);
  return q;
}

export async function listAllAssignmentsScoped(req) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticketAssignment.findMany({ where: buildPrismaOrgWhere(req) });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("ticket_assignments").select("*");
  q = scopeQueryByTenant(q, req);
  return q;
}

export async function listAssignmentsByTicketIds(ticketIds, { includeFe = true, includeAssignmentDueAt = true } = {}) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticketAssignment.findMany({
        where: { ticketId: { in: ticketIds } },
        include: includeFe ? { fe: { select: { name: true } } } : undefined,
      });
      const data = rows.map((row) => {
        const mapped = mapPrismaRowToSnake(row);
        if (includeFe && row.fe) {
          mapped.field_executives = mapPrismaRowToSnake(/** @type {Record<string, unknown>} */ (row.fe));
        }
        if (!includeAssignmentDueAt) delete mapped.assignment_due_at;
        return mapped;
      });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  const select = includeAssignmentDueAt
    ? includeFe
      ? "ticket_id, assigned_at, assignment_due_at, field_executives(name)"
      : "ticket_id, assigned_at, assignment_due_at"
    : includeFe
      ? "ticket_id, assigned_at, field_executives(name)"
      : "ticket_id, assigned_at";
  return supabase.from("ticket_assignments").select(select).in("ticket_id", ticketIds);
}

export async function listAssignmentsByFeIdsWithTickets(req, feIds) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticketAssignment.findMany({
        where: { feId: { in: feIds }, ...buildPrismaOrgWhere(req) },
        orderBy: { createdAt: "desc" },
      });
      const ticketIds = [...new Set(rows.map((r) => r.ticketId))];
      const tickets = ticketIds.length
        ? await prisma.ticket.findMany({
            where: { id: { in: ticketIds } },
            select: {
              id: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              currentAssignmentId: true,
            },
          })
        : [];
      const ticketMap = new Map(tickets.map((t) => [t.id, mapPrismaRowToSnake(t)]));
      const data = rows.map((row) => {
        const mapped = mapPrismaRowToSnake(row);
        mapped.tickets = ticketMap.get(row.ticketId) ?? null;
        return mapped;
      });
      return { data, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase
    .from("ticket_assignments")
    .select(
      `
        id,
        fe_id,
        created_at,
        tickets!ticket_assignments_ticket_id_fkey (
          id,
          status,
          created_at,
          updated_at,
          current_assignment_id
        )
      `
    )
    .in("fe_id", feIds);
  q = scopeQueryByTenant(q, req);
  return q;
}
