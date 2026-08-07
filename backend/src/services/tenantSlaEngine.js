/**
 * Pure tenant SLA calculation engine (elapsed wall-clock; business hours stored for future use).
 */

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
};

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
 * Build immutable ticket SLA snapshot fields from tenant config + open time.
 */
export function buildTicketSlaSnapshot(tenantSla, openedAt = new Date()) {
  const cfg = tenantSla || DEFAULT_TENANT_SLA;
  const responseMinutes = Math.max(1, Number(cfg.responseMinutes ?? cfg.response_minutes) || DEFAULT_TENANT_SLA.responseMinutes);
  const resolutionMinutes = Math.max(
    1,
    Number(cfg.resolutionMinutes ?? cfg.resolution_minutes) || DEFAULT_TENANT_SLA.resolutionMinutes
  );
  const opened = openedAt instanceof Date ? openedAt : new Date(openedAt);
  return {
    response_sla_minutes: responseMinutes,
    resolution_sla_minutes: resolutionMinutes,
    response_due_at: minutesToDueAt(opened, responseMinutes)?.toISOString() ?? null,
    resolution_due_at: minutesToDueAt(opened, resolutionMinutes)?.toISOString() ?? null,
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
  // Elapsed from (due - total) = open; approximate using total - remaining
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

  const escalationLevel = computeEscalationLevel(
    resolution.elapsedPercent ?? 0,
    escalationLevels
  );

  // Prefer resolution status for list "Status"; if NA, fall back to response.
  let overallStatus = resolution.status !== SLA_STATUS.NA ? resolution.status : response.status;
  if (response.status === SLA_STATUS.BREACHED && overallStatus === SLA_STATUS.ON_TRACK) {
    overallStatus = SLA_STATUS.APPROACHING;
  }

  const responseTimeMinutes =
    assignedAt && (ticket.opened_at || ticket.created_at)
      ? Math.round(
          (new Date(assignedAt).getTime() - new Date(ticket.opened_at || ticket.created_at).getTime()) /
            60000
        )
      : null;
  const resolutionTimeMinutes =
    resolvedAt && (ticket.opened_at || ticket.created_at)
      ? Math.round(
          (new Date(resolvedAt).getTime() - new Date(ticket.opened_at || ticket.created_at).getTime()) /
            60000
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
