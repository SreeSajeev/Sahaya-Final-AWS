/**
 * Pure tenant SLA calculation engine.
 * When business_hours_enabled is true, due dates skip non-working periods
 * in the tenant's configured IANA timezone (not server local time).
 */

import {
  DEFAULT_TENANT_TIMEZONE,
  getZonedParts,
  normalizeTimezone,
  zonedLocalToUtc,
} from "../utils/timezoneUtils.js";

export const SLA_STATUS = {
  ON_TRACK: "ON_TRACK",
  APPROACHING: "APPROACHING",
  BREACHED: "BREACHED",
  NA: "NA",
};

export const DEFAULT_ESCALATION_LEVELS = [
  { level: 1, percent: 50 },
  { level: 2, percent: 75 },
  { level: 3, percent: 100 },
  { level: 4, percent: 150 },
];

export const DEFAULT_TENANT_SLA = {
  responseMinutes: 4 * 60,
  resolutionMinutes: 48 * 60,
  escalationLevels: DEFAULT_ESCALATION_LEVELS,
  businessHoursEnabled: false,
  startTime: "09:00",
  endTime: "18:00",
  workingDays: [1, 2, 3, 4, 5],
  timezone: DEFAULT_TENANT_TIMEZONE,
};

/** @param {unknown} cfg */
export function normalizeBusinessHoursConfig(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {};
  const rawDays = c.workingDays ?? c.working_days;
  const workingDays = Array.isArray(rawDays)
    ? rawDays.map((d) => Number(d)).filter((d) => Number.isFinite(d) && d >= 0 && d <= 6)
    : [...DEFAULT_TENANT_SLA.workingDays];
  return {
    businessHoursEnabled: Boolean(c.businessHoursEnabled ?? c.business_hours_enabled),
    startTime: String(c.startTime ?? c.start_time ?? DEFAULT_TENANT_SLA.startTime).trim(),
    endTime: String(c.endTime ?? c.end_time ?? DEFAULT_TENANT_SLA.endTime).trim(),
    workingDays: workingDays.length > 0 ? workingDays : [...DEFAULT_TENANT_SLA.workingDays],
    timezone: normalizeTimezone(c.timezone ?? c.time_zone ?? DEFAULT_TENANT_SLA.timezone),
  };
}

function parseHHMM(timeStr) {
  const parts = String(timeStr || "09:00").trim().split(":");
  const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return h * 60 + m;
}

function isWorkingDay(dayOfWeek, workingDays) {
  return workingDays.includes(dayOfWeek);
}

function zonedDayStart(instant, timeZone, minutesFromMidnight) {
  const p = getZonedParts(instant, timeZone);
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return zonedLocalToUtc({ year: p.year, month: p.month, day: p.day, hour: h, minute: m, second: 0 }, timeZone);
}

function startOfNextCalendarDayInZone(from, timeZone) {
  const p = getZonedParts(from, timeZone);
  const next = new Date(p.year, p.month - 1, p.day);
  next.setDate(next.getDate() + 1);
  return zonedLocalToUtc(
    { year: next.getFullYear(), month: next.getMonth() + 1, day: next.getDate(), hour: 0, minute: 0, second: 0 },
    timeZone
  );
}

function startOfNextWorkingDay(from, bh) {
  let cursor = startOfNextCalendarDayInZone(from, bh.timezone);
  for (let guard = 0; guard < 366; guard += 1) {
    const p = getZonedParts(cursor, bh.timezone);
    if (isWorkingDay(p.dayOfWeek, bh.workingDays)) {
      return zonedDayStart(cursor, bh.timezone, parseHHMM(bh.startTime));
    }
    cursor = startOfNextCalendarDayInZone(cursor, bh.timezone);
  }
  return cursor;
}

/**
 * Move `from` to the next in-window business instant in tenant timezone.
 * @param {Date} from
 * @param {ReturnType<typeof normalizeBusinessHoursConfig>} bh
 */
export function alignToBusinessWindow(from, bh) {
  const startMin = parseHHMM(bh.startTime);
  const endMin = parseHHMM(bh.endTime);
  if (endMin <= startMin) return new Date(from);

  let cursor = new Date(from);
  for (let guard = 0; guard < 366; guard += 1) {
    const p = getZonedParts(cursor, bh.timezone);
    if (!isWorkingDay(p.dayOfWeek, bh.workingDays)) {
      cursor = startOfNextWorkingDay(cursor, bh);
      continue;
    }
    const dayStart = zonedDayStart(cursor, bh.timezone, startMin);
    const dayEnd = zonedDayStart(cursor, bh.timezone, endMin);
    if (cursor.getTime() < dayStart.getTime()) return dayStart;
    if (cursor.getTime() >= dayEnd.getTime()) {
      cursor = startOfNextWorkingDay(cursor, bh);
      continue;
    }
    return cursor;
  }
  return cursor;
}

/**
 * Add SLA minutes respecting tenant business hours + timezone when enabled.
 * @param {Date|string} from
 * @param {number} minutes
 * @param {unknown} rawCfg
 * @returns {Date|null}
 */
