import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { scopeQueryByTenant } from "../middleware/tenantContext.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { isPrismaDbMode } from "./db/mode.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError, toErrorWithCode } from "./db/prismaErrors.js";
import { buildPrismaOrgWhere } from "./db/tenantScope.js";

const TICKET_SNAKE_TO_CAMEL = {
  ticket_number: "ticketNumber",
  status: "status",
  complaint_id: "complaintId",
  vehicle_number: "vehicleNumber",
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

function applySupabaseTenantScope(q, req) {
  return scopeQueryByTenant(q, req);
}

function buildListWhere(req, filters = {}) {
  const where = { ...buildPrismaOrgWhere(req) };
  if (req?.isSuperAdmin && filters.organisationIdFilter && !filters.scopeAllOrganisations) {
    where.organisationId = filters.organisationIdFilter;
  }
  if (filters.status && filters.status !== "all") where.status = filters.status;
  if (filters.clientSlug) where.clientSlug = filters.clientSlug;
  if (filters.stateFilter) where.state = filters.stateFilter;
  if (filters.unassignedOnly) where.currentAssignmentId = null;
  if (filters.startDate) where.openedAt = { ...(where.openedAt || {}), gte: new Date(filters.startDate) };
  if (filters.endDate) where.openedAt = { ...(where.openedAt || {}), lte: new Date(filters.endDate) };
  return where;
}

export async function findTicketByComplaintId(complaintId, organisationId = null) {
  if (isPrismaDbMode()) {
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
  let query = supabase.from("tickets").select("id").eq("complaint_id", complaintId).limit(1);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  const { data, error } = await query.single();
  if (error && error.code !== "PGRST116") throw new Error(`ticketsRepo error: ${error.message}`);
  return data ?? null;
}

export async function findTicketByTicketNumber(ticketNumber, organisationId = null) {
  if (isPrismaDbMode()) {
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
  }
  const trimmed = String(ticketNumber).trim();
  if (!trimmed) return null;
  let query = supabase
    .from("tickets")
    .select("id, status, complaint_id, vehicle_number, category, issue_type, location, short_description")
    .eq("ticket_number", trimmed)
    .limit(1);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data ?? null;
}

export async function updateTicketStatus(ticketId, status, organisationId = null) {
  if (!ticketId || !status) return { error: new Error("Missing ticketId or status") };
  if (isPrismaDbMode()) {
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
  let query = supabase.from("tickets").update({ status }).eq("id", ticketId);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  return query;
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
  if (isPrismaDbMode()) {
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
  let query = supabase.from("tickets").update(patch).eq("id", ticketId);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  return query;
}

export async function insertTicket(ticket) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.ticket.create({ data: ticketInsertToPrisma(ticket) });
      return mapPrismaRowToSnake(row);
    } catch (err) {
      throw new Error(`Ticket insert failed: ${err?.message || err}`);
    }
  }
  const { data, error } = await supabase.from("tickets").insert(ticket).select().single();
  if (error) throw new Error(`Ticket insert failed: ${error.message}`);
  return data;
}

export async function listTicketsScoped(req, { limit, offset, filters = {} }) {
  if (isPrismaDbMode()) {
    try {
      const where = buildListWhere(req, filters);
      let rows = await prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      });
      if (filters.search) {
        const s = String(filters.search).toLowerCase();
        rows = rows.filter((t) => {
          const hay = [
            t.ticketNumber,
            t.vehicleNumber,
            t.location,
            t.state,
            t.complaintId,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(s);
        });
      }
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("tickets").select("*").order("created_at", { ascending: false });
  if (!req.isSuperAdmin) {
    q = applySupabaseTenantScope(q, req);
  } else if (!filters.scopeAllOrganisations && filters.organisationIdFilter) {
    q = q.eq("organisation_id", filters.organisationIdFilter);
  }
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.clientSlug) q = q.eq("client_slug", filters.clientSlug);
  if (filters.stateFilter) q = q.eq("state", filters.stateFilter);
  if (filters.startDate) q = q.gte("opened_at", filters.startDate);
  if (filters.endDate) q = q.lte("opened_at", filters.endDate);
  if (filters.unassignedOnly) q = q.is("current_assignment_id", null);
  if (filters.search) {
    const s = String(filters.search).replace(/%/g, "\\%").replace(/_/g, "\\_");
    q = q.or(
      [
        `ticket_number.ilike.%${s}%`,
        `vehicle_number.ilike.%${s}%`,
        `location.ilike.%${s}%`,
        `state.ilike.%${s}%`,
        `complaint_id.ilike.%${s}%`,
      ].join(",")
    );
  }
  q = q.range(offset, offset + limit - 1);
  return q;
}

export async function getTicketByIdScoped(req, id, select = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.ticket.findFirst({
        where: { id, ...buildPrismaOrgWhere(req) },
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("tickets").select(select).eq("id", id);
  q = applySupabaseTenantScope(q, req);
  return q.maybeSingle();
}

export async function getTicketByIdScopedSingle(req, id, select) {
  const res = await getTicketByIdScoped(req, id, select);
  if (isPrismaDbMode()) return res;
  return res;
}

export async function getTicketByIdForAssign(req, ticketId) {
  const select =
    "id, ticket_number, vehicle_number, location, status, organisation_id, client_slug, state, current_assignment_id";
  if (isPrismaDbMode()) {
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
  return applySupabaseTenantScope(
    supabase.from("tickets").select(select).eq("id", ticketId),
    req
  ).single();
}

export async function getTicketsByIdsScoped(req, ids, select = "id, ticket_number, status, organisation_id") {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticket.findMany({
        where: { id: { in: ids }, ...buildPrismaOrgWhere(req) },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return applySupabaseTenantScope(supabase.from("tickets").select(select).in("id", ids), req);
}

export async function updateTicketById(id, patch) {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.ticket.update({
        where: { id },
        data: ticketPatchToPrisma(patch),
      });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("tickets").update(patch).eq("id", id).select("*").single();
}

export async function updateTicketAssignState(id, patch) {
  return updateTicketById(id, patch);
}

export async function setTicketAssigned(id, assignmentId) {
  return updateTicketById(id, {
    status: "ASSIGNED",
    current_assignment_id: assignmentId,
    updated_at: new Date().toISOString(),
  });
}

export async function listTicketsByIds(ids, req) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticket.findMany({
        where: { id: { in: ids }, ...buildPrismaOrgWhere(req) },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("tickets").select("*").in("id", ids);
  q = applySupabaseTenantScope(q, req);
  return q;
}

export async function listClientSlugsScoped(req, organisationIdFilter) {
  if (isPrismaDbMode()) {
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
  let q = supabase.from("tickets").select("client_slug").not("client_slug", "is", null);
  if (!req.isSuperAdmin) q = applySupabaseTenantScope(q, req);
  else if (organisationIdFilter) q = q.eq("organisation_id", organisationIdFilter);
  return q;
}

export async function listTenantInsightsTickets(organisationId) {
  if (isPrismaDbMode()) {
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
  return supabase.from("tickets").select("client_slug, status").eq("organisation_id", organisationId);
}

export async function countResolvedTicketsScoped(req) {
  if (isPrismaDbMode()) {
    try {
      const count = await prisma.ticket.count({
        where: { status: "RESOLVED", ...buildPrismaOrgWhere(req) },
      });
      return { count, error: null };
    } catch (err) {
      return { count: null, error: toSupabaseStyleError(err) };
    }
  }
  return applySupabaseTenantScope(
    supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "RESOLVED"),
    req
  );
}

export async function listTicketOrgStatsRows(limit, req) {
  if (isPrismaDbMode()) {
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
  let q = supabase.from("tickets").select("id, organisation_id, status, client_slug").limit(limit + 1);
  q = applySupabaseTenantScope(q, req);
  return q;
}

export async function listAllTicketsScoped(req, { orderDesc = true, limit } = {}) {
  if (isPrismaDbMode()) {
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
  let q = supabase.from("tickets").select("*").order("created_at", { ascending: !orderDesc });
  if (limit) q = q.limit(limit);
  q = applySupabaseTenantScope(q, req);
  return q;
}

export async function listDistinctClientSlugsGlobal(limit) {
  if (isPrismaDbMode()) {
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
  return supabase.from("tickets").select("client_slug").limit(limit);
}

export async function getTicketOrgCheckScoped(req, id) {
  return getTicketByIdScoped(req, id, "id, organisation_id, client_slug, status");
}

export async function getTicketByIdUnscoped(id, select = "*") {
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.ticket.findUnique({ where: { id } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("tickets").select(select).eq("id", id).maybeSingle();
}

export async function getTicketStatusById(ticketId) {
  if (isPrismaDbMode()) {
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
  return supabase.from("tickets").select("status").eq("id", ticketId).single();
}

export async function getTicketsMetaByIdsScoped(req, ids) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticket.findMany({
        where: { id: { in: ids }, ...buildPrismaOrgWhere(req) },
        select: { id: true, organisationId: true, openedAt: true, createdAt: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase
    .from("tickets")
    .select("id, organisation_id, opened_at, created_at")
    .in("id", ids);
  q = applySupabaseTenantScope(q, req);
  return q;
}

function isCloseColumnError(error) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    (error.message &&
      /verification_remarks|review_notes|resolution_category|column|resolved_at/.test(error.message))
  );
}

export async function updateTicketCloseWithFallback(ticketId, fullPayload, fallbackPayload) {
  let result = await updateTicketById(ticketId, fullPayload);
  if (result.error && isCloseColumnError(result.error)) {
    result = await updateTicketById(ticketId, fallbackPayload);
  }
  return result;
}

export async function reviewCompleteTicketScoped(req, ticketId, patch) {
  if (isPrismaDbMode()) {
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
  return applySupabaseTenantScope(
    supabase.from("tickets").update(patch).eq("id", ticketId).select("*, organisation_id"),
    req
  ).single();
}

function buildDashboardTicketWhere(req, filters) {
  const where = { ...buildPrismaOrgWhere(req) };
  if (req?.isSuperAdmin && filters.organisationIdOverride) {
    where.organisationId = filters.organisationIdOverride;
  }
  if (filters.clientSlug) where.clientSlug = filters.clientSlug;
  if (filters.stateFilter) where.state = filters.stateFilter;
  if (filters.startDate || filters.endDate) {
    where.openedAt = {};
    if (filters.startDate) where.openedAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.openedAt.lte = new Date(filters.endDate);
  }
  return where;
}

export async function listTicketsForDashboardStats(req, filters, maxScan) {
  if (isPrismaDbMode()) {
    try {
      const rows = await prisma.ticket.findMany({
        where: buildDashboardTicketWhere(req, filters),
        select: {
          id: true,
          status: true,
          confidenceScore: true,
          createdAt: true,
          openedAt: true,
          updatedAt: true,
          resolvedAt: true,
          currentAssignmentId: true,
        },
        take: maxScan + 1,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase
    .from("tickets")
    .select(
      "id, status, confidence_score, created_at, opened_at, updated_at, resolved_at, current_assignment_id"
    );
  if (!req.isSuperAdmin) {
    q = applySupabaseTenantScope(q, req);
  } else if (filters.organisationIdOverride) {
    q = q.eq("organisation_id", filters.organisationIdOverride);
  }
  if (filters.clientSlug) q = q.eq("client_slug", filters.clientSlug);
  if (filters.stateFilter) q = q.eq("state", filters.stateFilter);
  if (filters.startDate) q = q.gte("opened_at", filters.startDate);
  if (filters.endDate) q = q.lte("opened_at", filters.endDate);
  return q.limit(maxScan + 1);
}

export async function countResolvedTicketsWithDateFilter(req, filters) {
  if (isPrismaDbMode()) {
    try {
      const where = {
        status: "RESOLVED",
        ...buildDashboardTicketWhere(req, filters),
      };
      if (filters.startDate) {
        where.resolvedAt = { ...(where.resolvedAt || {}), gte: new Date(filters.startDate) };
      }
      if (filters.endDate) {
        where.resolvedAt = { ...(where.resolvedAt || {}), lte: new Date(filters.endDate) };
      }
      const count = await prisma.ticket.count({ where });
      return { count, error: null };
    } catch (err) {
      return { count: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("tickets").select("id", { count: "exact", head: true }).eq("status", "RESOLVED");
  if (!req.isSuperAdmin) {
    q = applySupabaseTenantScope(q, req);
  } else if (filters.organisationIdOverride) {
    q = q.eq("organisation_id", filters.organisationIdOverride);
  }
  if (filters.clientSlug) q = q.eq("client_slug", filters.clientSlug);
  if (filters.stateFilter) q = q.eq("state", filters.stateFilter);
  if (filters.startDate) q = q.gte("resolved_at", filters.startDate);
  if (filters.endDate) q = q.lte("resolved_at", filters.endDate);
  return q;
}

export async function listTicketClientSlugsGlobal() {
  if (isPrismaDbMode()) {
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
  return supabase.from("tickets").select("client_slug");
}

export async function listTicketsForAnalyticsSummary(req, filters) {
  if (isPrismaDbMode()) {
    try {
      const where = buildDashboardTicketWhere(req, filters);
      const rows = await prisma.ticket.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  let q = supabase.from("tickets").select("*").order("created_at", { ascending: false });
  q = applySupabaseTenantScope(q, req);
  if (filters.clientSlug) q = q.eq("client_slug", filters.clientSlug);
  if (filters.stateFilter) q = q.eq("state", filters.stateFilter);
  if (filters.startDate) q = q.gte("opened_at", filters.startDate);
  if (filters.endDate) q = q.lte("opened_at", filters.endDate);
  return q;
}
