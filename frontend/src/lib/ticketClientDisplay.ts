/**
 * Ticket table Client column display — prefer tenant_clients.company_short_name.
 * Lookup is keyed by organisation_id + client slug so SUPER_ADMIN multi-org
 * lists cannot collide when two orgs share the same slug.
 * client_slug remains the internal identifier and fallback.
 */

export function normalizeClientSlugKey(slug: string): string {
  return String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** Stable map key: organisation_id + normalized client slug. */
export function companyShortNameLookupKey(
  organisationId: string | null | undefined,
  slug: string | null | undefined
): string {
  const org = String(organisationId ?? "").trim();
  const normalized = normalizeClientSlugKey(String(slug ?? ""));
  if (!org || !normalized) return "";
  return `${org}::${normalized}`;
}

/**
 * Build organisation+slug → company_short_name map.
 * Requires organisation_id on each client (as returned by /data/clients).
 */
export function buildCompanyShortNameBySlug(
  tenantClients: {
    organisation_id?: string | null;
    slug?: string | null;
    company_short_name?: string | null;
  }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const client of tenantClients) {
    const short = String(client.company_short_name ?? "").trim();
    if (!short) continue;
    const key = companyShortNameLookupKey(client.organisation_id, client.slug);
    if (!key) continue;
    map[key] = short;
  }
  return map;
}

/**
 * User-facing Client label for ticket tables.
 * Prefer ticket.company_short_name, then map by organisation_id + client_slug,
 * else slug, else em dash.
 */
export function ticketClientTableLabel(
  ticket: {
    organisation_id?: string | null;
    client_slug?: string | null;
    company_short_name?: string | null;
  },
  companyShortNameByOrgSlug?: Record<string, string> | null
): string {
  const direct = String(ticket.company_short_name ?? "").trim();
  if (direct) return direct;

  const slug = String(ticket.client_slug ?? "").trim();
  if (!slug) return "—";

  if (companyShortNameByOrgSlug) {
    const key = companyShortNameLookupKey(ticket.organisation_id, slug);
    if (key) {
      const short = String(companyShortNameByOrgSlug[key] ?? "").trim();
      if (short) return short;
    }
  }

  return slug;
}

/** Read-only Category label for Verify & Close (not resolution_category). */
export function ticketCategoryCloseDisplay(
  category: string | null | undefined
): string {
  const trimmed = String(category ?? "").trim();
  return trimmed || "—";
}