export function addBusinessMinutes(from, minutes, rawCfg) {
  const ms = Number(minutes);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const base = from instanceof Date ? from : new Date(from);
  if (Number.isNaN(base.getTime())) return null;

  const bh = normalizeBusinessHoursConfig(rawCfg);
  if (!bh.businessHoursEnabled) {
    return new Date(base.getTime() + ms * 60 * 1000);
  }

  const endMin = parseHHMM(bh.endTime);
  let remaining = ms;
  let cursor = alignToBusinessWindow(base, bh);

  for (let guard = 0; guard < 10000 && remaining > 0; guard += 1) {
    const p = getZonedParts(cursor, bh.timezone);
    if (!isWorkingDay(p.dayOfWeek, bh.workingDays)) {
      cursor = startOfNextWorkingDay(cursor, bh);
      continue;
    }
    const dayEnd = zonedDayStart(cursor, bh.timezone, endMin);
    const available = Math.max(0, (dayEnd.getTime() - cursor.getTime()) / 60000);
    if (available <= 0) {
      cursor = startOfNextWorkingDay(cursor, bh);
      continue;
    }
    if (remaining <= available) {
      return new Date(cursor.getTime() + remaining * 60000);
    }
    remaining -= available;
    cursor = startOfNextWorkingDay(cursor, bh);
  }
  return cursor;
}

/** @param {unknown} levels */
export function normalizeEscalationLevels(levels) {
  const raw = Array.isArray(levels) ? levels : DEFAULT_ESCALATION_LEVELS;
  const cleaned = [];
  for (const item of raw) {
    const percent = Number(item?.percent);
    if (!Number.isFinite(percent) || percent <= 0) continue;
    cleaned.push({
      level: cleaned.length + 1,
      percent: Math.round(percent),
    });
  }
  if (cleaned.length === 0) return [...DEFAULT_ESCALATION_LEVELS];
  return cleaned.slice(0, 5).map((x, i) => ({ level: i + 1, percent: x.percent }));
}

export function minutesToDueAt(openedAt, minutes) {
  const base = openedAt ? new Date(openedAt) : new Date();
  const ms = Number(minutes);
  if (!Number.isFinite(ms) || ms < 0 || Number.isNaN(base.getTime())) return null;
  return new Date(base.getTime() + ms * 60 * 1000);
}

/**
 * Build tenant SLA config object from a tenant_slas row (snake or camel).
 * @param {Record<string, unknown>|null|undefined} row
 */
export function tenantSlaRowToEngineConfig(row) {
  if (!row) return { ...DEFAULT_TENANT_SLA };
  return {
    responseMinutes: row.response_minutes ?? row.responseMinutes,
    resolutionMinutes: row.resolution_minutes ?? row.resolutionMinutes,
    escalationLevels: row.escalation_levels ?? row.escalationLevels,
    businessHoursEnabled: row.business_hours_enabled ?? row.businessHoursEnabled,
    startTime: row.start_time ?? row.startTime,
    endTime: row.end_time ?? row.endTime,
    workingDays: row.working_days ?? row.workingDays,
    timezone: row.timezone ?? row.time_zone,
  };
}

/**
 * Build immutable ticket SLA snapshot fields from tenant config + open time.
 */
export function buildTicketSlaSnapshot(tenantSla, openedAt = new Date()) {
  const raw = tenantSla || DEFAULT_TENANT_SLA;
  const responseMinutes = Math.max(
    1,
    Number(raw.responseMinutes ?? raw.response_minutes) || DEFAULT_TENANT_SLA.responseMinutes
  );
  const resolutionMinutes = Math.max(
    1,
    Number(raw.resolutionMinutes ?? raw.resolution_minutes) || DEFAULT_TENANT_SLA.resolutionMinutes
  );
  const opened = openedAt instanceof Date ? openedAt : new Date(openedAt);
  const engineCfg = normalizeBusinessHoursConfig(tenantSlaRowToEngineConfig(raw));
  const responseDue = addBusinessMinutes(opened, responseMinutes, engineCfg);
  const resolutionDue = addBusinessMinutes(opened, resolutionMinutes, engineCfg);
  return {
    response_sla_minutes: responseMinutes,
    resolution_sla_minutes: resolutionMinutes,
    response_due_at: responseDue?.toISOString() ?? null,
    resolution_due_at: resolutionDue?.toISOString() ?? null,
    escalation_level: null,
  };
}

export function formatDurationMinutes(totalMinutes) {
  if (totalMinutes == null || !Number.isFinite(Number(totalMinutes))) return "—";
  const abs = Math.abs(Math.round(Number(totalMinutes)));
  const days = Math.floor(abs / (60 * 24));
  const hours = Math.floor((abs % (60 * 24)) / 60);
  const mins = abs % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(" ");
}

/**
 * @param {{ dueAt: string|Date|null, totalMinutes: number|null, now?: Date, stoppedAt?: string|Date|null }} args
 * stoppedAt: when the clock stops (e.g. assigned for response, resolved for resolution)
 */
