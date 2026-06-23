/**
 * Ticket list/detail access with pluggable backends (incremental migration).
 * Does NOT replace tickets.js routes yet — wire in explicitly when ready.
 *
 * Modes (DB_MODE or resolveDbMode()):
 * - supabase: Supabase client (unchanged behavior vs direct .from("tickets"))
 * - shadow_pg: Supabase is source of truth; compare with pg; return Supabase payload
 * - postgres: Direct SQL via pg (DATABASE_URL)
 * - prisma: Prisma client
 * - shadow_prisma: pg is source of truth; compare with Prisma; return pg payload
 */

import { supabase } from "../supabaseClient.js";
import { pgQuery } from "../db/postgresClient.js";
import { prisma } from "../db/prisma.js";
import { resolveDbMode } from "../config/appConfig.js";

/** Same sentinel as middleware/tenantContext — no rows when tenant missing for non–super-admin */
const TENANT_DENY_SENTINEL = "00000000-0000-0000-0000-000000000000";

function getMode() {
  return resolveDbMode();
}

/** @param {unknown} v */
function isoOrNull(v) {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString();
  return v;
}

/**
 * @param {import("@prisma/client").Ticket} row
 * @returns {Record<string, unknown>}
 */
function ticketToSupabaseRowShape(row) {
  return {
    id: row.id,
    ticket_number: row.ticketNumber,
    status: row.status,
    complaint_id: row.complaintId,
    vehicle_number: row.vehicleNumber,
    category: row.category,
    issue_type: row.issueType,
    location: row.location,
    opened_by_email: row.openedByEmail,
    opened_at: isoOrNull(row.openedAt),
    current_assignment_id: row.currentAssignmentId,
    created_at: isoOrNull(row.createdAt),
    updated_at: isoOrNull(row.updatedAt),
    raw_email_id: row.rawEmailId,
    remarks: row.remarks,
    source: row.source,
    confidence_score: row.confidenceScore,
    needs_review: row.needsReview,
    ack_email_sent: row.ackEmailSent,
    resolved_at: isoOrNull(row.resolvedAt),
    priority: row.priority,
    priority_level: row.priorityLevel,
    client_slug: row.clientSlug,
    verification_remarks: row.verificationRemarks,
    organisation_id: row.organisationId,
    short_description: row.shortDescription,
  };
}

/**
 * Normalizes pg `pg` driver rows (snake_case + Date objects) for API / shadow compare.
 * @param {Record<string, unknown>|null} row
 */
function normalizePgRow(row) {
  if (!row) return null;
  /** @type {Record<string, unknown>} */
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (out[k] instanceof Date) out[k] = out[k].toISOString();
  }
  return out;
}

function stableStringify(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return JSON.stringify(value.map((v) => JSON.parse(stableStringify(v))));
  const keys = Object.keys(value).sort();
  const obj = {};
  for (const k of keys) obj[k] = value[k];
  return JSON.stringify(obj);
}

function logMismatch(kind, payload) {
  console.warn(`[ticketRepository][${kind}]`, payload);
}

/**
 * List tickets (GET /tickets equivalent).
 * @param {{
 *   isSuperAdmin: boolean,
 *   tenantId: string | null,
 *   limit: number,
 *   offset: number,
 * }} args
 * @returns {Promise<{ data: unknown[] | null, error: Error | null }>}
 */
export async function listTickets(args) {
  const { isSuperAdmin, tenantId, limit, offset } = args;
  const mode = getMode();

  if (mode === "supabase" || mode === "shadow_pg") {
    let q = supabase
      .from("tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (!isSuperAdmin) {
      if (tenantId) q = q.eq("organisation_id", tenantId);
      else q = q.eq("organisation_id", TENANT_DENY_SENTINEL);
    }
    const { data, error } = await q;
    if (mode === "shadow_pg") {
      void compareListShadowPg({ isSuperAdmin, tenantId, limit, offset }, data).catch((e) =>
        console.warn("[ticketRepository][shadow_pg] compare failed", e?.message || e)
      );
    }
    return { data: data ?? [], error: error ?? null };
  }

  if (mode === "postgres" || mode === "shadow_prisma") {
    const pgRows = await listTicketsPg({ isSuperAdmin, tenantId, limit, offset });
    if (mode === "shadow_prisma") {
      void compareListShadowPrisma({ isSuperAdmin, tenantId, limit, offset }, pgRows).catch((e) =>
        console.warn("[ticketRepository][shadow_prisma] compare failed", e?.message || e)
      );
    }
    return { data: pgRows.map((r) => normalizePgRow(r)), error: null };
  }

  if (mode === "prisma") {
    const where = buildPrismaWhere({ isSuperAdmin, tenantId });
    const rows = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    });
    return { data: rows.map(ticketToSupabaseRowShape), error: null };
  }

  return { data: null, error: new Error(`Unsupported DB_MODE: ${mode}`) };
}

function buildPrismaWhere({ isSuperAdmin, tenantId }) {
  if (isSuperAdmin) return {};
  if (!tenantId) {
    return { organisationId: TENANT_DENY_SENTINEL };
  }
  return { organisationId: tenantId };
}

