import { supabase } from "@/integrations/supabase/client";
import { ticketPassesPriorityFilter, resolveTicketPriorityLevel } from "@/lib/priority";
import { getEndOfDayIST, getStartOfDayIST } from "@/lib/dateUtils";
import type { DashboardStats, Ticket, TicketFilters, TicketStatus, UserRole } from "@/lib/types";
import { buildTicketSearchOrFilter, ticketMatchesSearch } from "@/lib/ticketSearch";

/** Dev-only (or VITE_DEBUG_SUPABASE_SESSION=true): confirm JWT/session is visible to the SDK. */
export async function logTicketsSessionDebug(context: string): Promise<void> {
  const enabled =
    import.meta.env.DEV || String(import.meta.env.VITE_DEBUG_SUPABASE_SESSION ?? "").trim() === "true";
  if (!enabled) return;
  const session = await supabase.auth.getSession();
  // eslint-disable-next-line no-console
  console.log("SESSION DEBUG:", context, session);
}

const MAX_TENANT_TICKET_ROWS = 5000;

/** Normalise for comparison (organisations store slugs lowercased in create flow). */
export function normalizeOrgSlug(slug: string | null | undefined): string {
  return String(slug ?? "").trim().toLowerCase();
}

/** Escape `%`, `_`, `\` so `.ilike` matches the slug literally (case-insensitive). */
function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Resolve UUID → slug for aligning `tickets.client_slug` with `organisations.slug`. */
async function resolveOrganisationSlugFromId(orgId: string): Promise<string | null> {
  const id = String(orgId ?? "").trim();
  if (!id) return null;
  const { data, error } = await supabase.from("organisations").select("slug").eq("id", id).maybeSingle();
  if (error || data == null) return null;
  const slug = normalizeOrgSlug((data as { slug?: string | null }).slug ?? "");
  return slug || null;
}

export type OrganisationRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  [key: string]: unknown;
};

/** Single organisation by primary key (JWT session must allow RLS read). */
export async function fetchOrganisationById(orgId: string): Promise<OrganisationRow | null> {
  const id = String(orgId ?? "").trim();
  if (!id) return null;
  await logTicketsSessionDebug("fetchOrganisationById");
  const { data, error } = await supabase.from("organisations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (data == null) return null;
  const row = data as Record<string, unknown>;
  return {
    ...row,
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    status: String(row.status ?? ""),
  } as OrganisationRow;
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
 * Tenant-scoped ticket list: `client_slug` matches organisation slug (case-insensitive).
 */
export async function fetchTicketsByOrganisationSlug(orgSlug: string): Promise<Ticket[]> {
  const key = normalizeOrgSlug(orgSlug);
  if (!key) return [];

  await logTicketsSessionDebug("fetchTicketsByOrganisationSlug");

  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .ilike("client_slug", escapeIlikeExact(key))
    .order("created_at", { ascending: false })
    .limit(MAX_TENANT_TICKET_ROWS);

  if (import.meta.env.DEV) {
    const slugsSample = [...new Set((data ?? []).slice(0, 50).map((r: { client_slug?: string | null }) => String(r.client_slug ?? "")))];
    // eslint-disable-next-line no-console
    console.info("[tenantTickets] organisation slug:", key, "rowCount:", data?.length ?? 0, "sample client_slug:", slugsSample);
  }

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[tenantTickets]", error.message, error.code);
    }
    throw new Error(error.message);
  }

  const mapped = (data ?? []).map((r) => mapSupabaseTicketRow(r as Record<string, unknown>));
  return mapped.filter((t) => normalizeOrgSlug(t.client_slug) === key);
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

/** One fetch of ticket stubs for counting by org slug (Organisations overview). */
export type TicketStubRow = {
  id: string;
  client_slug: string | null;
  status: TicketStatus;
  needs_review?: boolean | null;
};

export async function fetchAllTicketsStubForSlugStats(): Promise<TicketStubRow[]> {
  await logTicketsSessionDebug("fetchAllTicketsStubForSlugStats");

  const { data, error } = await supabase
    .from("tickets")
    .select("id, client_slug, status, needs_review")
    .limit(MAX_TENANT_TICKET_ROWS);

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[organisationsTicketStats]", error.message, error.code);
    }
    throw new Error(error.message);
  }
  return (data ?? []) as TicketStubRow[];
}

/**
 * Ticket stubs only for known organisation slugs (matches `client_slug`; case-insensitive exact).
 * Prefer this for org cards so results are not truncated by unrelated rows before `.limit`.
 */
export async function fetchTicketStubsForOrganisationSlugs(organisationSlugs: string[]): Promise<TicketStubRow[]> {
  const normalized = [...new Set(organisationSlugs.map(normalizeOrgSlug).filter(Boolean))];
  if (normalized.length === 0) return [];
  await logTicketsSessionDebug("fetchTicketStubsForOrganisationSlugs");
  const orParts = normalized.map((s) => `client_slug.ilike.${escapeIlikeExact(s)}`);
  const { data, error } = await supabase
    .from("tickets")
    .select("id, client_slug, status, needs_review")
    .or(orParts.join(","))
    .limit(MAX_TENANT_TICKET_ROWS);

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[organisationsTicketStats] scoped stubs", error.message, error.code);
    }
    throw new Error(error.message);
  }

  const allow = new Set(normalized);
  return ((data ?? []) as TicketStubRow[]).filter((r) => allow.has(normalizeOrgSlug(r.client_slug)));
}

