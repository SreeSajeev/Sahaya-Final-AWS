import { supabase } from "../supabaseClient.js";
import { scopeQueryByTenant } from "../middleware/tenantContext.js";
import { normalizeAuditLogRow, scopeAuditLogsQuery } from "./auditLogService.js";
import { safeTrim } from "../utils/http.js";

const SORT_COLUMNS = new Set(["created_at", "action", "entity_type"]);

/**
 * Resolve ticket UUIDs for a ticket-number search (tenant-scoped).
 */
export async function resolveTicketIdsForNumberSearch(ticketNumber, req) {
  const q = safeTrim(ticketNumber);
  if (!q) return [];
  let tq = supabase.from("tickets").select("id").ilike("ticket_number", `%${q}%`).limit(200);
  tq = scopeQueryByTenant(tq, req, "organisation_id");
  const { data, error } = await tq;
  if (error) throw error;
  return (data || []).map((t) => t.id).filter(Boolean);
}

/**
 * Apply ticket-number filter without dropping assignment rows (metadata.ticket_id).
 */
export function applyTicketNumberFilter(query, ticketIds) {
  if (!ticketIds?.length) {
    return query.eq("entity_type", "__no_match__");
  }
  const inList = `(${ticketIds.join(",")})`;
  return query.or(`entity_id.in.${inList},metadata->>ticket_id.in.${inList}`);
}

export function parseAuditLogSort(sortBy, sortDir) {
  const sortKey = sortBy ?? "";
  const column = SORT_COLUMNS.has(sortKey) ? sortKey : "created_at";
  const ascending = String(sortDir ?? "desc").toLowerCase() === "asc";
  return { column, ascending };
}

function pickTicketId(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  if (row.entity_type === "ticket" || row.entity_type === "bulk_assignment") {
    return row.entity_id || meta.ticket_id || null;
  }
  if (row.entity_type === "assignment") {
    return meta.ticket_id || null;
  }
  return meta.ticket_id || null;
}

function pickFeId(row) {
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return row.actor_fe_id || meta.fe_id || (row.entity_type === "field_executive" ? row.entity_id : null) || null;
}

function pickUserId(row) {
  if (row.actor_user_id) return row.actor_user_id;
  if (row.actor_role === "FIELD_EXECUTIVE") return null;
  if (row.performed_by && row.entity_type !== "field_executive") {
    return row.performed_by;
  }
  return null;
}

