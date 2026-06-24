import { prisma } from "../db/prisma.js";
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

export async function findSlaRowByTicketId(ticketId) {
  
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

export async function insertSlaRow(payload) {
  
    try {
      await prisma.slaTracking.create({ data: slaPatchToPrisma(payload) });
      return { error: null };
    } catch (err) {
      const styled = toSupabaseStyleError(err);
      if (styled.code === "23505") return { error: styled };
      return { error: styled };
    }
}

export async function updateSlaByTicketId(ticketId, patch) {
  
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

export async function updateSlaById(slaId, patch) {
  
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

export async function listSlaRowsForEvaluate() {
  
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

export async function listTicketStatusesByIds(ticketIds) {
  
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

export async function listSlaRowsScoped(req, { limit, offset, orderDesc = true
}) {
  
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

export async function listSlaBreachesByTicketIdsScoped(req, ticketIds, selectCols = "*") {
  
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

export async function listSlaRowsByTicketIds(ticketIds, selectCols = "*") {
  try {
    const rows = await prisma.slaTracking.findMany({
      where: { ticketId: { in: ticketIds } },
    });
    const data = mapPrismaRowsToSnake(rows);
    if (selectCols === "*") return { data, error: null };
    const cols = String(selectCols)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const filtered = data.map((row) => {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const col of cols) {
        if (Object.prototype.hasOwnProperty.call(row, col)) out[col] = row[col];
      }
      return out;
    });
    return { data: filtered, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listSlaAssignmentDeadlinesByTicketIds(ticketIds) {
  
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

export async function listAllSlaTicketIds() {
  
    try {
      const rows = await prisma.slaTracking.findMany({ select: { ticketId: true } });
      return { data: rows.map((r) => ({ ticket_id: r.ticketId })), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listAllSlaRowsScoped(req) {
  
    try {
      const rows = await prisma.slaTracking.findMany({ where: buildPrismaOrgWhere(req) });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listSlaBreachRowsGlobal(limit) {
  
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

export async function listSlaByTicketIdsForOrg(organisationId, ticketIds, hasSlaOrgId) {
  try {
    const rows = await prisma.slaTracking.findMany({
      where: {
        ticketId: { in: ticketIds },
        ...(hasSlaOrgId ? { organisationId } : {}),
      },
      select: {
        ticketId: true,
        assignmentBreached: true,
        onsiteBreached: true,
        resolutionBreached: true,
        assignmentDeadline: true,
        resolutionDeadline: true,
        ...(hasSlaOrgId ? { organisationId: true } : {}),
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
