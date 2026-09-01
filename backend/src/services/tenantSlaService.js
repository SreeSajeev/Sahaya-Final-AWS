import { safeTrim } from "../utils/http.js";
import { insertAuditLog } from "./auditLogService.js";
import {
  buildTicketSlaSnapshot,
  computeTicketSlaView,
  DEFAULT_TENANT_SLA,
  normalizeEscalationLevels,
  tenantSlaRowToEngineConfig,
} from "./tenantSlaEngine.js";
import { normalizeTimezone } from "../utils/timezoneUtils.js";
import {
  ensureDefaultTenantSla,
  getTenantSlaByOrgId,
  updateTicketEscalationLevel,
  upsertTenantSlaRow,
} from "../repositories/tenantSlaRepository.js";

const RESPONSE_PRESETS = [4 * 60, 8 * 60, 12 * 60, 24 * 60, 48 * 60];
const RESOLUTION_PRESETS = [24 * 60, 48 * 60, 72 * 60, 5 * 24 * 60, 7 * 24 * 60];

function parseMinutes(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.round(n);
}

function validateTimeHHMM(raw) {
  const s = safeTrim(raw);
  if (!s) return null;
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return s;
}

/**
 * Resolve tenant org id for SLA config from request.
 */
export function resolveSlaOrgId(req, bodyOrgId = null) {
  if (req.isSuperAdmin && bodyOrgId) return String(bodyOrgId);
  return req.tenantId ?? null;
}

export async function getTenantSlaConfig(req, organisationId = null) {
  const orgId = organisationId || resolveSlaOrgId(req, null);
  if (!orgId) return { error: { status: 403, message: "Tenant context missing" } };
  if (!req.isSuperAdmin && req.tenantId && orgId !== req.tenantId) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  const ensured = await ensureDefaultTenantSla(orgId);
  if (ensured.error) return { error: { status: 500, message: ensured.error.message } };
  return { data: formatSlaConfig(ensured.data) };
}

function formatSlaConfig(row) {
  if (!row) return null;
  return {
    id: row.id,
    organisation_id: row.organisation_id,
    response_minutes: row.response_minutes,
    resolution_minutes: row.resolution_minutes,
    escalation_levels: normalizeEscalationLevels(row.escalation_levels),
    business_hours_enabled: Boolean(row.business_hours_enabled),
    start_time: row.start_time,
    end_time: row.end_time,
    working_days: Array.isArray(row.working_days) ? row.working_days : DEFAULT_TENANT_SLA.workingDays,
    timezone: row.timezone ?? DEFAULT_TENANT_SLA.timezone,
    created_at: row.created_at,
    updated_at: row.updated_at,
    presets: {
      response_minutes: RESPONSE_PRESETS,
      resolution_minutes: RESOLUTION_PRESETS,
    },
  };
}

