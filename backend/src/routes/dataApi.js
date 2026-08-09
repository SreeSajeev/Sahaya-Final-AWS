import express from "express";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import {
  attachTenantContext,
  requireTenantOrSuperAdmin,
} from "../middleware/tenantContext.js";
import { findAccessTokenByHash } from "../repositories/accessTokenRepository.js";
import { listRawEmailsPaged } from "../repositories/rawEmailsRepo.js";
import { listParsedEmailsByRawEmailIds } from "../repositories/parsedEmailsRepo.js";
import { TENANT_DENY_SENTINEL } from "../repositories/db/tenantScope.js";
import { toInt, safeTrim, jsonError, jsonOk } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { buildCreatorDisplayByTicketId } from "../utils/ticketDisplayEnrichment.js";
import {
  insertAuditLog,
  backfillAuditLogsFromData,
} from "../services/auditLogService.js";
import {
  listAuditLogsPage,
  auditRowsToCsv,
} from "../services/auditLogDisplayService.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireTenantClientsEnabled } from "../middleware/tenantClientsGate.js";
import {
  listTenantClients,
  getTenantClientById,
  createTenantClient,
  updateTenantClient,
  deleteTenantClient,
} from "../services/tenantClientService.js";
import {
  listClientVehicles,
  createClientVehicle,
  updateClientVehicle,
  deleteClientVehicle,
  importClientVehicles,
  buildVehicleExportCsv,
  buildVehicleImportErrorsCsv,
} from "../services/clientVehicleService.js";
import { listClientNotificationEmails } from "../services/clientNotificationEmailResolver.js";
import {
  getTenantSlaConfig,
  updateTenantSlaConfig,
  enrichTicketsWithSla,
} from "../services/tenantSlaService.js";
import { computeTicketSlaView, SLA_STATUS } from "../services/tenantSlaEngine.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { normalizeTicketState } from "../utils/normalizeTicketState.js";
import { normalizeTicketPriorityInput } from "../utils/normalizeTicketPriority.js";
import { validateDataApiStatusTransition } from "../services/ticketStateMachine.js";
import {
  STAFF_OPERATION_ROLES,
  RAW_EMAIL_READ_ROLES,
  AUDIT_LOG_READ_ROLES,
} from "../constants/rolePolicies.js";
import { getSlaConfig } from "../services/slaService.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import {
  listTicketsScoped,
  getTicketByIdScoped,
  getTicketOrgCheckScoped,
  updateTicketById,
  listTicketsForDashboardStats,
  countResolvedTicketsWithDateFilter,
  aggregateDashboardTicketStats,
  listClientSlugsScoped,
  listTenantInsightsTickets,
  listTicketOrgStatsRows,
  listTicketsByIds,
  getTicketsMetaByIdsScoped,
  listTicketsForAnalyticsSummary,
  listTicketClientSlugsGlobal,
} from "../repositories/ticketQueryRepository.js";
import {
  listSlaRowsScoped,
  listSlaBreachesByTicketIdsScoped,
  listSlaAssignmentDeadlinesByTicketIds,
  listAllSlaRowsScoped,
  listSlaBreachRowsGlobal,
} from "../repositories/slaRepository.js";
import {
  listAssignmentsForTicket,
  listAssignmentsByTicketIds,
  listAssignmentsByFeIdsWithTickets,
  listAllAssignmentsScoped,
} from "../repositories/assignmentRepository.js";
import { insertComment, listCommentsForTicket, getCommentById } from "../repositories/commentRepository.js";
import {
  listUsersScoped,
  listUsersOrganisationIds,
  listStaffUsersForAnalytics,
  countUsersGlobal,
} from "../repositories/userRepository.js";
import {
  listOrganisations,
  getOrganisationById,
  insertOrganisation,
  updateOrganisation,
  normalizeOrganisationShortName,
} from "../repositories/organisationRepository.js";
import {
  listFieldExecutivesScoped,
  getFieldExecutiveByIdScoped,
  listFieldExecutivesOrganisationIds,
  listAllFieldExecutivesScoped,
  countFieldExecutivesGlobal,
} from "../repositories/fieldExecutiveRepository.js";
import {
  getConfigurationByKey,
  configurationKeyExists,
  listConfigurationsByKeys,
  listAllConfigurations,
  upsertConfiguration,
} from "../repositories/configurationRepository.js";
import { findActiveFeActionTokenForTicket } from "../repositories/feActionTokenRepository.js";

const router = express.Router();

router.use(requireAuth);
router.use(attachTenantContext({ requireAuthenticated: false }));
router.use(requireAppUser);
router.use(requireTenantOrSuperAdmin);

/** UUID path params (tickets, field executives, organisations). */
router.param("id", validateUuidParam);

/* ======================================================
   Dashboard stats (read)
====================================================== */

