import { scopeQueryByTenant } from "../middleware/tenantContext.js";
import { hasPublicColumn } from "./schemaCompatService.js";
import {
  findOrganisationIdBySlug,
  insertAuditLogRow,
  listAssignmentIdsByTicketIds,
  listAssignmentsForAuditBackfill,
  listTicketIdsByOrganisation,
  listTicketsForAuditBackfill,
} from "../repositories/auditLogRepository.js";

let auditSchemaCache = null;

async function getAuditSchema() {
  if (auditSchemaCache) return auditSchemaCache;
  const table = "audit_logs";
  auditSchemaCache = {
    organisation_id: await hasPublicColumn(table, "organisation_id"),
    actor_user_id: await hasPublicColumn(table, "actor_user_id"),
    performed_by: await hasPublicColumn(table, "performed_by"),
    actor_fe_id: await hasPublicColumn(table, "actor_fe_id"),
    actor_role: await hasPublicColumn(table, "actor_role"),
    request_id: await hasPublicColumn(table, "request_id"),
    summary: await hasPublicColumn(table, "summary"),
  };
  return auditSchemaCache;
}

function resolveEntityId(entity_type, entity_id, metadata) {
  if (entity_id) return entity_id;
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  if (Array.isArray(meta.ticket_ids) && meta.ticket_ids.length > 0) {
    return meta.ticket_ids[0];
  }
  if (meta.ticket_id) return meta.ticket_id;
  return null;
}

function normalizeOrgSlug(slug) {
  return String(slug ?? "").trim().toLowerCase();
}

const organisationIdBySlugCache = new Map();

async function resolveOrganisationIdFromSlug(client_slug) {
  const key = normalizeOrgSlug(client_slug);
  if (!key) return null;
  if (organisationIdBySlugCache.has(key)) return organisationIdBySlugCache.get(key);

  const orgId = await findOrganisationIdBySlug(key);
  if (!orgId) return null;
  organisationIdBySlugCache.set(key, orgId);
  return orgId;
}

/**
 * Resolve tenant organisation_id for audit writes.
 * Priority: explicit organisation_id → req.tenantId → client_slug lookup → ticket row org → null.
 */
export async function resolveAuditOrganisationId({
  organisation_id = null,
  ticket_organisation_id = null,
  client_slug = null,
  req = null,
  metadata = {},
}) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};

  if (organisation_id) return organisation_id;
  if (meta.organisation_id) return meta.organisation_id;
  if (meta.tenant_id) return meta.tenant_id;

  if (req?.tenantId) return req.tenantId;

  const slug = client_slug ?? meta.client_slug ?? null;
  if (slug) {
    const fromSlug = await resolveOrganisationIdFromSlug(slug);
    if (fromSlug) return fromSlug;
  }

  if (ticket_organisation_id) return ticket_organisation_id;

  return null;
}

function buildSummary(action, metadata) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const actionLabel = String(action || "event").replace(/_/g, " ");
  if (action === "bulk_ticket_assignment" && meta.summary) {
    const s = meta.summary;
    return `Bulk assignment: ${s.succeeded ?? 0} of ${s.requested ?? "?"} tickets assigned`;
  }
  if (meta.ticket_number) {
    return `${actionLabel} (${meta.ticket_number})`;
  }
  return actionLabel;
}

/**
 * Fire-and-forget audit row. Never throws to callers.
 * Supports new schema (organisation_id, actor_user_id, actor_fe_id, request_id, summary)
 * and legacy performed_by column when present.
 */
export async function insertAuditLog({
  req = null,
  entity_type,
  entity_id = null,
  action,
  metadata = {},
  organisation_id = null,
  ticket_organisation_id = null,
  client_slug = null,
  performed_by = null,
  actor_user_id = null,
  actor_fe_id = null,
  actor_role = null,
  request_id = null,
  summary = null,
}) {
  try {
    const schema = await getAuditSchema();
    const meta = metadata && typeof metadata === "object" ? { ...metadata } : {};
    const orgId = await resolveAuditOrganisationId({
      organisation_id,
      ticket_organisation_id,
      client_slug,
      req,
      metadata: meta,
    });
    const resolvedEntityId = resolveEntityId(entity_type, entity_id, meta);

    if (schema.organisation_id && !orgId) {
      console.error("[audit-log] skipped (missing organisation_id)", { entity_type, action });
      return;
    }
    if (!resolvedEntityId) {
      console.error("[audit-log] skipped (missing entity_id)", { entity_type, action });
      return;
    }

    const appUserId = req?.appUser?.id ?? null;
    const role = actor_role ?? req?.appUser?.role ?? req?.tenantRole ?? null;

    let userId = actor_user_id ?? null;
    let feId = actor_fe_id ?? null;

    if (performed_by && !userId && !feId) {
      const actionStr = String(action || "");
      if (
        role === "FIELD_EXECUTIVE" ||
        actionStr.startsWith("fe_") ||
        entity_type === "assignment"
      ) {
        feId = performed_by;
      } else {
        userId = performed_by;
      }
    }
    if (!userId && appUserId && role !== "FIELD_EXECUTIVE") {
      userId = appUserId;
    }

    const row = {
      entity_type,
      entity_id: resolvedEntityId,
      action,
      metadata: meta,
    };

    if (schema.organisation_id) {
      row.organisation_id = orgId;
    }
    if (schema.actor_user_id) {
      row.actor_user_id = userId;
    } else if (schema.performed_by) {
      row.performed_by = userId ?? feId ?? appUserId ?? null;
    }
    if (schema.actor_fe_id && feId) {
      row.actor_fe_id = feId;
    }
    if (schema.actor_role && role) {
      row.actor_role = role;
    }
    if (schema.request_id) {
      row.request_id = request_id ?? req?.requestId ?? null;
    }
    if (schema.summary) {
      row.summary = summary ?? buildSummary(action, meta);
    }

    const { error } = await insertAuditLogRow(row);
    if (error) {
      console.error("[audit-log] insert failed:", error.message, {
        entity_type,
        action,
        code: error.code,
      });
    }
  } catch (err) {
    console.error("[audit-log] insert exception:", err?.message || err);
  }
}

