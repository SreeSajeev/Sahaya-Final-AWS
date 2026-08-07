/**
 * Enterprise operations analytics derived from Sahaya tickets, assignments, SLA, and FEs.
 * Pure functions — no network I/O. Used by Analytics page (and metrics CSV export).
 */

import { formatResolutionCategoryDisplay } from "@/lib/resolutionDisplay";

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const OPEN_PIPELINE = new Set([
  "OPEN",
  "NEEDS_REVIEW",
  "ASSIGNED",
  "EN_ROUTE",
  "ON_SITE",
  "RESOLVED_PENDING_VERIFICATION",
  "REOPENED",
  "FE_ATTEMPT_FAILED",
]);

const ACTIVE_FE_STATUSES = new Set([
  "ASSIGNED",
  "EN_ROUTE",
  "ON_SITE",
  "RESOLVED_PENDING_VERIFICATION",
  "REOPENED",
  "FE_ATTEMPT_FAILED",
]);

export type AnalyticsTicket = Record<string, unknown>;
export type AnalyticsSla = Record<string, unknown>;
export type AnalyticsAssignment = Record<string, unknown>;
export type AnalyticsFe = Record<string, unknown>;
export type AnalyticsStaffUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

export type FeScorecard = {
  feId: string;
  name: string;
  active: boolean;
  totalAssigned: number;
  activeTickets: number;
  onSiteTickets: number;
  resolvedTickets: number;
  pendingVerification: number;
  closedTickets: number;
  /** Current status === REOPENED (rarely written by backend — treat as informational). */
  reopenedTickets: number;
  /** Tickets with >1 assignment row (reassignment / multi-attempt). Alias: repeatAssignments. */
  escalatedTickets: number;
  /** Same as escalatedTickets — preferred display label. */
  repeatAssignments: number;
  failedAttempts: number;
  successAttempts: number;
  slaCompliancePct: number;
  avgResolutionHours: number | null;
  /** assigned_at → ended_at (or resolved_at) handle time */
  avgHandleHours: number | null;
  verificationSuccessPct: number | null;
  productivityPct: number;
  currentWorkload: number;
  closedToday: number;
  closedThisWeek: number;
  closedThisMonth: number;
};

/** Org-level team ops (accurate without manager attribution). */
export type TeamOperationsSummary = {
  pendingApproval: number;
  pendingVerification: number;
  teamWorkload: number;
  teamProductivityPct: number;
  avgAssignmentHours: number | null;
  avgClosureHours: number | null;
  teamSlaCompliancePct: number;
  openPipeline: number;
  closedTickets: number;
  failedAttempts: number;
  /** True when enough assignment rows have assigned_by to show per-manager tables. */
  managerAttributionAvailable: boolean;
  assignedByCoveragePct: number;
  attributionNote: string;
};

export type ExecutiveSummary = {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  pendingVerification: number;
  pendingAssignment: number;
  awaitingApproval: number;
  ticketsRequiringAttention: number;
  slaCompliancePct: number;
  avgResolutionHours: number | null;
  agingSummaryLabel: string;
  operationalHealthScore: number;
};

export type ServiceManagerScorecard = {
  userId: string;
  name: string;
  email: string;
  ticketsAssigned: number;
  uniqueTicketsAssigned: number;
  pendingVerificationQueue: number;
  closedTickets: number;
  reassignments: number;
  slaCompliancePct: number;
  avgAssignmentHours: number | null;
  avgClosureHours: number | null;
  teamActiveWorkload: number;
  teamProductivityPct: number;
  failedTeamAttempts: number;
  openAssignedToTeam: number;
};

export type OperationalHealth = {
  pendingAssignment: number;
  awaitingApproval: number;
  pendingVerification: number;
  onSite: number;
  enRoute: number;
  reopened: number;
  attemptFailed: number;
  agingBuckets: { label: string; count: number }[];
  bottleneckStatuses: { status: string; count: number; avgAgeHours: number }[];
  categoryAvgResolution: { category: string; avgHours: number; count: number }[];
  locationVolume: { location: string; count: number; openCount: number }[];
  repeatComplaints: { key: string; count: number; label: string }[];
  dailyClosures: { date: string; created: number; closed: number }[];
  resolutionCategoryBreakdown: { name: string; value: number }[];
  otherResolutions: { ticketNumber: string; details: string; resolvedAt: string }[];
  workloadDistribution: { name: string; active: number; capacityHint: string }[];
  attentionTickets: {
    ticketNumber: string;
    status: string;
    ageHours: number;
    reason: string;
    location: string;
  }[];
  orgPendingAssignment: number;
  orgSlaCompliancePct: number;
  teamUtilizationPct: number;
  /** Count of tickets with any SLA phase breached (non-REJECTED). */
  slaBreachTickets: number;
  /** 0–100 composite from SLA, aging, queues, utilization (available data only). */
  operationalHealthScore: number;
  /** Hours opened → first assignment (org average). */
  avgAssignmentHours: number | null;
  /** Hours assignment started → SUCCESS ended / resolve (org average). */
  avgVerificationWaitHours: number | null;
};

function hoursBetween(start: unknown, end: unknown): number | null {
  if (!start || !end) return null;
  const a = new Date(String(start)).getTime();
  const b = new Date(String(end)).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return (b - a) / MS_PER_HOUR;
}

function isResolved(status: string): boolean {
  return status === "RESOLVED";
}

function isOpenPipeline(status: string): boolean {
  return OPEN_PIPELINE.has(status);
}

