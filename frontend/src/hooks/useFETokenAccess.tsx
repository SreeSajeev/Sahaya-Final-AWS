import { useQuery } from "@tanstack/react-query";
import { fetchPublicJson } from "@/lib/backendDataApi";

export function useFETokenAccess(token: string | null) {
  return useQuery({
    queryKey: ["fe-token", token],
    enabled: !!token,
    retry: false,

    queryFn: async () => {
      if (!token) {
        throw new Error("No token provided");
      }
      const cleanToken = token.trim();
      return await fetchPublicJson<Record<string, unknown>>(
        `/auth/public/access-tokens/by-hash?tokenHash=${encodeURIComponent(cleanToken)}`
      );
    },
  });
}
