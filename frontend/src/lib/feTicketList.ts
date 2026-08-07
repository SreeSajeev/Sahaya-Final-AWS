import type { Ticket, TicketStatus } from '@/lib/types';
import { formatIST } from '@/lib/dateUtils';

export type FEActionTokenLite = {
  id: string;
  ticket_id: string;
  action_type: 'ON_SITE' | 'RESOLUTION';
  expires_at?: string;
};

export type FETicketRow = Ticket & {
  client_name?: string | null;
  /** Tenant client contact details, enriched by the JWT-scoped FE API. */
  contact_person?: string | null;
  contact_number?: string | null;
  remarks?: string | null;
  /** Manager-selected due from ticket_assignments.assignment_due_at (optional). */
  assignment_due?: string | null;
  /** When this FE was assigned (ticket_assignments.created_at). */
  assigned_at?: string | null;
  /** Who opened / reported the ticket (staff name + email when available). */
  reporter_display?: string | null;
  sla?: {
    assignment_deadline?: string | null;
    onsite_deadline?: string | null;
    resolution_deadline?: string | null;
    assignment_breached?: boolean | null;
    onsite_breached?: boolean | null;
    resolution_breached?: boolean | null;
  } | null;
  tokens?: {
    onSite?: {
      id: string;
      expires_at?: string;
      token_state?: string;
      used?: boolean;
      actionable?: boolean;
    } | null;
    resolution?: {
      id: string;
      expires_at?: string;
      token_state?: string;
      used?: boolean;
      actionable?: boolean;
    } | null;
  } | null;
  resolution_locked?: boolean;
  creator_display?: string | null;
  // Backward compatibility (older payload variants)
  active_fe_tokens?: FEActionTokenLite[];
};

export type FEWorkTypeFilter = 'all' | 'on_site' | 'resolution';

export type FETicketSortKey =
  | 'newest'
  | 'oldest'
  | 'ticket_number'
  | 'status';

export const FE_STATUS_FILTERS: { id: 'all' | TicketStatus; label: string }[] = [
  { id: 'all', label: 'All Statuses' },
  { id: 'OPEN', label: 'Open' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'EN_ROUTE', label: 'En Route' },
  { id: 'ON_SITE', label: 'On Site' },
  { id: 'RESOLVED_PENDING_VERIFICATION', label: 'Resolved Pending Verification' },
  { id: 'RESOLVED', label: 'Resolved' },
  { id: 'REOPENED', label: 'Reopened' },
  { id: 'FE_ATTEMPT_FAILED', label: 'Failed' },
];

export const FE_TICKET_SORT_OPTIONS: { value: FETicketSortKey; label: string }[] = [
  { value: 'newest', label: 'Newest → Oldest' },
  { value: 'oldest', label: 'Oldest → Newest' },
  { value: 'ticket_number', label: 'Ticket Number' },
  { value: 'status', label: 'Status' },
];

/** Active work first when sorting by status. */
const FE_TICKET_STATUS_ORDER: Partial<Record<TicketStatus, number>> = {
  ON_SITE: 0,
  EN_ROUTE: 1,
  ASSIGNED: 2,
  OPEN: 3,
  REOPENED: 4,
  RESOLVED_PENDING_VERIFICATION: 5,
  FE_ATTEMPT_FAILED: 6,
  RESOLVED: 7,
};
const FE_TICKET_STATUS_ORDER_DEFAULT = 8;

const STATUS_SEARCH_LABELS: Partial<Record<TicketStatus, string>> = {
  OPEN: 'open',
  NEEDS_REVIEW: 'needs review',
  ASSIGNED: 'assigned',
  EN_ROUTE: 'en route',
  ON_SITE: 'on site',
  RESOLVED_PENDING_VERIFICATION: 'resolved pending verification pending verify',
  RESOLVED: 'resolved',
  REOPENED: 'reopened',
  FE_ATTEMPT_FAILED: 'failed attempt failed',
  REJECTED: 'rejected',
};

