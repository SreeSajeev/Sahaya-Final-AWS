import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/backendDataApi";

export type FEActionToken = {
  id: string;
  ticket_id: string;
  fe_id: string;
  action_type: "ON_SITE" | "RESOLUTION";
  expires_at: string;
  used: boolean;
  created_at: string;
};

export function useFETokenForTicket(ticketId: string) {
  return useQuery<FEActionToken | null>({
    queryKey: ["fe-token-for-ticket", ticketId],
    enabled: Boolean(ticketId),
    retry: false,
    refetchOnWindowFocus: false,

    queryFn: async () => {
      if (!ticketId) return null;
      try {
        const res = await fetchJson<{ token: FEActionToken | null }>(
          `/data/tickets/${encodeURIComponent(ticketId)}/fe-action-tokens/active`
        );
        return res.token ?? null;
      } catch {
        return null;
      }
    },
  });
}