export function aggregateTicketCountsByNormalizedSlug(rows: TicketStubRow[]) {
  const byNorm: Record<
    string,
    { ticketIds: string[]; total: number; open: number; needsReview: number; distinctClientSlugs: Set<string> }
  > = {};

  for (const r of rows) {
    const norm = normalizeOrgSlug(r.client_slug);
    if (!norm) continue;
    if (!byNorm[norm]) {
      byNorm[norm] = {
        ticketIds: [],
        total: 0,
        open: 0,
        needsReview: 0,
        distinctClientSlugs: new Set(),
      };
    }
    const bucket = byNorm[norm];
    bucket.ticketIds.push(r.id);
    bucket.total += 1;
    if (!NON_OPEN_FINAL.includes(r.status)) bucket.open += 1;
    if (r.needs_review) bucket.needsReview += 1;
    const rawSlug = String(r.client_slug ?? "").trim();
    if (rawSlug) bucket.distinctClientSlugs.add(rawSlug);
  }
  return byNorm;
}

/** Ticket IDs that appear in sla_tracking with any breach flag set. */
export async function fetchBreachedTicketIds(ticketIds: string[]): Promise<Set<string>> {
  await logTicketsSessionDebug("fetchBreachedTicketIds");

  const out = new Set<string>();
  const uniq = [...new Set(ticketIds)].filter(Boolean);
  const chunkSize = 200;
  for (let i = 0; i < uniq.length; i += chunkSize) {
    const chunk = uniq.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("sla_tracking")
      .select("ticket_id")
      .in("ticket_id", chunk)
      .or(
        "assignment_breached.eq.true,onsite_breached.eq.true,resolution_breached.eq.true"
      );
    if (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error("[fetchBreachedTicketIds]", error.message, error.code);
      }
      continue;
    }
    for (const row of data ?? []) {
      if (row.ticket_id) out.add(String(row.ticket_id));
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

/** Main list reads for dashboards / All Tickets via Supabase (JWT attached by the SDK). */
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

  /** Tenant users must have organisation_id; never rely on broken RLS staff bypass alone. */
  if (!isSuperAdmin && !scopeAll && !organisationId) {
    return [];
  }

  let tenantScopeSlug: string | null = null;
  let tenantOrganisationId: string | null = null;

  /** SUPER_ADMIN optional org filter via UI (organisation id → slug + organisation_id). */
  if (isSuperAdmin && filters.organisationId != null && String(filters.organisationId).trim() !== "") {
    tenantOrganisationId = String(filters.organisationId).trim();
    tenantScopeSlug = await resolveOrganisationSlugFromId(tenantOrganisationId);
    if (!tenantScopeSlug) return [];
  } else if (!isSuperAdmin && !scopeAll && organisationId) {
    tenantOrganisationId = organisationId;
    if (isClient) {
      const fromFilter =
        filters.clientSlug != null && String(filters.clientSlug).trim() !== ""
          ? normalizeOrgSlug(String(filters.clientSlug))
          : "";
      tenantScopeSlug = fromFilter
        ? fromFilter
        : await resolveOrganisationSlugFromId(organisationId);
      if (!tenantScopeSlug) return [];
    }
  }

  let q = supabase
    .from("tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(maxRows, 1), 10_000));

  if (tenantOrganisationId) {
    q = q.eq("organisation_id", tenantOrganisationId);
  }

  if (tenantScopeSlug) {
    q = q.ilike("client_slug", escapeIlikeExact(tenantScopeSlug));
  }

  if (filters.reviewQueue === true) {
    q = q.or("status.eq.NEEDS_REVIEW,needs_review.eq.true");
  } else if (filters.status != null && filters.status !== "all") {
    q = q.eq("status", filters.status as string);
  }

  if (filters.clientSlug != null && String(filters.clientSlug).trim() !== "") {
    const cs = normalizeOrgSlug(String(filters.clientSlug));
    if (cs) q = q.ilike("client_slug", escapeIlikeExact(cs));
  }

  if (filters.state != null && String(filters.state).trim() !== "") {
    q = q.eq("state", String(filters.state).trim());
  }

  if (filters.needsReview === true && filters.reviewQueue !== true) {
    q = q.eq("needs_review", true);
  }

  if (filters.unassignedOnly) {
    q = q.is("current_assignment_id", null);
  }

  if (filters.dateFrom != null && String(filters.dateFrom).trim() !== "") {
    q = q.gte("opened_at", getStartOfDayIST(String(filters.dateFrom).trim()).toISOString());
  }
  if (filters.dateTo != null && String(filters.dateTo).trim() !== "") {
    q = q.lte("opened_at", getEndOfDayIST(String(filters.dateTo).trim()).toISOString());
  }

  const orFilter =
    filters.search != null && String(filters.search).trim() !== ""
      ? buildTicketSearchOrFilter(filters.search!, {
          extraClientSlugs: filters.searchMatchingClientSlugs,
          extraOrganisationIds: filters.searchMatchingOrganisationIds,
        })
      : null;
  if (orFilter) {
    q = q.or(orFilter);
  }

  const { data, error } = await q;

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("[fetchWorkspaceTicketsList]", error.message, error.code);
    }
    throw new Error(error.message);
  }

  let rows = (data ?? []).map((r) => mapSupabaseTicketRow(r as Record<string, unknown>));

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
