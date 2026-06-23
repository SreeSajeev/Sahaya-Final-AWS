import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/backendDataApi";
import type { TenantClient } from "@/lib/types";

export function useTenantClients(options?: {
  organisationId?: string | null;
  activeOnly?: boolean;
  enabled?: boolean;
}) {
  const enabled = options?.enabled !== false;
  const organisationId = options?.organisationId ?? null;
  const activeOnly = options?.activeOnly === true;

  return useQuery({
    queryKey: ["tenant-clients", organisationId, activeOnly],
    enabled,
    queryFn: async (): Promise<TenantClient[]> => {
      const params = new URLSearchParams();
      if (organisationId) params.set("organisationId", organisationId);
      if (activeOnly) params.set("activeOnly", "true");
      const qs = params.toString();
      const res = await fetchJson<{ items: TenantClient[] }>(
        `/data/clients${qs ? `?${qs}` : ""}`
      );
      return res.items ?? [];
    },
  });
}

/** Ticket create modal — active clients for current tenant (or all for super admin). */
export function useTenantClientsForPicker(options?: { enabled?: boolean }) {
  return useTenantClients({ activeOnly: true, enabled: options?.enabled });
}

export function useCreateTenantClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return await fetchJson<TenantClient>("/data/clients", {
        method: "POST",
        body,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-clients"] });
    },
  });
}

export function useUpdateTenantClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      return await fetchJson<TenantClient>(`/data/clients/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-clients"] });
    },
  });
}

export function useDeleteTenantClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await fetchJson<{ success: boolean; id: string }>(
        `/data/clients/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-clients"] });
    },
  });
}
