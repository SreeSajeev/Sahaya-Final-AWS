import { normalizeAuditLogRow } from "./auditLogService.js";
import { safeTrim } from "../utils/http.js";
import { searchTicketIdsByNumberIlike, getTicketsMetaByIds } from "../repositories/ticketQueryRepository.js";
import { findAssignmentsTicketFeByIds } from "../repositories/assignmentRepository.js";
import { findUsersByIds } from "../repositories/userRepository.js";
import { findFieldExecutivesByIds } from "../repositories/fieldExecutiveRepository.js";
import { findOrganisationsByIds } from "../repositories/organisationRepository.js";
import { listAuditLogsPaginated } from "../repositories/auditLogRepository.js";

const SORT_COLUMNS = new Set(["created_at", "action", "entity_type"]);

/**
 * Resolve ticket UUIDs for a ticket-number search (tenant-scoped).
 */
export async function resolveTicketIdsForNumberSearch(ticketNumber, req) {
  const q = safeTrim(ticketNumber);
  if (!q) return [];
  const { data, error } = await searchTicketIdsByNumberIlike(req, `%${q}%`, 200);
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
    const { data: assignments } = await findAssignmentsTicketFeByIds([...assignmentIds]);
    for (const a of assignments || []) {
      if (a.ticket_id) ticketIds.add(a.ticket_id);
      if (a.fe_id) feIds.add(a.fe_id);
    }
  }

  const ticketMap = new Map();
  const userMap = new Map();
  const feMap = new Map();
  const orgMap = new Map();

  if (ticketIds.size) {
    const { data: tickets } = await getTicketsMetaByIds([...ticketIds]);
    for (const row of tickets || []) ticketMap.set(row.id, row);
  }
  if (userIds.size) {
    const { data: users } = await findUsersByIds([...userIds]);
    for (const row of users || []) userMap.set(row.id, row);
  }
  if (feIds.size) {
    const { data: fes } = await findFieldExecutivesByIds([...feIds]);
    for (const row of fes || []) feMap.set(row.id, row);
  }
  if (orgIds.size) {
    const { data: orgs } = await findOrganisationsByIds([...orgIds]);
    for (const row of orgs || []) orgMap.set(row.id, row);
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
 * Run audit log list query with pagination (single execution path for the API route).
 */
export async function listAuditLogsPage(req, filters, { limit, offset }) {
  const { column, ascending } = parseAuditLogSort(filters.sortBy, filters.sortDir);
  const { data, error } = await listAuditLogsPaginated(req, filters, {
    limit,
    offset,
    sortColumn: column,
    ascending,
  });
  if (error) throw error;
  return enrichAuditLogRows(data || []);
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
