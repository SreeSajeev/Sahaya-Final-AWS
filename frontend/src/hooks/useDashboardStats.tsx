import { useQuery } from '@tanstack/react-query';
import { DashboardStats } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { fetchJson } from "@/lib/backendDataApi";

export type DashboardStatsQuery = {
  clientSlug?: string | null;
  state?: string | null;
  organisationIdOverride?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export function useDashboardStats(query: DashboardStatsQuery = {}) {
  const { userProfile } = useAuth();
  const organisationId = userProfile?.organisation_id ?? null;
  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';
  const {
    clientSlug = null,
    state = null,
    organisationIdOverride = null,
    startDate = null,
    endDate = null,
  } = query;

  return useQuery({
    queryKey: [
      'dashboard-stats',
      clientSlug ?? 'all',
      state ?? 'all',
      organisationId,
      isSuperAdmin,
      organisationIdOverride,
      startDate,
      endDate,
    ],
    queryFn: async (): Promise<DashboardStats> => {
      const params = new URLSearchParams();
      if (clientSlug != null && clientSlug !== "") params.set("clientSlug", clientSlug);
      if (state != null && state !== "") params.set("state", state);
      if (isSuperAdmin && organisationIdOverride != null && organisationIdOverride !== "") {
        params.set("organisationId", organisationIdOverride);
      }
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      return await fetchJson<DashboardStats>(`/data/dashboard/stats?${params.toString()}`);
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}
