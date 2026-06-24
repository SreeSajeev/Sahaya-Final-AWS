import { prisma } from "../db/prisma.js";
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
  if (Object.prototype.hasOwnProperty.call(patch, "outcome")) {
    data.outcome = patch.outcome;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "ended_at")) {
    data.endedAt = patch.ended_at ? new Date(String(patch.ended_at)) : null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "failure_reason")) {
    data.failureReason = patch.failure_reason;
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

export async function getAssignmentNotificationSentAt(assignmentId) {
  
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

export async function insertAssignment(insert) {
  
    try {
      const row = await prisma.ticketAssignment.create({
        data: assignmentInsertToPrisma(insert),
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function countAssignmentsForTicket(ticketId) {
  
    try {
      const count = await prisma.ticketAssignment.count({ where: { ticketId } });
      return { count, error: null };
    } catch (err) {
      return { count: null, error: toSupabaseStyleError(err) };
    }
}

export async function getAssignmentById(assignmentId, selectCols = "*") {
  
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

export async function listAssignmentsForTicket(req, ticketId, { limit, offset, includeFe = true
}) {
  
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

export async function listAssignmentsWithTicketsScoped(req, { limit, offset
}) {
  
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

export async function listAllAssignmentsScoped(req) {
  
    try {
      const rows = await prisma.ticketAssignment.findMany({ where: buildPrismaOrgWhere(req) });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function getAssignmentByTicketId(ticketId, selectCols = "*") {
  try {
    const row = await prisma.ticketAssignment.findFirst({
      where: { ticketId },
      orderBy: { assignedAt: "desc" },
    });
    if (!row) return { data: null, error: null };
    const mapped = mapPrismaRowToSnake(row);
    if (selectCols === "*") return { data: mapped, error: null };
    const cols = String(selectCols)
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    /** @type {Record<string, unknown>} */
    const filtered = {};
    for (const col of cols) {
      if (Object.prototype.hasOwnProperty.call(mapped, col)) filtered[col] = mapped[col];
    }
    return { data: filtered, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getAssignmentFeIdById(assignmentId, tenantId = null) {
  try {
    const row = await prisma.ticketAssignment.findFirst({
      where: {
        id: assignmentId,
        ...(tenantId ? { organisationId: tenantId } : {}),
      },
      select: { feId: true },
    });
    return { data: row ? { fe_id: row.feId } : null, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findAssignmentsTicketFeByIds(ids) {
  try {
    const rows = await prisma.ticketAssignment.findMany({
      where: { id: { in: ids } },
      select: { id: true, ticketId: true, feId: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

function mapAssignmentWithTicket(row) {
  const mapped = mapPrismaRowToSnake(row);
  if (!mapped) return null;
  if (row.ticket && typeof row.ticket === "object") {
    mapped.tickets = mapPrismaRowToSnake(/** @type {Record<string, unknown>} */ (row.ticket));
  }
  delete mapped.ticket;
  return mapped;
}

export async function listAssignmentsByFeId(feId) {
  try {
    const rows = await prisma.ticketAssignment.findMany({
      where: { feId },
      include: { ticket: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      data: rows.map((r) => mapAssignmentWithTicket(/** @type {Record<string, unknown>} */ (r))).filter(Boolean),
      error: null,
    };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getAssignmentWithTicketByFeAndTicket(feId, ticketId) {
  try {
    const row = await prisma.ticketAssignment.findFirst({
      where: { feId, ticketId },
      include: { ticket: true },
      orderBy: { createdAt: "desc" },
    });
    return { data: row ? mapAssignmentWithTicket(/** @type {Record<string, unknown>} */ (row)) : null, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listAssignmentsByTicketIds(ticketIds, { includeFe = true, includeAssignmentDueAt = true
} = {}) {
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

export async function listAssignmentsByFeIdsWithTickets(req, feIds) {
  try {
    const rows = await prisma.ticketAssignment.findMany({
      where: { feId: { in: feIds }, ...buildPrismaOrgWhere(req) },
      orderBy: { createdAt: "desc" },
    });
    const relatedTicketIds = [...new Set(rows.map((r) => r.ticketId))];
    const tickets = relatedTicketIds.length
      ? await prisma.ticket.findMany({
          where: { id: { in: relatedTicketIds } },
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

export async function listAssignmentsInAssignedAtWindow(
  organisationId,
  windowStart,
  windowEnd,
  hasAssignmentOrgId
) {
  try {
    const rows = await prisma.ticketAssignment.findMany({
      where: {
        assignedAt: { gte: windowStart, lte: windowEnd },
        ...(hasAssignmentOrgId ? { organisationId } : {}),
      },
      select: {
        ticketId: true,
        assignedAt: true,
        feId: true,
        organisationId: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listAssignmentsByIdsForDailyReport(ids) {
  try {
    const rows = await prisma.ticketAssignment.findMany({
      where: { id: { in: ids } },
      select: { id: true, ticketId: true, feId: true, assignedAt: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listAssignmentFeIdsByIds(ids) {
  try {
    const rows = await prisma.ticketAssignment.findMany({
      where: { id: { in: ids } },
      select: { id: true, feId: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listAssignmentStatsByTicketIdsForDailyReport(
  ticketIds,
  organisationId,
  hasAssignmentOrgId
) {
  try {
    const rows = await prisma.ticketAssignment.findMany({
      where: {
        ticketId: { in: ticketIds },
        ...(hasAssignmentOrgId ? { organisationId } : {}),
      },
      select: {
        ticketId: true,
        assignedAt: true,
        organisationId: true,
        outcome: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
