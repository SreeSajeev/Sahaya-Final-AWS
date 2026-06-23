import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { isPrismaDbMode } from "./db/mode.js";
import { mapParsedEmailWithRawEmail, mapPrismaRowToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

function snakeToParsedEmailCreate(data) {
  const { contact_number: _contact, ...rest } = data;
  /** @type {Record<string, unknown>} */
  const create = {};
  const fieldMap = {
    raw_email_id: "rawEmailId",
    complaint_id: "complaintId",
    vehicle_number: "vehicleNumber",
    issue_type: "issueType",
    reported_at: "reportedAt",
    confidence_score: "confidenceScore",
    needs_review: "needsReview",
    ticket_created: "ticketCreated",
    organisation_id: "organisationId",
  };
  for (const [snake, camel] of Object.entries(fieldMap)) {
    if (Object.prototype.hasOwnProperty.call(rest, snake)) {
      create[camel] = rest[snake];
    }
  }
  for (const key of ["category", "location", "remarks"]) {
    if (Object.prototype.hasOwnProperty.call(rest, key)) {
      create[key] = rest[key];
    }
  }
  return create;
}

async function insertParsedEmailSupabase(data, organisationId = null) {
  const { contact_number, ...rest } = data;
  if (organisationId && !rest.organisation_id) rest.organisation_id = organisationId;
  return supabase.from("parsed_emails").insert(rest).select().single();
}

async function insertParsedEmailPrisma(data, organisationId = null) {
  const { contact_number, ...rest } = data;
  if (organisationId && !rest.organisation_id) rest.organisation_id = organisationId;
  try {
    const row = await prisma.parsedEmail.create({
      data: snakeToParsedEmailCreate(rest),
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function insertParsedEmail(data, organisationId = null) {
  if (isPrismaDbMode()) {
    return insertParsedEmailPrisma(data, organisationId);
  }
  return insertParsedEmailSupabase(data, organisationId);
}

async function markParsedAsTicketedSupabase(id, organisationId = null) {
  let query = supabase.from("parsed_emails").update({ ticket_created: true }).eq("id", id);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  return query;
}

async function markParsedAsTicketedPrisma(id, organisationId = null) {
  try {
    await prisma.parsedEmail.updateMany({
      where: {
        id,
        ...(organisationId ? { organisationId } : {}),
      },
      data: { ticketCreated: true },
    });
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function markParsedAsTicketed(id, organisationId = null) {
  if (isPrismaDbMode()) {
    return markParsedAsTicketedPrisma(id, organisationId);
  }
  return markParsedAsTicketedSupabase(id, organisationId);
}

async function fetchUnprocessedParsedEmailsSupabase(limit = 10, organisationId = null) {
  let query = supabase
    .from("parsed_emails")
    .select("*, raw_emails(*)")
    .eq("ticket_created", false)
    .order("created_at")
    .limit(limit);
  if (organisationId) query = query.eq("organisation_id", organisationId);

  const { data, error } = await query;

  if (error) {
    console.error("❌ fetchUnprocessedParsedEmails error:", error);
    return [];
  }

  return data || [];
}

async function fetchUnprocessedParsedEmailsPrisma(limit = 10, organisationId = null) {
  try {
    const rows = await prisma.parsedEmail.findMany({
      where: {
        ticketCreated: false,
        ...(organisationId ? { organisationId } : {}),
      },
      include: { rawEmail: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows
      .map((row) => mapParsedEmailWithRawEmail(/** @type {Record<string, unknown>} */ (row)))
      .filter(Boolean);
  } catch (err) {
    console.error("❌ fetchUnprocessedParsedEmails error:", err?.message || err);
    return [];
  }
}

export async function fetchUnprocessedParsedEmails(limit = 10, organisationId = null) {
  if (isPrismaDbMode()) {
    return fetchUnprocessedParsedEmailsPrisma(limit, organisationId);
  }
  return fetchUnprocessedParsedEmailsSupabase(limit, organisationId);
}
