import { subDays } from 'date-fns';
import { formatIST, getEndOfDayIST, getStartOfDayIST, todayIST } from '@/lib/dateUtils';

/** Date presets for dashboard (aligned with Analytics IST logic). */
export type DashboardDatePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'custom';

export const DASHBOARD_DATE_PRESET_LABELS: Record<DashboardDatePreset, string> = {
  all: 'All Time',
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 Days',
  last30: 'Last 30 Days',
  thisMonth: 'This Month',
  custom: 'Custom Range',
};

/** Active field-work statuses (existing workflow model). */
export const IN_PROGRESS_TICKET_STATUSES = [
  'EN_ROUTE',
  'ON_SITE',
  'RESOLVED_PENDING_VERIFICATION',
  'FE_ATTEMPT_FAILED',
] as const;

export type DashboardFilterParams = {
  clientSlug: string | null;
  state: string | null;
  datePreset: DashboardDatePreset;
  dateFrom: string;
  dateTo: string;
};

export function dashboardFiltersToIsoRange(filters: Pick<DashboardFilterParams, 'dateFrom' | 'dateTo'>): {
  startDate: string | null;
  endDate: string | null;
} {
  const from = filters.dateFrom?.trim() ?? '';
  const to = filters.dateTo?.trim() ?? '';
  if (!from && !to) return { startDate: null, endDate: null };
  return {
    startDate: from ? getStartOfDayIST(from).toISOString() : null,
    endDate: to ? getEndOfDayIST(to || from).toISOString() : null,
  };
}

/** Resolve yyyy-MM-dd range for a preset (IST). */
export function datePresetToYmdRange(preset: DashboardDatePreset): { from: string; to: string } | null {
  if (preset === 'all' || preset === 'custom') return null;

  const todayYmd = todayIST();
  const todayStart = getStartOfDayIST(todayYmd);

  if (preset === 'today') {
    return { from: todayYmd, to: todayYmd };
  }
  if (preset === 'yesterday') {
    const y = formatIST(subDays(todayStart, 1), 'yyyy-MM-dd');
    return { from: y, to: y };
  }
  if (preset === 'last7') {
    const start = formatIST(subDays(todayStart, 6), 'yyyy-MM-dd');
    return { from: start, to: todayYmd };
  }
  if (preset === 'last30') {
    const start = formatIST(subDays(todayStart, 29), 'yyyy-MM-dd');
    return { from: start, to: todayYmd };
  }
  if (preset === 'thisMonth') {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(todayStart);
    const y = parts.find((p) => p.type === 'year')?.value ?? '';
    const m = parts.find((p) => p.type === 'month')?.value ?? '';
    return { from: `${y}-${m}-01`, to: todayYmd };
  }
  return null;
}

export function parseDashboardFiltersFromSearchParams(params: URLSearchParams): DashboardFilterParams {
  const clientRaw = params.get('client')?.trim() ?? '';
  const stateRaw = params.get('state')?.trim() ?? '';
  const presetRaw = params.get('range')?.trim() ?? 'all';
  const validPresets: DashboardDatePreset[] = [
    'all',
    'today',
    'yesterday',
    'last7',
    'last30',
    'thisMonth',
    'custom',
  ];
  const datePreset = validPresets.includes(presetRaw as DashboardDatePreset)
    ? (presetRaw as DashboardDatePreset)
    : 'all';

  let dateFrom = params.get('from')?.trim() ?? '';
  let dateTo = params.get('to')?.trim() ?? '';

  if (datePreset !== 'custom' && datePreset !== 'all') {
    const resolved = datePresetToYmdRange(datePreset);
    if (resolved) {
      dateFrom = resolved.from;
      dateTo = resolved.to;
    }
  }

  return {
    clientSlug: clientRaw && clientRaw !== 'all' ? clientRaw : null,
    state: stateRaw && stateRaw !== 'all' ? stateRaw : null,
    datePreset,
    dateFrom,
    dateTo,
  };
}

export function dashboardFiltersToSearchParams(filters: DashboardFilterParams): URLSearchParams {
  const next = new URLSearchParams();
  if (filters.clientSlug) next.set('client', filters.clientSlug);
  else next.set('client', 'all');
  if (filters.state) next.set('state', filters.state);
  else next.set('state', 'all');
  next.set('range', filters.datePreset);
  if (filters.datePreset === 'custom') {
    if (filters.dateFrom) next.set('from', filters.dateFrom);
    if (filters.dateTo) next.set('to', filters.dateTo);
  }
  return next;
}

export function dashboardFilterSummary(filters: DashboardFilterParams): string {
  const client = filters.clientSlug ? filters.clientSlug : 'All clients';
  const statePart = filters.state ? filters.state : null;
  const base = statePart ? `${client} · ${statePart}` : client;
  if (filters.datePreset === 'all') return base;
  const label = DASHBOARD_DATE_PRESET_LABELS[filters.datePreset];
  if (filters.datePreset === 'custom' && filters.dateFrom) {
    const to = filters.dateTo || filters.dateFrom;
    return `${base} · ${filters.dateFrom} – ${to}`;
  }
  return `${base} · ${label}`;
}
