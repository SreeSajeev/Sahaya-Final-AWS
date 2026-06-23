/**
 * Read-only helpers to add human-readable ticket fields without schema migrations.
 */
import { findUsersByIds } from "../repositories/userRepository.js";

/**
 * First STAFF comment per ticket (by created_at) approximates manual ticket creator
 * when the initial description comment is inserted with author_id.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Array<{ id: string; source?: string | null; opened_by_email?: string | null }>} tickets
 * @returns {Promise<Map<string, string>>} ticketId -> display line (includes "Created by:" / "Opened via email" prefix where applicable)
 */
export async function buildCreatorDisplayByTicketId(supabase, tickets) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!Array.isArray(tickets) || tickets.length === 0) return out;

  const ticketIds = [...new Set(tickets.map((t) => t?.id).filter(Boolean))];
  if (ticketIds.length === 0) return out;

  const { data: commentRows, error: cErr } = await supabase
    .from("ticket_comments")
    .select("ticket_id, author_id, created_at")
    .in("ticket_id", ticketIds)
    .eq("source", "STAFF")
    .not("author_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(8000);

  if (cErr) {
    console.warn("[ticketDisplayEnrichment] staff comments lookup skipped:", cErr.message);
  }

  /** @type {Map<string, string>} */
  const firstAuthorByTicket = new Map();
  for (const row of commentRows || []) {
    const tid = row?.ticket_id;
    const aid = row?.author_id;
    if (!tid || !aid || firstAuthorByTicket.has(tid)) continue;
    firstAuthorByTicket.set(tid, aid);
  }

  const authorIds = [...new Set([...firstAuthorByTicket.values()])];
  /** @type {Map<string, { name?: string | null; email?: string | null }>} */
  const userById = new Map();
  if (authorIds.length > 0) {
    const { data: users, error: uErr } = await findUsersByIds(authorIds);
    if (uErr) {
      console.warn("[ticketDisplayEnrichment] users lookup skipped:", uErr.message);
    } else {
      for (const u of users || []) {
        if (u?.id) userById.set(u.id, { name: u.name, email: u.email });
      }
    }
  }

  for (const t of tickets) {
    const tid = t?.id;
    if (!tid) continue;
    const aid = firstAuthorByTicket.get(tid);
    if (aid) {
      const u = userById.get(aid);
      const name = u?.name != null ? String(u.name).trim() : "";
      const email = u?.email != null ? String(u.email).trim() : "";
      if (name) {
        out.set(tid, `Created by: ${name}`);
        continue;
      }
      if (email) {
        out.set(tid, `Created by: ${email}`);
        continue;
      }
    }

    const src = String(t?.source ?? "").trim().toUpperCase();
    if (src === "EMAIL" || src === "") {
      if (src === "EMAIL") out.set(tid, "Opened via email");
      continue;
    }
    if (src === "MANUAL" || src === "STAFF") {
      const em = t?.opened_by_email != null ? String(t.opened_by_email).trim() : "";
      if (em) out.set(tid, `Created by: ${em}`);
      else out.set(tid, "Created by: Staff portal");
    }
  }

  return out;
}