/** Map DB row for API consumers that still read performed_by. */
export function normalizeAuditLogRow(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    performed_by: row.performed_by ?? row.actor_user_id ?? row.actor_fe_id ?? null,
  };
}

/**
 * Scope audit log reads by tenant when organisation_id exists on audit_logs.
 *
 * Returns `{ query }` — not the builder directly (see buildAuditLogsListQuery).
 * Consumers: `const { query: scoped } = await scopeAuditLogsQuery(q, req); q = scoped;`
 */
export async function scopeAuditLogsQuery(query, req) {
  const debug = process.env.AUDIT_LOGS_DEBUG === "true";

  if (req?.isSuperAdmin) {
    if (debug) {
      console.error("[audit-logs] scopeAuditLogsQuery", {
        requestId: req?.requestId,
        mode: "super_admin_unscoped",
      });
    }
    return { query };
  }

  const schema = await getAuditSchema();

  if (schema.organisation_id) {
    if (debug) {
      console.error("[audit-logs] scopeAuditLogsQuery", {
        requestId: req?.requestId,
        mode: "organisation_id_column",
        filter: { column: "organisation_id", value: req?.tenantId ?? "TENANT_DENY_SENTINEL" },
      });
    }
    return { query: scopeQueryByTenant(query, req, "organisation_id") };
  }

  if (!req?.tenantId) {
    return { query: query.eq("entity_type", "__no_tenant__") };
  }

  const { data: tickets, error: ticketErr } = await listTicketIdsByOrganisation(req.tenantId, 5000);

  if (ticketErr) {
    console.error("[audit-logs] scopeAuditLogsQuery tickets subquery error", {
      requestId: req?.requestId,
      errorMessage: ticketErr.message,
      errorCode: ticketErr.code,
    });
    return { query: query.eq("entity_type", "__no_tickets__") };
  }

  const ticketIds = (tickets || []).map((t) => t.id).filter(Boolean);
  if (!ticketIds.length) {
    return { query: query.eq("entity_type", "__no_tickets__") };
  }

  const { data: assignments, error: assignErr } = await listAssignmentIdsByTicketIds(ticketIds, 5000);

  if (assignErr) {
    console.error("[audit-logs] scopeAuditLogsQuery assignments subquery error", {
      requestId: req?.requestId,
      errorMessage: assignErr.message,
      errorCode: assignErr.code,
    });
    return { query: query.eq("entity_type", "__no_tickets__") };
  }

  const assignmentIds = (assignments || []).map((a) => a.id).filter(Boolean);
  const ticketIn = `(${ticketIds.join(",")})`;
  const parts = [`and(entity_type.eq.ticket,entity_id.in.${ticketIn})`];
  if (assignmentIds.length) {
    const assignIn = `(${assignmentIds.join(",")})`;
    parts.push(`and(entity_type.eq.assignment,entity_id.in.${assignIn})`);
  }

  if (debug) {
    console.error("[audit-logs] scopeAuditLogsQuery", {
      requestId: req?.requestId,
      mode: "legacy_ticket_and_assignment_entity_ids",
      ticketIdCount: ticketIds.length,
      assignmentIdCount: assignmentIds.length,
    });
  }

  return { query: query.or(parts.join(",")) };
}

/**
 * Backfill audit rows from existing tickets/assignments (demo / migration helper).
 */
export async function backfillAuditLogsFromData({ limit = 300 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 300, 1), 2000);
  const inserted = [];

  const { data: tickets, error: tErr } = await listTicketsForAuditBackfill(cap);

  if (tErr) throw tErr;

  for (const ticket of tickets || []) {
    if (!ticket.organisation_id) continue;

    await insertAuditLog({
      entity_type: "ticket",
      entity_id: ticket.id,
      action: "ticket_created",
      organisation_id: ticket.organisation_id,
      metadata: {
        ticket_number: ticket.ticket_number ?? null,
        status: ticket.status ?? null,
        source: "backfill",
      },
    });
    inserted.push(ticket.id);

    if (ticket.status && ticket.status !== "OPEN") {
      await insertAuditLog({
        entity_type: "ticket",
        entity_id: ticket.id,
        action: `status_changed_to_${ticket.status}`,
        organisation_id: ticket.organisation_id,
        metadata: {
          ticket_number: ticket.ticket_number ?? null,
          source: "backfill",
        },
      });
    }
  }

  const ticketIds = (tickets || []).map((t) => t.id).filter(Boolean);
  if (ticketIds.length > 0) {
    const { data: assignments } = await listAssignmentsForAuditBackfill(ticketIds, cap * 2);

    for (const a of assignments || []) {
      const ticket = (tickets || []).find((t) => t.id === a.ticket_id);
      const orgId = a.organisation_id || ticket?.organisation_id;
      if (!orgId) continue;

      await insertAuditLog({
        entity_type: "assignment",
        entity_id: a.id,
        action: "ticket_assigned",
        organisation_id: orgId,
        actor_fe_id: a.fe_id ?? null,
        metadata: {
          ticket_id: a.ticket_id,
          fe_id: a.fe_id,
          ticket_number: ticket?.ticket_number ?? null,
          source: "backfill",
        },
      });
    }
  }

  return { inserted_count: inserted.length, ticket_count: tickets?.length ?? 0 };
}