function ticketRecencyMs(ticket: FETicketRow): number {
  const created = ticket.created_at ? new Date(ticket.created_at).getTime() : NaN;
  const updated = ticket.updated_at ? new Date(ticket.updated_at).getTime() : NaN;
  const opened = ticket.opened_at ? new Date(ticket.opened_at).getTime() : NaN;
  const c = Number.isFinite(created) ? created : 0;
  const u = Number.isFinite(updated) ? updated : 0;
  const o = Number.isFinite(opened) ? opened : 0;
  return Math.max(c, u, o);
}

export function getFETicketWorkTypes(ticket: FETicketRow): {
  onSite: boolean;
  resolution: boolean;
} {
  const legacyToks = ticket.active_fe_tokens ?? [];
  const onSiteTok = ticket.tokens?.onSite;
  const resTok = ticket.tokens?.resolution;
  const onSiteId =
    onSiteTok?.id ?? legacyToks.find((x) => x.action_type === 'ON_SITE')?.id ?? null;
  const resolutionId =
    resTok?.id ?? legacyToks.find((x) => x.action_type === 'RESOLUTION')?.id ?? null;

  const onSite = Boolean(onSiteId && onSiteTok?.actionable !== false);
  const resolution = Boolean(
    resolutionId && resTok?.actionable !== false && !ticket.resolution_locked,
  );

  return { onSite, resolution };
}

/** Display label for the Work Type column. */
export function formatFETicketWorkType(ticket: FETicketRow): string {
  const { onSite, resolution } = getFETicketWorkTypes(ticket);
  if (onSite && resolution) return 'On Site · Resolution';
  if (onSite) return 'On Site';
  if (resolution) return 'Resolution';
  if (ticket.resolution_locked && ticket.tokens?.resolution?.id) return 'Resolution locked';
  return '—';
}

export function matchesFETicketSearch(ticket: FETicketRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystacks: Array<string | null | undefined> = [
    ticket.id,
    ticket.ticket_number,
    ticket.complaint_id,
    ticket.client_name,
    ticket.client_slug,
    ticket.location,
    ticket.state,
    ticket.vehicle_number,
    ticket.vehicle_name,
    ticket.registration_number,
    ticket.category,
    ticket.issue_type,
    ticket.remarks,
    ticket.short_description,
    ticket.reporter_display,
    ticket.creator_display,
    ticket.opened_by_email,
    ticket.status,
    STATUS_SEARCH_LABELS[ticket.status],
    formatFETicketWorkType(ticket),
  ];

  return haystacks.some((v) => v != null && String(v).toLowerCase().includes(q));
}

export function matchesFEWorkTypeFilter(
  ticket: FETicketRow,
  workType: FEWorkTypeFilter,
): boolean {
  if (workType === 'all') return true;
  const { onSite, resolution } = getFETicketWorkTypes(ticket);
  if (workType === 'on_site') return onSite;
  if (workType === 'resolution') return resolution;
  return true;
}

function facetValue(raw: string | null | undefined): string {
  return raw != null ? String(raw).trim() : '';
}

/** Unique sorted facet options from the FE's accessible tickets. */
export function collectFETicketFacetOptions(
  tickets: FETicketRow[],
): { states: string[]; locations: string[]; customers: string[] } {
  const states = new Set<string>();
  const locations = new Set<string>();
  const customers = new Set<string>();
  for (const t of tickets) {
    const state = facetValue(t.state);
    const location = facetValue(t.location);
    const customer = facetValue(t.client_name ?? t.client_slug);
    if (state) states.add(state);
    if (location) locations.add(location);
    if (customer) customers.add(customer);
  }
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return {
    states: [...states].sort(collator.compare),
    locations: [...locations].sort(collator.compare),
    customers: [...customers].sort(collator.compare),
  };
}

