import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Organisation } from "@/lib/types";
import { fetchJson } from "@/lib/backendDataApi";

/** Map DB row → app Organisation (email arrays may be absent on older schemas). */
function mapOrgRow(row: {
  id: string;
  name: string;
  slug: string;
  created_at: string | null;
  status: string;
  incoming_emails?: unknown;
  outgoing_emails?: unknown;
  spoc_name?: string | null;
  spoc_email?: string | null;
  spoc_phone?: string | null;
}): Organisation {
  const toStrArr = (j: unknown) =>
    Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : [];

  const org: Organisation = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    created_at: row.created_at ?? "",
    status: row.status,
  };
  const incoming = toStrArr(row.incoming_emails ?? null);
  const outgoing = toStrArr(row.outgoing_emails ?? null);
  if (incoming.length) org.incoming_emails = incoming;
  if (outgoing.length) org.outgoing_emails = outgoing;
  if (row.spoc_name != null && String(row.spoc_name).trim() !== "") org.spoc_name = String(row.spoc_name).trim();
  if (row.spoc_email != null && String(row.spoc_email).trim() !== "") org.spoc_email = String(row.spoc_email).trim();
  if (row.spoc_phone != null && String(row.spoc_phone).trim() !== "") org.spoc_phone = String(row.spoc_phone).trim();
  return org;
}

/**
 * Organisations — backend Prisma API (`/data/organisations`).
 */
export function useOrganisationsTable(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  return useQuery({
    queryKey: ["organisations-table"],
    enabled,
    queryFn: async (): Promise<Organisation[]> => {
      const res = await fetchJson<{ items: Parameters<typeof mapOrgRow>[0][] }>(
        "/data/organisations"
      );
      return (res.items ?? []).map(mapOrgRow);
    },
  });
}

function normalizeEmailArray(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Create a new organisation via backend Prisma API. Super Admin only.
 * Does not provision Supabase Auth users (Auth remains frozen separately).
 */
export function useCreateOrganisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      slug: string;
      email?: string;
      incoming_emails?: string[];
      outgoing_emails?: string[];
    }) => {
      const slug = payload.slug.trim().toLowerCase().replace(/\s+/g, "-");
      const incoming = normalizeEmailArray(payload.incoming_emails);
      let outgoing = normalizeEmailArray(payload.outgoing_emails);
      const legacy = payload.email != null ? String(payload.email).trim() : "";
      if (legacy) {
        outgoing = normalizeEmailArray([legacy, ...outgoing]);
      }

      const data = await fetchJson<Parameters<typeof mapOrgRow>[0]>("/data/organisations", {
        method: "POST",
        body: {
          name: payload.name.trim(),
          slug,
          email: legacy || undefined,
          incoming_emails: incoming,
          outgoing_emails: outgoing,
        },
      });
      if (!data) throw new Error("Tenant create returned no row.");
      return mapOrgRow(data);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<Organisation[]>(["organisations-table"], (old) =>
        old ? [created, ...old.filter((o) => o.id !== created.id)] : [created]
      );
      queryClient.invalidateQueries({ queryKey: ["organisations-table"] });
    },
  });
}

/**
 * Update organisation fields via backend Prisma API.
 */
export function useUpdateOrganisation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      incoming_emails?: string[];
      outgoing_emails?: string[];
      spoc_name?: string | null;
      spoc_email?: string | null;
      spoc_phone?: string | null;
    }) => {
      const incoming = normalizeEmailArray(payload.incoming_emails);
      const outgoing = normalizeEmailArray(payload.outgoing_emails);

      const data = await fetchJson<Parameters<typeof mapOrgRow>[0]>(
        `/data/organisations/${encodeURIComponent(payload.id)}`,
        {
          method: "PATCH",
          body: {
            name: payload.name.trim(),
            incoming_emails: incoming,
            outgoing_emails: outgoing,
            spoc_name:
              payload.spoc_name != null && String(payload.spoc_name).trim() !== ""
                ? String(payload.spoc_name).trim()
                : null,
            spoc_email:
              payload.spoc_email != null && String(payload.spoc_email).trim() !== ""
                ? String(payload.spoc_email).trim()
                : null,
            spoc_phone:
              payload.spoc_phone != null && String(payload.spoc_phone).trim() !== ""
                ? String(payload.spoc_phone).trim()
                : null,
          },
        }
      );
      if (!data) throw new Error("Tenant update returned no row.");
      return mapOrgRow(data);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Organisation[]>(["organisations-table"], (old) =>
        old ? old.map((o) => (o.id === updated.id ? updated : o)) : old
      );
      queryClient.invalidateQueries({ queryKey: ["organisations-table"] });
      queryClient.invalidateQueries({ queryKey: ["organisation", updated.id] });
    },
  });
}
