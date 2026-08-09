import { useQuery } from "@tanstack/react-query";
import { fetchPlatformSettings } from "../lib/platformApi";

export function usePlatformSettings(organisationId?: string) {
  return useQuery({
    queryKey: ["platform-settings", organisationId ?? "self"],
    queryFn: () => fetchPlatformSettings(organisationId),
    staleTime: 30_000,
  });
}