function ticketAgeHours(ticket: AnalyticsTicket, nowMs: number): number {
  const opened = ticket.opened_at ?? ticket.created_at;
  if (!opened) return 0;
  const t = new Date(String(opened)).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (nowMs - t) / MS_PER_HOUR);
}

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function inSameCalendarDay(iso: unknown, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

function inLastNDays(iso: unknown, ref: Date, days: number): boolean {
  if (!iso) return false;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = ref.getTime() - days * MS_PER_DAY;
  return d.getTime() >= cutoff && d.getTime() <= ref.getTime();
}

function inSameCalendarMonth(iso: unknown, ref: Date): boolean {
  if (!iso) return false;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function buildTicketMaps(
  tickets: AnalyticsTicket[],
  assignments: AnalyticsAssignment[],
  sla: AnalyticsSla[]
) {
  const ticketById = new Map<string, AnalyticsTicket>();
  for (const t of tickets) ticketById.set(String(t.id), t);

  const assignmentsByTicket = new Map<string, AnalyticsAssignment[]>();
  const assignmentsByFe = new Map<string, AnalyticsAssignment[]>();
  const assignmentsByStaff = new Map<string, AnalyticsAssignment[]>();

  for (const a of assignments) {
    const tid = String(a.ticket_id ?? "");
    const feId = String(a.fe_id ?? "");
    const staffId = a.assigned_by != null ? String(a.assigned_by) : "";
    if (tid) {
      const list = assignmentsByTicket.get(tid) ?? [];
      list.push(a);
      assignmentsByTicket.set(tid, list);
    }
    if (feId) {
      const list = assignmentsByFe.get(feId) ?? [];
      list.push(a);
      assignmentsByFe.set(feId, list);
    }
    if (staffId) {
      const list = assignmentsByStaff.get(staffId) ?? [];
      list.push(a);
      assignmentsByStaff.set(staffId, list);
    }
  }

  for (const [, list] of assignmentsByTicket) {
    list.sort(
      (x, y) =>
        new Date(String(y.assigned_at || 0)).getTime() -
        new Date(String(x.assigned_at || 0)).getTime()
    );
  }

  const slaByTicket = new Map<string, AnalyticsSla>();
  for (const s of sla) {
    const tid = String(s.ticket_id ?? "");
    if (tid) slaByTicket.set(tid, s);
  }

  const currentFeByTicket = new Map<string, string>();
  for (const t of tickets) {
    const tid = String(t.id);
    const aid = t.current_assignment_id != null ? String(t.current_assignment_id) : "";
    if (aid) {
      const current = (assignmentsByTicket.get(tid) ?? []).find((a) => String(a.id) === aid);
      if (current?.fe_id) currentFeByTicket.set(tid, String(current.fe_id));
    }
    if (!currentFeByTicket.has(tid)) {
      const latest = (assignmentsByTicket.get(tid) ?? [])[0];
      if (latest?.fe_id) currentFeByTicket.set(tid, String(latest.fe_id));
    }
  }

  return {
    ticketById,
    assignmentsByTicket,
    assignmentsByFe,
    assignmentsByStaff,
    slaByTicket,
    currentFeByTicket,
  };
}

function slaBreached(s: AnalyticsSla | undefined): boolean {
  if (!s) return false;
  return !!(s.assignment_breached || s.onsite_breached || s.resolution_breached);
}

/** Prefer resolved_at only — avoid updated_at inflation when resolved_at missing. */
function resolutionHours(ticket: AnalyticsTicket): number | null {
  if (String(ticket.status) !== "RESOLVED") return null;
  if (!ticket.resolved_at) return null;
  return hoursBetween(ticket.opened_at ?? ticket.created_at, ticket.resolved_at);
}

export function getAssignedByCoverage(assignments: AnalyticsAssignment[]): {
  withAssignedBy: number;
  total: number;
  pct: number;
} {
  const total = assignments.length;
  const withAssignedBy = assignments.filter(
    (a) => a.assigned_by != null && String(a.assigned_by).trim() !== ""
  ).length;
  return {
    withAssignedBy,
    total,
    pct: total > 0 ? Math.round((withAssignedBy / total) * 100) : 0,
  };
}

/**
 * Org-level service-team metrics. Accurate without assigned_by.
 * Per-manager scorecards remain available only when attribution coverage is sufficient.
 */
export function computeTeamOperationsSummary(
  tickets: AnalyticsTicket[],
  assignments: AnalyticsAssignment[],
  sla: AnalyticsSla[]
): TeamOperationsSummary {
  const coverage = getAssignedByCoverage(assignments);
  const managerAttributionAvailable = coverage.total > 0 && coverage.pct >= 25;

  let pendingApproval = 0;
  let pendingVerification = 0;
  let teamWorkload = 0;
  let openPipeline = 0;
  let closedTickets = 0;
  let slaOk = 0;
  let slaTotal = 0;
  const assignHours: number[] = [];
  const closeHours: number[] = [];
  let failedAttempts = 0;

  const maps = buildTicketMaps(tickets, assignments, sla);

  for (const a of assignments) {
    if (a.outcome === "FAILED") failedAttempts += 1;
  }

  for (const t of tickets) {
    const status = String(t.status ?? "");
    const tid = String(t.id);
    if (status === "NEEDS_REVIEW") pendingApproval += 1;
    if (status === "RESOLVED_PENDING_VERIFICATION") pendingVerification += 1;
    if (isOpenPipeline(status)) {
      openPipeline += 1;
      if (t.current_assignment_id && ACTIVE_FE_STATUSES.has(status)) teamWorkload += 1;
    }
    if (isResolved(status)) {
      closedTickets += 1;
      const ch = resolutionHours(t);
      if (ch != null) closeHours.push(ch);
    }

    const s = maps.slaByTicket.get(tid);
    if (s && status !== "REJECTED") {
      slaTotal += 1;
      if (!slaBreached(s)) slaOk += 1;
    }

    const assigns = maps.assignmentsByTicket.get(tid) ?? [];
    if (assigns.length > 0) {
      const first = [...assigns].sort(
        (a, b) =>
          new Date(String(a.assigned_at || 0)).getTime() -
          new Date(String(b.assigned_at || 0)).getTime()
      )[0];
      const ah = hoursBetween(t.opened_at ?? t.created_at, first?.assigned_at);
      if (ah != null) assignHours.push(ah);
    }
  }

  const teamProductivityPct =
    tickets.length > 0 ? Math.round((closedTickets / tickets.length) * 100) : 0;

  return {
    pendingApproval,
    pendingVerification,
    teamWorkload,
    teamProductivityPct,
    avgAssignmentHours:
      assignHours.length > 0
        ? Math.round((assignHours.reduce((s, h) => s + h, 0) / assignHours.length) * 10) / 10
        : null,
    avgClosureHours:
      closeHours.length > 0
        ? Math.round((closeHours.reduce((s, h) => s + h, 0) / closeHours.length) * 10) / 10
        : null,
    teamSlaCompliancePct: slaTotal > 0 ? Math.round((slaOk / slaTotal) * 100) : 100,
    openPipeline,
    closedTickets,
    failedAttempts,
    managerAttributionAvailable,
    assignedByCoveragePct: coverage.pct,
    attributionNote: managerAttributionAvailable
      ? `Manager attribution available on ${coverage.pct}% of assignment rows (assigned_by).`
      : `Per-manager scorecards are hidden: only ${coverage.pct}% of assignments have assigned_by populated. Showing org-level team metrics instead. Writing assigned_by on assign/reassign unlocks manager leaderboards.`,
  };
}

/** Composite 0–100 health score from available operational signals. */
export function computeOperationalHealthScore(input: {
  slaCompliancePct: number;
  pendingAssignment: number;
  pendingVerification: number;
  agingOver7Days: number;
  openPipeline: number;
  teamUtilizationPct: number;
}): number {
  const {
    slaCompliancePct,
    pendingAssignment,
    pendingVerification,
    agingOver7Days,
    openPipeline,
    teamUtilizationPct,
  } = input;

  const agingPressure =
    openPipeline > 0 ? Math.min(100, Math.round((agingOver7Days / openPipeline) * 100)) : 0;
  const queuePressure = Math.min(
    100,
    pendingAssignment * 4 + pendingVerification * 3
  );

  // Weight: SLA 40%, low aging pressure 25%, low queues 20%, utilization 15% (capped usefulness)
  const utilScore = Math.min(100, Math.max(0, 100 - Math.abs(teamUtilizationPct - 70)));
  const score =
    slaCompliancePct * 0.4 +
    (100 - agingPressure) * 0.25 +
    (100 - Math.min(100, queuePressure)) * 0.2 +
    utilScore * 0.15;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeExecutiveSummary(
  tickets: AnalyticsTicket[],
  assignments: AnalyticsAssignment[],
  sla: AnalyticsSla[],
  fieldExecutives: AnalyticsFe[],
  now: Date = new Date()
): ExecutiveSummary {
  const ops = computeOperationalHealth(tickets, assignments, sla, fieldExecutives, now);
  const openTickets = tickets.filter((t) => isOpenPipeline(String(t.status))).length;
  const closedTickets = tickets.filter((t) => String(t.status) === "RESOLVED").length;
  const hoursList = tickets
    .map((t) => resolutionHours(t))
    .filter((h): h is number => h != null);
  const avgResolutionHours =
    hoursList.length > 0
      ? Math.round((hoursList.reduce((s, h) => s + h, 0) / hoursList.length) * 10) / 10
      : null;

  const agingParts = ops.agingBuckets
    .filter((b) => b.count > 0)
    .map((b) => `${b.label}: ${b.count}`);
  const agingSummaryLabel =
    agingParts.length > 0 ? agingParts.join(" · ") : "No open tickets aging";

  return {
    totalTickets: tickets.length,
    openTickets,
    closedTickets,
    pendingVerification: ops.pendingVerification,
    pendingAssignment: ops.pendingAssignment,
    awaitingApproval: ops.awaitingApproval,
    ticketsRequiringAttention: ops.attentionTickets.length,
    slaCompliancePct: ops.orgSlaCompliancePct,
    avgResolutionHours,
    agingSummaryLabel,
    operationalHealthScore: ops.operationalHealthScore,
  };
}

/**
 * Build per–Field Executive scorecards from analytics payload.
 */
export function computeFeScorecards(
  tickets: AnalyticsTicket[],
  assignments: AnalyticsAssignment[],
  sla: AnalyticsSla[],
  fieldExecutives: AnalyticsFe[],
  now: Date = new Date()
): FeScorecard[] {
  const maps = buildTicketMaps(tickets, assignments, sla);

  return fieldExecutives
    .map((fe) => {
      const feId = String(fe.id);
      const feAssignments = maps.assignmentsByFe.get(feId) ?? [];
      const ticketIds = new Set(feAssignments.map((a) => String(a.ticket_id)));

      const closedTicketIdSet = new Set<string>();
      for (const a of feAssignments) {
        const t = maps.ticketById.get(String(a.ticket_id));
        if (!t || String(t.status) !== "RESOLVED") continue;
        if (a.outcome === "SUCCESS" || String(t.current_assignment_id) === String(a.id)) {
          closedTicketIdSet.add(String(a.ticket_id));
        }
      }

      let activeTickets = 0;
      let onSiteTickets = 0;
      let pendingVerification = 0;
      let reopenedTickets = 0;
      let escalatedTickets = 0;
      let slaOk = 0;
      let slaTotal = 0;
      const resolutionHoursList: number[] = [];
      const handleHoursList: number[] = [];
      let verificationEligible = 0;
      let verificationSuccess = 0;
      let closedToday = 0;
      let closedThisWeek = 0;
      let closedThisMonth = 0;

      for (const tid of ticketIds) {
        const t = maps.ticketById.get(tid);
        if (!t) continue;
        const status = String(t.status ?? "");
        const isCurrent = maps.currentFeByTicket.get(tid) === feId;

        if ((maps.assignmentsByTicket.get(tid)?.length ?? 0) > 1) escalatedTickets += 1;
        if (status === "REOPENED") reopenedTickets += 1;

        if (isCurrent && ACTIVE_FE_STATUSES.has(status)) {
          activeTickets += 1;
          if (status === "ON_SITE") onSiteTickets += 1;
          if (status === "RESOLVED_PENDING_VERIFICATION") {
            pendingVerification += 1;
            verificationEligible += 1;
          }
        }

        if (closedTicketIdSet.has(tid)) {
          const rh = resolutionHours(t);
          if (rh != null) resolutionHoursList.push(rh);
          const closedAt = t.resolved_at;
          if (closedAt && inSameCalendarDay(closedAt, now)) closedToday += 1;
          if (closedAt && inLastNDays(closedAt, now, 7)) closedThisWeek += 1;
          if (closedAt && inSameCalendarMonth(closedAt, now)) closedThisMonth += 1;
          verificationEligible += 1;
          verificationSuccess += 1;
        }

        if (closedTicketIdSet.has(tid) || isCurrent) {
          const s = maps.slaByTicket.get(tid);
          if (s) {
            slaTotal += 1;
            if (!slaBreached(s)) slaOk += 1;
          }
        }
      }

      for (const a of feAssignments) {
        if (a.outcome === "SUCCESS" || a.ended_at) {
          const h = hoursBetween(
            a.assigned_at,
            a.ended_at ?? maps.ticketById.get(String(a.ticket_id))?.resolved_at
          );
          if (h != null) handleHoursList.push(h);
        }
      }

      const failedAttempts = feAssignments.filter((a) => a.outcome === "FAILED").length;
      const successAttempts = feAssignments.filter((a) => a.outcome === "SUCCESS").length;
      const closedTickets = closedTicketIdSet.size;
      const totalAssigned = ticketIds.size;
      const productivityPct =
        totalAssigned > 0 ? Math.round((closedTickets / totalAssigned) * 100) : 0;
      const avgResolutionHours =
        resolutionHoursList.length > 0
          ? Math.round(
              (resolutionHoursList.reduce((s, h) => s + h, 0) / resolutionHoursList.length) * 10
            ) / 10
          : null;
      const avgHandleHours =
        handleHoursList.length > 0
          ? Math.round(
              (handleHoursList.reduce((s, h) => s + h, 0) / handleHoursList.length) * 10
            ) / 10
          : null;
      const verificationSuccessPct =
        verificationEligible > 0
          ? Math.round((verificationSuccess / verificationEligible) * 100)
          : null;

      return {
        feId,
        name: String(fe.name ?? "Unknown"),
        active: fe.active !== false,
        totalAssigned,
        activeTickets,
        onSiteTickets,
        resolvedTickets: closedTickets,
        pendingVerification,
        closedTickets,
        reopenedTickets,
        escalatedTickets,
        repeatAssignments: escalatedTickets,
        failedAttempts,
        successAttempts,
        slaCompliancePct: slaTotal > 0 ? Math.round((slaOk / slaTotal) * 100) : 100,
        avgResolutionHours,
        avgHandleHours,
        verificationSuccessPct,
        productivityPct,
        currentWorkload: activeTickets,
        closedToday,
        closedThisWeek,
        closedThisMonth,
      };
    })
    .filter((row) => row.totalAssigned > 0 || row.active)
    .sort((a, b) => b.closedThisWeek - a.closedThisWeek || b.productivityPct - a.productivityPct);
}

/**
 * Build per–Service Manager (STAFF) scorecards using ticket_assignments.assigned_by.
 */
export function computeServiceManagerScorecards(
  tickets: AnalyticsTicket[],
  assignments: AnalyticsAssignment[],
  sla: AnalyticsSla[],
  staffUsers: AnalyticsStaffUser[]
): ServiceManagerScorecard[] {
  const maps = buildTicketMaps(tickets, assignments, sla);
  const staffById = new Map(staffUsers.map((u) => [String(u.id), u]));

  // Include any assigned_by ids even if not in staffUsers list
  const allStaffIds = new Set<string>([
    ...staffUsers.filter((u) => u.role === "STAFF" || u.role === "ADMIN").map((u) => String(u.id)),
    ...assignments
      .map((a) => (a.assigned_by != null ? String(a.assigned_by) : ""))
      .filter(Boolean),
  ]);

  const rows: ServiceManagerScorecard[] = [];

  for (const userId of allStaffIds) {
    const user = staffById.get(userId);
    const smAssignments = maps.assignmentsByStaff.get(userId) ?? [];
    if (smAssignments.length === 0 && user?.role !== "STAFF" && user?.role !== "ADMIN") continue;
    if (smAssignments.length === 0) continue;

    const uniqueTicketIds = new Set(smAssignments.map((a) => String(a.ticket_id)));
    let pendingVerificationQueue = 0;
    let closedTickets = 0;
    let reassignments = 0;
    let slaOk = 0;
    let slaTotal = 0;
    const assignmentHours: number[] = [];
    const closureHours: number[] = [];
    let teamActiveWorkload = 0;
    let teamClosed = 0;
    let teamAssigned = 0;
    let failedTeamAttempts = 0;
    let openAssignedToTeam = 0;
    const teamFeIds = new Set<string>();

    // Reassignments: tickets with >1 assignment where this SM made at least one
    for (const tid of uniqueTicketIds) {
      const allAssigns = maps.assignmentsByTicket.get(tid) ?? [];
      if (allAssigns.length > 1) reassignments += 1;

      const t = maps.ticketById.get(tid);
      if (!t) continue;
      const status = String(t.status ?? "");

      if (status === "RESOLVED_PENDING_VERIFICATION") pendingVerificationQueue += 1;
      if (isResolved(status)) {
        closedTickets += 1;
        const ch = resolutionHours(t);
        if (ch != null) closureHours.push(ch);
      }
      if (isOpenPipeline(status)) openAssignedToTeam += 1;

      const s = maps.slaByTicket.get(tid);
      if (s) {
        slaTotal += 1;
        if (!slaBreached(s)) slaOk += 1;
      }

      const firstBySm = [...allAssigns]
        .filter((a) => String(a.assigned_by) === userId)
        .sort(
          (a, b) =>
            new Date(String(a.assigned_at || 0)).getTime() -
            new Date(String(b.assigned_at || 0)).getTime()
        )[0];
      if (firstBySm) {
        const ah = hoursBetween(t.opened_at ?? t.created_at, firstBySm.assigned_at);
        if (ah != null) assignmentHours.push(ah);
      }

      for (const a of allAssigns) {
        if (a.fe_id) teamFeIds.add(String(a.fe_id));
        if (a.outcome === "FAILED") failedTeamAttempts += 1;
      }

      const currentFe = maps.currentFeByTicket.get(tid);
      if (currentFe && ACTIVE_FE_STATUSES.has(status)) teamActiveWorkload += 1;
      teamAssigned += 1;
      if (isResolved(status)) teamClosed += 1;
    }

    const name = user?.name?.trim() || user?.email?.trim() || `Manager ${userId.slice(0, 8)}`;

    rows.push({
      userId,
      name,
      email: user?.email ?? "",
      ticketsAssigned: smAssignments.length,
      uniqueTicketsAssigned: uniqueTicketIds.size,
      pendingVerificationQueue,
      closedTickets,
      reassignments,
      slaCompliancePct: slaTotal > 0 ? Math.round((slaOk / slaTotal) * 100) : 100,
      avgAssignmentHours:
        assignmentHours.length > 0
          ? Math.round(
              (assignmentHours.reduce((s, h) => s + h, 0) / assignmentHours.length) * 10
            ) / 10
          : null,
      avgClosureHours:
        closureHours.length > 0
          ? Math.round((closureHours.reduce((s, h) => s + h, 0) / closureHours.length) * 10) / 10
          : null,
      teamActiveWorkload,
      teamProductivityPct:
        teamAssigned > 0 ? Math.round((teamClosed / teamAssigned) * 100) : 0,
      failedTeamAttempts,
      openAssignedToTeam,
    });
  }

  return rows.sort(
    (a, b) => b.uniqueTicketsAssigned - a.uniqueTicketsAssigned || b.closedTickets - a.closedTickets
  );
}

/**
 * Org-level operational intelligence (aging, bottlenecks, trends, attention list).
 */
export function computeOperationalHealth(
  tickets: AnalyticsTicket[],
  assignments: AnalyticsAssignment[],
  sla: AnalyticsSla[],
  fieldExecutives: AnalyticsFe[],
  now: Date = new Date()
): OperationalHealth {
  const maps = buildTicketMaps(tickets, assignments, sla);
  const nowMs = now.getTime();

  let pendingAssignment = 0;
  let awaitingApproval = 0;
  let pendingVerification = 0;
  let onSite = 0;
  let enRoute = 0;
  let reopened = 0;
  let attemptFailed = 0;

  const agingBuckets = [
    { label: "0–1 day", count: 0 },
    { label: "1–3 days", count: 0 },
    { label: "3–7 days", count: 0 },
    { label: "7+ days", count: 0 },
  ];

  const statusAgeSum: Record<string, { count: number; ageSum: number }> = {};
  const categoryRes: Record<string, number[]> = {};
  const locationCounts: Record<string, { count: number; openCount: number }> = {};
  const repeatKeys: Record<string, { count: number; label: string }> = {};

  const attentionTickets: OperationalHealth["attentionTickets"] = [];

  let slaOk = 0;
  let slaTotal = 0;

  for (const t of tickets) {
    const status = String(t.status ?? "");
    const ageH = ticketAgeHours(t, nowMs);
    const ageDays = ageH / 24;
    const location = String(t.resolution_location_name ?? t.location ?? "Unknown").trim() || "Unknown";
    const category = String(t.category ?? "Uncategorized").trim() || "Uncategorized";

    if (
      (status === "OPEN" || status === "NEEDS_REVIEW") &&
      !t.current_assignment_id
    ) {
      pendingAssignment += 1;
    }
    if (status === "NEEDS_REVIEW") awaitingApproval += 1;
    if (status === "RESOLVED_PENDING_VERIFICATION") pendingVerification += 1;
    if (status === "ON_SITE") onSite += 1;
    if (status === "EN_ROUTE") enRoute += 1;
    if (status === "REOPENED") reopened += 1;
    if (status === "FE_ATTEMPT_FAILED") attemptFailed += 1;

    if (isOpenPipeline(status)) {
      if (ageDays < 1) agingBuckets[0].count += 1;
      else if (ageDays < 3) agingBuckets[1].count += 1;
      else if (ageDays < 7) agingBuckets[2].count += 1;
      else agingBuckets[3].count += 1;

      if (!statusAgeSum[status]) statusAgeSum[status] = { count: 0, ageSum: 0 };
      statusAgeSum[status].count += 1;
      statusAgeSum[status].ageSum += ageH;
    }

    const rh = resolutionHours(t);
    if (rh != null) {
      if (!categoryRes[category]) categoryRes[category] = [];
      categoryRes[category].push(rh);
    }

    if (!locationCounts[location]) locationCounts[location] = { count: 0, openCount: 0 };
    locationCounts[location].count += 1;
    if (isOpenPipeline(status)) locationCounts[location].openCount += 1;

    // Repeat complaints: same vehicle or complaint_id appearing more than once
    const vehicle = String(t.vehicle_number ?? "").trim();
    const complaintId = String(t.complaint_id ?? "").trim();
    const repeatKey = vehicle
      ? `vehicle:${vehicle.toUpperCase()}`
      : complaintId
        ? `complaint:${complaintId}`
        : "";
    if (repeatKey) {
      if (!repeatKeys[repeatKey]) {
        repeatKeys[repeatKey] = {
          count: 0,
          label: vehicle ? `Vehicle ${vehicle}` : `Complaint ${complaintId}`,
        };
      }
      repeatKeys[repeatKey].count += 1;
    }

    const s = maps.slaByTicket.get(String(t.id));
    if (s && status !== "REJECTED") {
      slaTotal += 1;
      if (!slaBreached(s)) slaOk += 1;
    }

    // Attention: aging open, breached SLA, pending verification > 24h, attempt failed
    if (isOpenPipeline(status)) {
      const reasons: string[] = [];
      if (slaBreached(s)) reasons.push("SLA breached");
      if (ageDays >= 3) reasons.push(`Aging ${Math.round(ageDays)}d`);
      if (status === "RESOLVED_PENDING_VERIFICATION" && ageH >= 24) {
        reasons.push("Verification backlog");
      }
      if (status === "FE_ATTEMPT_FAILED") reasons.push("Attempt failed");
      if (status === "REOPENED") reasons.push("Reopened");
      if (!t.current_assignment_id && (status === "OPEN" || status === "NEEDS_REVIEW")) {
        reasons.push("Unassigned");
      }
      if (reasons.length > 0) {
        attentionTickets.push({
          ticketNumber: String(t.ticket_number ?? t.id),
          status,
          ageHours: Math.round(ageH * 10) / 10,
          reason: reasons.join(" · "),
          location,
        });
      }
    }
  }

  attentionTickets.sort((a, b) => b.ageHours - a.ageHours);

  const bottleneckStatuses = Object.entries(statusAgeSum)
    .map(([status, v]) => ({
      status,
      count: v.count,
      avgAgeHours: Math.round((v.ageSum / v.count) * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count || b.avgAgeHours - a.avgAgeHours);

  const categoryAvgResolution = Object.entries(categoryRes)
    .map(([category, hours]) => ({
      category,
      count: hours.length,
      avgHours: Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10,
    }))
    .sort((a, b) => b.avgHours - a.avgHours)
    .slice(0, 10);

  const locationVolume = Object.entries(locationCounts)
    .map(([location, v]) => ({ location, count: v.count, openCount: v.openCount }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const repeatComplaints = Object.values(repeatKeys)
    .filter((r) => r.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((r) => ({ key: r.label, count: r.count, label: r.label }));

  // Daily created/closed last 7 days (local calendar approximation; Analytics charts use IST separately)
  const dailyClosures: OperationalHealth["dailyClosures"] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(startOfDayMs(now) - i * MS_PER_DAY);
    const next = new Date(day.getTime() + MS_PER_DAY);
    let created = 0;
    let closed = 0;
    for (const t of tickets) {
      const createdAt = t.created_at ?? t.opened_at;
      if (createdAt) {
        const c = new Date(String(createdAt)).getTime();
        if (c >= day.getTime() && c < next.getTime()) created += 1;
      }
      if (String(t.status) === "RESOLVED") {
        const closedAt = t.resolved_at;
        if (closedAt) {
          const c = new Date(String(closedAt)).getTime();
          if (c >= day.getTime() && c < next.getTime()) closed += 1;
        }
      }
    }
    dailyClosures.push({
      date: `${day.getMonth() + 1}/${day.getDate()}`,
      created,
      closed,
    });
  }

  const resolutionCategoryCounts: Record<string, number> = {};
  const otherResolutions: OperationalHealth["otherResolutions"] = [];
  for (const t of tickets) {
    const cat = String(t.resolution_category ?? "").trim();
    if (!cat) continue;
    const display = formatResolutionCategoryDisplay(
      cat,
      t.verification_remarks as string | null | undefined
    );
    resolutionCategoryCounts[display] = (resolutionCategoryCounts[display] || 0) + 1;
    if (cat.toUpperCase() === "OTHER") {
      const details = formatResolutionCategoryDisplay(cat, t.verification_remarks as string | null);
      otherResolutions.push({
        ticketNumber: String(t.ticket_number ?? t.id),
        details: details.replace(/^Other:\s*/i, "") || "(no details recorded)",
        resolvedAt: String(t.resolved_at ?? t.updated_at ?? ""),
      });
    }
  }

  const resolutionCategoryBreakdown = Object.entries(resolutionCategoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, value]) => ({ name, value }));

  const feScorecards = computeFeScorecards(tickets, assignments, sla, fieldExecutives, now);
  const activeFes = fieldExecutives.filter((fe) => fe.active !== false).length || 1;
  const busyFes = feScorecards.filter((f) => f.currentWorkload > 0).length;
  const teamUtilizationPct = Math.round((busyFes / activeFes) * 100);

  const workloadDistribution = feScorecards.slice(0, 15).map((f) => ({
    name: f.name.split(" ")[0] || f.name,
    active: f.currentWorkload,
    capacityHint:
      f.currentWorkload === 0
        ? "Available"
        : f.currentWorkload >= 5
          ? "High load"
          : f.currentWorkload >= 3
            ? "Moderate"
            : "Light",
  }));

  const orgSlaCompliancePct = slaTotal > 0 ? Math.round((slaOk / slaTotal) * 100) : 100;
  const slaBreachTickets = Math.max(0, slaTotal - slaOk);
  const agingOver7 = agingBuckets[3]?.count ?? 0;
  const openPipelineCount = agingBuckets.reduce((s, b) => s + b.count, 0);

  const assignHours: number[] = [];
  const verifyWaitHours: number[] = [];
  for (const t of tickets) {
    const tid = String(t.id);
    const assigns = maps.assignmentsByTicket.get(tid) ?? [];
    if (assigns.length > 0) {
      const first = [...assigns].sort(
        (a, b) =>
          new Date(String(a.assigned_at || 0)).getTime() -
          new Date(String(b.assigned_at || 0)).getTime()
      )[0];
      const ah = hoursBetween(t.opened_at ?? t.created_at, first?.assigned_at);
      if (ah != null) assignHours.push(ah);
    }
    const success = assigns.find((a) => a.outcome === "SUCCESS" && a.ended_at);
    if (success && t.resolved_at) {
      const vh = hoursBetween(success.ended_at, t.resolved_at);
      if (vh != null) verifyWaitHours.push(vh);
    }
  }

  const operationalHealthScore = computeOperationalHealthScore({
    slaCompliancePct: orgSlaCompliancePct,
    pendingAssignment,
    pendingVerification,
    agingOver7Days: agingOver7,
    openPipeline: openPipelineCount,
    teamUtilizationPct,
  });

  return {
    pendingAssignment,
    awaitingApproval,
    pendingVerification,
    onSite,
    enRoute,
    reopened,
    attemptFailed,
    agingBuckets,
    bottleneckStatuses,
    categoryAvgResolution,
    locationVolume,
    repeatComplaints,
    dailyClosures,
    resolutionCategoryBreakdown,
    otherResolutions: otherResolutions.slice(0, 50),
    workloadDistribution,
    attentionTickets: attentionTickets.slice(0, 25),
    orgPendingAssignment: pendingAssignment,
    orgSlaCompliancePct,
    teamUtilizationPct,
    slaBreachTickets,
    operationalHealthScore,
    avgAssignmentHours:
      assignHours.length > 0
        ? Math.round((assignHours.reduce((s, h) => s + h, 0) / assignHours.length) * 10) / 10
        : null,
    avgVerificationWaitHours:
      verifyWaitHours.length > 0
        ? Math.round(
            (verifyWaitHours.reduce((s, h) => s + h, 0) / verifyWaitHours.length) * 10
          ) / 10
        : null,
  };
}

/** Flat rows for metrics CSV export sections. */
export function feScorecardsToCsvRows(rows: FeScorecard[]): string[][] {
  return [
    [
      "FE Name",
      "Active",
      "Productivity %",
      "Total Assigned",
      "Active Tickets",
      "On Site",
      "Resolved",
      "Pending Verification",
      "Closed",
      "SLA Compliance %",
      "Avg Resolution Hours",
      "Avg Handle Hours",
      "Reopened",
      "Repeat Assignments",
      "Failed Attempts",
      "Verification Success %",
      "Current Workload",
      "Closed Today",
      "Closed This Week",
      "Closed This Month",
    ],
    ...rows.map((r) => [
      r.name,
      r.active ? "Yes" : "No",
      String(r.productivityPct),
      String(r.totalAssigned),
      String(r.activeTickets),
      String(r.onSiteTickets),
      String(r.resolvedTickets),
      String(r.pendingVerification),
      String(r.closedTickets),
      String(r.slaCompliancePct),
      r.avgResolutionHours != null ? String(r.avgResolutionHours) : "",
      r.avgHandleHours != null ? String(r.avgHandleHours) : "",
      String(r.reopenedTickets),
      String(r.repeatAssignments ?? r.escalatedTickets),
      String(r.failedAttempts),
      r.verificationSuccessPct != null ? String(r.verificationSuccessPct) : "",
      String(r.currentWorkload),
      String(r.closedToday),
      String(r.closedThisWeek),
      String(r.closedThisMonth),
    ]),
  ];
}

export function smScorecardsToCsvRows(rows: ServiceManagerScorecard[]): string[][] {
  return [
    [
      "Service Manager",
      "Email",
      "Assignment Events",
      "Unique Tickets",
      "Pending Verification",
      "Closed",
      "Reassignments",
      "SLA Compliance %",
      "Avg Assignment Hours",
      "Avg Closure Hours",
      "Team Active Workload",
      "Team Productivity %",
      "Failed Team Attempts",
      "Open Assigned to Team",
    ],
    ...rows.map((r) => [
      r.name,
      r.email,
      String(r.ticketsAssigned),
      String(r.uniqueTicketsAssigned),
      String(r.pendingVerificationQueue),
      String(r.closedTickets),
      String(r.reassignments),
      String(r.slaCompliancePct),
      r.avgAssignmentHours != null ? String(r.avgAssignmentHours) : "",
      r.avgClosureHours != null ? String(r.avgClosureHours) : "",
      String(r.teamActiveWorkload),
      String(r.teamProductivityPct),
      String(r.failedTeamAttempts),
      String(r.openAssignedToTeam),
    ]),
  ];
}

export type FeLeaderboardEntry = {
  rank: number;
  feId: string;
  name: string;
  value: number;
  valueLabel: string;
};

export type FeLeaderboards = {
  topProductivity: FeLeaderboardEntry[];
  mostClosed: FeLeaderboardEntry[];
  bestSla: FeLeaderboardEntry[];
  lowestResolutionTime: FeLeaderboardEntry[];
};

export type ManagementHighlights = {
  topPerformingExecutive: string;
  mostActiveExecutive: string;
  highestWorkload: string;
  highestAgingCategory: string;
  mostCommonComplaintCategory: string;
  mostCommonResolutionCategory: string;
  repeatComplaintCount: number;
  operationalHealthScore: number;
  pendingVerification: number;
  slaBreachTickets: number;
  unassignedTickets: number;
  highAgingTickets: number;
};

function topN<T>(
  rows: T[],
  score: (r: T) => number | null,
  n: number,
  label: (r: T, v: number) => string,
  id: (r: T) => string,
  name: (r: T) => string,
  ascending = false
): FeLeaderboardEntry[] {
  const scored = rows
    .map((r) => ({ r, v: score(r) }))
    .filter((x): x is { r: T; v: number } => x.v != null && Number.isFinite(x.v));
  scored.sort((a, b) => (ascending ? a.v - b.v : b.v - a.v));
  return scored.slice(0, n).map((x, i) => ({
    rank: i + 1,
    feId: id(x.r),
    name: name(x.r),
    value: x.v,
    valueLabel: label(x.r, x.v),
  }));
}

/** Ranked FE leaderboards (Top 5–10 by data volume). */
export function computeFeLeaderboards(
  feScorecards: FeScorecard[],
  limit = 5
): FeLeaderboards {
  const n = Math.min(10, Math.max(5, limit));
  const eligible = feScorecards.filter((f) => f.totalAssigned > 0 || f.closedTickets > 0);
  return {
    topProductivity: topN(
      eligible.filter((f) => f.totalAssigned > 0),
      (f) => f.productivityPct,
      n,
      (_f, v) => `${v}%`,
      (f) => f.feId,
      (f) => f.name
    ),
    mostClosed: topN(
      eligible,
      (f) => f.closedThisWeek,
      n,
      (_f, v) => `${v} this week`,
      (f) => f.feId,
      (f) => f.name
    ),
    bestSla: topN(
      eligible.filter((f) => f.closedTickets > 0 || f.activeTickets > 0),
      (f) => f.slaCompliancePct,
      n,
      (_f, v) => `${v}%`,
      (f) => f.feId,
      (f) => f.name
    ),
    lowestResolutionTime: topN(
      eligible.filter((f) => f.avgResolutionHours != null && f.closedTickets > 0),
      (f) => f.avgResolutionHours,
      n,
      (_f, v) => `${v}h avg`,
      (f) => f.feId,
      (f) => f.name,
      true
    ),
  };
}

/** Concise management highlight cards from existing computed structures. */
export function computeManagementHighlights(
  feScorecards: FeScorecard[],
  opsHealth: OperationalHealth,
  tickets: AnalyticsTicket[]
): ManagementHighlights {
  const byClosures = [...feScorecards].sort(
    (a, b) => b.closedThisWeek - a.closedThisWeek || b.productivityPct - a.productivityPct
  )[0];
  const byActive = [...feScorecards].sort((a, b) => b.activeTickets - a.activeTickets)[0];
  const byWorkload = [...feScorecards].sort(
    (a, b) => b.currentWorkload - a.currentWorkload
  )[0];
  const agingBucket = [...opsHealth.agingBuckets].sort((a, b) => b.count - a.count)[0];

  const complaintCounts: Record<string, number> = {};
  for (const t of tickets) {
    const c = String(t.category ?? "Uncategorized").trim() || "Uncategorized";
    complaintCounts[c] = (complaintCounts[c] || 0) + 1;
  }
  const topComplaint =
    Object.entries(complaintCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const topResolution = opsHealth.resolutionCategoryBreakdown[0]?.name ?? "—";

  const highAging = opsHealth.attentionTickets.filter((t) => t.ageHours >= 72).length;
  const unassigned = opsHealth.pendingAssignment;
  const slaBreaches = opsHealth.attentionTickets.filter((t) =>
    t.reason.includes("SLA breached")
  ).length;

  return {
    topPerformingExecutive: byClosures
      ? `${byClosures.name} (${byClosures.closedThisWeek} closed / week)`
      : "—",
    mostActiveExecutive: byActive
      ? `${byActive.name} (${byActive.activeTickets} active)`
      : "—",
    highestWorkload: byWorkload
      ? `${byWorkload.name} (${byWorkload.currentWorkload} workload)`
      : "—",
    highestAgingCategory: agingBucket
      ? `${agingBucket.label} (${agingBucket.count})`
      : "—",
    mostCommonComplaintCategory: topComplaint,
    mostCommonResolutionCategory: topResolution,
    repeatComplaintCount: opsHealth.repeatComplaints.reduce((s, r) => s + r.count, 0),
    operationalHealthScore: opsHealth.operationalHealthScore,
    pendingVerification: opsHealth.pendingVerification,
    slaBreachTickets: Math.max(opsHealth.slaBreachTickets, slaBreaches),
    unassignedTickets: unassigned,
    highAgingTickets: highAging,
  };
}
