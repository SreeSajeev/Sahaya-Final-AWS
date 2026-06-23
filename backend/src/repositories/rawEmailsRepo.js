import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import { isPrismaDbMode } from "./db/mode.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

const STALE_PROCESSING_MINUTES = Math.min(
  240,
  Math.max(5, Number(process.env.RAW_EMAIL_STALE_PROCESSING_MINUTES) || 30)
);

function buildRawEmailUpdateData(status, extra = {}) {
  const payload = { processing_status: status, ...extra };
  if (Object.prototype.hasOwnProperty.call(payload, "organisation_id") && payload.organisation_id == null) {
    delete payload.organisation_id;
  }
  return payload;
}

function toPrismaRawEmailUpdate(payload) {
  /** @type {Record<string, unknown>} */
  const data = {};
  if (Object.prototype.hasOwnProperty.call(payload, "processing_status")) {
    data.processingStatus = payload.processing_status;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "processing_claimed_at")) {
    data.processingClaimedAt = payload.processing_claimed_at;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "organisation_id")) {
    data.organisationId = payload.organisation_id;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "processing_error")) {
    data.processingError = payload.processing_error;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "linked_ticket_id")) {
    data.linkedTicketId = payload.linked_ticket_id;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "missing_fields")) {
    data.missingFields = payload.missing_fields;
  }
  return data;
}

async function fetchPendingRawEmailsSupabase(limit = 10, organisationId = null) {
  let query = supabase
    .from("raw_emails")
    .select("*")
    .or("processing_status.is.null,processing_status.eq.PENDING")
    .order("created_at")
    .limit(limit);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  return query;
}