function humanizeAction(action) {
  if (!action) return "—";
  return String(action)
    .replace(/_/g, " ")
    .replace(/status changed to/i, "Status → ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Batch-enrich audit rows for operational grid (no UUIDs in display fields).
 */
export async function enrichAuditLogRows(rows) {
  if (!rows?.length) return [];

  const ticketIds = new Set();
  const userIds = new Set();
  const feIds = new Set();
  const orgIds = new Set();
  const assignmentIds = new Set();

  for (const row of rows) {
    if (row.organisation_id) orgIds.add(row.organisation_id);
    const uid = pickUserId(row);
    if (uid) userIds.add(uid);
    const fid = pickFeId(row);
    if (fid) feIds.add(fid);
    const tid = pickTicketId(row);
    if (tid) ticketIds.add(tid);
    if (row.entity_type === "assignment" && row.entity_id) {
      assignmentIds.add(row.entity_id);
    }
  }

  if (assignmentIds.size > 0) {
    const { data: assignments } = await supabase
      .from("ticket_assignments")
      .select("id, ticket_id, fe_id")
      .in("id", [...assignmentIds]);
    for (const a of assignments || []) {
      if (a.ticket_id) ticketIds.add(a.ticket_id);
      if (a.fe_id) feIds.add(a.fe_id);
    }
  }

  const ticketMap = new Map();
  const userMap = new Map();
  const feMap = new Map();
  const orgMap = new Map();

  const loadChunked = async (table, ids, select, key = "id") => {
    const map = new Map();
    const list = [...ids];
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const { data } = await supabase.from(table).select(select).in(key, chunk);
      for (const row of data || []) map.set(row[key], row);
    }
    return map;
  };

  if (ticketIds.size) {
    const t = await loadChunked("tickets", ticketIds, "id, ticket_number, status");
    t.forEach((v, k) => ticketMap.set(k, v));
  }
  if (userIds.size) {
    const u = await loadChunked("users", userIds, "id, name, email");
    u.forEach((v, k) => userMap.set(k, v));
  }
  if (feIds.size) {
    const f = await loadChunked("field_executives", feIds, "id, name, email");
    f.forEach((v, k) => feMap.set(k, v));
  }
  if (orgIds.size) {
    const o = await loadChunked("organisations", orgIds, "id, name, slug");
    o.forEach((v, k) => orgMap.set(k, v));
  }

  return rows.map((row) => {
    const base = normalizeAuditLogRow(row);
    const ticketId = pickTicketId(row);
    const ticket = ticketId ? ticketMap.get(ticketId) : null;
    const userId = pickUserId(row);
    const user = userId ? userMap.get(userId) : null;
    const feId = pickFeId(row);
    const fe = feId ? feMap.get(feId) : null;
    const org = row.organisation_id ? orgMap.get(row.organisation_id) : null;

    const actorRole = row.actor_role ?? null;
    const doneBy =
      user?.name?.trim() ||
      user?.email?.trim() ||
      fe?.name?.trim() ||
      fe?.email?.trim() ||
      (actorRole === "FIELD_EXECUTIVE" ? "Field executive" : null) ||
      (userId || feId ? "System user" : "System");

    const summary =
      row.summary != null && String(row.summary).trim()
        ? String(row.summary).trim()
        : humanizeAction(row.action);

    return {
      ...base,
      display: {
        timestamp: row.created_at,
        ticket_number: ticket?.ticket_number ?? (row.metadata?.ticket_number ?? null),
        action: row.action,
        action_label: humanizeAction(row.action),
        ticket_status: ticket?.status ?? null,
        done_by: doneBy,
        actor_role: actorRole,
        field_executive_name: fe?.name ?? null,
        organisation_name: org?.name ?? null,
        summary,
      },
    };
  });
}

/**
 * Build audit log list query (tenant scope + filters).
 *
 * Returns `{ query }` — not the builder directly. `buildAuditLogsListQuery` is async; returning a
 * Supabase PostgREST builder from an async function would await the thenable and execute the query
 * before `.range()` runs in the route handler.
 */
export async function buildAuditLogsListQuery(req, filters) {
  const {
    entityType,
    action,
    dateFrom,
    dateTo,
    ticketNumber,
    actorUserId,
    actorFeId,
    organisationId,
    sortBy,
    sortDir,
  } = filters;

  const { column, ascending } = parseAuditLogSort(sortBy, sortDir);

  let q = supabase.from("audit_logs").select("*").order(column, { ascending });

  const { query: scoped } = await scopeAuditLogsQuery(q, req);
  q = scoped;

  if (req.isSuperAdmin && organisationId) {
    q = q.eq("organisation_id", organisationId);
  }

  if (entityType && entityType !== "all") q = q.eq("entity_type", entityType);
  if (action && action !== "all") q = q.eq("action", action);
  if (dateFrom) q = q.gte("created_at", dateFrom);
  if (dateTo) q = q.lte("created_at", dateTo);
  if (actorUserId) q = q.eq("actor_user_id", actorUserId);
  if (actorFeId) q = q.eq("actor_fe_id", actorFeId);

  if (ticketNumber) {
    const ticketIds = await resolveTicketIdsForNumberSearch(ticketNumber, req);
    q = applyTicketNumberFilter(q, ticketIds);
  }

  return { query: q };
}

/**
 * Run audit log list query with pagination (single execution path for the API route).
 */
export async function listAuditLogsPage(req, filters, { limit, offset }) {
  const built = await buildAuditLogsListQuery(req, filters);
  const listQuery = built?.query;

  if (listQuery && typeof listQuery.range === "function") {
    const { data, error } = await listQuery.range(offset, offset + limit - 1);
    if (error) throw error;
    return enrichAuditLogRows(data || []);
  }

  /**
   * Older builds: buildAuditLogsListQuery was async and returned a thenable builder;
   * returning it executed the query early and yielded { data, error, count, … }.
   * Paginate in memory so tenants still see rows until the image is updated.
   */
  if (built && Array.isArray(built.data)) {
    console.warn("[audit-logs] using legacy executed-result pagination", {
      requestId: req?.requestId,
      totalRows: built.data.length,
      offset,
      limit,
    });
    const page = built.data.slice(offset, offset + limit);
    if (built.error) throw built.error;
    return enrichAuditLogRows(page);
  }

  throw new Error("Invalid audit log query builder");
}

/** CSV export headers for operational audit grid. */
export const AUDIT_CSV_HEADERS = [
  "timestamp",
  "ticket_number",
  "action",
  "ticket_status",
  "done_by",
  "actor_role",
  "field_executive",
  "organisation",
  "summary",
  "entity_type",
  "entity_id",
];

export function auditRowsToCsv(items) {
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [AUDIT_CSV_HEADERS.join(",")];
  for (const row of items) {
    const d = row.display || {};
    lines.push(
      [
        d.timestamp ?? row.created_at,
        d.ticket_number,
        d.action_label ?? d.action ?? row.action,
        d.ticket_status,
        d.done_by,
        d.actor_role,
        d.field_executive_name,
        d.organisation_name,
        d.summary,
        row.entity_type,
        row.entity_id,
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\n");
}
