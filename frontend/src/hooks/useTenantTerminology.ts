import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/backendDataApi";
import {
  getOrgTicketConfigKey,
  parseTerminologyFromConfig,
  DEFAULT_FIELD_EXECUTIVE_LABEL,
  DEFAULT_TICKET_PREFIX_DISPLAY,
} from "@/lib/orgTicketConfig";
import { isTenantConfigurationEnabled } from "@/lib/tenantConfigurationFeature";

export type TenantTerminology = {
  fieldExecutiveLabel: string;
  fieldExecutivesLabel: string;
  ticketPrefixDisplay: string;
  /** When true, UI may show ticketPrefixDisplay beside stored ticket_number. */
  showTicketPrefix: boolean;
  terminologyActive: boolean;
};

const FALLBACK_TERMINOLOGY: TenantTerminology = {
  fieldExecutiveLabel: DEFAULT_FIELD_EXECUTIVE_LABEL,
  fieldExecutivesLabel: "Field Executives",
  ticketPrefixDisplay: DEFAULT_TICKET_PREFIX_DISPLAY,
  showTicketPrefix: false,
  terminologyActive: false,
};

/** Plural nav label from singular tenant terminology. */
export function pluralFieldExecutiveLabel(singular: string): string {
  if (singular === DEFAULT_FIELD_EXECUTIVE_LABEL) return "Field Executives";
  if (singular.endsWith("s") || singular.endsWith("S")) return singular;
  return `${singular}s`;
}

/**
 * Loads ticketPrefixDisplay + fieldExecutiveLabel from org_<id>_ticket_config.
 * Shares React Query cache with Ticket Settings / Create Ticket config fetch.
 */
export function useTenantTerminology(organisationId?: string | null): TenantTerminology {
  const tenantConfigEnabled = isTenantConfigurationEnabled();
  const orgId = organisationId ?? null;
  const configKey = orgId ? getOrgTicketConfigKey(orgId) : null;

  const queryEnabled = tenantConfigEnabled && Boolean(configKey);

  const { data: configRow, isLoading, isError } = useQuery({
    queryKey: ["configurations", configKey],
    enabled: queryEnabled,
    queryFn: async () => {
      return await fetchJson<{ key: string; value: Record<string, unknown> | null } | null>(
        `/data/configurations/${encodeURIComponent(configKey!)}`
      );
    },
  });

  return useMemo(() => {
    if (!tenantConfigEnabled) return FALLBACK_TERMINOLOGY;

    const loaded =
      queryEnabled && !isLoading && !isError && configRow?.value && typeof configRow.value === "object";

    if (!loaded) return FALLBACK_TERMINOLOGY;

    const { fieldExecutiveLabel, ticketPrefixDisplay } = parseTerminologyFromConfig(
      configRow.value as Record<string, unknown>
    );

    return {
      fieldExecutiveLabel,
      fieldExecutivesLabel: pluralFieldExecutiveLabel(fieldExecutiveLabel),
      ticketPrefixDisplay,
      showTicketPrefix: Boolean(ticketPrefixDisplay.trim()),
      terminologyActive: true,
    };
  }, [tenantConfigEnabled, queryEnabled, isLoading, isError, configRow?.value]);
}
