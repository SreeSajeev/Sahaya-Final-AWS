import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Json } from "@/integrations/supabase/types";
import { Organisation } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { guardSharedSupabaseMutation } from "@/lib/sharedSupabaseMutationFreeze";

/** Map DB row → app Organisation (email arrays may be absent on older schemas). */
function mapOrgRow(row: {
  id: string;
  name: string;
  slug: string;
  created_at: string | null;
  status: string;
  incoming_emails?: Json | null;
  outgoing_emails?: Json | null;
  spoc_name?: string | null;
  spoc_email?: string | null;
  spoc_phone?: string | null;
}): Organisation {
  const toStrArr = (j: Json | undefined | null) =>
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
 * Organisations — direct Supabase (no `/data` API).
 */
export function useOrganisationsTable(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  return useQuery({
    queryKey: ["organisations-table"],
    enabled,
    queryFn: async (): Promise<Organisation[]> => {
      const { data, error } = await supabase
        .from("organisations")
        .select("id,name,slug,created_at,status,incoming_emails,outgoing_emails,spoc_name,spoc_email,spoc_phone")
        .order("created_at", { ascending: false });

      if (error) {
        // eslint-disable-next-line no-console
        console.error("[OrganisationsTable] Supabase organisations query failed:", {
          message: error.message,
          code: error.code,
        });
        throw new Error(error.message);
      }

      return (data ?? []).map(mapOrgRow);
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
 * Create a new organisation via Supabase. Super Admin only — requires RLS/policies that allow INSERT for that role (or trusted client).
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

      guardSharedSupabaseMutation("postgrest.organisations.insert");

      const { data, error } = await supabase
        .from("organisations")
        .insert({
          name: payload.name.trim(),
          slug,
          status: "active",
          incoming_emails: incoming,
          outgoing_emails: outgoing,
        })
        .select("id,name,slug,created_at,status,incoming_emails,outgoing_emails,spoc_name,spoc_email,spoc_phone")
        .single();

      if (error) throw new Error(error.message);
      if (!data) throw new Error("Tenant insert returned no row.");
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
 * Update organisation fields via Supabase. Super Admin (or policy that allows UPDATE).
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

      guardSharedSupabaseMutation("postgrest.organisations.update");

      const { data, error } = await supabase
        .from("organisations")
        .update({
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
        })
        .eq("id", payload.id)
        .select("id,name,slug,created_at,status,incoming_emails,outgoing_emails,spoc_name,spoc_email,spoc_phone")
        .single();

      if (error) throw new Error(error.message);
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