export function matchesFEFacetFilters(
  ticket: FETicketRow,
  opts: { state: string; location: string; customer: string },
): boolean {
  if (opts.state !== 'all') {
    if (facetValue(ticket.state) !== opts.state) return false;
  }
  if (opts.location !== 'all') {
    if (facetValue(ticket.location) !== opts.location) return false;
  }
  if (opts.customer !== 'all') {
    const customer = facetValue(ticket.client_name ?? ticket.client_slug);
    if (customer !== opts.customer) return false;
  }
  return true;
}

/** Display helper: empty/null complaint id → em dash (never "undefined"). */
export function formatComplaintIdDisplay(complaintId: string | null | undefined): string {
  const s = complaintId != null ? String(complaintId).trim() : '';
  return s || '—';
}

export function compareFETickets(
  a: FETicketRow,
  b: FETicketRow,
  sortKey: FETicketSortKey,
): number {
  switch (sortKey) {
    case 'oldest':
      return ticketRecencyMs(a) - ticketRecencyMs(b);
    case 'ticket_number': {
      const an = String(a.ticket_number ?? '').localeCompare(
        String(b.ticket_number ?? ''),
        undefined,
        { numeric: true, sensitivity: 'base' },
      );
      if (an !== 0) return an;
      return ticketRecencyMs(b) - ticketRecencyMs(a);
    }
    case 'status': {
      const pa = FE_TICKET_STATUS_ORDER[a.status] ?? FE_TICKET_STATUS_ORDER_DEFAULT;
      const pb = FE_TICKET_STATUS_ORDER[b.status] ?? FE_TICKET_STATUS_ORDER_DEFAULT;
      if (pa !== pb) return pa - pb;
      return ticketRecencyMs(b) - ticketRecencyMs(a);
    }
    case 'newest':
    default:
      return ticketRecencyMs(b) - ticketRecencyMs(a);
  }
}

export function filterAndSortFETickets(
  tickets: FETicketRow[],
  opts: {
    search: string;
    status: 'all' | TicketStatus;
    workType: FEWorkTypeFilter;
    sortKey: FETicketSortKey;
    state?: string;
    location?: string;
    customer?: string;
  },
): FETicketRow[] {
  const state = opts.state ?? 'all';
  const location = opts.location ?? 'all';
  const customer = opts.customer ?? 'all';
  const filtered = tickets.filter((t) => {
    if (opts.status !== 'all' && t.status !== opts.status) return false;
    if (!matchesFEWorkTypeFilter(t, opts.workType)) return false;
    if (!matchesFEFacetFilters(t, { state, location, customer })) return false;
    return matchesFETicketSearch(t, opts.search);
  });
  return [...filtered].sort((a, b) => compareFETickets(a, b, opts.sortKey));
}

/**
 * Field-visit date range: prefer assignment date (assigned_at), else created_at / opened_at.
 * Dates are compared as IST calendar days (inclusive).
 */
export function ticketInFEDateRange(
  ticket: FETicketRow,
  fromYmd: string,
  toYmd: string,
): boolean {
  const iso =
    ticket.assigned_at ||
    ticket.created_at ||
    ticket.opened_at ||
    null;
  if (!iso) return false;
  const ymd = formatIST(iso, 'yyyy-MM-dd');
  if (!ymd || ymd.length < 10) return false;
  return ymd >= fromYmd && ymd <= toYmd;
}

export function validateFEDateRange(
  fromYmd: string,
  toYmd: string,
): { ok: true } | { ok: false; error: string } {
  if (!fromYmd || !toYmd) {
    return { ok: false, error: 'Select both From and To dates.' };
  }
  if (fromYmd > toYmd) {
    return { ok: false, error: 'From date must be on or before To date.' };
  }
  return { ok: true };
}

export function filterFETicketsByDateRange(
  tickets: FETicketRow[],
  fromYmd: string,
  toYmd: string,
): FETicketRow[] {
  return tickets.filter((t) => ticketInFEDateRange(t, fromYmd, toYmd));
}
