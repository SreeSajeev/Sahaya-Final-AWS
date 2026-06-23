import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/backendDataApi";
import type {
  ComplaintPoint,
  ComplaintPointCreateBody,
  ComplaintPointUpdateBody,
} from "@/lib/complaintPointsApi";

export function useComplaintPoints(options?: {
  organisationId?: string | null;
  status?: "active" | "disabled" | null;
  enabled?: boolean;
}) {
  const enabled = options?.enabled !== false;
  const organisationId = options?.organisationId ?? null;
  const status = options?.status ?? null;

  return useQuery({
    queryKey: ["complaint-points", organisationId, status],
    enabled,
    queryFn: async (): Promise<ComplaintPoint[]> => {
      const params = new URLSearchParams();
      if (organisationId) params.set("organisation_id", organisationId);
      if (status) params.set("status", status);
      const qs = params.toString();
      const res = await fetchJson<{ items: ComplaintPoint[] }>(
        `/complaint-points${qs ? `?${qs}` : ""}`
      );
      return res.items ?? [];
    },
  });
}

export function useCreateComplaintPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: ComplaintPointCreateBody) => {
      return await fetchJson<ComplaintPoint>("/complaint-points", {
        method: "POST",
        body,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaint-points"] });
    },
  });
}

export function useUpdateComplaintPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: ComplaintPointUpdateBody }) => {
      return await fetchJson<ComplaintPoint>(`/complaint-points/${encodeURIComponent(id)}`, {
        method: "PUT",
        body,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaint-points"] });
    },
  });
}

export function useDisableComplaintPoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await fetchJson<ComplaintPoint>(
        `/complaint-points/${encodeURIComponent(id)}/disable`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaint-points"] });
    },
  });
}

export function useRegenerateComplaintPointToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return await fetchJson<ComplaintPoint>(
        `/complaint-points/${encodeURIComponent(id)}/regenerate-token`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complaint-points"] });
    },
  });
}