router.get("/dashboard/stats", async (req, res) => {
  const startedAt = Date.now();
  const clientSlug = safeTrim(req.query.clientSlug);
  const stateFilter = safeTrim(req.query.state);
  const organisationIdOverride = safeTrim(req.query.organisationId);
  const startDate = safeTrim(req.query.startDate);
  const endDate = safeTrim(req.query.endDate);
  const maxScan = toInt(process.env.DASHBOARD_STATS_MAX_SCAN, { defaultValue: 10000, min: 1000, max: 100000 });

  const IN_PROGRESS_STATUSES = ["EN_ROUTE", "ON_SITE", "RESOLVED_PENDING_VERIFICATION", "FE_ATTEMPT_FAILED"];

  try {
    const filters = { clientSlug, stateFilter, organisationIdOverride, startDate, endDate };

    // Prefer SQL aggregates for status/count KPIs; row scan only for tenant SLA view metrics.
    const { data: agg, error: aggErr } = await aggregateDashboardTicketStats(req, filters);
    if (aggErr) {
      if (aggErr.code === "ROLE_SCOPE") return jsonError(res, aggErr.status || 403, aggErr.message);
      return jsonError(res, 500, aggErr.message);
    }

    const { data: ticketsRaw, error: ticketsError } = await listTicketsForDashboardStats(
      req,
      filters,
      maxScan
    );
    if (ticketsError) {
      if (ticketsError.code === "ROLE_SCOPE") return jsonError(res, ticketsError.status || 403, ticketsError.message);
      return jsonError(res, 500, ticketsError.message);
    }

    const raw = ticketsRaw ?? [];
    const statsTruncated = raw.length > maxScan;
    const ticketList = (statsTruncated ? raw.slice(0, maxScan) : raw).filter(
      (t) => t.status !== "REJECTED"
    );
    const rejectedIds = new Set(
      (statsTruncated ? raw.slice(0, maxScan) : raw)
        .filter((t) => t.status === "REJECTED")
        .map((t) => t.id)
    );

    let resolvedTickets = agg?.resolvedTickets ?? 0;
    if (startDate || endDate) {
      const { count, error: resolvedErr } = await countResolvedTicketsWithDateFilter(req, filters);
      if (resolvedErr) {
        if (resolvedErr.code === "ROLE_SCOPE") return jsonError(res, resolvedErr.status || 403, resolvedErr.message);
        return jsonError(res, 500, resolvedErr.message);
      }
      resolvedTickets = count ?? 0;
    }

    let slaData = [];
    if (ticketList.length > 0) {
      const slaIds = ticketList.map((t) => t.id);
      const SLA_IN_CHUNK = 100;
      for (let i = 0; i < slaIds.length; i += SLA_IN_CHUNK) {
        const chunk = slaIds.slice(i, i + SLA_IN_CHUNK);
        const { data: slaRows, error: slaError } = await listSlaBreachesByTicketIdsScoped(
          req,
          chunk,
          "ticket_id, assignment_breached, onsite_breached, resolution_breached"
        );
        if (slaError) return jsonError(res, 500, slaError.message);
        slaData.push(...(slaRows ?? []));
      }
    }

    const totalTickets = agg?.totalTickets ?? ticketList.length;
    const openTickets = agg?.openTickets ?? ticketList.filter((t) => t.status === "OPEN").length;
    const needsReviewCount =
      agg?.needsReviewCount ?? ticketList.filter((t) => t.status === "NEEDS_REVIEW").length;
    const assignedTickets =
      agg?.assignedTickets ?? ticketList.filter((t) => t.current_assignment_id != null).length;
    const inProgressTickets =
      agg?.inProgressTickets ??
      ticketList.filter((t) => IN_PROGRESS_STATUSES.includes(t.status)).length;

    const resolvedToday = agg?.resolvedToday ?? 0;
    const avgConfidenceScore = agg?.avgConfidenceScore ?? 0;

    const slaBreaches =
      agg?.slaBreaches ??
      ((slaData ?? []).filter((s) => {
        if (rejectedIds.has(s.ticket_id)) return false;
        return Boolean(s.assignment_breached || s.onsite_breached || s.resolution_breached);
      }).length || 0);

    // Tenant-configurable response/resolution SLA KPIs (snapshot-based, computed).
    let responseSlaBreached = 0;
    let resolutionSlaBreached = 0;
    let ticketsApproachingSla = 0;
    let responseTimeSum = 0;
    let responseTimeCount = 0;
    let resolutionTimeSum = 0;
    let resolutionTimeCount = 0;
    let resolutionComplianceDenom = 0;
    let resolutionComplianceOk = 0;

    for (const t of ticketList) {
      const view = computeTicketSlaView(t);
      if (view.response.breached) responseSlaBreached += 1;
      if (view.resolution.breached) resolutionSlaBreached += 1;
      if (view.status === SLA_STATUS.APPROACHING) ticketsApproachingSla += 1;
      if (view.response_time_minutes != null) {
        responseTimeSum += view.response_time_minutes;
        responseTimeCount += 1;
      }
      if (view.resolution_time_minutes != null) {
        resolutionTimeSum += view.resolution_time_minutes;
        resolutionTimeCount += 1;
      }
      if (t.resolution_due_at && ["RESOLVED", "CLOSED"].includes(String(t.status || "").toUpperCase())) {
        resolutionComplianceDenom += 1;
        if (!view.resolution.breached) resolutionComplianceOk += 1;
      } else if (t.resolution_due_at && view.resolution.status !== SLA_STATUS.NA) {
        resolutionComplianceDenom += 1;
        if (!view.resolution.breached) resolutionComplianceOk += 1;
      }
    }

    const avgResponseTimeMinutes =
      responseTimeCount > 0 ? Math.round(responseTimeSum / responseTimeCount) : null;
    const avgResolutionTimeMinutes =
      resolutionTimeCount > 0 ? Math.round(resolutionTimeSum / resolutionTimeCount) : null;
    const slaCompliancePercent =
      resolutionComplianceDenom > 0
        ? Math.round((resolutionComplianceOk / resolutionComplianceDenom) * 1000) / 10
        : null;

    logEvent("dataApi.dashboard.stats", {
      tenantId: req.tenantId ?? null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
      clientSlug: clientSlug ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      ms: Date.now() - startedAt,
      tickets: totalTickets,
      statsTruncated,
      maxScan,
    });

    return jsonOk(res, {
      totalTickets,
      openTickets,
      needsReviewCount,
      assignedTickets,
      inProgressTickets,
      resolvedTickets,
      resolvedToday,
      avgConfidenceScore,
      slaBreaches,
      responseSlaBreached,
      resolutionSlaBreached,
      ticketsApproachingSla,
      avgResponseTimeMinutes,
      avgResolutionTimeMinutes,
      slaCompliancePercent,
      statsTruncated,
      maxScan,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to compute dashboard stats");
  }
});

/* ======================================================
   Tenant SLA configuration
====================================================== */

const SLA_ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];
const SLA_READ_ROLES = ["ADMIN", "STAFF", "SUPER_ADMIN"];

router.get("/tenant-sla", requireRole(SLA_READ_ROLES), async (req, res) => {
  const organisationId = safeTrim(req.query.organisationId);
  try {
    const outcome = await getTenantSlaConfig(req, organisationId || null);
    if (outcome.error) return jsonError(res, outcome.error.status, outcome.error.message);
    return jsonOk(res, outcome.data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load SLA configuration");
  }
});

router.put("/tenant-sla", requireRole(SLA_ADMIN_ROLES), async (req, res) => {
  try {
    const outcome = await updateTenantSlaConfig(req, req.body ?? {});
    if (outcome.error) return jsonError(res, outcome.error.status, outcome.error.message);
    return jsonOk(res, outcome.data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to save SLA configuration");
  }
});

/* ======================================================
   Field executives (read)
====================================================== */

router.get("/field-executives", async (req, res) => {
  const startedAt = Date.now();
  const activeOnly = String(req.query.activeOnly ?? "true").toLowerCase() !== "false";
  const organisationIdOverride = safeTrim(req.query.organisationId);
  const limit = toInt(req.query.limit, { defaultValue: 200, min: 1, max: 500 });
  const offset = toInt(req.query.offset, { defaultValue: 0, min: 0, max: 50000 });

  try {
    const { data, error } = await listFieldExecutivesScoped(req, {
      limit,
      offset,
      organisationIdOverride,
      activeOnly,
    });
    if (error) return jsonError(res, 500, error.message);
    logEvent("dataApi.fieldExecutives.list", {
      tenantId: req.tenantId ?? null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
      ms: Date.now() - startedAt,
      count: Array.isArray(data) ? data.length : 0,
    });
    return jsonOk(res, { items: data || [], limit, offset });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to list field executives");
  }
});

router.get("/field-executives/:id", async (req, res) => {
  const startedAt = Date.now();
  const id = req.params.id;
  try {
    const { data, error } = await getFieldExecutiveByIdScoped(req, id, "*");
    if (error) return jsonError(res, 500, error.message);
    if (!data) return jsonError(res, 404, "Field executive not found");
    logEvent("dataApi.fieldExecutives.get", { tenantId: req.tenantId ?? null, feId: id, ms: Date.now() - startedAt });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load field executive");
  }
});

/* ======================================================
   Configurations (read)
====================================================== */

router.get("/configurations/:key", async (req, res) => {
  const startedAt = Date.now();
  const key = safeTrim(req.params.key);
  if (!key) return jsonError(res, 400, "Key required");

  try {
    const { data, error } = await getConfigurationByKey(key);
    if (error) return jsonError(res, 500, error.message);
    logEvent("dataApi.configurations.get", { tenantId: req.tenantId ?? null, key, ms: Date.now() - startedAt });
    return jsonOk(res, data || null);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load configuration");
  }
});

router.put("/configurations/:key", async (req, res) => {
  const startedAt = Date.now();
  const key = safeTrim(req.params.key);
  if (!key) return jsonError(res, 400, "Key required");

  const role = req.tenantRole ?? req.appUser?.role ?? null;
  const isAllowed = req.isSuperAdmin || role === "ADMIN";
  if (!isAllowed) return jsonError(res, 403, "Forbidden");

  // Safety: in non-superadmin mode, only allow writing the current tenant's config key.
  // Expected key format: org_<organisationId>_ticket_config
  if (!req.isSuperAdmin) {
    const match = /^org_(.+)_ticket_config$/.exec(key);
    const orgIdFromKey = match?.[1] ?? null;
    if (!orgIdFromKey || (req.tenantId && orgIdFromKey !== req.tenantId)) {
      return jsonError(res, 403, "Forbidden");
    }
  }

  const value = req.body?.value ?? null;
  if (value == null || typeof value !== "object") return jsonError(res, 400, "Invalid value");

  try {
    const updated_at = new Date().toISOString();
    const { data: existing, error: exErr } = await configurationKeyExists(key);
    if (exErr) return jsonError(res, 500, exErr.message);

    const { error } = await upsertConfiguration(key, value, updated_at);
    if (error) return jsonError(res, 500, error.message);

    logEvent("dataApi.configurations.put", { tenantId: req.tenantId ?? null, key, ms: Date.now() - startedAt });
    return jsonOk(res, { ok: true });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to save configuration");
  }
});

/* ======================================================
   Tickets (read)
====================================================== */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function chunkIds(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function orgTicketConfigKey(organisationId) {
  return `org_${organisationId}_ticket_config`;
}

function nonEmptyIsoTimestamp(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s !== "" ? s : null;
}

/**
 * Resolution SLA hours from org_<id>_ticket_config (Ticket Settings JSON).
 * @param {unknown} configValue
 * @returns {number | null}
 */
function parseOrgResolutionSlaHours(configValue) {
  if (configValue == null || typeof configValue !== "object") return null;
  const sla = /** @type {{ resolutionHours?: unknown }} */ (configValue).sla;
  if (sla == null || typeof sla !== "object") return null;
  const h = /** @type {{ resolutionHours?: unknown }} */ (sla).resolutionHours;
  if (typeof h !== "number" || Number.isNaN(h) || h < 0) return null;
  return h;
}

/**
 * Display-only resolution SLA deadline: ticket open + configured hours.
 * Does not read or write sla_tracking; mirrors Ticket Settings + getSlaConfig fallback.
 */
function computeDisplayResolutionSlaDeadline(openedAt, createdAt, resolutionHours) {
  const baseRaw = openedAt ?? createdAt;
  if (!nonEmptyIsoTimestamp(baseRaw)) return null;
  if (typeof resolutionHours !== "number" || Number.isNaN(resolutionHours) || resolutionHours < 0) {
    return null;
  }
  const base = new Date(String(baseRaw));
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + resolutionHours * 60 * 60 * 1000).toISOString();
}

/**
 * Ticket list row extras (assignment FE name, operational due date for display).
 * Uses service-role Supabase (bypasses RLS) but only returns rows for tickets the caller may read (tenant scope).
 */
router.post("/tickets-row-supplement", async (req, res) => {
  const startedAt = Date.now();
  const raw = req.body?.ticket_ids;
  if (!Array.isArray(raw)) {
    return jsonError(res, 400, "Body must include ticket_ids (array of UUID strings)");
  }
  const requested = [
    ...new Set(
      raw
        .map((x) => (x == null ? "" : String(x).trim()))
        .filter((x) => UUID_RE.test(x))
    ),
  ].slice(0, 500);

  const emptyRow = () => ({
    assignedFeName: null,
    assignedUserName: null,
    assignmentType: null,
    assignedAt: null,
    dueAssignment: null,
  });
  /** @type {Record<string, ReturnType<typeof emptyRow>>} */
  const supplement = {};
  for (const id of requested) supplement[id] = emptyRow();

  if (requested.length === 0) {
    return jsonOk(res, { supplement });
  }

  const TICKET_VERIFY_CHUNK = 100;
  const ASSIGN_CHUNK = 50;

  try {
    const allowedIds = [];
    /** @type {Map<string, { organisation_id?: string | null, opened_at?: string | null, created_at?: string | null }>} */
    const ticketMetaById = new Map();
    for (const ch of chunkIds(requested, TICKET_VERIFY_CHUNK)) {
      const { data: rows, error: tErr } = await getTicketsMetaByIdsScoped(req, ch);
      if (tErr) return jsonError(res, 500, tErr.message);
      for (const r of rows || []) {
        if (r?.id) {
          const id = String(r.id);
          allowedIds.push(id);
          ticketMetaById.set(id, {
            organisation_id: r.organisation_id ?? null,
            opened_at: r.opened_at ?? null,
            created_at: r.created_at ?? null,
          });
        }
      }
    }

    if (allowedIds.length === 0) {
      logEvent("dataApi.ticketsRowSupplement", {
        tenantId: req.tenantId ?? null,
        isSuperAdmin: Boolean(req.isSuperAdmin),
        requested: requested.length,
        allowed: 0,
        ms: Date.now() - startedAt,
      });
      return jsonOk(res, { supplement });
    }

    const uniqueOrgIds = [
      ...new Set(
        [...ticketMetaById.values()]
          .map((m) => (m.organisation_id != null ? String(m.organisation_id).trim() : ""))
          .filter(Boolean)
      ),
    ];

    /** @type {Map<string, number>} */
    const orgResolutionHoursByOrgId = new Map();
    for (const ch of chunkIds(uniqueOrgIds, 50)) {
      const keys = ch.map((orgId) => orgTicketConfigKey(orgId));
      const { data: cfgRows, error: cfgErr } = await listConfigurationsByKeys(keys);
      if (cfgErr) return jsonError(res, 500, cfgErr.message);
      for (const row of cfgRows || []) {
        const key = row?.key != null ? String(row.key) : "";
        const match = /^org_(.+)_ticket_config$/.exec(key);
        if (!match) continue;
        const hours = parseOrgResolutionSlaHours(row.value);
        if (hours != null) orgResolutionHoursByOrgId.set(match[1], hours);
      }
    }

    const globalSlaConfig = await getSlaConfig();
    const globalResolutionHours = globalSlaConfig.resolution_sla_hours ?? 48;

    const effectiveResolutionHours = (orgId) => {
      if (orgId == null || String(orgId).trim() === "") return globalResolutionHours;
      const orgHours = orgResolutionHoursByOrgId.get(String(orgId));
      return orgHours != null ? orgHours : globalResolutionHours;
    };

    const hasAssignmentDueAt = await hasPublicColumn("ticket_assignments", "assignment_due_at");

    const best = new Map();
    for (const ch of chunkIds(allowedIds, ASSIGN_CHUNK)) {
      const { data: rows, error: aErr } = await listAssignmentsByTicketIds(ch, {
        includeFe: true,
        includeAssignmentDueAt: hasAssignmentDueAt,
      });
      if (aErr) return jsonError(res, 500, aErr.message);
      for (const row of rows || []) {
        const tid = row?.ticket_id != null ? String(row.ticket_id) : "";
        if (!tid) continue;
        const prev = best.get(tid);
        const tNew = row.assigned_at ? new Date(row.assigned_at).getTime() : 0;
        const tPrev = prev?.assigned_at ? new Date(prev.assigned_at).getTime() : -1;
        if (!prev || tNew >= tPrev) {
          best.set(tid, {
            assigned_at: row.assigned_at,
            fe: row.field_executives,
            assignment_due_at: hasAssignmentDueAt ? row.assignment_due_at : null,
            assignment_type: row.assignment_type ?? null,
            assigned_user_id: row.assigned_user_id ?? null,
          });
        }
      }
    }

    for (const [tid, row] of best.entries()) {
      if (!supplement[tid]) continue;
      supplement[tid].assignedAt = row.assigned_at ?? null;
      supplement[tid].assignmentType = row.assignment_type ?? null;
      const n = row.fe?.name;
      supplement[tid].assignedFeName =
        n != null && String(n).trim() !== "" ? String(n).trim() : null;
    }

    const smUserIds = [
      ...new Set(
        [...best.values()]
          .map((r) => (r.assigned_user_id != null ? String(r.assigned_user_id) : ""))
          .filter(Boolean)
      ),
    ];
    if (smUserIds.length > 0) {
      const { findUsersByIds } = await import("../repositories/userRepository.js");
      const { data: users } = await findUsersByIds(smUserIds);
      const nameById = new Map(
        (users || []).map((u) => [String(u.id), u.name != null ? String(u.name).trim() : ""])
      );
      for (const [tid, row] of best.entries()) {
        if (!supplement[tid] || !row.assigned_user_id) continue;
        const name = nameById.get(String(row.assigned_user_id));
        if (name) {
          supplement[tid].assignedUserName = name;
          if (!supplement[tid].assignedFeName) {
            supplement[tid].assignedFeName = `${name} (SM)`;
          }
        }
      }
    }

    /** @type {Map<string, string>} */
    const assignmentDeadlineByTicketId = new Map();
    for (const ch of chunkIds(allowedIds, ASSIGN_CHUNK)) {
      const { data: slaPart, error: sErr } = await listSlaAssignmentDeadlinesByTicketIds(ch);
      if (sErr) return jsonError(res, 500, sErr.message);
      for (const row of slaPart || []) {
        const tid = row?.ticket_id != null ? String(row.ticket_id) : "";
        if (!tid) continue;
        const deadline = nonEmptyIsoTimestamp(row.assignment_deadline);
        if (deadline) assignmentDeadlineByTicketId.set(tid, deadline);
      }
    }

    for (const tid of allowedIds) {
      if (!supplement[tid]) continue;

      const bestRow = best.get(tid);
      const latestAssignmentDueAt = nonEmptyIsoTimestamp(bestRow?.assignment_due_at);

      const meta = ticketMetaById.get(tid);
      const resolutionHours = effectiveResolutionHours(meta?.organisation_id);
      const resolutionSlaDeadline = computeDisplayResolutionSlaDeadline(
        meta?.opened_at,
        meta?.created_at,
        resolutionHours
      );

      const assignmentDeadline = assignmentDeadlineByTicketId.get(tid) ?? null;

      supplement[tid].dueAssignment =
        latestAssignmentDueAt ?? resolutionSlaDeadline ?? assignmentDeadline ?? null;
    }

    logEvent("dataApi.ticketsRowSupplement", {
      tenantId: req.tenantId ?? null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
      requested: requested.length,
      allowed: allowedIds.length,
      ms: Date.now() - startedAt,
    });
    return jsonOk(res, { supplement });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load ticket row supplement");
  }
});

router.get("/tickets", async (req, res) => {
  const startedAt = Date.now();
  const limit = toInt(req.query.limit, { defaultValue: 100, min: 1, max: 5000 });
  const offset = toInt(req.query.offset, { defaultValue: 0, min: 0, max: 50000 });

  const status = safeTrim(req.query.status);
  const clientSlug = safeTrim(req.query.clientSlug);
  const stateFilter = safeTrim(req.query.state);
  const startDate = safeTrim(req.query.startDate);
  const endDate = safeTrim(req.query.endDate);
  const search = safeTrim(req.query.search);
  const organisationIdFilter = safeTrim(req.query.organisationId);
  const scopeAllOrganisations = String(req.query.scopeAllOrganisations || "").toLowerCase() === "true";
  const unassignedOnly = String(req.query.unassignedOnly || "").toLowerCase() === "true";
  const needsReview = String(req.query.needsReview || "").toLowerCase() === "true";
  const reviewQueue = String(req.query.reviewQueue || "").toLowerCase() === "true";

  try {
    const { data, error } = await listTicketsScoped(req, {
      limit,
      offset,
      filters: {
        status,
        clientSlug,
        stateFilter,
        startDate,
        endDate,
        organisationIdFilter,
        scopeAllOrganisations,
        unassignedOnly,
        search,
        needsReview: needsReview || undefined,
        reviewQueue: reviewQueue || undefined,
      },
    });
    if (error) {
      if (error.code === "ROLE_SCOPE") return jsonError(res, error.status || 403, error.message);
      return jsonError(res, 500, error.message);
    }

    const items = await enrichTicketsWithSla(data || [], { persistEscalation: true });

    logEvent("dataApi.tickets.list", {
      tenantId: req.tenantId ?? null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
      limit,
      offset,
      ms: Date.now() - startedAt,
      count: Array.isArray(items) ? items.length : 0,
    });
    return jsonOk(res, { items, limit, offset });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to list tickets");
  }
});

router.get("/tickets/:id", async (req, res) => {
  const startedAt = Date.now();
  const id = req.params.id;
  try {
    const { data, error } = await getTicketByIdScoped(req, id, "*");
    if (error) return jsonError(res, 500, error.message);
    if (!data) return jsonError(res, 404, "Ticket not found");

    logEvent("dataApi.tickets.get", {
      tenantId: req.tenantId ?? null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
      ticketId: id,
      ms: Date.now() - startedAt,
    });
    let creator_display = null;
    try {
      const creatorMap = await buildCreatorDisplayByTicketId([data]);
      creator_display = creatorMap.get(data.id) ?? null;
    } catch (e) {
      console.warn("[dataApi.tickets.get] creator_display skipped:", e?.message || e);
    }
    return jsonOk(res, { ...data, creator_display });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load ticket");
  }
});

router.patch("/tickets/:id", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const id = req.params.id;
  if (!id) return jsonError(res, 400, "Ticket id required");
  if (req.tenantRole === "CLIENT") return jsonError(res, 403, "Forbidden");

  const updates = req.body?.updates ?? null;
  if (!updates || typeof updates !== "object") return jsonError(res, 400, "Invalid updates");

  const allow = new Set([
    "vehicle_number",
    "category",
    "issue_type",
    "location",
    "state",
    "priority",
    "priority_level",
    "complaint_id",
    "client_slug", // only STAFF can edit
  ]);
  const out = {};
  let priorityInput = null;
  for (const [k, v] of Object.entries(updates)) {
    if (!allow.has(k)) continue;
    if (k === "client_slug" && req.tenantRole !== "STAFF") continue;
    if (k === "priority" || k === "priority_level") {
      if (priorityInput == null) priorityInput = {};
      priorityInput[k] = v;
      continue;
    }
    if (k === "location") {
      out.location = normalizeLocation(v);
      continue;
    }
    if (k === "state") {
      out.state = normalizeTicketState(v);
      continue;
    }
    out[k] = v;
  }
  if (priorityInput != null) {
    const normalized = normalizeTicketPriorityInput({
      priority: priorityInput.priority,
      priority_level: priorityInput.priority_level,
      defaultLevel: "LOW",
    });
    if (!normalized.ok) return jsonError(res, 400, normalized.error);
    out.priority = normalized.priority;
    out.priority_level = normalized.priority_level;
  }
  const fieldKeys = Object.keys(out).filter((k) => k !== "updated_at");
  if (fieldKeys.length === 0) {
    return jsonError(res, 400, "No allowed fields to update");
  }
  out.updated_at = new Date().toISOString();

  try {
    const { data: existing, error: exErr } = await getTicketOrgCheckScoped(req, id);
    if (exErr) return jsonError(res, 500, exErr.message);
    if (!existing) return jsonError(res, 404, "Ticket not found");

    const { data, error } = await updateTicketById(id, out);
    if (error) return jsonError(res, 500, error.message);

    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: id,
      action: "ticket_updated",
      ticket_organisation_id: existing.organisation_id ?? null,
      client_slug: existing.client_slug ?? null,
      metadata: { fields: Object.keys(out).filter((k) => k !== "updated_at") },
    });

    logEvent("dataApi.tickets.patch", { tenantId: req.tenantId ?? null, ticketId: id, ms: Date.now() - startedAt });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to update ticket");
  }
});

