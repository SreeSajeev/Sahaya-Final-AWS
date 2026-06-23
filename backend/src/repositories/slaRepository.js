import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { scopeQueryByTenant } from "../middleware/tenantContext.js";
import { isPrismaDbMode } from "./db/mode.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";
import { buildPrismaOrgWhere } from "./db/tenantScope.js";

function slaPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  const map = {
    assignment_deadline: "assignmentDeadline",
    onsite_deadline: "onsiteDeadline",
    resolution_deadline: "resolutionDeadline",
    assignment_breached: "assignmentBreached",
    onsite_breached: "onsiteBreached",
    resolution_breached: "resolutionBreached",
    updated_at: "updatedAt",
    organisation_id: "organisationId",
    ticket_id: "ticketId",
  };
  for (const [snake, camel] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(patch, snake)) {
      const v = patch[snake];
      data[camel] = v === null ? null : snake.endsWith("_at") || snake.endsWith("_deadline") ? new Date(String(v)) : v;
    }
  }
  return data;
}

export async function fetchTicketOrganisationId(ticketId) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { organisationId: true },
      });
      return row?.organisationId ?? null;
    } catch (err) {
      console.warn("[SLA] fetchTicketOrgId failed:", ticketId, err?.message || err);
      return null;
    }
  }
  const { data, error } = await supabase
    .from("tickets")
    .select("organisation_id")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) {
    console.warn("[SLA] fetchTicketOrgId failed:", ticketId, error.message);
    return null;
  }
  return data?.organisation_id ?? null;
}

export async function findSlaRowByTicketId(ticketId) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.slaTracking.findFirst({
        where: { ticketId },
        select: { id: true },
      });
      return { data: row ? mapPrismaRowToSnake(row) : null, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("sla_tracking").select("id").eq("ticket_id", ticketId).maybeSingle();
}

export async function insertSlaRow(payload) {
  if (isPrismaDbMode()) {
    try {
      await prisma.slaTracking.create({ data: slaPatchToPrisma(payload) });
      return { error: null };
    } catch (err) {
      const styled = toSupabaseStyleError(err);
      if (styled.code === "23505") return { error: styled };
      return { error: styled };
    }
  }
  return supabase.from("sla_tracking").insert(payload);
}

export async function updateSlaByTicketId(ticketId, patch) {
  if (isPrismaDbMode()) {
    try {
      await prisma.slaTracking.updateMany({
        where: { ticketId },
        data: slaPatchToPrisma(patch),
      });
      return { error: null };
    } catch (err) {
      return { error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("sla_tracking").update(patch).eq("ticket_id", ticketId);
}

export async function updateSlaById(slaId, patch) {
  if (isPrismaDbMode()) {
    try {
      await prisma.slaTracking.update({
        where: { id: slaId },
        data: slaPatchToPrisma(patch),
      });
      return { error: null };
    } catch (err) {
      return { error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("sla_tracking").update(patch).eq("id", slaId);
}

export async function listSlaRowsForEvaluate() {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.slaTracking.findMany({
        select: {
          id: true,
          ticketId: true,
          assignmentDeadline: true,
          onsiteDeadline: true,
          resolutionDeadline: true,
          assignmentBreached: true,
          onsiteBreached: true,
          resolutionBreached: true,
        },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase
    .from("sla_tracking")
    .select(
      "id, ticket_id, assignment_deadline, onsite_deadline, resolution_deadline, assignment_breached, onsite_breached, resolution_breached"
    );
}

export async function listTicketStatusesByIds(ticketIds) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticket.findMany({
        where: { id: { in: ticketIds } },
        select: { id: true, status: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("tickets").select("id, status").in("id", ticketIds);
}

export async function listSlaRowsScoped(req, { limit, offset, orderDesc = true }) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.slaTracking.findMany({
        where: buildPrismaOrgWhere(req),
        orderBy: { createdAt: orderDesc ? "desc" : "asc" },
        skip: offset,
        take: limit,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase
    .from("sla_tracking")
    .select("*")
    .order("created_at", { ascending: !orderDesc })
    .range(offset, offset + limit - 1);
  q = scopeQueryByTenant(q, req);
  return q;
}

export async function listSlaBreachesByTicketIdsScoped(req, ticketIds, selectCols = "*") {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.slaTracking.findMany({
        where: { ticketId: { in: ticketIds }, ...buildPrismaOrgWhere(req) },
        select:
          selectCols === "*"
            ? undefined
            : {
                ticketId: true,
                assignmentBreached: true,
                onsiteBreached: true,
                resolutionBreached: true,
              },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("sla_tracking").select(selectCols).in("ticket_id", ticketIds);
  q = scopeQueryByTenant(q, req);
  return q;
}

export async function listSlaAssignmentDeadlinesByTicketIds(ticketIds) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.slaTracking.findMany({
        where: { ticketId: { in: ticketIds } },
        select: { ticketId: true, assignmentDeadline: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("sla_tracking").select("ticket_id, assignment_deadline").in("ticket_id", ticketIds);
}

export async function listAllSlaTicketIds() {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.slaTracking.findMany({ select: { ticketId: true } });
      return { data: rows.map((r) => ({ ticket_id: r.ticketId })), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("sla_tracking").select("ticket_id");
}

export async function listAllSlaRowsScoped(req) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.slaTracking.findMany({ where: buildPrismaOrgWhere(req) });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("sla_tracking").select("*");
  q = scopeQueryByTenant(q, req);
  return q;
}

export async function listSlaBreachRowsGlobal(limit) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.slaTracking.findMany({
        select: {
          ticketId: true,
          assignmentBreached: true,
          onsiteBreached: true,
          resolutionBreached: true,
        },
        take: limit + 1,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase
    .from("sla_tracking")
    .select("ticket_id, assignment_breached, onsite_breached, resolution_breached")
    .limit(limit + 1);
}
