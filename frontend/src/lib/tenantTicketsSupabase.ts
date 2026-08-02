import { fetchJson } from "@/lib/backendDataApi";
import { ticketPassesPriorityFilter, resolveTicketPriorityLevel } from "@/lib/priority";
import { getEndOfDayIST, getStartOfDayIST } from "@/lib/dateUtils";
import type { DashboardStats, Ticket, TicketFilters, TicketStatus, UserRole } from "@/lib/types";
import { ticketMatchesSearch } from "@/lib/ticketSearch";

/** Dev-only session debug (no Supabase Auth). */
export async function logTicketsSessionDebug(context: string): Promise<void> {
  const enabled =
    import.meta.env.DEV || String(import.meta.env.VITE_DEBUG_SUPABASE_SESSION ?? "").trim() === "true";
  if (!enabled) return;
  // eslint-disable-next-line no-console
  console.log("SESSION DEBUG:", context, { hasToken: Boolean(sessionStorage.getItem("sahaya_access_token")) });
}

const MAX_TENANT_TICKET_ROWS = 5000;

/** Normalise for comparison (organisations store slugs lowercased in create flow). */
export function normalizeOrgSlug(slug: string | null | undefined): string {
  return String(slug ?? "").trim().toLowerCase();
}

export type OrganisationRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  [key: string]: unknown;
};

/** Single organisation by primary key via backend Prisma API. */
export async function fetchOrganisationById(orgId: string): Promise<OrganisationRow | null> {
  const id = String(orgId ?? "").trim();
  if (!id) return null;
  await logTicketsSessionDebug("fetchOrganisationById");
  try {
    const data = await fetchJson<Record<string, unknown>>(
      `/data/organisations/${encodeURIComponent(id)}`
    );
    return {
      ...data,
      id: String(data.id ?? ""),
      name: String(data.name ?? ""),
      slug: String(data.slug ?? ""),
      status: String(data.status ?? ""),
    } as OrganisationRow;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404") || /not found/i.test(msg)) return null;
    throw err;
  }
}

/** Resolve UUID → slug for aligning `tickets.client_slug` with `organisations.slug`. */
async function resolveOrganisationSlugFromId(orgId: string): Promise<string | null> {
  const row = await fetchOrganisationById(orgId);
  if (!row) return null;
  const slug = normalizeOrgSlug(row.slug);
  return slug || null;
}

export function mapSupabaseTicketRow(row: Record<string, unknown>): Ticket {
  return {
    id: String(row.id ?? ""),
    ticket_number: String(row.ticket_number ?? ""),
    status: (row.status as TicketStatus) ?? "OPEN",
    complaint_id: row.complaint_id != null ? String(row.complaint_id) : null,
    vehicle_number: row.vehicle_number != null ? String(row.vehicle_number) : null,
    category: row.category != null ? String(row.category) : null,
    issue_type: row.issue_type != null ? String(row.issue_type) : null,
    location: row.location != null ? String(row.location) : null,
    state: row.state != null && String(row.state).trim() !== "" ? String(row.state) : null,
    short_description: row.short_description != null ? String(row.short_description) : null,
    opened_by_email: row.opened_by_email != null ? String(row.opened_by_email) : null,
    opened_at: row.opened_at != null ? String(row.opened_at) : "",
    confidence_score:
      row.confidence_score != null && row.confidence_score !== ""
        ? Number(row.confidence_score)
        : null,
    needs_review: Boolean(row.needs_review),
    source: row.source != null ? String(row.source) : null,
    current_assignment_id: row.current_assignment_id != null ? String(row.current_assignment_id) : null,
    created_at: row.created_at != null ? String(row.created_at) : "",
    updated_at: row.updated_at != null ? String(row.updated_at) : "",
    priority: row.priority === true,
    priority_level: resolveTicketPriorityLevel({
      priority_level: row.priority_level as string | null | undefined,
      priority: row.priority === true,
    }),
    client_slug: row.client_slug != null && String(row.client_slug).trim() !== "" ? String(row.client_slug).trim() : null,
    organisation_id: row.organisation_id != null ? String(row.organisation_id) : null,
    resolved_at:
      row.resolved_at != null && String(row.resolved_at).trim() !== ""
        ? String(row.resolved_at)
        : null,
    verification_remarks:
      row.verification_remarks != null && String(row.verification_remarks).trim() !== ""
        ? String(row.verification_remarks)
        : null,
    review_notes:
      row.review_notes != null && String(row.review_notes).trim() !== ""
        ? String(row.review_notes)
        : null,
    resolution_category:
      row.resolution_category != null && String(row.resolution_category).trim() !== ""
        ? String(row.resolution_category)
        : null,
  };
}

