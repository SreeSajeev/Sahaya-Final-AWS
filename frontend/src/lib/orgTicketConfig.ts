/** Shared helpers for org_<organisationId>_ticket_config (configurations table). */

export const ORG_TICKET_CONFIG_KEY_PREFIX = "org_";
export const ORG_TICKET_CONFIG_KEY_SUFFIX = "_ticket_config";

export function getOrgTicketConfigKey(organisationId: string): string {
  return `${ORG_TICKET_CONFIG_KEY_PREFIX}${organisationId}${ORG_TICKET_CONFIG_KEY_SUFFIX}`;
}

export const DEFAULT_FIELD_EXECUTIVE_LABEL = "Field Executive";
export const DEFAULT_TICKET_PREFIX_DISPLAY = "TKT";

export interface OrgTicketConfig {
  categories: string[];
  issueTypes: string[];
  resolutionCategories?: string[];
  sla: {
    assignmentHours: number;
    onsiteHours: number;
    resolutionHours: number;
  };
  ticketPrefixDisplay?: string;
  fieldExecutiveLabel?: string;
  /** When true, ticket create allows free-text "Other…" vehicle entry. Default false. */
  allowManualVehicle?: boolean;
}

export function parseTerminologyFromConfig(raw: Record<string, unknown> | null | undefined): {
  fieldExecutiveLabel: string;
  ticketPrefixDisplay: string;
} {
  const v = raw && typeof raw === "object" ? raw : {};
  const fieldExecutiveLabel =
    typeof v.fieldExecutiveLabel === "string" && v.fieldExecutiveLabel.trim()
      ? v.fieldExecutiveLabel.trim()
      : DEFAULT_FIELD_EXECUTIVE_LABEL;
  const ticketPrefixDisplay =
    typeof v.ticketPrefixDisplay === "string" && v.ticketPrefixDisplay.trim()
      ? v.ticketPrefixDisplay.trim()
      : DEFAULT_TICKET_PREFIX_DISPLAY;
  return { fieldExecutiveLabel, ticketPrefixDisplay };
}

/** Keep "Other" last so custom-entry UX matches legacy create-ticket flow. */
export function ensureOtherLast(items: string[]): string[] {
  const trimmed = items.map((s) => String(s).trim()).filter(Boolean);
  const rest = trimmed.filter((x) => x !== "Other");
  return [...rest, "Other"];
}

/** Tenant lists when configured and non-empty; otherwise hardcoded defaults. */
export function resolvePickerOptions(
  configured: string[] | undefined,
  fallback: readonly string[],
  useTenantConfig: boolean
): string[] {
  if (!useTenantConfig) return [...fallback];
  if (!Array.isArray(configured) || configured.length === 0) return [...fallback];
  const items = configured.map((s) => String(s).trim()).filter(Boolean);
  if (items.length === 0) return [...fallback];
  return ensureOtherLast(items);
}

/** Tenant string lists without forcing "Other" (resolution categories, etc.). */
export function resolveTenantStringList(
  configured: string[] | undefined,
  fallback: readonly string[],
  useTenantConfig: boolean
): string[] {
  if (!useTenantConfig) return [...fallback];
  if (!Array.isArray(configured) || configured.length === 0) return [...fallback];
  const items = configured.map((s) => String(s).trim()).filter(Boolean);
  if (items.length === 0) return [...fallback];
  return items;
}
