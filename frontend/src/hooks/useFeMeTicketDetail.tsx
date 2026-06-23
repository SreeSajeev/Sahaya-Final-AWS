import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/backendDataApi";

/** Payload item from GET /fe/me/tickets/:ticketId (same shape as list rows). */
export type FeMeTicketDetail = Record<string, unknown> & {
  id: string;
  ticket_number?: string;
  status?: string;
  tokens?: {
    onSite?: {
      id: string;
      expires_at?: string;
      token_state?: string;
      used?: boolean;
      /** false when token used/expired; omitted on older APIs (treat as true if id present). */
      actionable?: boolean;
    } | null;
    resolution?: {
      id: string;
      expires_at?: string;
      token_state?: string;
      used?: boolean;
      actionable?: boolean;
    } | null;
  } | null;
  resolution_locked?: boolean;
  assignment_due?: string | null;
  reporter_display?: string | null;
  creator_display?: string | null;
  priority?: boolean;
  priority_level?: import('@/lib/priority').PriorityLevel;
  sla?: Record<string, unknown> | null;
};

export function useFeMeTicketDetail(ticketId: string) {
  return useQuery<FeMeTicketDetail | null>({
    queryKey: ["fe-me-ticket", ticketId],
    enabled: Boolean(ticketId),
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetchJson<{ item: FeMeTicketDetail | null }>(
        `/fe/me/tickets/${encodeURIComponent(ticketId)}`
      );
      return res.item ?? null;
    },
  });
}