async function fetchPendingRawEmailsPrisma(limit = 10, organisationId = null) {
  try {
    const rows = await prisma.rawEmail.findMany({
      where: {
        OR: [{ processingStatus: null }, { processingStatus: "PENDING" }],
        ...(organisationId ? { organisationId } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function fetchPendingRawEmails(limit = 10, organisationId = null) {
  if (isPrismaDbMode()) {
    return fetchPendingRawEmailsPrisma(limit, organisationId);
  }
  return fetchPendingRawEmailsSupabase(limit, organisationId);
}

async function requeueStaleProcessingRawEmailsSupabase(maxAgeMinutes = STALE_PROCESSING_MINUTES) {
  const hasClaimedAt = await hasPublicColumn("raw_emails", "processing_claimed_at");
  if (!hasClaimedAt) return { requeued: 0, error: null };

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("raw_emails")
    .update({ processing_status: "PENDING", processing_claimed_at: null })
    .eq("processing_status", "PROCESSING")
    .lt("processing_claimed_at", cutoff)
    .select("id");

  if (error) {
    console.error("[rawEmailsRepo] requeue stale PROCESSING failed:", error.message);
    return { requeued: 0, error };
  }
  return { requeued: (data || []).length, error: null };
}

async function requeueStaleProcessingRawEmailsPrisma(maxAgeMinutes = STALE_PROCESSING_MINUTES) {
  const hasClaimedAt = await hasPublicColumn("raw_emails", "processing_claimed_at");
  if (!hasClaimedAt) return { requeued: 0, error: null };

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  try {
    const stale = await prisma.rawEmail.findMany({
      where: {
        processingStatus: "PROCESSING",
        processingClaimedAt: { lt: cutoff },
      },
      select: { id: true },
    });
    if (!stale.length) return { requeued: 0, error: null };

    await prisma.rawEmail.updateMany({
      where: { id: { in: stale.map((r) => r.id) } },
      data: { processingStatus: "PENDING", processingClaimedAt: null },
    });
    return { requeued: stale.length, error: null };
  } catch (err) {
    console.error("[rawEmailsRepo] requeue stale PROCESSING failed:", err?.message || err);
    return { requeued: 0, error: toSupabaseStyleError(err) };
  }
}

export async function requeueStaleProcessingRawEmails(maxAgeMinutes = STALE_PROCESSING_MINUTES) {
  if (isPrismaDbMode()) {
    return requeueStaleProcessingRawEmailsPrisma(maxAgeMinutes);
  }
  return requeueStaleProcessingRawEmailsSupabase(maxAgeMinutes);
}

async function claimRawEmailForProcessingSupabase(id, organisationId = null) {
  const hasClaimedAt = await hasPublicColumn("raw_emails", "processing_claimed_at");
  const nowIso = new Date().toISOString();
  const payload = { processing_status: "PROCESSING" };
  if (hasClaimedAt) payload.processing_claimed_at = nowIso;

  let query = supabase
    .from("raw_emails")
    .update(payload)
    .eq("id", id)
    .or("processing_status.is.null,processing_status.eq.PENDING")
    .select("*")
    .maybeSingle();

  if (organisationId) {
    query = query.eq("organisation_id", organisationId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(`[rawEmailsRepo] claim failed raw_email ${id}:`, error.message);
    return { claimed: false, row: null, error };
  }
  return { claimed: Boolean(data), row: data ?? null, error: null };
}

async function claimRawEmailForProcessingPrisma(id, organisationId = null) {
  const hasClaimedAt = await hasPublicColumn("raw_emails", "processing_claimed_at");
  const nowIso = new Date();
  /** @type {Record<string, unknown>} */
  const data = { processingStatus: "PROCESSING" };
  if (hasClaimedAt) data.processingClaimedAt = nowIso;

  try {
    const result = await prisma.rawEmail.updateMany({
      where: {
        id,
        OR: [{ processingStatus: null }, { processingStatus: "PENDING" }],
        ...(organisationId ? { organisationId } : {}),
      },
      data,
    });
    if (result.count === 0) {
      return { claimed: false, row: null, error: null };
    }
    const row = await prisma.rawEmail.findUnique({ where: { id } });
    return { claimed: true, row: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    console.error(`[rawEmailsRepo] claim failed raw_email ${id}:`, err?.message || err);
    return { claimed: false, row: null, error: toSupabaseStyleError(err) };
  }
}

export async function claimRawEmailForProcessing(id, organisationId = null) {
  if (isPrismaDbMode()) {
    return claimRawEmailForProcessingPrisma(id, organisationId);
  }
  return claimRawEmailForProcessingSupabase(id, organisationId);
}

async function updateRawEmailStatusSupabase(id, status, extra = {}) {
  const hasOrgColumn = await hasPublicColumn("raw_emails", "organisation_id");
  const payload = buildRawEmailUpdateData(status, extra);
  const scopedOrganisationId = payload.organisation_id ?? null;
  if (!hasOrgColumn && Object.prototype.hasOwnProperty.call(payload, "organisation_id")) {
    delete payload.organisation_id;
  }

  let query = supabase.from("raw_emails").update(payload).eq("id", id);
  if (hasOrgColumn && scopedOrganisationId) {
    query = query.eq("organisation_id", scopedOrganisationId);
  }
  const { error } = await query;

  if (error) {
    console.error(`❌ Failed to update raw_email ${id} status to ${status}:`, error);
  }

  return { error };
}

async function updateRawEmailStatusPrisma(id, status, extra = {}) {
  const hasOrgColumn = await hasPublicColumn("raw_emails", "organisation_id");
  const payload = buildRawEmailUpdateData(status, extra);
  const scopedOrganisationId = payload.organisation_id ?? null;
  if (!hasOrgColumn && Object.prototype.hasOwnProperty.call(payload, "organisation_id")) {
    delete payload.organisation_id;
  }

  try {
    const data = toPrismaRawEmailUpdate(payload);
    for (const [snakeKey, value] of Object.entries(extra)) {
      if (snakeKey === "organisation_id") continue;
      const exists = await hasPublicColumn("raw_emails", snakeKey);
      if (exists) {
        data[camelToSnakeKey(snakeKey)] = value;
      }
    }

    await prisma.rawEmail.updateMany({
      where: {
        id,
        ...(hasOrgColumn && scopedOrganisationId ? { organisationId: scopedOrganisationId } : {}),
      },
      data,
    });
    return { error: null };
  } catch (err) {
    const error = toSupabaseStyleError(err);
    console.error(`❌ Failed to update raw_email ${id} status to ${status}:`, error.message);
    return { error };
  }
}

function camelToSnakeKey(snakeKey) {
  return snakeKey.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

export async function updateRawEmailStatus(id, status, extra = {}) {
  if (isPrismaDbMode()) {
    return updateRawEmailStatusPrisma(id, status, extra);
  }
  return updateRawEmailStatusSupabase(id, status, extra);
}
