import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { fetchJson } from "@/lib/backendDataApi";

/** Per-ticket display fields not on the base `tickets` row (additive). */
export type TicketRowSupplement = {
  assignedFeName: string | null;
  assignedAt: string | null;
  dueAssignment: string | null;
};

type SupplementResponse = {
  supplement?: Record<string, TicketRowSupplement>;
  requestId?: string;
};

/**
 * Fetches latest assignment + SLA deadline for ticket list rows via CRM backend
 * (`POST /data/tickets-row-supplement`). Avoids browser → Supabase REST calls that hit
 * RLS 403 (e.g. `ticket_assignments` / embedded `field_executives` staff-only policies)
 * and avoids oversized `.in()` URLs.
 */
export function useTicketListSupplement(ticketIds: string[]) {
  const { session } = useAuth();
  const uniq = [...new Set(ticketIds.filter(Boolean))].sort();
  const stableKey = uniq.join(",");

  return useQuery({
    queryKey: ["ticket-list-supplement", stableKey, session?.user?.id],
    enabled: Boolean(session?.access_token && uniq.length > 0),
    queryFn: async (): Promise<Record<string, TicketRowSupplement>> => {
      const empty = (): TicketRowSupplement => ({
        assignedFeName: null,
        assignedAt: null,
        dueAssignment: null,
      });

      const out: Record<string, TicketRowSupplement> = {};
      for (const id of uniq) out[id] = empty();

      try {
        const res = await fetchJson<SupplementResponse>("/data/tickets-row-supplement", {
          method: "POST",
          body: { ticket_ids: uniq },
        });
        const sup = res?.supplement ?? {};
        for (const id of uniq) {
          const row = sup[id];
          if (!row) continue;
          out[id] = {
            assignedFeName: row.assignedFeName ?? null,
            assignedAt: row.assignedAt ?? null,
            dueAssignment: row.dueAssignment ?? null,
          };
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[useTicketListSupplement] backend supplement failed:", e);
        }
      }

      return out;
    },
  });
}
