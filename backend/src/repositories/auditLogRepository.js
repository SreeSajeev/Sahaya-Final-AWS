import { prisma } from "../db/prisma.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";
import { buildPrismaOrgWhere } from "./db/tenantScope.js";
import { searchTicketIdsByNumberIlike } from "./ticketQueryRepository.js";
import { findOrganisationIdBySlug as findOrgIdBySlugRepo } from "./organisationRepository.js";

const AUDIT_SORT_SNAKE_TO_CAMEL = {
  created_at: "createdAt",
  action: "action",
  entity_type: "entityType",
};

let auditOrgColumnCache = null;

async function auditLogsHaveOrganisationId() {
  if (auditOrgColumnCache == null) {
    auditOrgColumnCache = await hasPublicColumn("audit_logs", "organisation_id");
  }
  return auditOrgColumnCache;
}

function buildAuditTicketNumberWhere(ticketIds) {
  if (!ticketIds?.length) {
    return { entityType: "__no_match__" };
  }
  return {
    OR: [
      { entityType: "ticket", entityId: { in: ticketIds } },
      ...ticketIds.map((id) => ({
        metadata: { path: ["ticket_id"], equals: id },
      })),
    ],
  };
}

async function buildAuditLogsPrismaWhere(req, filters) {
  /** @type {import('@prisma/client').Prisma.AuditLogWhereInput} */
  const where = {};

  if (req?.isSuperAdmin && filters.organisationId) {
    where.organisationId = filters.organisationId;
  } else if (!req?.isSuperAdmin) {
    const hasOrgCol = await auditLogsHaveOrganisationId();
    if (hasOrgCol) {
      Object.assign(where, buildPrismaOrgWhere(req));
    } else if (req?.tenantId) {
      const { data: tickets } = await listTicketIdsByOrganisation(req.tenantId, 5000);
      const ticketIds = (tickets || []).map((t) => t.id).filter(Boolean);
      if (!ticketIds.length) {
        where.entityType = "__no_tickets__";
      } else {
        const { data: assignments } = await listAssignmentIdsByTicketIds(ticketIds, 5000);
        const assignmentIds = (assignments || []).map((a) => a.id).filter(Boolean);
        where.OR = [
          { entityType: "ticket", entityId: { in: ticketIds } },
          ...(assignmentIds.length
            ? [{ entityType: "assignment", entityId: { in: assignmentIds } }]
            : []),
        ];
      }
    } else {
      where.entityType = "__no_tenant__";
    }
  }

  if (filters.entityType && filters.entityType !== "all") where.entityType = filters.entityType;
  if (filters.action && filters.action !== "all") where.action = filters.action;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
  }
  if (filters.actorUserId) where.actorUserId = filters.actorUserId;
  if (filters.actorFeId) where.actorFeId = filters.actorFeId;

  if (filters.ticketNumber) {
    const pattern = `%${String(filters.ticketNumber).trim()}%`;
    const { data: ticketRows, error } = await searchTicketIdsByNumberIlike(req, pattern, 200);
    if (error) throw error;
    const ticketIds = (ticketRows || []).map((t) => t.id).filter(Boolean);
    const ticketFilter = buildAuditTicketNumberWhere(ticketIds);
    where.AND = [...(where.AND ? /** @type {unknown[]} */ (where.AND) : []), ticketFilter];
  }

  return where;
}

/**
 * Paginated audit log list with tenant scope and filters.
 */
export async function listAuditLogsPaginated(
  req,
  filters,
  { limit, offset, sortColumn = "created_at", ascending = false }
) {
  const column = AUDIT_SORT_SNAKE_TO_CAMEL[sortColumn] ? sortColumn : "created_at";
  const orderAsc = Boolean(ascending);

  try {
    const where = await buildAuditLogsPrismaWhere(req, filters);
    const orderField = AUDIT_SORT_SNAKE_TO_CAMEL[column] || "createdAt";
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { [orderField]: orderAsc ? "asc" : "desc" },
      skip: offset,
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

function auditRowToPrismaCreate(row) {
  return {
    entityType: row.entity_type,
    entityId: row.entity_id ?? null,
    action: row.action,
    metadata: row.metadata ?? undefined,
    organisationId: row.organisation_id ?? null,
    performedBy: row.performed_by ?? null,
    actorUserId: row.actor_user_id ?? null,
    actorFeId: row.actor_fe_id ?? null,
    actorRole: row.actor_role ?? null,
    requestId: row.request_id ?? null,
    summary: row.summary ?? null,
  };
}

export async function insertAuditLogRow(row) {
  try {
    await prisma.auditLog.create({ data: auditRowToPrismaCreate(row) });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function findOrganisationIdBySlug(slug) {
  const { data, error } = await findOrgIdBySlugRepo(slug);
  if (error || !data?.id) return null;
  return data.id;
}

export async function listTicketIdsByOrganisation(organisationId, limit = 5000) {
  try {
    const rows = await prisma.ticket.findMany({
      where: { organisationId },
      select: { id: true },
      take: limit,
    });
    return { data: rows.map((r) => ({ id: r.id })), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listAssignmentIdsByTicketIds(ticketIds, limit = 5000) {
  try {
    const rows = await prisma.ticketAssignment.findMany({
      where: { ticketId: { in: ticketIds } },
      select: { id: true },
      take: limit,
    });
    return { data: rows.map((r) => ({ id: r.id })), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listTicketsForAuditBackfill(limit) {
  try {
    const rows = await prisma.ticket.findMany({
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        organisationId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return {
      data: mapPrismaRowsToSnake(rows),
      error: null,
    };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listAssignmentsForAuditBackfill(ticketIds, limit) {
  try {
    const rows = await prisma.ticketAssignment.findMany({
      where: { ticketId: { in: ticketIds } },
      select: {
        id: true,
        ticketId: true,
        feId: true,
        assignedAt: true,
        organisationId: true,
      },
      orderBy: { assignedAt: "desc" },
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
