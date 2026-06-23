import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logTicketsSessionDebug } from "@/lib/tenantTicketsSupabase";

export interface OrganizationRow {
  slug: string;
  displayName: string;
  ticketCount: number;
}

function slugToDisplayName(slug: string): string {
  const trimmed = String(slug).trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

/**
 * Distinct client_slug values from tickets with counts (Supabase client + user JWT).
 */
export function useOrganizations() {
  const { userProfile, session } = useAuth();

  return useQuery({
    queryKey: ["organizations", session?.user?.id],
    enabled: Boolean(session?.access_token && userProfile?.id),
    queryFn: async (): Promise<OrganizationRow[]> => {
      await logTicketsSessionDebug("useOrganizations");
      const { data, error } = await supabase.from("tickets").select("client_slug").limit(2000);
      if (error) {
        throw new Error(error.message);
      }

      const rows = data ?? [];

      const slugs = rows
        .map((row) => row.client_slug)
        .filter((s): s is string => s != null && String(s).trim() !== "");

      const countBySlug: Record<string, number> = {};
      for (const slug of slugs) {
        const key = String(slug).trim();
        countBySlug[key] = (countBySlug[key] ?? 0) + 1;
      }

      const unique = [...new Set(slugs.map((s) => String(s).trim()))];
      return unique
        .sort((a, b) => a.localeCompare(b))
        .map((slug) => ({
          slug,
          displayName: slugToDisplayName(slug),
          ticketCount: countBySlug[slug] ?? 0,
        }));
    },
    refetchInterval: 30000,
  });
}
