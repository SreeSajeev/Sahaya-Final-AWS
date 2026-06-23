import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { isPrismaDbMode } from "./db/mode.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

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