const NON_OPEN_FINAL: TicketStatus[] = ["RESOLVED", "REJECTED"];

/**
 * Tenant-scoped ticket list: organisation_id preferred; client_slug as fallback.
 */
export async function fetchTicketsByOrganisationSlug(orgSlug: string): Promise<Ticket[]> {
  const key = normalizeOrgSlug(orgSlug);
  if (!key) return [];

  await logTicketsSessionDebug("fetchTicketsByOrganisationSlug");

  const params = new URLSearchParams();
  params.set("limit", String(MAX_TENANT_TICKET_ROWS));
  params.set("offset", "0");
  params.set("clientSlug", key);
  params.set("scopeAllOrganisations", "true");

  const res = await fetchJson<{ items: Record<string, unknown>[] }>(`/data/tickets?${params.toString()}`);
  const mapped = (res.items ?? []).map((r) => mapSupabaseTicketRow(r));
  return mapped.filter((t) => normalizeOrgSlug(t.client_slug) === key);
}

/** Tickets for an organisation id (Super Admin tenant view). */
export async function fetchTicketsByOrganisationId(organisationId: string): Promise<Ticket[]> {
  const id = String(organisationId ?? "").trim();
  if (!id) return [];
  await logTicketsSessionDebug("fetchTicketsByOrganisationId");
  const params = new URLSearchParams();
  params.set("limit", String(MAX_TENANT_TICKET_ROWS));
  params.set("offset", "0");
  params.set("organisationId", id);
  const res = await fetchJson<{ items: Record<string, unknown>[] }>(`/data/tickets?${params.toString()}`);
  return (res.items ?? []).map((r) => mapSupabaseTicketRow(r));
}

