import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { COMPLAINT_CATEGORIES, ISSUE_TYPES } from "@/constants/complaintCategories";
import { fetchJson } from "@/lib/backendDataApi";
import { getOrgTicketConfigKey, resolvePickerOptions, type OrgTicketConfig } from "@/lib/orgTicketConfig";
import { isTenantConfigurationEnabled } from "@/lib/tenantConfigurationFeature";

/**
 * Loads org ticket config for create-ticket dropdowns.
 * Falls back to complaintCategories constants when flag off, org missing, or lists empty.
 */
export function useOrgTicketConfigForCreate(options: {
  organisationId: string | null;
  enabled?: boolean;
}) {
  const tenantConfigEnabled = isTenantConfigurationEnabled();
  const organisationId = options.organisationId ?? null;
  const configKey = organisationId ? getOrgTicketConfigKey(organisationId) : null;

  const queryEnabled =
    options.enabled !== false &&
    tenantConfigEnabled &&
    Boolean(configKey);

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
  const categoriesFromConfig = Array.isArray(value?.categories) ? (value.categories as string[]) : undefined;
  const issueTypesFromConfig = Array.isArray(value?.issueTypes) ? (value.issueTypes as string[]) : undefined;
  const allowManualVehicle = value?.allowManualVehicle === true;

  const useTenantLists =
    tenantConfigEnabled &&
    !isError &&
    !isLoading &&
    Boolean(configRow?.value);

  const categoryOptions = useMemo(
    () => resolvePickerOptions(categoriesFromConfig, COMPLAINT_CATEGORIES, useTenantLists),
    [categoriesFromConfig, useTenantLists]
  );

  const issueTypeOptions = useMemo(
    () => resolvePickerOptions(issueTypesFromConfig, ISSUE_TYPES, useTenantLists),
    [issueTypesFromConfig, useTenantLists]
  );

  return {
    categoryOptions,
    issueTypeOptions,
    allowManualVehicle,
    isLoadingConfig: queryEnabled && isLoading,
    usesTenantConfig: useTenantLists,
  };
}

export type { OrgTicketConfig };
