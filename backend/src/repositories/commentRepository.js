import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { scopeQueryByTenant } from "../middleware/tenantContext.js";
import { isPrismaDbMode } from "./db/mode.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";
import { buildPrismaOrgWhere } from "./db/tenantScope.js";

async function insertEmailCommentSupabase(ticketId, body) {
  return supabase.from("ticket_comments").insert({
    ticket_id: ticketId,
    body,
    source: "EMAIL",
  });
}

async function insertEmailCommentPrisma(ticketId, body) {
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

/**
 * Insert an EMAIL-sourced ticket comment (Supabase-compatible return shape).
 * @param {string} ticketId
 * @param {string} body
 */
export async function insertEmailComment(ticketId, body) {
  if (isPrismaDbMode()) {
    return insertEmailCommentPrisma(ticketId, body);
  }
  return insertEmailCommentSupabase(ticketId, body);
}

async function insertCommentSupabase(row) {
  return supabase.from("ticket_comments").insert(row).select("*").single();
}

async function insertCommentPrisma(row) {
  try {
    const created = await prisma.ticketComment.create({
      data: {
        ticketId: row.ticket_id,
        body: row.body ?? null,
        source: row.source,
        authorId: row.author_id ?? null,
        attachments: row.attachments ?? undefined,
        organisationId: row.organisation_id ?? null,
      },
    });
    return { data: mapPrismaRowToSnake(created), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function insertComment(row) {
  if (isPrismaDbMode()) {
    return insertCommentPrisma(row);
  }
  return insertCommentSupabase(row);
}

export async function listCommentsForTicket(req, ticketId, { limit, offset }) {
  if (isPrismaDbMode()) {
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
  let q = supabase
    .from("ticket_comments")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);
  q = scopeQueryByTenant(q, req);
  return q;
}

export async function insertCommentReturning(row) {
  return insertComment(row);
}
