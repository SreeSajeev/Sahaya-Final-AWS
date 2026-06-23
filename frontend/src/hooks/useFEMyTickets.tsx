import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchJson } from "@/lib/backendDataApi";

type FETwitter = {
  id: string;
  ticket_number: string;
  status: string;
  location?: string | null;
  issue_type?: string | null;
  opened_at?: string | null;
};

/** @deprecated Prefer FEMyTickets page + `/fe/me/tickets` via React Query. */
export function useFEMyTickets() {
  const { user } = useAuth();

  const [tickets, setTickets] = useState<FETwitter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.email) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetchJson<{ items: FETwitter[] }>("/fe/me/tickets");
        setTickets(res.items ?? []);
      } catch (err: unknown) {
        console.error("FE ticket fetch failed:", err);
        setError(err instanceof Error ? err.message : "Failed to load tickets");
        setTickets([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.email]);

  return { tickets, loading, error };
}