async function listTicketsPg({ isSuperAdmin, tenantId, limit, offset }) {
  const values = [];
  let idx = 1;
  let sqlSimple = `
    SELECT *
    FROM tickets
    WHERE 1=1
  `;
  if (!isSuperAdmin) {
    if (tenantId) {
      sqlSimple += ` AND organisation_id = $${idx++}::uuid`;
      values.push(tenantId);
    } else {
      sqlSimple += ` AND organisation_id = $${idx++}::uuid`;
      values.push(TENANT_DENY_SENTINEL);
    }
  }
  sqlSimple += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  values.push(limit, offset);

  const res = await pgQuery(sqlSimple, values);
  return res.rows;
}

async function compareListShadowPg(scope, supabaseData) {
  const pgRows = await listTicketsPg({
    isSuperAdmin: scope.isSuperAdmin,
    tenantId: scope.tenantId,
    limit: scope.limit,
    offset: scope.offset,
  });
  const a = stableStringify(supabaseData ?? []);
  const b = stableStringify((pgRows ?? []).map((r) => normalizePgRow(r)));
  if (a !== b) {
    logMismatch("shadow_pg", {
      scope,
      supabaseCount: Array.isArray(supabaseData) ? supabaseData.length : null,
      pgCount: Array.isArray(pgRows) ? pgRows.length : null,
    });
  }
}

async function compareListShadowPrisma(scope, pgRows) {
  const where = buildPrismaWhere(scope);
  const prismaRows = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: scope.offset,
    take: scope.limit,
  });
  const mapped = prismaRows.map(ticketToSupabaseRowShape);
  const a = stableStringify((pgRows ?? []).map((r) => normalizePgRow(r)));
  const b = stableStringify(mapped);
  if (a !== b) {
    logMismatch("shadow_prisma", {
      scope,
      pgCount: Array.isArray(pgRows) ? pgRows.length : null,
      prismaCount: mapped.length,
    });
  }
}

/**
 * Single ticket by id (maybeSingle semantics: 0 rows => data null, no error).
 * @param {{
 *   isSuperAdmin: boolean,
 *   tenantId: string | null,
 *   ticketId: string,
 * }} args
 * @returns {Promise<{ data: unknown | null, error: Error | null }>}
 */
export async function getTicketById(args) {
  const { isSuperAdmin, tenantId, ticketId } = args;
  const mode = getMode();

  if (mode === "supabase" || mode === "shadow_pg") {
    let q = supabase.from("tickets").select("*").eq("id", ticketId);
    if (!isSuperAdmin) {
      if (tenantId) q = q.eq("organisation_id", tenantId);
      else q = q.eq("organisation_id", TENANT_DENY_SENTINEL);
    }
    const { data, error } = await q.maybeSingle();
    if (mode === "shadow_pg") {
      void compareGetShadowPg({ isSuperAdmin, tenantId, ticketId }, data).catch((e) =>
        console.warn("[ticketRepository][shadow_pg][get] compare failed", e?.message || e)
      );
    }
    return { data: data ?? null, error: error ?? null };
  }

  if (mode === "postgres" || mode === "shadow_prisma") {
    const row = await getTicketByIdPg({ isSuperAdmin, tenantId, ticketId });
    if (mode === "shadow_prisma") {
      void compareGetShadowPrisma({ isSuperAdmin, tenantId, ticketId }, row).catch((e) =>
        console.warn("[ticketRepository][shadow_prisma][get] compare failed", e?.message || e)
      );
    }
    return { data: normalizePgRow(row), error: null };
  }

  if (mode === "prisma") {
    const where = buildPrismaWhereForId({ isSuperAdmin, tenantId, ticketId });
    const row = await prisma.ticket.findFirst({ where });
    return { data: row ? ticketToSupabaseRowShape(row) : null, error: null };
  }

  return { data: null, error: new Error(`Unsupported DB_MODE: ${mode}`) };
}

function buildPrismaWhereForId({ isSuperAdmin, tenantId, ticketId }) {
  const base = { id: ticketId };
  if (isSuperAdmin) return base;
  if (!tenantId) {
    return { ...base, organisationId: TENANT_DENY_SENTINEL };
  }
  return { ...base, organisationId: tenantId };
}

async function getTicketByIdPg({ isSuperAdmin, tenantId, ticketId }) {
  const values = [ticketId];
  let sql = `SELECT * FROM tickets WHERE id = $1::uuid`;
  if (!isSuperAdmin) {
    if (tenantId) {
      sql += ` AND organisation_id = $2::uuid`;
      values.push(tenantId);
    } else {
      sql += ` AND organisation_id = $2::uuid`;
      values.push(TENANT_DENY_SENTINEL);
    }
  }
  sql += ` LIMIT 1`;
  const res = await pgQuery(sql, values);
  return res.rows[0] ?? null;
}

async function compareGetShadowPg(scope, supabaseRow) {
  const pgRow = await getTicketByIdPg({
    isSuperAdmin: scope.isSuperAdmin,
    tenantId: scope.tenantId,
    ticketId: scope.ticketId,
  });
  const a = stableStringify(supabaseRow ?? null);
  const b = stableStringify(normalizePgRow(pgRow));
  if (a !== b) {
    logMismatch("shadow_pg_get", { scope, supabase: !!supabaseRow, pg: !!pgRow });
  }
}

async function compareGetShadowPrisma(scope, pgRow) {
  const where = buildPrismaWhereForId(scope);
  const row = await prisma.ticket.findFirst({ where });
  const mapped = row ? ticketToSupabaseRowShape(row) : null;
  const a = stableStringify(normalizePgRow(pgRow));
  const b = stableStringify(mapped);
  if (a !== b) {
    logMismatch("shadow_prisma_get", { scope, pg: !!pgRow, prisma: !!mapped });
  }
}
