import { prisma } from "../db/prisma.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
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

function camelToSnakeKey(snakeKey) {
  return snakeKey.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
}

export async function fetchPendingRawEmails(limit = 10, organisationId = null) {
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

export async function requeueStaleProcessingRawEmails(maxAgeMinutes = STALE_PROCESSING_MINUTES) {
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

export async function claimRawEmailForProcessing(id, organisationId = null) {
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

export async function updateRawEmailStatus(id, status, extra = {}) {
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

export async function findRawEmailByMessageId(messageId) {
  try {
    const row = await prisma.rawEmail.findFirst({
      where: { messageId },
      select: { id: true, messageId: true },
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

function inboundRawEmailToPrisma(payload) {
  /** @type {Record<string, unknown>} */
  const data = {
    messageId: payload.message_id,
    fromEmail: payload.from_email,
    toEmail: payload.to_email,
    receivedAt: new Date(String(payload.received_at)),
    payload: payload.payload,
  };
  if (payload.thread_id != null) data.threadId = payload.thread_id;
  if (payload.subject != null) data.subject = payload.subject;
  if (payload.processing_status != null) data.processingStatus = payload.processing_status;
  if (payload.created_at != null) data.createdAt = new Date(String(payload.created_at));
  if (payload.organisation_id != null) data.organisationId = payload.organisation_id;
  if (payload.raw_text != null) data.rawText = payload.raw_text;
  if (payload.raw_html != null) data.rawHtml = payload.raw_html;
  return data;
}

export async function insertInboundRawEmail(payload) {
  try {
    const row = await prisma.rawEmail.create({
      data: inboundRawEmailToPrisma(payload),
      select: { id: true },
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listRawEmailsPaged({ limit, offset, organisationId } = {}) {
  try {
    const rows = await prisma.rawEmail.findMany({
      where: organisationId ? { organisationId } : {},
      orderBy: { receivedAt: "desc" },
      skip: offset,
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