export function computePhaseSla({ dueAt, totalMinutes, now = new Date(), stoppedAt = null }) {
  if (!dueAt || totalMinutes == null || !Number.isFinite(Number(totalMinutes)) || Number(totalMinutes) <= 0) {
    return {
      status: SLA_STATUS.NA,
      remainingMinutes: null,
      elapsedMinutes: null,
      elapsedPercent: null,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      breached: false,
    };
  }
  const due = new Date(dueAt);
  const clock = stoppedAt ? new Date(stoppedAt) : now;
  const total = Number(totalMinutes);
  const remainingMs = due.getTime() - clock.getTime();
  const remainingMinutes = remainingMs / (60 * 1000);
  const elapsedMinutes = total - remainingMinutes;
  const elapsedPercent = Math.max(0, (elapsedMinutes / total) * 100);

  let status = SLA_STATUS.ON_TRACK;
  if (clock.getTime() > due.getTime()) {
    status = SLA_STATUS.BREACHED;
  } else if (remainingMinutes <= total * 0.2) {
    status = SLA_STATUS.APPROACHING;
  }

  return {
    status,
    remainingMinutes: Math.round(remainingMinutes),
    elapsedMinutes: Math.round(elapsedMinutes),
    elapsedPercent: Math.round(elapsedPercent * 10) / 10,
    dueAt: due.toISOString(),
    breached: status === SLA_STATUS.BREACHED,
    remainingLabel:
      status === SLA_STATUS.BREACHED
        ? `${formatDurationMinutes(remainingMinutes)} overdue`
        : `${formatDurationMinutes(remainingMinutes)} remaining`,
  };
}

/**
 * Escalation level from elapsed % of resolution SLA (highest matching threshold).
 * @param {number} elapsedPercent
 * @param {Array<{level:number,percent:number}>} levels
 */
export function computeEscalationLevel(elapsedPercent, levels) {
  const normalized = normalizeEscalationLevels(levels);
  let current = 0;
  for (const lvl of normalized) {
    if (elapsedPercent >= lvl.percent) current = lvl.level;
  }
  return current > 0 ? current : null;
}

/**
 * Overall ticket SLA view for APIs/UI.
 * Response clock stops at assignedAt (first FE assignment = operational response).
 * Resolution clock stops at resolvedAt.
 */
export function computeTicketSlaView(ticket, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const escalationLevels = normalizeEscalationLevels(
    opts.escalationLevels ?? ticket.escalation_levels ?? DEFAULT_ESCALATION_LEVELS
  );

  const assignedAt = opts.assignedAt ?? ticket.assigned_at ?? null;
  const resolvedAt = ticket.resolved_at ?? null;
  const isClosed =
    resolvedAt != null ||
    ["RESOLVED", "CLOSED", "REJECTED", "CANCELLED"].includes(String(ticket.status || "").toUpperCase());

  const response = computePhaseSla({
    dueAt: ticket.response_due_at,
    totalMinutes: ticket.response_sla_minutes,
    now,
    stoppedAt: assignedAt,
  });

  const resolution = computePhaseSla({
    dueAt: ticket.resolution_due_at,
    totalMinutes: ticket.resolution_sla_minutes,
    now,
    stoppedAt: isClosed ? resolvedAt || now : null,
  });

  const escalationLevel = computeEscalationLevel(resolution.elapsedPercent ?? 0, escalationLevels);

  let overallStatus = resolution.status !== SLA_STATUS.NA ? resolution.status : response.status;
  if (response.status === SLA_STATUS.BREACHED && overallStatus === SLA_STATUS.ON_TRACK) {
    overallStatus = SLA_STATUS.APPROACHING;
  }

  const responseTimeMinutes =
    assignedAt && (ticket.opened_at || ticket.created_at)
      ? Math.round(
          (new Date(assignedAt).getTime() - new Date(ticket.opened_at || ticket.created_at).getTime()) / 60000
        )
      : null;
  const resolutionTimeMinutes =
    resolvedAt && (ticket.opened_at || ticket.created_at)
      ? Math.round(
          (new Date(resolvedAt).getTime() - new Date(ticket.opened_at || ticket.created_at).getTime()) / 60000
        )
      : null;

  return {
    response_sla_minutes: ticket.response_sla_minutes ?? null,
    resolution_sla_minutes: ticket.resolution_sla_minutes ?? null,
    response_due_at: ticket.response_due_at ?? null,
    resolution_due_at: ticket.resolution_due_at ?? null,
    response,
    resolution,
    status: overallStatus,
    escalation_level: escalationLevel,
    escalation_label: escalationLevel ? `L${escalationLevel}` : "—",
    response_time_minutes: responseTimeMinutes,
    resolution_time_minutes: resolutionTimeMinutes,
    breached: response.breached || resolution.breached,
  };
}

export function statusDisplayLabel(status) {
  switch (status) {
    case SLA_STATUS.ON_TRACK:
      return "Healthy";
    case SLA_STATUS.APPROACHING:
      return "Approaching";
    case SLA_STATUS.BREACHED:
      return "Breached";
    default:
      return "—";
  }
}
