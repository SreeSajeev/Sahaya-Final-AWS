import { prisma } from "../db/prisma.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";
import { buildPrismaOrgWhere } from "./db/tenantScope.js";

/**
 * Insert an EMAIL-sourced ticket comment ({ data, error } return shape).
 * @param {string} ticketId
 * @param {string} body
 */
export async function insertEmailComment(ticketId, body) {
  try {
    await prisma.ticketComment.create({
      data: {
        ticketId,
        body,
        source: "EMAIL",
      },
    });
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function insertComment(row) {
  try {
    const data = {
      ticketId: row.ticket_id,
      source: row.source,
      body: row.body ?? null,
      authorId: row.author_id ?? null,
      attachments: row.attachments ?? undefined,
      organisationId: row.organisation_id ?? null,
    };
    if (row.created_at) data.createdAt = new Date(String(row.created_at));
    const created = await prisma.ticketComment.create({ data });
    return { data: mapPrismaRowToSnake(created), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listCommentsForTicket(req, ticketId, { limit, offset }) {
  try {
    const rows = await prisma.ticketComment.findMany({
      where: { ticketId, ...buildPrismaOrgWhere(req) },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

/** Unscoped list for internal email enrichment (trusted server paths only). */
export async function listCommentsForTicketUnscoped(ticketId, { limit = 200, offset = 0 } = {}) {
  try {
    const rows = await prisma.ticketComment.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

/**
 * Batch-load comments for multiple tickets (FE worksheet / exports).
 * Caller must already enforce ticket ownership / tenant scope.
 */
export async function listCommentsForTicketIds(ticketIds, { limitPerTicket = 200 } = {}) {
  try {
    const ids = [...new Set((ticketIds ?? []).map((id) => String(id)).filter(Boolean))];
    if (ids.length === 0) return { data: {}, error: null };
    const rows = await prisma.ticketComment.findMany({
      where: { ticketId: { in: ids } },
      orderBy: { createdAt: "asc" },
      take: Math.min(ids.length * Math.max(1, limitPerTicket), 10000),
    });
    /** @type {Record<string, ReturnType<typeof mapPrismaRowsToSnake>>} */
    const byTicket = Object.fromEntries(ids.map((id) => [id, []]));
    for (const row of mapPrismaRowsToSnake(rows)) {
      const tid = row.ticket_id;
      if (!byTicket[tid]) byTicket[tid] = [];
      if (byTicket[tid].length < limitPerTicket) byTicket[tid].push(row);
    }
    return { data: byTicket, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function insertCommentReturning(row) {
  return insertComment(row);
}

export async function getCommentById(commentId, selectCols = "*") {
  try {
    const row = await prisma.ticketComment.findUnique({ where: { id: commentId } });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function updateCommentById(commentId, patch) {
  try {
    const data = {};
    if (Object.prototype.hasOwnProperty.call(patch, "attachments")) data.attachments = patch.attachments;
    if (Object.prototype.hasOwnProperty.call(patch, "body")) data.body = patch.body;
    await prisma.ticketComment.update({ where: { id: commentId }, data });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function findFeCommentByTicketBodyPattern(ticketId, bodyPattern) {
  try {
    const row = await prisma.ticketComment.findFirst({
      where: {
        ticketId,
        source: "FE",
        body: { contains: bodyPattern.replace(/%/g, ""), mode: "insensitive" },
      },
      select: { id: true },
    });
    return { data: row ? { id: row.id } : null, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listFeCommentsForTicketProofCheck(ticketId, { limit = 50, tenantId = null } = {}) {
  try {
    const rows = await prisma.ticketComment.findMany({
      where: {
        ticketId,
        source: "FE",
        ...(tenantId ? { organisationId: tenantId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, attachments: true, body: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listFeCommentsWithAttachmentsForWorker(ticketId, { limit = 10, tenantId = null } = {}) {
  try {
    const rows = await prisma.ticketComment.findMany({
      where: {
        ticketId,
        source: "FE",
        ...(tenantId ? { organisationId: tenantId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, attachments: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listStaffAuthorCommentsByTicketIds(ticketIds) {
  try {
    const rows = await prisma.ticketComment.findMany({
      where: {
        ticketId: { in: ticketIds },
        source: "STAFF",
        authorId: { not: null },
      },
      orderBy: { createdAt: "asc" },
      take: 8000,
      select: { ticketId: true, authorId: true, createdAt: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listFeProofCommentsByTicketIds(ticketIds) {
  try {
    const rows = await prisma.ticketComment.findMany({
      where: {
        ticketId: { in: ticketIds },
        source: "FE",
      },
      orderBy: { createdAt: "desc" },
      select: { ticketId: true, source: true, attachments: true, createdAt: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
