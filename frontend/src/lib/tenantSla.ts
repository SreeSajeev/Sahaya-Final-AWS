/**
 * Frontend mirror of tenant SLA engine helpers (display + filter/sort).
 */

export const SLA_STATUS = {
  ON_TRACK: "ON_TRACK",
  APPROACHING: "APPROACHING",
  BREACHED: "BREACHED",
  NA: "NA",
} as const;

export type SlaStatus = (typeof SLA_STATUS)[keyof typeof SLA_STATUS];

export const DEFAULT_ESCALATION_LEVELS = [
  { level: 1, percent: 50 },
  { level: 2, percent: 75 },
  { level: 3, percent: 100 },
  { level: 4, percent: 150 },
];

export const RESPONSE_PRESETS_MINUTES = [4 * 60, 8 * 60, 12 * 60, 24 * 60, 48 * 60];
export const RESOLUTION_PRESETS_MINUTES = [24 * 60, 48 * 60, 72 * 60, 5 * 24 * 60, 7 * 24 * 60];

export type TenantSlaConfig = {
  id?: string;
  organisation_id?: string;
  response_minutes: number;
  resolution_minutes: number;
  escalation_levels: Array<{ level: number; percent: number }>;
  business_hours_enabled: boolean;
  start_time: string | null;
  end_time: string | null;
  working_days: number[];
  presets?: { response_minutes: number[]; resolution_minutes: number[] };
};

export function formatDurationMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || !Number.isFinite(Number(totalMinutes))) return "—";
  const abs = Math.abs(Math.round(Number(totalMinutes)));
  const days = Math.floor(abs / (60 * 24));
  const hours = Math.floor((abs % (60 * 24)) / 60);
  const mins = abs % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(" ");
}

export function formatMinutesAsHoursLabel(minutes: number): string {
  if (minutes % (24 * 60) === 0) {
    const d = minutes / (24 * 60);
    return d === 1 ? "1 Day" : `${d} Days`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? "1 Hour" : `${h} Hours`;
  }
  return formatDurationMinutes(minutes);
}

export function statusDisplayLabel(status: string | null | undefined): string {
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

export function slaStatusTone(status: string | null | undefined): "green" | "orange" | "red" | "muted" {
  switch (status) {
    case SLA_STATUS.ON_TRACK:
      return "green";
    case SLA_STATUS.APPROACHING:
      return "orange";
    case SLA_STATUS.BREACHED:
      return "red";
    default:
      return "muted";
  }
}

export type TicketSlaView = {
  status: string;
  escalation_level: number | null;
  escalation_label: string;
  breached: boolean;
  response: {
    status: string;
    remainingMinutes: number | null;
    remainingLabel?: string;
    dueAt: string | null;
    breached: boolean;
  };
  resolution: {
    status: string;
    remainingMinutes: number | null;
    remainingLabel?: string;
    dueAt: string | null;
    breached: boolean;
  };
  response_sla_minutes?: number | null;
  resolution_sla_minutes?: number | null;
};

/** Prefer API-attached `ticket.sla`; else build a minimal view from snapshot fields. */
export function getTicketSlaView(ticket: Record<string, unknown> | null | undefined): TicketSlaView | null {
  if (!ticket) return null;
  const attachedTenant = ticket.tenant_sla as TicketSlaView | undefined;
  if (attachedTenant && typeof attachedTenant === "object" && attachedTenant.status) {
    return attachedTenant;
  }
  const attached = ticket.sla as TicketSlaView | undefined;
  // Avoid mistaking FE lifecycle sla_tracking rows (no CRM status enum) for tenant SLA.
  if (
    attached &&
    typeof attached === "object" &&
    attached.status &&
    ["ON_TRACK", "APPROACHING", "BREACHED", "NA"].includes(String(attached.status))
  ) {
    return attached;
  }

  if (!ticket.response_due_at && !ticket.resolution_due_at) return null;

  // Lightweight client fallback (same rules as backend) without full escalation config.
  const now = Date.now();
  const phase = (
    dueAt: unknown,
    totalMinutes: unknown
  ): TicketSlaView["response"] => {
    if (!dueAt || totalMinutes == null) {
      return { status: SLA_STATUS.NA, remainingMinutes: null, dueAt: null, breached: false };
    }
    const due = new Date(String(dueAt)).getTime();
    const total = Number(totalMinutes);
    const remainingMinutes = Math.round((due - now) / 60000);
    let status: string = SLA_STATUS.ON_TRACK;
    if (now > due) status = SLA_STATUS.BREACHED;
    else if (remainingMinutes <= total * 0.2) status = SLA_STATUS.APPROACHING;
    return {
      status,
      remainingMinutes,
      dueAt: new Date(due).toISOString(),
      breached: status === SLA_STATUS.BREACHED,
      remainingLabel:
        status === SLA_STATUS.BREACHED
          ? `${formatDurationMinutes(remainingMinutes)} overdue`
          : `${formatDurationMinutes(remainingMinutes)} remaining`,
    };
  };

  const response = phase(ticket.response_due_at, ticket.response_sla_minutes);
  const resolution = phase(ticket.resolution_due_at, ticket.resolution_sla_minutes);
  const status =
    resolution.status !== SLA_STATUS.NA ? resolution.status : response.status;
  const escalation =
    ticket.escalation_level != null ? Number(ticket.escalation_level) : null;

  return {
    status,
    escalation_level: escalation && escalation > 0 ? escalation : null,
    escalation_label: escalation && escalation > 0 ? `L${escalation}` : "—",
    breached: Boolean(response.breached || resolution.breached),
    response,
    resolution,
    response_sla_minutes: ticket.response_sla_minutes as number | null,
    resolution_sla_minutes: ticket.resolution_sla_minutes as number | null,
  };
}

export function matchesSlaFilter(
  ticket: Record<string, unknown>,
  filter: "all" | "breached" | "approaching" | "healthy"
): boolean {
  if (filter === "all") return true;
  const view = getTicketSlaView(ticket);
  if (!view) return filter === "healthy";
  if (filter === "breached") return view.status === SLA_STATUS.BREACHED;
  if (filter === "approaching") return view.status === SLA_STATUS.APPROACHING;
  return view.status === SLA_STATUS.ON_TRACK || view.status === SLA_STATUS.NA;
}

export function compareSlaRemaining(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  const va = getTicketSlaView(a);
  const vb = getTicketSlaView(b);
  const ra = va?.resolution.remainingMinutes ?? va?.response.remainingMinutes ?? Number.POSITIVE_INFINITY;
  const rb = vb?.resolution.remainingMinutes ?? vb?.response.remainingMinutes ?? Number.POSITIVE_INFINITY;
  return ra - rb;
}