router.post("/tickets/:id/status", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const id = req.params.id;
  if (!id) return jsonError(res, 400, "Ticket id required");

  const status = safeTrim(req.body?.status);
  if (!status) return jsonError(res, 400, "Status required");

  try {
    const { data: existing, error: exErr } = await getTicketOrgCheckScoped(req, id);
    if (exErr) return jsonError(res, 500, exErr.message);
    if (!existing) return jsonError(res, 404, "Ticket not found");

    const transition = validateDataApiStatusTransition(existing.status, status);
    if (!transition.ok) {
      return jsonError(res, 400, transition.error);
    }

    const statusUpdate = {
      status,
      updated_at: new Date().toISOString(),
      ...(status === "OPEN" && existing.status === "NEEDS_REVIEW" ? { needs_review: false } : {}),
    };
    const { data, error, conflict } = await updateTicketById(id, statusUpdate, {
      expectedStatus: existing.status,
    });
    if (conflict) {
      return jsonError(res, 409, "Ticket status changed; refresh and retry", {
        code: "STATUS_CONFLICT",
      });
    }
    if (error) return jsonError(res, 500, error.message);

    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: id,
      action: `status_changed_to_${status}`,
      ticket_organisation_id: existing.organisation_id ?? null,
      client_slug: existing.client_slug ?? null,
      metadata: { new_status: status, previous_status: existing.status ?? null },
    });

    logEvent("dataApi.tickets.status", { tenantId: req.tenantId ?? null, ticketId: id, status, ms: Date.now() - startedAt });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to update ticket status");
  }
});