/** Distinct client slugs within a ticket list (excluding empty). */
export function distinctClientSlugsFromTickets(tickets: Ticket[]): string[] {
  const set = new Set<string>();
  for (const t of tickets) {
    const s = normalizeOrgSlug(t.client_slug);
    if (s) set.add(String(t.client_slug).trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function clientStatsFromTickets(tickets: Ticket[]): Record<string, { total: number; open: number }> {
  const out: Record<string, { total: number; open: number }> = {};
  for (const t of tickets) {
    const raw = String(t.client_slug ?? "").trim() || "_unknown";
    const key = raw === "" ? "_unknown" : raw;
    if (!out[key]) out[key] = { total: 0, open: 0 };
    out[key].total += 1;
    if (!NON_OPEN_FINAL.includes(t.status)) out[key].open += 1;
  }
  return out;
}

/** Derive dashboard-style stats from scoped tickets (+ optional SLA breach total). */
export function deriveDashboardStatsFromTickets(tickets: Ticket[], slaBreaches: number): DashboardStats {
  const totalTickets = tickets.length;
  let openTickets = 0;
  let needsReviewCount = 0;
  let assignedTickets = 0;
  let inProgressTickets = 0;
  let resolvedTickets = 0;
  let resolvedToday = 0;
  let confSum = 0;
  let confCount = 0;

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);

  for (const t of tickets) {
    if (!NON_OPEN_FINAL.includes(t.status)) openTickets += 1;
    if (t.needs_review) needsReviewCount += 1;
    if (
      t.current_assignment_id != null &&
      String(t.current_assignment_id).trim() !== ""
    ) {
      assignedTickets += 1;
    }
    if (
      t.status === "EN_ROUTE" ||
      t.status === "ON_SITE" ||
      t.status === "RESOLVED_PENDING_VERIFICATION" ||
      t.status === "FE_ATTEMPT_FAILED"
    )
      inProgressTickets += 1;
    if (t.status === "RESOLVED") {
      resolvedTickets += 1;
      const resolvedAtRaw = t.resolved_at;
      if (resolvedAtRaw) {
        const d = new Date(resolvedAtRaw);
        if (!Number.isNaN(d.getTime()) && d >= dayStart) resolvedToday += 1;
      }
    }
    if (t.confidence_score != null && !Number.isNaN(Number(t.confidence_score))) {
      confSum += Number(t.confidence_score);
      confCount += 1;
    }
  }

  return {
    totalTickets,
    openTickets,
    needsReviewCount,
    assignedTickets,
    inProgressTickets,
    resolvedTickets,
    resolvedToday,
    avgConfidenceScore: confCount > 0 ? Math.round(confSum / confCount) : 0,
    slaBreaches: slaBreaches,
  };
}

/** Ticket IDs that appear in sla_tracking with any breach flag set. */
export async function fetchBreachedTicketIds(ticketIds: string[]): Promise<Set<string>> {
  await logTicketsSessionDebug("fetchBreachedTicketIds");

  const out = new Set<string>();
  const uniq = [...new Set(ticketIds)].filter(Boolean);
  const chunkSize = 500;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    try {
      const res = await fetchJson<{
        items: Array<{
          ticket_id?: string;
          assignment_breached?: boolean;
          onsite_breached?: boolean;
          resolution_breached?: boolean;
        }>;
      }>("/data/sla/by-ticket-ids", {
        method: "POST",
        body: { ticketIds: chunk },
      });
      for (const row of res.items ?? []) {
        if (
          row.ticket_id &&
          (row.assignment_breached || row.onsite_breached || row.resolution_breached)
        ) {
          out.add(String(row.ticket_id));
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error("[fetchBreachedTicketIds]", err instanceof Error ? err.message : err);
      }
    }
  }
  return out;
}

function ticketPassesConfidence(
  score: number | null | undefined,
  range: TicketFilters["confidenceRange"] | undefined
): boolean {
  if (range == null || range === "all") return true;
  const s = score ?? 0;
  if (range === "high") return s >= 95;
  if (range === "medium") return s >= 80 && s < 95;
  if (range === "low") return s < 80;
  return true;
}

/** Main list reads for dashboards / All Tickets via backend Prisma API. */
export async function fetchWorkspaceTicketsList(opts: {
  maxRows: number;
  organisationId: string | null;
  isSuperAdmin: boolean;
  role: UserRole | null | undefined;
  filters: TicketFilters;
}): Promise<Ticket[]> {
  await logTicketsSessionDebug("fetchWorkspaceTicketsList");

  const { maxRows, organisationId, isSuperAdmin, filters, role } = opts;
  const scopeAll = Boolean(filters.scopeAllOrganisations);
  const isClient = role === "CLIENT";

  if (!isSuperAdmin && !scopeAll && !organisationId) {
    return [];
  }

  const params = new URLSearchParams();
  params.set("limit", String(Math.min(Math.max(maxRows, 1), MAX_TENANT_TICKET_ROWS)));
  params.set("offset", "0");

  if (isSuperAdmin && filters.organisationId != null && String(filters.organisationId).trim() !== "") {
    params.set("organisationId", String(filters.organisationId).trim());
  }
  if (scopeAll) {
    params.set("scopeAllOrganisations", "true");
  }

  if (filters.reviewQueue === true) {
    params.set("reviewQueue", "true");
  } else if (filters.status != null && filters.status !== "all") {
    params.set("status", String(filters.status));
  }

  if (filters.clientSlug != null && String(filters.clientSlug).trim() !== "") {
    const cs = normalizeOrgSlug(String(filters.clientSlug));
    if (cs) params.set("clientSlug", cs);
  } else if (isClient && organisationId) {
    const tenantScopeSlug = await resolveOrganisationSlugFromId(organisationId);
    if (tenantScopeSlug) params.set("clientSlug", tenantScopeSlug);
  }

  if (filters.state != null && String(filters.state).trim() !== "") {
    params.set("state", String(filters.state).trim());
  }

  if (filters.needsReview === true && filters.reviewQueue !== true) {
    params.set("needsReview", "true");
  }

  if (filters.unassignedOnly) {
    params.set("unassignedOnly", "true");
  }

  if (filters.dateFrom != null && String(filters.dateFrom).trim() !== "") {
    params.set("startDate", getStartOfDayIST(String(filters.dateFrom).trim()).toISOString());
  }
  if (filters.dateTo != null && String(filters.dateTo).trim() !== "") {
    params.set("endDate", getEndOfDayIST(String(filters.dateTo).trim()).toISOString());
  }

  if (filters.search != null && String(filters.search).trim() !== "") {
    params.set("search", String(filters.search).trim());
  }

  const res = await fetchJson<{ items: Record<string, unknown>[] }>(`/data/tickets?${params.toString()}`);
  let rows = (res.items ?? []).map((r) => mapSupabaseTicketRow(r));

  const searchRaw = filters.search != null ? String(filters.search).trim() : "";
  if (searchRaw !== "") {
    rows = rows.filter((t) =>
      ticketMatchesSearch(t, filters.search!, {
        clientSearchLookup: filters.searchClientLookup,
      })
    );
  }

  rows = rows.filter((t) => ticketPassesConfidence(t.confidence_score, filters.confidenceRange));
  rows = rows.filter((t) => ticketPassesPriorityFilter(t, filters.priorityLevel));

  if (!isSuperAdmin && !scopeAll && organisationId) {
    rows = rows.filter((t) => t.organisation_id === organisationId);
  }

  return rows;
}
