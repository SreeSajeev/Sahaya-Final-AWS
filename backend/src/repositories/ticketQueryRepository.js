import { prisma } from "../db/prisma.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError, toErrorWithCode } from "./db/prismaErrors.js";
import { buildPrismaOrgWhere } from "./db/tenantScope.js";
import { applyRoleTicketListScope, assertRoleCanAccessTicket } from "../services/ticketRoleScope.js";

const TICKET_SNAKE_TO_CAMEL = {
  ticket_number: "ticketNumber",
  status: "status",
  complaint_id: "complaintId",
  vehicle_number: "vehicleNumber",
  vehicle_id: "vehicleId",
  vehicle_name: "vehicleName",
  vehicle_type: "vehicleType",
  registration_number: "registrationNumber",
  category: "category",
  issue_type: "issueType",
  location: "location",
  state: "state",
  opened_by_email: "openedByEmail",
  opened_at: "openedAt",
  current_assignment_id: "currentAssignmentId",
  created_at: "createdAt",
  updated_at: "updatedAt",
  raw_email_id: "rawEmailId",
  remarks: "remarks",
  source: "source",
  confidence_score: "confidenceScore",
  needs_review: "needsReview",
  ack_email_sent: "ackEmailSent",
  resolved_at: "resolvedAt",
  priority: "priority",
  priority_level: "priorityLevel",
  client_slug: "clientSlug",
  verification_remarks: "verificationRemarks",
  organisation_id: "organisationId",
  short_description: "shortDescription",
  review_notes: "reviewNotes",
  resolution_category: "resolutionCategory",
  close_form_snapshot: "closeFormSnapshot",
  resolution_location_id: "resolutionLocationId",
  resolution_location_name: "resolutionLocationName",
  rejection_reason: "rejectionReason",
  rejected_at: "rejectedAt",
  rejected_by: "rejectedBy",
  response_sla_minutes: "responseSlaMinutes",
  resolution_sla_minutes: "resolutionSlaMinutes",
  response_due_at: "responseDueAt",
  resolution_due_at: "resolutionDueAt",
  escalation_level: "escalationLevel",
};

function ticketPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [snake, camel] of Object.entries(TICKET_SNAKE_TO_CAMEL)) {
    if (!Object.prototype.hasOwnProperty.call(patch, snake)) continue;
    const v = patch[snake];
    if (snake.endsWith("_at") && v != null) {
      data[camel] = new Date(String(v));
    } else {
      data[camel] = v;
    }
  }
  return data;
}

function ticketInsertToPrisma(ticket) {
  const data = ticketPatchToPrisma(ticket);
  if (Object.prototype.hasOwnProperty.call(ticket, "location")) {
    data.location = normalizeLocation(ticket.location);
  }
  return data;
}