router.post("/tickets/:id/comments", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const id = req.params.id;
  if (!id) return jsonError(res, 400, "Ticket id required");

  const body = safeTrim(req.body?.body);
  const source = safeTrim(req.body?.source) || "STAFF";
  const attachments = req.body?.attachments ?? null;
  if (!body) return jsonError(res, 400, "Body required");

  try {
    const { data: existing, error: exErr } = await getTicketOrgCheckScoped(req, id);
    if (exErr) return jsonError(res, 500, exErr.message);
    if (!existing) return jsonError(res, 404, "Ticket not found");

    const { data, error } = await insertComment({ ticket_id: id, body, source, attachments });
    if (error) return jsonError(res, 500, error.message);

    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: id,
      action: "comment_added",
      ticket_organisation_id: existing.organisation_id ?? null,
      client_slug: existing.client_slug ?? null,
      metadata: { source, comment_id: data?.id ?? null },
    });

    logEvent("dataApi.tickets.comments.create", { tenantId: req.tenantId ?? null, ticketId: id, ms: Date.now() - startedAt });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to add comment");
  }
});

router.get("/tickets/:id/comments", async (req, res) => {
  const startedAt = Date.now();
  const id = req.params.id;
  const limit = toInt(req.query.limit, { defaultValue: 200, min: 1, max: 500 });
  const offset = toInt(req.query.offset, { defaultValue: 0, min: 0, max: 50000 });
  try {
    const { data: ticket, error: tErr } = await getTicketByIdScoped(
      req,
      id,
      "id, organisation_id, client_slug, current_assignment_id"
    );
    if (tErr) return jsonError(res, 500, tErr.message);
    if (!ticket) return jsonError(res, 404, "Ticket not found");

    const { data, error } = await listCommentsForTicket(req, id, { limit, offset });
    if (error) return jsonError(res, 500, error.message);
    logEvent("dataApi.tickets.comments", {
      tenantId: req.tenantId ?? null,
      ticketId: id,
      ms: Date.now() - startedAt,
      count: Array.isArray(data) ? data.length : 0,
    });
    return jsonOk(res, { items: data || [], limit, offset });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load comments");
  }
});

/**
 * Short-lived presigned GET for a proof object stored on TEST S3.
 * Key is resolved from comment.attachments.proof_storage_paths[index] — never trusted from the client.
 * Access: tenant staff / super-admin, or the currently assigned field executive.
 */