export async function updateTenantSlaConfig(req, body) {
  const orgId = resolveSlaOrgId(req, safeTrim(body?.organisation_id));
  if (!orgId) {
    return {
      error: {
        status: req.isSuperAdmin ? 400 : 403,
        message: req.isSuperAdmin ? "organisation_id is required" : "Tenant context missing",
      },
    };
  }
  if (!req.isSuperAdmin && req.tenantId && orgId !== req.tenantId) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  const responseMinutes = parseMinutes(body?.response_minutes ?? body?.responseMinutes, DEFAULT_TENANT_SLA.responseMinutes);
  const resolutionMinutes = parseMinutes(
    body?.resolution_minutes ?? body?.resolutionMinutes,
    DEFAULT_TENANT_SLA.resolutionMinutes
  );
  if (responseMinutes > 60 * 24 * 30 || resolutionMinutes > 60 * 24 * 90) {
    return { error: { status: 400, message: "SLA duration is too large" } };
  }

  let escalationLevels = normalizeEscalationLevels(body?.escalation_levels ?? body?.escalationLevels);
  if (escalationLevels.length < 1) {
    return { error: { status: 400, message: "At least one escalation level is required" } };
  }
  if (escalationLevels.length > 5) {
    escalationLevels = escalationLevels.slice(0, 5);
  }

  const businessHoursEnabled = Boolean(body?.business_hours_enabled ?? body?.businessHoursEnabled);
  const startTime = validateTimeHHMM(body?.start_time ?? body?.startTime) || DEFAULT_TENANT_SLA.startTime;
  const endTime = validateTimeHHMM(body?.end_time ?? body?.endTime) || DEFAULT_TENANT_SLA.endTime;
  let workingDays = body?.working_days ?? body?.workingDays;
  if (!Array.isArray(workingDays) || workingDays.length === 0) {
    workingDays = DEFAULT_TENANT_SLA.workingDays;
  } else {
    workingDays = workingDays.map(Number).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6);
    if (workingDays.length === 0) workingDays = DEFAULT_TENANT_SLA.workingDays;
  }

  const { data, error } = await upsertTenantSlaRow(orgId, {
    response_minutes: responseMinutes,
    resolution_minutes: resolutionMinutes,
    escalation_levels: escalationLevels,
    business_hours_enabled: businessHoursEnabled,
    start_time: startTime,
    end_time: endTime,
    working_days: workingDays,
    timezone: normalizeTimezone(body?.timezone ?? body?.time_zone),
  });
  if (error) return { error: { status: 400, message: error.message } };

  void insertAuditLog({
    req,
    entity_type: "tenant_sla",
    entity_id: data.id,
    action: "tenant_sla_updated",
    organisation_id: orgId,
    metadata: {
      response_minutes: responseMinutes,
      resolution_minutes: resolutionMinutes,
      escalation_levels: escalationLevels,
      business_hours_enabled: businessHoursEnabled,
    },
  });

  return { data: formatSlaConfig(data) };
}

/**
 * Load config for snapshotting a new ticket (defaults if missing).
 */
export async function loadSlaSnapshotForOrg(organisationId) {
  if (!organisationId) {
    return buildTicketSlaSnapshot(DEFAULT_TENANT_SLA, new Date());
  }
  const { data } = await ensureDefaultTenantSla(organisationId);
  return buildTicketSlaSnapshot(data ? tenantSlaRowToEngineConfig(data) : DEFAULT_TENANT_SLA, new Date());
}

/**
 * Enrich a ticket row with live SLA view. Optionally persist escalation_level if changed.
 */
export async function enrichTicketWithSla(ticket, opts = {}) {
  if (!ticket) return ticket;
  const view = computeTicketSlaView(ticket, {
    assignedAt: opts.assignedAt ?? null,
    escalationLevels: opts.escalationLevels,
    now: opts.now,
  });
  const out = { ...ticket, sla: view };

  if (
    opts.persistEscalation &&
    ticket.id &&
    view.escalation_level != null &&
    Number(ticket.escalation_level) !== Number(view.escalation_level)
  ) {
    void updateTicketEscalationLevel(ticket.id, view.escalation_level);
    out.escalation_level = view.escalation_level;
  }

  return out;
}

export async function enrichTicketsWithSla(tickets, opts = {}) {
  if (!Array.isArray(tickets)) return [];
  const orgIds = [...new Set(tickets.map((t) => t.organisation_id).filter(Boolean))];
  /** @type {Map<string, unknown>} */
  const levelsByOrg = new Map();
  await Promise.all(
    orgIds.map(async (oid) => {
      const { data } = await getTenantSlaByOrgId(oid);
      levelsByOrg.set(oid, data?.escalation_levels);
    })
  );

  return Promise.all(
    tickets.map((t) =>
      enrichTicketWithSla(t, {
        ...opts,
        escalationLevels: levelsByOrg.get(t.organisation_id) || DEFAULT_TENANT_SLA.escalationLevels,
      })
    )
  );
}

export { RESPONSE_PRESETS, RESOLUTION_PRESETS, DEFAULT_TENANT_SLA };
