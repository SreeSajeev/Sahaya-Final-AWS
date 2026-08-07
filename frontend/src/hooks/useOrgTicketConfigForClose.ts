import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { RESOLUTION_CATEGORIES } from "@/constants/complaintCategories";
import { fetchJson } from "@/lib/backendDataApi";
import {
  getOrgTicketConfigKey,
  resolveTenantStringList,
  type OrgTicketConfig,
} from "@/lib/orgTicketConfig";
import { isTenantConfigurationEnabled } from "@/lib/tenantConfigurationFeature";

/**
 * Loads org resolution categories for the close dialog.
 * Falls back to RESOLUTION_CATEGORIES when flag off, org missing, or list empty.
 */
export function useOrgTicketConfigForClose(options: {
  organisationId: string | null;
  enabled?: boolean;
}) {
  const tenantConfigEnabled = isTenantConfigurationEnabled();
  const organisationId = options.organisationId ?? null;
  const configKey = organisationId ? getOrgTicketConfigKey(organisationId) : null;

  const queryEnabled =
    options.enabled !== false && tenantConfigEnabled && Boolean(configKey);

  const { data: configRow, isLoading, isError } = useQuery({
    queryKey: ["configurations", configKey],
    enabled: queryEnabled,
    queryFn: async () => {
      return await fetchJson<{ key: string; value: Record<string, unknown> | null } | null>(
        `/data/configurations/${encodeURIComponent(configKey!)}`
      );
    },
  });

  const value = configRow?.value;
  const resolutionFromConfig = Array.isArray(value?.resolutionCategories)
    ? (value.resolutionCategories as string[])
    : undefined;
  const closeFormFields = Array.isArray(value?.closeFormFields)
    ? (value.closeFormFields as NonNullable<OrgTicketConfig["closeFormFields"]>)
        .filter((field) => field && typeof field.id === "string" && typeof field.label === "string")
        .sort((a, b) => a.displayOrder - b.displayOrder)
    : [];

  const useTenantLists =
    tenantConfigEnabled && !isError && !isLoading && Boolean(configRow?.value);

  const resolutionCategoryOptions = useMemo(
    () => resolveTenantStringList(resolutionFromConfig, RESOLUTION_CATEGORIES, useTenantLists),
    [resolutionFromConfig, useTenantLists]
  );

  return {
    resolutionCategoryOptions,
    isLoadingConfig: queryEnabled && isLoading,
    usesTenantConfig: useTenantLists,
    closeFormFields,
  };
}

export type { OrgTicketConfig };