router.get("/tickets/:id/comments/:commentId/proofs/:index/url", async (req, res) => {
  const startedAt = Date.now();
  const ticketId = safeTrim(req.params.id);
  const commentId = safeTrim(req.params.commentId);
  const index = toInt(req.params.index, { defaultValue: 0, min: 0, max: 50 });
  if (!ticketId || !commentId) return jsonError(res, 400, "ticket id and comment id required");

  try {
    const { data: ticket, error: tErr } = await getTicketByIdScoped(
      req,
      ticketId,
      "id, organisation_id, client_slug, status, current_assignment_id"
    );
    if (tErr) return jsonError(res, 500, tErr.message);
    if (!ticket) return jsonError(res, 404, "Ticket not found");

    const { assertTicketProofReadableByCaller } = await import(
      "../services/assignmentContextService.js"
    );
    const access = await assertTicketProofReadableByCaller(req, ticket);
    if (!access.ok) {
      return jsonError(res, access.status ?? 403, access.error || "Forbidden");
    }

    const { data: comment, error: cErr } = await getCommentById(commentId, "attachments, ticket_id");
    if (cErr) return jsonError(res, 500, cErr.message);
    if (!comment) return jsonError(res, 404, "Comment not found");
    if (String(comment.ticket_id) !== String(ticketId)) {
      return jsonError(res, 404, "Comment not found on ticket");
    }

    const att =
      comment.attachments && typeof comment.attachments === "object" && !Array.isArray(comment.attachments)
        ? comment.attachments
        : {};
    const { isCommentImagesHidden } = await import("../services/imageVisibilityService.js");
    if (isCommentImagesHidden(att)) {
      return jsonError(res, 404, "Proof is no longer available");
    }
    const paths = Array.isArray(att.proof_storage_paths) ? att.proof_storage_paths : [];
    const key = paths[index];
    if (!key || typeof key !== "string") {
      return jsonError(res, 404, "Proof object not available (historical proofs may use DB base64 only)");
    }

    const { getProofDownloadUrl } = await import("../services/proofStorageService.js");
    const signed = await getProofDownloadUrl({ key, expiresInSeconds: 120 });
    logEvent("dataApi.tickets.proofUrl", {
      tenantId: req.tenantId ?? null,
      ticketId,
      commentId,
      index,
      ms: Date.now() - startedAt,
    });
    return jsonOk(res, {
      url: signed.url,
      expiresIn: signed.expiresIn,
      index,
      key: signed.key,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to create proof download URL");
  }
});

router.get("/tickets/:id/assignments", async (req, res) => {
  const startedAt = Date.now();
  const id = req.params.id;
  const limit = toInt(req.query.limit, { defaultValue: 100, min: 1, max: 300 });
  const offset = toInt(req.query.offset, { defaultValue: 0, min: 0, max: 50000 });
  try {
    const { data: ticket, error: tErr } = await getTicketByIdScoped(
      req,
      id,
      "id, organisation_id, client_slug, current_assignment_id"
    );
    if (tErr) return jsonError(res, 500, tErr.message);
    if (!ticket) return jsonError(res, 404, "Ticket not found");

    const { data, error } = await listAssignmentsForTicket(req, id, { limit, offset, includeFe: true });
    if (error) return jsonError(res, 500, error.message);
    logEvent("dataApi.tickets.assignments", {
      tenantId: req.tenantId ?? null,
      ticketId: id,
      ms: Date.now() - startedAt,
      count: Array.isArray(data) ? data.length : 0,
    });
    return jsonOk(res, { items: data || [], limit, offset });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load assignments");
  }
});

/**
 * Assignments joined to tickets for FE stats (Field Executives page).
 * Query: feIds=comma-separated UUIDs (max 500).
 */
router.get("/ticket-assignments/by-fe", async (req, res) => {
  const startedAt = Date.now();
  const raw = safeTrim(req.query.feIds);
  if (!raw) return jsonOk(res, { items: [] });
  const feIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 500);
  if (feIds.length === 0) return jsonOk(res, { items: [] });
  try {
    const { data, error } = await listAssignmentsByFeIdsWithTickets(req, feIds);
    if (error) return jsonError(res, 500, error.message);
    logEvent("dataApi.ticketAssignments.byFe", {
      tenantId: req.tenantId ?? null,
      ms: Date.now() - startedAt,
      count: Array.isArray(data) ? data.length : 0,
    });
    return jsonOk(res, { items: data || [] });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load assignments by FE");
  }
});

/* ======================================================
   Tenant clients (tenant-managed end customers)
====================================================== */

const CLIENT_READ_ROLES = ["ADMIN", "STAFF", "SUPER_ADMIN"];
const CLIENT_WRITE_ROLES = ["ADMIN", "SUPER_ADMIN"];

router.get("/clients", requireTenantClientsEnabled, requireRole(CLIENT_READ_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const organisationId = safeTrim(req.query.organisationId);
  const status = safeTrim(req.query.status);
  const activeOnly = String(req.query.activeOnly ?? "").toLowerCase() === "true";

  try {
    const { data, error } = await listTenantClients(req, {
      organisationId: organisationId || null,
      status: status || null,
      activeOnly,
    });
    if (error) return jsonError(res, 500, error.message);
    logEvent("dataApi.clients.list", {
      tenantId: req.tenantId ?? null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
      ms: Date.now() - startedAt,
      count: data.length,
    });
    return jsonOk(res, { items: data });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to list clients");
  }
});

router.get(
  "/clients/:slug/notification-emails",
  requireRole(CLIENT_READ_ROLES),
  async (req, res) => {
    const startedAt = Date.now();
    const slug = safeTrim(req.params.slug);
    const organisationId = safeTrim(req.query.organisationId);
    if (!slug) return jsonError(res, 400, "slug required");

    try {
      const result = await listClientNotificationEmails(req, {
        clientSlug: slug,
        organisationId: organisationId || null,
      });
      if (result.error) {
        return jsonError(res, result.status ?? 400, result.error);
      }
      logEvent("dataApi.clients.notificationEmails", {
        tenantId: req.tenantId ?? null,
        isSuperAdmin: Boolean(req.isSuperAdmin),
        clientSlug: slug,
        ms: Date.now() - startedAt,
        count: result.items.length,
      });
      return jsonOk(res, { items: result.items });
    } catch (err) {
      return jsonError(res, 500, err?.message || "Failed to load client notification emails");
    }
  }
);

router.get("/clients/:id", requireTenantClientsEnabled, requireRole(CLIENT_READ_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  if (!id) return jsonError(res, 400, "id required");
  try {
    const { data, error, forbidden } = await getTenantClientById(req, id);
    if (error) return jsonError(res, 500, error.message);
    if (forbidden) return jsonError(res, 403, "Forbidden");
    if (!data) return jsonError(res, 404, "Client not found");
    logEvent("dataApi.clients.get", { ms: Date.now() - startedAt, clientId: id });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load client");
  }
});

router.post("/clients", requireTenantClientsEnabled, requireRole(CLIENT_WRITE_ROLES), async (req, res) => {
  const startedAt = Date.now();
  try {
    const outcome = await createTenantClient(req, req.body ?? {});
    if (outcome.error) {
      return jsonError(res, outcome.error.status, outcome.error.message);
    }
    const row = outcome.data;
    void insertAuditLog({
      req,
      entity_type: "tenant_client",
      entity_id: row.id,
      action: "client_created",
      organisation_id: row.organisation_id ?? null,
      metadata: { name: row.name, slug: row.slug, status: row.status },
    });
    logEvent("dataApi.clients.create", { ms: Date.now() - startedAt, clientId: row.id });
    return jsonOk(res, row);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to create client");
  }
});

router.patch("/clients/:id", requireTenantClientsEnabled, requireRole(CLIENT_WRITE_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  if (!id) return jsonError(res, 400, "id required");
  try {
    const outcome = await updateTenantClient(req, id, req.body ?? {});
    if (outcome.error) {
      return jsonError(res, outcome.error.status, outcome.error.message);
    }
    const row = outcome.data;
    void insertAuditLog({
      req,
      entity_type: "tenant_client",
      entity_id: row.id,
      action: "client_updated",
      organisation_id: row.organisation_id ?? null,
      metadata: { name: row.name, slug: row.slug, status: row.status },
    });
    logEvent("dataApi.clients.patch", { ms: Date.now() - startedAt, clientId: id });
    return jsonOk(res, row);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to update client");
  }
});

router.delete("/clients/:id", requireTenantClientsEnabled, requireRole(CLIENT_WRITE_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  if (!id) return jsonError(res, 400, "id required");
  try {
    const outcome = await deleteTenantClient(req, id);
    if (outcome.error) {
      return jsonError(res, outcome.error.status, outcome.error.message);
    }
    const row = outcome.data;
    void insertAuditLog({
      req,
      entity_type: "tenant_client",
      entity_id: row.id,
      action: "client_deleted",
      organisation_id: row.organisation_id ?? null,
      metadata: { name: row.name, slug: row.slug },
    });
    logEvent("dataApi.clients.delete", { ms: Date.now() - startedAt, clientId: id });
    return jsonOk(res, { success: true, id: row.id });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to delete client");
  }
});

/* ======================================================
   Client vehicles (tenant-scoped vehicle master)
====================================================== */

router.get(
  "/clients/:id/vehicles",
  requireTenantClientsEnabled,
  requireRole(CLIENT_READ_ROLES),
  async (req, res) => {
    const startedAt = Date.now();
    const clientId = safeTrim(req.params.id);
    const activeOnly = String(req.query.activeOnly ?? "").toLowerCase() === "true";
    const search = safeTrim(req.query.search);
    try {
      const outcome = await listClientVehicles(req, clientId, {
        activeOnly,
        search: search || null,
      });
      if (outcome.error) return jsonError(res, outcome.error.status, outcome.error.message);
      logEvent("dataApi.clientVehicles.list", {
        tenantId: req.tenantId ?? null,
        clientId,
        ms: Date.now() - startedAt,
        count: outcome.data.length,
      });
      return jsonOk(res, {
        items: outcome.data,
        total: outcome.total,
        active: outcome.active,
      });
    } catch (err) {
      return jsonError(res, 500, err?.message || "Failed to list vehicles");
    }
  }
);

router.get(
  "/clients/:id/vehicles/export",
  requireTenantClientsEnabled,
  requireRole(CLIENT_WRITE_ROLES),
  async (req, res) => {
    const clientId = safeTrim(req.params.id);
    try {
      const outcome = await listClientVehicles(req, clientId, {});
      if (outcome.error) return jsonError(res, outcome.error.status, outcome.error.message);
      const csv = buildVehicleExportCsv(outcome.data);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="client-vehicles-${clientId.slice(0, 8)}.csv"`
      );
      return res.status(200).send(csv);
    } catch (err) {
      return jsonError(res, 500, err?.message || "Failed to export vehicles");
    }
  }
);

router.post(
  "/clients/:id/vehicles/import",
  requireTenantClientsEnabled,
  requireRole(CLIENT_WRITE_ROLES),
  async (req, res) => {
    const startedAt = Date.now();
    const clientId = safeTrim(req.params.id);
    const rows = req.body?.rows;
    try {
      const outcome = await importClientVehicles(req, clientId, rows);
      if (outcome.error) return jsonError(res, outcome.error.status, outcome.error.message);
      const errorCsv =
        outcome.errors.length > 0 ? buildVehicleImportErrorsCsv(outcome.errors) : null;
      logEvent("dataApi.clientVehicles.import", {
        tenantId: req.tenantId ?? null,
        clientId,
        ms: Date.now() - startedAt,
        ...outcome.summary,
      });
      return jsonOk(res, {
        summary: outcome.summary,
        errors: outcome.errors,
        error_csv: errorCsv,
      });
    } catch (err) {
      return jsonError(res, 500, err?.message || "Failed to import vehicles");
    }
  }
);

router.post(
  "/clients/:id/vehicles",
  requireTenantClientsEnabled,
  requireRole(CLIENT_WRITE_ROLES),
  async (req, res) => {
    const startedAt = Date.now();
    const clientId = safeTrim(req.params.id);
    try {
      const outcome = await createClientVehicle(req, clientId, req.body ?? {});
      if (outcome.error) return jsonError(res, outcome.error.status, outcome.error.message);
      logEvent("dataApi.clientVehicles.create", {
        tenantId: req.tenantId ?? null,
        clientId,
        ms: Date.now() - startedAt,
        vehicleId: outcome.data.id,
      });
      return jsonOk(res, outcome.data);
    } catch (err) {
      return jsonError(res, 500, err?.message || "Failed to create vehicle");
    }
  }
);

router.patch(
  "/clients/:id/vehicles/:vehicleId",
  requireTenantClientsEnabled,
  requireRole(CLIENT_WRITE_ROLES),
  async (req, res) => {
    const startedAt = Date.now();
    const clientId = safeTrim(req.params.id);
    const vehicleId = safeTrim(req.params.vehicleId);
    if (!vehicleId) return jsonError(res, 400, "vehicleId required");
    try {
      const outcome = await updateClientVehicle(req, clientId, vehicleId, req.body ?? {});
      if (outcome.error) return jsonError(res, outcome.error.status, outcome.error.message);
      logEvent("dataApi.clientVehicles.patch", {
        tenantId: req.tenantId ?? null,
        clientId,
        vehicleId,
        ms: Date.now() - startedAt,
      });
      return jsonOk(res, outcome.data);
    } catch (err) {
      return jsonError(res, 500, err?.message || "Failed to update vehicle");
    }
  }
);

router.delete(
  "/clients/:id/vehicles/:vehicleId",
  requireTenantClientsEnabled,
  requireRole(CLIENT_WRITE_ROLES),
  async (req, res) => {
    const startedAt = Date.now();
    const clientId = safeTrim(req.params.id);
    const vehicleId = safeTrim(req.params.vehicleId);
    if (!vehicleId) return jsonError(res, 400, "vehicleId required");
    try {
      const outcome = await deleteClientVehicle(req, clientId, vehicleId);
      if (outcome.error) return jsonError(res, outcome.error.status, outcome.error.message);
      logEvent("dataApi.clientVehicles.delete", {
        tenantId: req.tenantId ?? null,
        clientId,
        vehicleId,
        ms: Date.now() - startedAt,
      });
      return jsonOk(res, { success: true, id: vehicleId });
    } catch (err) {
      return jsonError(res, 500, err?.message || "Failed to delete vehicle");
    }
  }
);

/* ======================================================
   Organisations (read)
====================================================== */

router.get("/organisations", async (req, res) => {
  const startedAt = Date.now();
  try {
    let organisationId = null;
    if (!req.isSuperAdmin) {
      if (!req.tenantId) return jsonError(res, 403, "Forbidden");
      organisationId = req.tenantId;
    }
    const { data, error } = await listOrganisations({ organisationId });
    if (error) return jsonError(res, 500, error.message);
    logEvent("dataApi.organisations.list", { ms: Date.now() - startedAt, count: (data || []).length });
    return jsonOk(res, { items: data || [] });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to list organisations");
  }
});

router.get("/organisations/stats", async (req, res) => {
  const startedAt = Date.now();
  if (!req.isSuperAdmin) return jsonError(res, 403, "Forbidden");

  const orgStatsCap = toInt(process.env.ORG_STATS_MAX_ROWS, { defaultValue: 20000, min: 1000, max: 200000 });

  try {
    const [ticketsRes, usersRes, feRes, slaRes] = await Promise.all([
      listTicketOrgStatsRows(orgStatsCap, req),
      listUsersOrganisationIds(orgStatsCap),
      listFieldExecutivesOrganisationIds(orgStatsCap),
      listSlaBreachRowsGlobal(orgStatsCap),
    ]);
    if (ticketsRes.error) return jsonError(res, 500, ticketsRes.error.message);
    if (usersRes.error) return jsonError(res, 500, usersRes.error.message);
    if (feRes.error) return jsonError(res, 500, feRes.error.message);
    if (slaRes.error) return jsonError(res, 500, slaRes.error.message);

    const cap = (rows) => {
      const r = rows ?? [];
      const truncated = r.length > orgStatsCap;
      return { rows: truncated ? r.slice(0, orgStatsCap) : r, truncated };
    };
    const tCap = cap(ticketsRes.data);
    const uCap = cap(usersRes.data);
    const feCap = cap(feRes.data);
    const sCap = cap(slaRes.data);
    const orgStatsTruncated = tCap.truncated || uCap.truncated || feCap.truncated || sCap.truncated;

    const tickets = tCap.rows;
    const users = uCap.rows;
    const fes = feCap.rows;
    const sla = sCap.rows;

    const breachedTicketIds = new Set(
      sla
        .filter((s) => s.assignment_breached || s.onsite_breached || s.resolution_breached)
        .map((s) => s.ticket_id)
    );

    const out = {};
    for (const t of tickets) {
      const orgId = t.organisation_id ?? "__none__";
      if (!out[orgId]) {
        out[orgId] = { totalTickets: 0, openTickets: 0, feCount: 0, userCount: 0, distinctClients: 0, slaBreached: 0 };
      }
      out[orgId].totalTickets++;
      if (t.status !== "RESOLVED" && t.status !== "REJECTED") out[orgId].openTickets++;
      if (t.client_slug) {
        if (!out[orgId]._clients) out[orgId]._clients = new Set();
        out[orgId]._clients.add(t.client_slug);
      }
      if (breachedTicketIds.has(t.id)) out[orgId].slaBreached++;
    }
    for (const u of users) {
      const orgId = u.organisation_id ?? "__none__";
      if (!out[orgId]) out[orgId] = { totalTickets: 0, openTickets: 0, feCount: 0, userCount: 0, distinctClients: 0, slaBreached: 0 };
      out[orgId].userCount++;
    }
    for (const fe of fes) {
      const orgId = fe.organisation_id ?? "__none__";
      if (!out[orgId]) out[orgId] = { totalTickets: 0, openTickets: 0, feCount: 0, userCount: 0, distinctClients: 0, slaBreached: 0 };
      out[orgId].feCount++;
    }
    for (const [orgId, stats] of Object.entries(out)) {
      stats.distinctClients = stats._clients ? stats._clients.size : 0;
      delete stats._clients;
    }

    logEvent("dataApi.organisations.stats", {
      ms: Date.now() - startedAt,
      orgs: Object.keys(out).length,
      orgStatsTruncated,
      orgStatsCap,
    });
    return jsonOk(res, { items: out, orgStatsTruncated, orgStatsCap });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to compute org stats");
  }
});

router.get("/organisations/:id", async (req, res) => {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  if (!id) return jsonError(res, 400, "id required");
  const tenantMayRead = req.tenantId && id === req.tenantId;
  if (!req.isSuperAdmin && !tenantMayRead) return jsonError(res, 403, "Forbidden");
  try {
    const { data, error } = await getOrganisationById(id);
    if (error) return jsonError(res, 500, error.message);
    if (!data) return jsonError(res, 404, "Organisation not found");
    logEvent("dataApi.organisations.get", { ms: Date.now() - startedAt, orgId: id });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load organisation");
  }
});

router.post("/organisations", async (req, res) => {
  const startedAt = Date.now();
  if (!req.isSuperAdmin) return jsonError(res, 403, "Forbidden");
  const name = safeTrim(req.body?.name);
  let slug = safeTrim(req.body?.slug);
  if (!name || !slug) return jsonError(res, 400, "name and slug required");
  slug = slug.toLowerCase().replace(/\s+/g, "-");
  const shortNorm = normalizeOrganisationShortName(req.body?.short_name);
  if (!shortNorm.ok) return jsonError(res, 400, shortNorm.error);
  try {
    const insert = { name, slug, status: "active", short_name: shortNorm.value };
    const email = safeTrim(req.body?.email);
    if (email) insert.email = email;
    if (Array.isArray(req.body?.incoming_emails)) insert.incoming_emails = req.body.incoming_emails;
    if (Array.isArray(req.body?.outgoing_emails)) insert.outgoing_emails = req.body.outgoing_emails;
    const { data, error } = await insertOrganisation(insert);
    if (error) return jsonError(res, 400, error.message);
    logEvent("dataApi.organisations.create", { ms: Date.now() - startedAt, orgId: data?.id });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to create organisation");
  }
});

router.patch("/organisations/:id", async (req, res) => {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  if (!id) return jsonError(res, 400, "id required");
  const tenantMayWrite = req.tenantId && id === req.tenantId;
  if (!req.isSuperAdmin && !tenantMayWrite) return jsonError(res, 403, "Forbidden");
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const patch = {};
    for (const key of [
      "name",
      "status",
      "email",
      "spoc_name",
      "spoc_email",
      "spoc_phone",
      "incoming_emails",
      "outgoing_emails",
      "review_field_label",
      "review_field_helper_text",
      "short_name",
    ]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key];
    }
    if (typeof patch.name === "string") patch.name = patch.name.trim();
    if (Object.prototype.hasOwnProperty.call(patch, "short_name")) {
      const shortNorm = normalizeOrganisationShortName(patch.short_name);
      if (!shortNorm.ok) return jsonError(res, 400, shortNorm.error);
      patch.short_name = shortNorm.value;
    }
    const { data, error } = await updateOrganisation(id, patch);
    if (error) return jsonError(res, 400, error.message);
    if (!data) return jsonError(res, 404, "Organisation not found");
    logEvent("dataApi.organisations.patch", { ms: Date.now() - startedAt, orgId: id });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to update organisation");
  }
});

/* ======================================================
   Users (read)
====================================================== */

router.get("/users", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const limit = toInt(req.query.limit, { defaultValue: 200, min: 1, max: 500 });
  const offset = toInt(req.query.offset, { defaultValue: 0, min: 0, max: 50000 });
  const organisationId = safeTrim(req.query.organisationId);
  const approvalStatus = safeTrim(req.query.approvalStatus);
  const role = safeTrim(req.query.role);

  try {
    const { data, error } = await listUsersScoped(req, {
      limit,
      offset,
      organisationId,
      approvalStatus,
      role,
    });
    if (error) return jsonError(res, 500, error.message);

    logEvent("dataApi.users.list", {
      tenantId: req.tenantId ?? null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
      ms: Date.now() - startedAt,
      count: Array.isArray(data) ? data.length : 0,
    });
    return jsonOk(res, { items: data || [], limit, offset });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to list users");
  }
});

/* ======================================================
   Raw emails (read)
====================================================== */

router.get("/raw-emails", requireRole(RAW_EMAIL_READ_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const limit = toInt(req.query.limit, { defaultValue: 100, min: 1, max: 200 });
  const offset = toInt(req.query.offset, { defaultValue: 0, min: 0, max: 50000 });
  try {
    const organisationId = req.isSuperAdmin ? null : (req.tenantId ?? TENANT_DENY_SENTINEL);
    const { data: raw, error } = await listRawEmailsPaged({
      limit,
      offset,
      organisationId: organisationId ?? undefined,
    });
    if (error) return jsonError(res, 500, error.message);

    const rawIds = (raw || []).map((r) => r.id).filter(Boolean);
    let parsedMap = new Map();
    if (rawIds.length > 0) {
      const { data: parsed, error: parsedErr } = await listParsedEmailsByRawEmailIds(
        rawIds,
        organisationId ?? undefined
      );
      if (!parsedErr && Array.isArray(parsed)) {
        parsedMap = new Map(parsed.map((p) => [p.raw_email_id, p]));
      }
    }

    const items = (raw || []).map((r) => ({ ...r, parsed_email: parsedMap.get(r.id) || null }));

    logEvent("dataApi.rawEmails.list", {
      tenantId: req.tenantId ?? null,
      ms: Date.now() - startedAt,
      count: items.length,
    });
    return jsonOk(res, { items, limit, offset });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to list raw emails");
  }
});

/* ======================================================
   Audit logs (read)
====================================================== */

router.get("/audit-logs", requireRole(AUDIT_LOG_READ_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const format = (safeTrim(req.query.format) ?? "").toLowerCase();
  const isCsv = format === "csv";
  const limit = toInt(req.query.limit, {
    defaultValue: isCsv ? 2000 : 50,
    min: 1,
    max: isCsv ? 5000 : 200,
  });
  const offset = isCsv ? 0 : toInt(req.query.offset, { defaultValue: 0, min: 0, max: 50000 });

  const filters = {
    entityType: safeTrim(req.query.entityType),
    action: safeTrim(req.query.action),
    dateFrom: safeTrim(req.query.dateFrom),
    dateTo: safeTrim(req.query.dateTo),
    ticketNumber: safeTrim(req.query.ticketNumber),
    actorUserId: safeTrim(req.query.actorUserId),
    actorFeId: safeTrim(req.query.actorFeId),
    organisationId: req.isSuperAdmin ? safeTrim(req.query.organisationId) : null,
    sortBy: safeTrim(req.query.sortBy) || "created_at",
    sortDir: safeTrim(req.query.sortDir) || "desc",
  };

  try {
    if (process.env.AUDIT_LOGS_DEBUG === "true") {
      console.error("[audit-logs] list request", {
        requestId: req.requestId,
        appUserId: req.appUser?.id ?? null,
        appUserRole: req.appUser?.role ?? null,
        tenantId: req.tenantId ?? null,
        isSuperAdmin: Boolean(req.isSuperAdmin),
        filters,
        limit,
        offset,
      });
    }

    const items = await listAuditLogsPage(req, filters, { limit, offset });

    if (process.env.AUDIT_LOGS_DEBUG === "true") {
      console.error("[audit-logs] list result", {
        requestId: req.requestId,
        enrichedCount: items.length,
      });
    }

    logEvent("dataApi.auditLogs.list", {
      tenantId: req.tenantId ?? null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
      ms: Date.now() - startedAt,
      count: items.length,
      format: isCsv ? "csv" : "json",
    });

    if (isCsv) {
      const csv = auditRowsToCsv(items);
      const filename = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(csv);
    }

    return jsonOk(res, { items, limit, offset });
  } catch (err) {
    console.error("[audit-logs] failure", {
      requestId: req.requestId,
      errorMessage: err?.message,
      errorStack: err?.stack,
    });
    return jsonError(res, 500, err?.message || "Failed to list audit logs");
  }
});

router.post("/audit-logs/backfill", async (req, res) => {
  if (!req.isSuperAdmin) return jsonError(res, 403, "Super Admin only");
  const limit = toInt(req.body?.limit ?? req.query?.limit, { defaultValue: 300, min: 1, max: 2000 });
  try {
    const result = await backfillAuditLogsFromData({ limit });
    logEvent("dataApi.auditLogs.backfill", { inserted_count: result.inserted_count });
    return jsonOk(res, result);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Backfill failed");
  }
});

/* ======================================================
   SLA monitor (read)
====================================================== */

router.get("/sla/monitor", async (req, res) => {
  const startedAt = Date.now();
  const limit = toInt(req.query.limit, { defaultValue: 200, min: 1, max: 500 });
  const offset = toInt(req.query.offset, { defaultValue: 0, min: 0, max: 50000 });

  // Note: This is a compatibility endpoint for the current UI.
  // It returns joined-ish data but still in a "list of rows" shape.
  try {
    const { data: slaRows, error: slaErr } = await listSlaRowsScoped(req, {
      limit,
      offset,
      orderDesc: true,
    });
    if (slaErr) return jsonError(res, 500, slaErr.message);
    const ticketIds = (slaRows || []).map((s) => s.ticket_id).filter(Boolean);
    if (ticketIds.length === 0) return jsonOk(res, { items: [], limit, offset });

    const { data: tickets, error: ticketsErr } = await listTicketsByIds(ticketIds, req);
    if (ticketsErr) return jsonError(res, 500, ticketsErr.message);

    const ticketMap = new Map((tickets || []).map((t) => [t.id, t]));
    const activeList = (slaRows || [])
      .map((s) => {
        const t = ticketMap.get(s.ticket_id);
        if (!t) return null;
        if (t.status === "REJECTED") return null;
        return { ...s, ticket: t };
      })
      .filter(Boolean);

    logEvent("dataApi.sla.monitor", { tenantId: req.tenantId ?? null, ms: Date.now() - startedAt, count: activeList.length });
    return jsonOk(res, { items: activeList, limit, offset });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load SLA monitor");
  }
});

/* ======================================================
   Analytics: distinct client slugs (read)
====================================================== */

router.get("/analytics/client-slugs", async (req, res) => {
  const startedAt = Date.now();
  const organisationIdFilter = safeTrim(req.query.organisationId);
  try {
    const { data, error } = await listClientSlugsScoped(req, organisationIdFilter);
    if (error) return jsonError(res, 500, error.message);
    const slugs = [...new Set((data ?? []).map((r) => r.client_slug).filter(Boolean))];
    const clientSlugs = slugs.sort();
    logEvent("dataApi.analytics.clientSlugs", { tenantId: req.tenantId ?? null, ms: Date.now() - startedAt, count: clientSlugs.length });
    return jsonOk(res, { clientSlugs });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load client slugs");
  }
});

/* ======================================================
   Tenant insights (superadmin): client slugs + per-client ticket counts
====================================================== */

router.get("/tenant/:organisationId/insights", async (req, res) => {
  const startedAt = Date.now();
  const organisationId = safeTrim(req.params.organisationId);
  if (!organisationId) return jsonError(res, 400, "organisationId required");
  if (!req.isSuperAdmin) return jsonError(res, 403, "Forbidden");
  try {
    const { data: rows, error } = await listTenantInsightsTickets(organisationId);
    if (error) return jsonError(res, 500, error.message);
    const clientSlugs = [...new Set((rows ?? []).map((r) => r.client_slug).filter(Boolean))].sort();
    const byClient = {};
    for (const t of rows ?? []) {
      const slug = t.client_slug ?? "_unknown";
      if (!byClient[slug]) byClient[slug] = { total: 0, open: 0 };
      byClient[slug].total++;
      if (t.status === "OPEN") byClient[slug].open++;
    }
    logEvent("dataApi.tenant.insights", { ms: Date.now() - startedAt, organisationId });
    return jsonOk(res, { clientSlugs, clientStats: byClient });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load tenant insights");
  }
});

/* ======================================================
   SLA rows for ticket id list (client dashboard, etc.)
====================================================== */

router.post("/sla/by-ticket-ids", async (req, res) => {
  const startedAt = Date.now();
  const ids = Array.isArray(req.body?.ticketIds) ? req.body.ticketIds : [];
  const clean = ids.map((x) => String(x)).filter(Boolean).slice(0, 500);
  if (clean.length === 0) return jsonOk(res, { items: [] });
  try {
    const { data, error } = await listSlaBreachesByTicketIdsScoped(
      req,
      clean,
      "ticket_id, assignment_breached, onsite_breached, resolution_breached"
    );
    if (error) return jsonError(res, 500, error.message);
    logEvent("dataApi.sla.byTicketIds", { tenantId: req.tenantId ?? null, ms: Date.now() - startedAt, count: (data || []).length });
    return jsonOk(res, { items: data || [] });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load SLA rows");
  }
});

/* ======================================================
   Active FE action token for a ticket (staff UI)
====================================================== */

router.get("/tickets/:ticketId/fe-action-tokens/active", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const ticketId = safeTrim(req.params.ticketId);
  if (!ticketId) return jsonError(res, 400, "ticketId required");
  try {
    const { data: ticket, error: te } = await getTicketOrgCheckScoped(req, ticketId);
    if (te) return jsonError(res, 500, te.message);
    if (!ticket) return jsonError(res, 404, "Ticket not found");

    const { data, error } = await findActiveFeActionTokenForTicket(
      ticketId,
      new Date().toISOString()
    );
    if (error) return jsonError(res, 500, error.message);
    // Never return the raw token UUID — it is the capability secret for /fe/action/:tokenId.
    const safe = data
      ? {
          ticket_id: data.ticket_id ?? ticketId,
          fe_id: data.fe_id ?? null,
          action_type: data.action_type ?? null,
          expires_at: data.expires_at ?? null,
          used: Boolean(data.used),
          token_state: data.token_state ?? null,
          has_active: true,
        }
      : null;
    logEvent("dataApi.feToken.active", { ticketId, ms: Date.now() - startedAt, found: !!data });
    return jsonOk(res, { token: safe });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load FE token");
  }
});

/* ======================================================
   access_tokens lookup (legacy magic links)
====================================================== */

router.get("/access-tokens/by-hash", async (req, res) => {
  const startedAt = Date.now();
  const tokenHash = safeTrim(req.query.tokenHash);
  if (!tokenHash) return jsonError(res, 400, "tokenHash required");
  try {
    const { data, error } = await findAccessTokenByHash(tokenHash);
    if (error) return jsonError(res, 500, error.message);
    if (!data) return jsonError(res, 404, "Invalid token");
    if (data.revoked) return jsonError(res, 410, "Token revoked");
    if (new Date(data.expires_at) < new Date()) return jsonError(res, 410, "Token expired");
    logEvent("dataApi.accessToken.lookup", { ms: Date.now() - startedAt });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Lookup failed");
  }
});

/* ======================================================
   Configurations list (superadmin read-only)
====================================================== */

router.get("/configurations", async (req, res) => {
  const startedAt = Date.now();
  if (!req.isSuperAdmin) return jsonError(res, 403, "Forbidden");
  try {
    const { data, error } = await listAllConfigurations(500);
    if (error) return jsonError(res, 500, error.message);
    logEvent("dataApi.configurations.list", { ms: Date.now() - startedAt, count: (data || []).length });
    return jsonOk(res, { items: data || [] });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to list configurations");
  }
});

/* ======================================================
   Analytics summary (read)
====================================================== */

router.get("/analytics/summary", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const clientSlug = safeTrim(req.query.clientSlug);
  const stateFilter = safeTrim(req.query.state);
  const startDate = safeTrim(req.query.startDate); // expected ISO
  const endDate = safeTrim(req.query.endDate);     // expected ISO

  try {
    const filters = { clientSlug, stateFilter, startDate, endDate };
    const { data: tickets, error: ticketsErr } = await listTicketsForAnalyticsSummary(req, filters);
    if (ticketsErr) {
      if (ticketsErr.code === "ROLE_SCOPE") return jsonError(res, ticketsErr.status || 403, ticketsErr.message);
      return jsonError(res, 500, ticketsErr.message);
    }

    const { data: sla, error: slaErr } = await listAllSlaRowsScoped(req);
    if (slaErr) return jsonError(res, 500, slaErr.message);

    const { data: fes, error: feErr } = await listAllFieldExecutivesScoped(req);
    if (feErr) return jsonError(res, 500, feErr.message);

    const { data: assignments, error: asErr } = await listAllAssignmentsScoped(req);
    if (asErr) return jsonError(res, 500, asErr.message);

    // Staff/admin users for Service Manager scorecards (assigned_by attribution)
    let staffUsers = [];
    try {
      const { data: usersRows, error: usersErr } = await listStaffUsersForAnalytics(req);
      if (!usersErr) staffUsers = usersRows || [];
    } catch {
      staffUsers = [];
    }

    logEvent("dataApi.analytics.summary", { tenantId: req.tenantId ?? null, ms: Date.now() - startedAt, tickets: (tickets || []).length });
    return jsonOk(res, {
      tickets: tickets || [],
      sla: sla || [],
      field_executives: fes || [],
      ticket_assignments: assignments || [],
      staff_users: staffUsers,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load analytics");
  }
});

/* ======================================================
   Super Admin helpers (read)
====================================================== */

router.get("/sla/tracked-count", async (req, res) => {
  const startedAt = Date.now();
  if (!req.isSuperAdmin) return jsonError(res, 403, "Forbidden");

  try {
    // Authoritative SQL: same source of truth as direct PostgreSQL probes.
    // `count` = SLA rows joined to a non-REJECTED ticket (dashboard tracked metric).
    // `totalSlaRows` = raw COUNT(*) FROM sla_tracking (must equal PG).
    const [aggRows, byStatusRows] = await Promise.all([
      prisma.$queryRawUnsafe(`
        SELECT
          COUNT(*)::int AS total_sla_rows,
          COUNT(*) FILTER (WHERE t.id IS NULL)::int AS orphan_sla_rows,
          COUNT(*) FILTER (WHERE t.status = 'REJECTED')::int AS rejected_sla_rows,
          COUNT(*) FILTER (
            WHERE t.id IS NOT NULL AND t.status IS DISTINCT FROM 'REJECTED'
          )::int AS tracked_count
        FROM sla_tracking s
        LEFT JOIN tickets t ON t.id = s.ticket_id
      `),
      prisma.$queryRawUnsafe(`
        SELECT COALESCE(t.status, '__ORPHAN__') AS status, COUNT(*)::int AS cnt
        FROM sla_tracking s
        LEFT JOIN tickets t ON t.id = s.ticket_id
        GROUP BY COALESCE(t.status, '__ORPHAN__')
        ORDER BY 1
      `),
    ]);
    const row = aggRows?.[0] || {};
    const count = Number(row.tracked_count || 0);
    /** @type {Record<string, number>} */
    const byStatus = {};
    for (const r of byStatusRows || []) {
      byStatus[String(r.status)] = Number(r.cnt || 0);
    }
    const payload = {
      count,
      totalSlaRows: Number(row.total_sla_rows || 0),
      orphanSlaRows: Number(row.orphan_sla_rows || 0),
      rejectedSlaRows: Number(row.rejected_sla_rows || 0),
      byStatus,
    };
    logEvent("dataApi.sla.trackedCount", { ms: Date.now() - startedAt, count, totalSlaRows: payload.totalSlaRows });
    return jsonOk(res, payload);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to compute SLA tracked count");
  }
});

router.get("/platform/overview", async (req, res) => {
  const startedAt = Date.now();
  if (!req.isSuperAdmin) return jsonError(res, 403, "Forbidden");

  try {
    const [usersRes, feRes, ticketsRes] = await Promise.all([
      countUsersGlobal(),
      countFieldExecutivesGlobal(),
      listTicketClientSlugsGlobal(),
    ]);
    if (usersRes.error) return jsonError(res, 500, usersRes.error.message);
    if (feRes.error) return jsonError(res, 500, feRes.error.message);
    if (ticketsRes.error) return jsonError(res, 500, ticketsRes.error.message);

    const distinctClients = new Set((ticketsRes.data ?? []).map((t) => t.client_slug).filter(Boolean)).size;
    const payload = {
      totalUsers: usersRes.count ?? 0,
      totalFEs: feRes.count ?? 0,
      distinctClients,
    };
    logEvent("dataApi.platform.overview", { ms: Date.now() - startedAt, ...payload });
    return jsonOk(res, payload);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to compute platform overview");
  }
});

export default router;

