/**
 * Ticket list search utilities — server-side PostgREST `.or()` filters + optional client-side match.
 * PostgREST `or` splits on commas; user input must not contain raw commas in the filter string.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Trim and normalize spaces; remove characters that break PostgREST `or=(...)` parsing.
 * We strip `%` so users can't inject LIKE wildcards, but we keep `_` — issue types often
 * use underscores (e.g. `Engine_Oil`) and stripping `_` broke matching those values.
 */
export function sanitizeTicketSearchInput(raw: string): string {
  return raw
    .trim()
    .replace(/,/g, ' ')
    .replace(/%/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isValidUuidString(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

/**
 * PostgREST filter values that contain `.`, `,`, `()`, etc. must be double-quoted or the parser breaks.
 * @see https://postgrest.org/en/stable/references/api/tables_views.html#horizontal-filtering-rows
 */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * PostgREST `col.ilike.PATTERN` tokenizes on `.`; if PATTERN contains `.`, it must be quoted.
 * For simple patterns (no dots), unquoted `%term%` matches what `.ilike()` uses internally.
 */
function formatIlikeOrFragment(column: string, pattern: string): string {
  return `${column}.ilike.${pattern.includes('.') ? quotePostgrestValue(pattern) : pattern}`;
}

/** Shared ticket text columns for server + client search. */
export const TICKET_SEARCH_TEXT_COLUMNS = [
  'issue_type',
  'category',
  'ticket_number',
  'complaint_id',
  'vehicle_number',
  'short_description',
  'location',
  'state',
  'opened_by_email',
  'source',
  'status',
  'verification_remarks',
  'review_notes',
  'resolution_category',
  'client_slug',
] as const;

export type TicketSearchFields = {
  id: string;
  ticket_number: string;
  complaint_id?: string | null;
  vehicle_number?: string | null;
  short_description?: string | null;
  category?: string | null;
  issue_type?: string | null;
  location?: string | null;
  state?: string | null;
  opened_by_email?: string | null;
  source?: string | null;
  status?: string | null;
  verification_remarks?: string | null;
  review_notes?: string | null;
  resolution_category?: string | null;
  client_slug?: string | null;
  organisation_id?: string | null;
};

/** Serializable lookup for client/org display names (All Tickets search). */
export type TicketClientSearchLookup = {
  clientNameBySlug: Record<string, string>;
  organisationNameById: Record<string, string>;
  organisationSlugById: Record<string, string>;
};

export type TicketSearchExtras = {
  assignedFeName?: string | null;
  statusLabels?: Record<string, string>;
  clientSearchLookup?: TicketClientSearchLookup;
};

export type TicketSearchHints = {
  extraClientSlugs?: string[];
  extraOrganisationIds?: string[];
};

function normalizeSlugKey(slug: string | null | undefined): string {
  return String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/**
 * Build lookup maps for client-side search (display names not stored on ticket rows).
 */
export function buildTicketClientSearchLookup(
  organisations: { id: string; name: string; slug?: string | null }[],
  tenantClients: { slug: string; name: string }[]
): TicketClientSearchLookup {
  const clientNameBySlug: Record<string, string> = {};
  for (const client of tenantClients) {
    const key = normalizeSlugKey(client.slug);
    if (!key) continue;
    const name = String(client.name ?? "").trim();
    if (name) clientNameBySlug[key] = name;
  }

  const organisationNameById: Record<string, string> = {};
  const organisationSlugById: Record<string, string> = {};
  for (const org of organisations) {
    const name = String(org.name ?? "").trim();
    if (name) organisationNameById[org.id] = name;
    const slug = String(org.slug ?? "").trim();
    if (slug) {
      organisationSlugById[org.id] = slug;
      const slugKey = normalizeSlugKey(slug);
      if (slugKey && !clientNameBySlug[slugKey]) {
        clientNameBySlug[slugKey] = name;
      }
    }
  }

  return { clientNameBySlug, organisationNameById, organisationSlugById };
}

/**
 * Resolve client slugs / organisation ids whose name or slug partially matches the search term.
 * Used to widen the PostgREST `.or()` filter when display names differ from `client_slug`.
 */
export function resolveTicketSearchHints(
  searchRaw: string,
  organisations: { id: string; name: string; slug?: string | null; short_name?: string | null }[],
  tenantClients: { slug: string; name: string }[]
): TicketSearchHints {
  const term = sanitizeTicketSearchInput(searchRaw).toLowerCase();
  if (!term) return {};

  const extraClientSlugs = new Set<string>();
  for (const client of tenantClients) {
    const slug = String(client.slug ?? "").toLowerCase();
    const name = String(client.name ?? "").toLowerCase();
    if ((slug && slug.includes(term)) || (name && name.includes(term))) {
      if (client.slug) extraClientSlugs.add(String(client.slug).trim());
    }
  }

  const extraOrganisationIds = new Set<string>();
  for (const org of organisations) {
    const name = String(org.name ?? "").toLowerCase();
    const slug = String(org.slug ?? "").toLowerCase();
    const shortName = String(org.short_name ?? "").toLowerCase();
    if (
      (name && name.includes(term)) ||
      (slug && slug.includes(term)) ||
      (shortName && shortName.includes(term))
    ) {
      extraOrganisationIds.add(org.id);
      const slugRaw = String(org.slug ?? "").trim();
      if (slugRaw) extraClientSlugs.add(slugRaw);
    }
  }

  return {
    extraClientSlugs: extraClientSlugs.size > 0 ? [...extraClientSlugs] : undefined,
    extraOrganisationIds:
      extraOrganisationIds.size > 0 ? [...extraOrganisationIds] : undefined,
  };
}

/**
 * Build PostgREST `.or()` filter string for ilike across ticket text columns + optional exact id match.
 * Returns null when search should be treated as "no filter" (empty after sanitize).
 */
export function buildTicketSearchOrFilter(
  searchRaw: string,
  hints?: TicketSearchHints
): string | null {
  const term = sanitizeTicketSearchInput(searchRaw);
  if (!term && !hints?.extraClientSlugs?.length && !hints?.extraOrganisationIds?.length) {
    return null;
  }

  const pattern = term ? `%${term}%` : null;
  const parts: string[] = [];

  if (term && isValidUuidString(term)) {
    parts.push(`id.eq.${quotePostgrestValue(term.trim())}`);
  }

  if (pattern) {
    for (const col of TICKET_SEARCH_TEXT_COLUMNS) {
      parts.push(formatIlikeOrFragment(col, pattern));
    }
  }

  for (const slug of hints?.extraClientSlugs ?? []) {
    const s = String(slug).trim();
    if (!s) continue;
    parts.push(`client_slug.ilike.${quotePostgrestValue(`%${s}%`)}`);
  }

  const orgIds = (hints?.extraOrganisationIds ?? []).filter(Boolean);
  if (orgIds.length > 0) {
    const inList = orgIds.map((id) => quotePostgrestValue(String(id))).join(",");
    parts.push(`organisation_id.in.(${inList})`);
  }

  if (parts.length === 0) return null;
  return parts.join(",");
}

function collectTicketSearchFieldValues(
  ticket: TicketSearchFields,
  extras?: TicketSearchExtras
): string[] {
  const statusLabel =
    ticket.status && extras?.statusLabels?.[ticket.status]
      ? extras.statusLabels[ticket.status]
      : null;

  const lookup = extras?.clientSearchLookup;
  const clientSlugKey = normalizeSlugKey(ticket.client_slug);
  const clientName =
    clientSlugKey && lookup?.clientNameBySlug?.[clientSlugKey]
      ? lookup.clientNameBySlug[clientSlugKey]
      : null;
  const organisationName =
    ticket.organisation_id && lookup?.organisationNameById?.[ticket.organisation_id]
      ? lookup.organisationNameById[ticket.organisation_id]
      : null;
  const organisationSlug =
    ticket.organisation_id && lookup?.organisationSlugById?.[ticket.organisation_id]
      ? lookup.organisationSlugById[ticket.organisation_id]
      : null;

  return [
    ticket.id,
    ticket.ticket_number,
    ticket.complaint_id,
    ticket.vehicle_number,
    ticket.short_description,
    ticket.category,
    ticket.issue_type,
    ticket.location,
    ticket.opened_by_email,
    ticket.source,
    ticket.status,
    statusLabel,
    ticket.verification_remarks,
    ticket.review_notes,
    ticket.resolution_category,
    ticket.client_slug,
    clientName,
    organisationName,
    organisationSlug,
    extras?.assignedFeName,
  ];
}

/**
 * Client-side match across ticket fields (for tests / optional fallback). Case-insensitive partial match.
 */
export function ticketMatchesSearch(
  ticket: TicketSearchFields,
  searchRaw: string,
  extras?: TicketSearchExtras
): boolean {
  const term = sanitizeTicketSearchInput(searchRaw);
  if (!term) return true;

  const q = term.toLowerCase();
  return collectTicketSearchFieldValues(ticket, extras).some(
    (f) => f != null && String(f).toLowerCase().includes(q)
  );
}

/** Client portal unified search (includes friendly status labels + assigned FE name). */
export function ticketMatchesClientPortalSearch(
  ticket: TicketSearchFields,
  searchRaw: string,
  extras?: TicketSearchExtras
): boolean {
  return ticketMatchesSearch(ticket, searchRaw, extras);
}