function buildListWhere(req, filters = {}) {
  const where = { ...buildPrismaOrgWhere(req) };
  if (req?.isSuperAdmin && filters.organisationIdFilter && !filters.scopeAllOrganisations) {
    where.organisationId = filters.organisationIdFilter;
  }
  if (filters.status && filters.status !== "all") where.status = filters.status;
  if (filters.clientSlug) {
    where.clientSlug = { equals: filters.clientSlug, mode: "insensitive" };
  }
  if (filters.stateFilter) where.state = filters.stateFilter;
  if (filters.unassignedOnly) where.currentAssignmentId = null;
  if (filters.needsReview === true) where.needsReview = true;
  if (filters.reviewQueue === true) {
    where.OR = [{ status: "NEEDS_REVIEW" }, { needsReview: true }];
  }
  if (filters.startDate) where.openedAt = { ...(where.openedAt || {}), gte: new Date(filters.startDate) };
  if (filters.endDate) where.openedAt = { ...(where.openedAt || {}), lte: new Date(filters.endDate) };

  // SQL search — applied before pagination (never filter in memory after LIMIT).
  if (filters.search) {
    const s = String(filters.search).trim();
    if (s) {
      const searchOr = [
        { ticketNumber: { contains: s, mode: "insensitive" } },
        { complaintId: { contains: s, mode: "insensitive" } },
        { vehicleNumber: { contains: s, mode: "insensitive" } },
        { vehicleName: { contains: s, mode: "insensitive" } },
        { registrationNumber: { contains: s, mode: "insensitive" } },
        { location: { contains: s, mode: "insensitive" } },
        { state: { contains: s, mode: "insensitive" } },
        { issueType: { contains: s, mode: "insensitive" } },
        { category: { contains: s, mode: "insensitive" } },
        { clientSlug: { contains: s, mode: "insensitive" } },
        { shortDescription: { contains: s, mode: "insensitive" } },
        { resolutionLocationName: { contains: s, mode: "insensitive" } },
      ];
      if (where.OR) {
        where.AND = [...(where.AND || []), { OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }
  }
  return where;
}

export async function findTicketByComplaintId(complaintId, organisationId = null) {
  
    try {
      const row = await prisma.ticket.findFirst({
        where: {
          complaintId,
          ...(organisationId ? { organisationId } : {}),
        },
        select: { id: true },
      });
      return row ? { id: row.id } : null;
    } catch (err) {
      throw new Error(`ticketsRepo error: ${err?.message || err}`);
    }
}

export async function findTicketByTicketNumber(ticketNumber, organisationId = null) {
  
    try {
      const row = await prisma.ticket.findFirst({
        where: {
          ticketNumber: String(ticketNumber).trim(),
          ...(organisationId ? { organisationId } : {}),
        },
        select: {
          id: true,
          status: true,
          complaintId: true,
          vehicleNumber: true,
          category: true,
          issueType: true,
          location: true,
          shortDescription: true,
        },
      });
      return row ? mapPrismaRowToSnake(row) : null;
    } catch {
      return null;
    }
  const trimmed = String(ticketNumber).trim();
  if (!trimmed) return null;
}

export async function updateTicketStatus(ticketId, status, organisationId = null) {
  if (!ticketId || !status) return { error: new Error("Missing ticketId or status") };
  
    try {
      await prisma.ticket.updateMany({
        where: { id: ticketId, ...(organisationId ? { organisationId } : {}) },
        data: { status },
      });
      return { error: null };
    } catch (err) {
      return { error: toErrorWithCode(err) };
    }
}

export async function updateTicketFields(ticketId, fields, organisationId = null) {
  if (!ticketId || !fields || typeof fields !== "object") {
    return { error: new Error("Missing ticketId or fields") };
  }
  const patch = { ...fields };
  if (Object.prototype.hasOwnProperty.call(patch, "location")) {
    patch.location = normalizeLocation(patch.location);
  }
  const { applyPriorityToPatch } = await import("../utils/normalizeTicketPriority.js");
  if (Object.prototype.hasOwnProperty.call(patch, "priority") || Object.prototype.hasOwnProperty.call(patch, "priority_level")) {
    const result = applyPriorityToPatch(patch, {
      priority: patch.priority,
      priority_level: patch.priority_level,
      defaultLevel: "LOW",
    });
    if (!result.ok) return { error: new Error(result.error) };
  }
  
    try {
      await prisma.ticket.updateMany({
        where: { id: ticketId, ...(organisationId ? { organisationId } : {}) },
        data: ticketPatchToPrisma(patch),
      });
      return { error: null };
    } catch (err) {
      return { error: toErrorWithCode(err) };
    }
}

export async function insertTicket(ticket) {
  
    try {
      const row = await prisma.ticket.create({ data: ticketInsertToPrisma(ticket) });
      return mapPrismaRowToSnake(row);
    } catch (err) {
      throw new Error(`Ticket insert failed: ${err?.message || err}`);
    }
}

export async function listTicketsScoped(req, { limit, offset, filters = {} }) {
  try {
    const where = buildListWhere(req, filters);
    let feId = filters.feId ?? null;
    const role = String(req?.tenantRole || req?.appUser?.role || "").toUpperCase();
    if (role === "FIELD_EXECUTIVE" && !feId) {
      const { resolveFeIdFromAppUser } = await import("../services/assignmentContextService.js");
      feId = await resolveFeIdFromAppUser(req);
    }
    const scope = await applyRoleTicketListScope(req, where, { feId });
    if (!scope.ok) {
      return { data: null, error: { message: scope.error, status: scope.status, code: "ROLE_SCOPE" } };
    }
    const rows = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getTicketByIdScoped(req, id, select = "*") {
  try {
    const row = await prisma.ticket.findFirst({
      where: { id, ...buildPrismaOrgWhere(req) },
    });
    const data = mapPrismaRowToSnake(row);
    if (!data) return { data: null, error: null };

    let feId = null;
    const role = String(req?.tenantRole || req?.appUser?.role || "").toUpperCase();
    if (role === "FIELD_EXECUTIVE") {
      const { resolveFeIdFromAppUser } = await import("../services/assignmentContextService.js");
      feId = await resolveFeIdFromAppUser(req);
    }
    const access = await assertRoleCanAccessTicket(req, data, { feId });
    if (!access.ok) {
      return { data: null, error: null };
    }
    return { data, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getTicketByIdScopedSingle(req, id, select) {
  return getTicketByIdScoped(req, id, select);
}

export async function getTicketByIdForAssign(req, ticketId) {
  const select =
    "id, ticket_number, vehicle_number, location, status, organisation_id, client_slug, state, current_assignment_id";
  
    try {
      const row = await prisma.ticket.findFirst({
        where: { id: ticketId, ...buildPrismaOrgWhere(req) },
      });
      if (!row) return { data: null, error: { message: "not found", code: "PGRST116" } };
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function getTicketsByIdsScoped(req, ids, select = "id, ticket_number, status, organisation_id") {
  try {
    const where = { id: { in: ids }, ...buildPrismaOrgWhere(req) };
    let feId = null;
    const role = String(req?.tenantRole || req?.appUser?.role || "").toUpperCase();
    if (role === "FIELD_EXECUTIVE") {
      const { resolveFeIdFromAppUser } = await import("../services/assignmentContextService.js");
      feId = await resolveFeIdFromAppUser(req);
    }
    const scope = await applyRoleTicketListScope(req, where, { feId });
    if (!scope.ok) {
      return { data: null, error: { message: scope.error, status: scope.status, code: "ROLE_SCOPE" } };
    }
    const rows = await prisma.ticket.findMany({ where });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

/**
 * Update a ticket. When `expectedStatus` is set, uses compare-and-swap:
 * UPDATE … WHERE id = ? AND status = expectedStatus.
 * Returns { conflict: true } when no row matched (caller should 409).
 *
 * @param {string} id
 * @param {Record<string, unknown>} patch
 * @param {{ expectedStatus?: string | string[] }} [opts]
 */
export async function updateTicketById(id, patch, opts = {}) {
  try {
    const data = ticketPatchToPrisma(patch);
    const expected = opts.expectedStatus;
    if (expected != null) {
      const statuses = Array.isArray(expected) ? expected : [expected];
      const result = await prisma.ticket.updateMany({
        where: { id, status: { in: statuses.map(String) } },
        data,
      });
      if (!result.count) {
        return { data: null, error: null, conflict: true };
      }
      const row = await prisma.ticket.findUnique({ where: { id } });
      return { data: mapPrismaRowToSnake(row), error: null, conflict: false };
    }
    const row = await prisma.ticket.update({
      where: { id },
      data,
    });
    return { data: mapPrismaRowToSnake(row), error: null, conflict: false };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err), conflict: false };
  }
}

export async function setTicketAssigned(id, assignmentId, opts = {}) {
  return updateTicketById(
    id,
    {
      status: "ASSIGNED",
      current_assignment_id: assignmentId,
      updated_at: new Date().toISOString(),
    },
    opts.expectedStatus != null ? { expectedStatus: opts.expectedStatus } : {}
  );
}

export async function listTicketsByIds(ids, req) {
  
    try {
      const rows = await prisma.ticket.findMany({
        where: { id: { in: ids }, ...buildPrismaOrgWhere(req) },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listClientSlugsScoped(req, organisationIdFilter) {
  
    try {
      const where = { clientSlug: { not: null }, ...buildPrismaOrgWhere(req) };
      if (req?.isSuperAdmin && organisationIdFilter) where.organisationId = organisationIdFilter;
      const rows = await prisma.ticket.findMany({
        where,
        select: { clientSlug: true },
      });
      return { data: rows.map((r) => ({ client_slug: r.clientSlug })), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listTenantInsightsTickets(organisationId) {
  
    try {
      const rows = await prisma.ticket.findMany({
        where: { organisationId },
        select: { clientSlug: true, status: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function countResolvedTicketsScoped(req) {
  
    try {
      const count = await prisma.ticket.count({
        where: { status: "RESOLVED", ...buildPrismaOrgWhere(req) },
      });
      return { count, error: null };
    } catch (err) {
      return { count: null, error: toSupabaseStyleError(err) };
    }
}

export async function listTicketOrgStatsRows(limit, req) {
  
    try {
      const rows = await prisma.ticket.findMany({
        where: buildPrismaOrgWhere(req),
        select: { id: true, organisationId: true, status: true, clientSlug: true },
        take: limit + 1,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listAllTicketsScoped(req, { orderDesc = true, limit
} = {}) {
  
    try {
      const rows = await prisma.ticket.findMany({
        where: buildPrismaOrgWhere(req),
        orderBy: { createdAt: orderDesc ? "desc" : "asc" },
        ...(limit ? { take: limit } : {}),
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listDistinctClientSlugsGlobal(limit) {
  
    try {
      const rows = await prisma.ticket.findMany({
        where: { clientSlug: { not: null } },
        select: { clientSlug: true },
        take: limit,
      });
      return { data: rows.map((r) => ({ client_slug: r.clientSlug })), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function getTicketOrgCheckScoped(req, id) {
  return getTicketByIdScoped(req, id, "id, organisation_id, client_slug, status");
}

export async function getTicketByIdUnscoped(id, select = "*") {
  
    try {
      const row = await prisma.ticket.findUnique({ where: { id } });
      if (!row) return { data: null, error: null };
      const mapped = mapPrismaRowToSnake(row);
      if (select === "*") return { data: mapped, error: null };
      const cols = String(select)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      /** @type {Record<string, unknown>} */
      const filtered = {};
      for (const col of cols) {
        if (Object.prototype.hasOwnProperty.call(mapped, col)) filtered[col] = mapped[col];
      }
      return { data: filtered, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function getTicketByIdUnscopedSingle(id, select = "*") {
  return getTicketByIdUnscoped(id, select);
}

export async function searchTicketIdsByNumberIlike(req, pattern, limit = 200) {
  try {
    const rows = await prisma.ticket.findMany({
      where: {
        ticketNumber: { contains: String(pattern).replace(/%/g, ""), mode: "insensitive" },
        ...buildPrismaOrgWhere(req),
      },
      select: { id: true },
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getTicketsMetaByIds(ids) {
  try {
    const rows = await prisma.ticket.findMany({
      where: { id: { in: ids } },
      select: { id: true, ticketNumber: true, status: true, organisationId: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listOnSiteTicketsForWorker({ limit = 50, tenantId = null } = {}) {
  try {
    const rows = await prisma.ticket.findMany({
      where: {
        status: "ON_SITE",
        ...(tenantId ? { organisationId: tenantId } : {}),
      },
      select: {
        id: true,
        ticketNumber: true,
        currentAssignmentId: true,
        location: true,
        vehicleNumber: true,
        organisationId: true,
      },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function getTicketStatusById(ticketId) {
  
    try {
      const row = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { status: true },
      });
      return { data: row ? { status: row.status } : null, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function getTicketsMetaByIdsScoped(req, ids) {
  try {
    const where = { id: { in: ids }, ...buildPrismaOrgWhere(req) };
    let feId = null;
    const role = String(req?.tenantRole || req?.appUser?.role || "").toUpperCase();
    if (role === "FIELD_EXECUTIVE") {
      const { resolveFeIdFromAppUser } = await import("../services/assignmentContextService.js");
      feId = await resolveFeIdFromAppUser(req);
    }
    const scope = await applyRoleTicketListScope(req, where, { feId });
    if (!scope.ok) {
      return { data: null, error: { message: scope.error, status: scope.status, code: "ROLE_SCOPE" } };
    }
    const rows = await prisma.ticket.findMany({
      where,
      select: { id: true, organisationId: true, openedAt: true, createdAt: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

function isCloseColumnError(error) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    (error.message &&
      /verification_remarks|review_notes|resolution_category|column|resolved_at/.test(error.message))
  );
}

export async function updateTicketCloseWithFallback(ticketId, fullPayload, fallbackPayload, opts = {}) {
  let result = await updateTicketById(ticketId, fullPayload, opts);
  if (result.conflict) return result;
  if (result.error && isCloseColumnError(result.error)) {
    result = await updateTicketById(ticketId, fallbackPayload, opts);
  }
  return result;
}

export async function reviewCompleteTicketScoped(req, ticketId, patch) {
  
    try {
      const existing = await prisma.ticket.findFirst({
        where: { id: ticketId, ...buildPrismaOrgWhere(req) },
      });
      if (!existing) {
        return { data: null, error: { message: "not found", code: "PGRST116" } };
      }
      const row = await prisma.ticket.update({
        where: { id: ticketId },
        data: ticketPatchToPrisma(patch),
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

function buildDashboardTicketWhere(req, filters) {
  const where = { ...buildPrismaOrgWhere(req) };
  if (req?.isSuperAdmin && filters.organisationIdOverride) {
    where.organisationId = filters.organisationIdOverride;
  }
  // CLIENT role forces own slug via applyRoleTicketListScope — ignore query overrides there.
  // Staff may still filter by clientSlug.
  const role = String(req?.tenantRole || req?.appUser?.role || "").toUpperCase();
  if (filters.clientSlug && role !== "CLIENT") where.clientSlug = filters.clientSlug;
  if (filters.stateFilter) where.state = filters.stateFilter;
  if (filters.startDate || filters.endDate) {
    where.openedAt = {};
    if (filters.startDate) where.openedAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.openedAt.lte = new Date(filters.endDate);
  }
  return where;
}

async function resolveDashboardWhere(req, filters) {
  const where = buildDashboardTicketWhere(req, filters);
  let feId = null;
  const role = String(req?.tenantRole || req?.appUser?.role || "").toUpperCase();
  if (role === "FIELD_EXECUTIVE") {
    const { resolveFeIdFromAppUser } = await import("../services/assignmentContextService.js");
    feId = await resolveFeIdFromAppUser(req);
  }
  const scope = await applyRoleTicketListScope(req, where, { feId });
  return { where, scope };
}

export async function listTicketsForDashboardStats(req, filters, maxScan) {
  try {
    const { where, scope } = await resolveDashboardWhere(req, filters);
    if (!scope.ok) {
      return { data: null, error: { message: scope.error, status: scope.status, code: "ROLE_SCOPE" } };
    }
    const rows = await prisma.ticket.findMany({
      where,
      select: {
        id: true,
        status: true,
        confidenceScore: true,
        createdAt: true,
        openedAt: true,
        updatedAt: true,
        resolvedAt: true,
        currentAssignmentId: true,
        responseSlaMinutes: true,
        resolutionSlaMinutes: true,
        responseDueAt: true,
        resolutionDueAt: true,
      },
      take: maxScan + 1,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

/**
 * SQL aggregates for dashboard KPI cards — avoids loading the full ticket table.
 */
export async function aggregateDashboardTicketStats(req, filters) {
  try {
    const { where, scope } = await resolveDashboardWhere(req, filters);
    if (!scope.ok) {
      return { data: null, error: { message: scope.error, status: scope.status, code: "ROLE_SCOPE" } };
    }

    const [byStatus, assignedCount, resolvedTodayCount, avgConf] = await Promise.all([
      prisma.ticket.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      prisma.ticket.count({
        where: {
          ...where,
          status: { not: "REJECTED" },
          currentAssignmentId: { not: null },
        },
      }),
      (() => {
        const now = new Date();
        const startOfToday = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
        );
        return prisma.ticket.count({
          where: {
            ...where,
            status: "RESOLVED",
            OR: [
              { resolvedAt: { gte: startOfToday } },
              { AND: [{ resolvedAt: null }, { createdAt: { gte: startOfToday } }] },
            ],
          },
        });
      })(),
      prisma.ticket.aggregate({
        where: { ...where, status: { not: "REJECTED" }, confidenceScore: { not: null } },
        _avg: { confidenceScore: true },
      }),
    ]);

    // SLA breach count: id-only scan then COUNT (SlaTracking has no Prisma ticket relation).
    const scopedIds = await prisma.ticket.findMany({
      where: { ...where, status: { not: "REJECTED" } },
      select: { id: true },
      take: 50000,
    });
    const idList = scopedIds.map((r) => r.id);
    let slaBreachCount = 0;
    if (idList.length > 0) {
      slaBreachCount = await prisma.slaTracking.count({
        where: {
          ticketId: { in: idList },
          OR: [
            { assignmentBreached: true },
            { onsiteBreached: true },
            { resolutionBreached: true },
          ],
        },
      });
    }

    /** @type {Record<string, number>} */
    const statusCounts = {};
    let totalNonRejected = 0;
    for (const row of byStatus) {
      const st = String(row.status);
      const n = row._count?._all ?? 0;
      statusCounts[st] = n;
      if (st !== "REJECTED") totalNonRejected += n;
    }

    const IN_PROGRESS = ["EN_ROUTE", "ON_SITE", "RESOLVED_PENDING_VERIFICATION", "FE_ATTEMPT_FAILED"];
    let inProgress = 0;
    for (const st of IN_PROGRESS) inProgress += statusCounts[st] || 0;

    return {
      data: {
        totalTickets: totalNonRejected,
        openTickets: statusCounts.OPEN || 0,
        needsReviewCount: statusCounts.NEEDS_REVIEW || 0,
        assignedTickets: assignedCount,
        inProgressTickets: inProgress,
        resolvedTickets: statusCounts.RESOLVED || 0,
        resolvedToday: resolvedTodayCount,
        avgConfidenceScore:
          avgConf._avg?.confidenceScore != null
            ? Math.round(Number(avgConf._avg.confidenceScore) * 10) / 10
            : 0,
        slaBreaches: slaBreachCount,
        statusCounts,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

/**
 * Resolved KPI date semantics (prod parity):
 * - Scope by tenant / client / state like other dashboard counts
 * - Apply startDate/endDate to `resolvedAt` only (not also `openedAt`)
 */
export async function countResolvedTicketsWithDateFilter(req, filters) {
  try {
    const { where: base, scope } = await resolveDashboardWhere(req, filters);
    if (!scope.ok) {
      return { count: null, error: { message: scope.error, status: scope.status, code: "ROLE_SCOPE" } };
    }
    const where = {
      ...base,
      status: "RESOLVED",
    };
    // Date filter for resolved KPI uses resolvedAt, not openedAt from dashboard where.
    delete where.openedAt;
    if (filters.startDate || filters.endDate) {
      where.resolvedAt = {};
      if (filters.startDate) where.resolvedAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.resolvedAt.lte = new Date(filters.endDate);
    }
    const count = await prisma.ticket.count({ where });
    return { count, error: null };
  } catch (err) {
    return { count: null, error: toSupabaseStyleError(err) };
  }
}

export async function listTicketClientSlugsGlobal() {
  
    try {
      const rows = await prisma.ticket.findMany({
        where: { clientSlug: { not: null } },
        select: { clientSlug: true },
      });
      return { data: rows.map((r) => ({ client_slug: r.clientSlug })), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listTicketsForAnalyticsSummary(req, filters) {
  try {
    const where = buildDashboardTicketWhere(req, filters);
    let feId = null;
    const role = String(req?.tenantRole || req?.appUser?.role || "").toUpperCase();
    if (role === "FIELD_EXECUTIVE") {
      const { resolveFeIdFromAppUser } = await import("../services/assignmentContextService.js");
      feId = await resolveFeIdFromAppUser(req);
    }
    const scope = await applyRoleTicketListScope(req, where, { feId });
    if (!scope.ok) {
      return { data: null, error: { message: scope.error, status: scope.status, code: "ROLE_SCOPE" } };
    }
    const maxScan = Math.min(
      Math.max(Number(process.env.ANALYTICS_TICKETS_MAX_SCAN || 5000), 100),
      20000
    );
    const rows = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: maxScan,
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        complaintId: true,
        vehicleNumber: true,
        category: true,
        issueType: true,
        location: true,
        state: true,
        clientSlug: true,
        priority: true,
        priorityLevel: true,
        openedAt: true,
        createdAt: true,
        resolvedAt: true,
        currentAssignmentId: true,
        organisationId: true,
        resolutionLocationName: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listTicketsCreatedInWindowForOrg(organisationId, windowStart, windowEnd) {
  try {
    const rows = await prisma.ticket.findMany({
      where: {
        organisationId,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, createdAt: true, openedAt: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listTicketsUpdatedInWindowForOrg(organisationId, windowStart, windowEnd) {
  try {
    const rows = await prisma.ticket.findMany({
      where: {
        organisationId,
        updatedAt: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, updatedAt: true, createdAt: true, status: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listTicketsResolvedInWindowForOrg(organisationId, windowStart, windowEnd) {
  try {
    const rows = await prisma.ticket.findMany({
      where: {
        organisationId,
        resolvedAt: { gte: windowStart, lte: windowEnd },
      },
      select: { id: true, resolvedAt: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listResolvedTicketsForFeStats(
  organisationId,
  windowStart,
  windowEnd,
  hasResolvedAt
) {
  try {
    if (hasResolvedAt) {
      const rows = await prisma.ticket.findMany({
        where: {
          organisationId,
          resolvedAt: { gte: windowStart, lte: windowEnd },
        },
        select: {
          id: true,
          resolvedAt: true,
          currentAssignmentId: true,
          organisationId: true,
        },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    }
    const rows = await prisma.ticket.findMany({
      where: {
        organisationId,
        status: "RESOLVED",
        updatedAt: { gte: windowStart, lte: windowEnd },
      },
      select: {
        id: true,
        updatedAt: true,
        currentAssignmentId: true,
        organisationId: true,
        status: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function listTicketIdsByOrgAndIds(organisationId, ids) {
  try {
    const rows = await prisma.ticket.findMany({
      where: { organisationId, id: { in: ids } },
      select: { id: true },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

function buildDailyReportTicketSelect(schemaFlags) {
  const select = {
    id: true,
    ticketNumber: true,
    complaintId: true,
    vehicleNumber: true,
    category: true,
    issueType: true,
    priority: true,
    priorityLevel: true,
    status: true,
    location: true,
    openedByEmail: true,
    openedAt: true,
    createdAt: true,
    updatedAt: true,
    verificationRemarks: true,
    clientSlug: true,
    source: true,
    needsReview: true,
    currentAssignmentId: true,
    organisationId: true,
  };
  if (schemaFlags.hasResolvedAt) select.resolvedAt = true;
  if (schemaFlags.hasReviewNotes) select.reviewNotes = true;
  if (schemaFlags.hasResolutionCategory) select.resolutionCategory = true;
  return select;
}

export async function listTicketsByIdsForDailyReport(organisationId, ticketIds, schemaFlags) {
  try {
    const rows = await prisma.ticket.findMany({
      where: { organisationId, id: { in: ticketIds } },
      select: buildDailyReportTicketSelect(schemaFlags),
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
