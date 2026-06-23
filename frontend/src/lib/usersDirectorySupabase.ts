import { supabase } from "@/integrations/supabase/client";
import type { User, UserRole } from "@/lib/types";

/**
 * Maps a PostgREST row to `User`. Handles older DBs that omit optional columns.
 */
function mapDbUserToUser(row: Record<string, unknown>): User {
  const name = row.name != null ? String(row.name).trim() : "";
  const email = row.email != null ? String(row.email).trim() : "";
  const roleRaw = row.role != null ? String(row.role) : "STAFF";
  const appr = row.approval_status;
  let approval_status: User["approval_status"];
  if (appr === "pending" || appr === "approved" || appr === "rejected") {
    approval_status = appr;
  }

  const orgRaw = row.organisation_id;
  const slugRaw = row.client_slug;

  return {
    id: String(row.id ?? ""),
    auth_id: row.auth_id == null ? null : String(row.auth_id),
    name,
    email,
    role: roleRaw as UserRole,
    active: row.active !== false,
    is_active: row.is_active != null ? Boolean(row.is_active) : undefined,
    created_at: row.created_at != null ? String(row.created_at) : "",
    organisation_id:
      orgRaw == null || orgRaw === ""
        ? null
        : String(orgRaw),
    client_slug: slugRaw == null || slugRaw === "" ? null : String(slugRaw),
    approval_status,
  };
}

async function fetchUsersBase(options: {
  isSuperAdmin: boolean;
  organisationId: string | null;
  limit: number;
}): Promise<User[]> {
  let q = supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options.limit);

  if (!options.isSuperAdmin) {
    if (!options.organisationId) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.info("[UsersDirectory] Non–super admin without organisation_id; returning empty user list.");
      }
      return [];
    }
    q = q.eq("organisation_id", options.organisationId);
  }

  const { data, error } = await q;

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[UsersDirectory] Supabase users query failed:", {
      message: error.message,
      code: error.code,
      details: (error as { details?: string }).details,
      hint: (error as { hint?: string }).hint,
    });
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => mapDbUserToUser(r as Record<string, unknown>));
}

/** All users visible to Super Admin; tenant-scoped for staff/admin with an organisation. */
export async function fetchWorkspaceUsersList(options: {
  isSuperAdmin: boolean;
  organisationId: string | null;
}): Promise<User[]> {
  return fetchUsersBase({ ...options, limit: 500 });
}

/** Pending approval — filtered in the client so missing `approval_status` column does not break the query. */
export async function fetchPendingUsersList(options: {
  isSuperAdmin: boolean;
  organisationId: string | null;
  limit?: number;
}): Promise<User[]> {
  const cap = options.limit ?? 500;
  const rows = await fetchUsersBase({
    isSuperAdmin: options.isSuperAdmin,
    organisationId: options.organisationId,
    limit: Math.min(cap * 3, 1000),
  });
  const pending = rows.filter((u) => u.approval_status === "pending");
  return pending.slice(0, cap);
}
