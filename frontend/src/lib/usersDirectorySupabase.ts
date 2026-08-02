import { fetchJson } from "@/lib/backendDataApi";
import type { User, UserRole } from "@/lib/types";

/**
 * Maps a backend `/data/users` row to `User`.
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
  approvalStatus?: string;
}): Promise<User[]> {
  if (!options.isSuperAdmin && !options.organisationId) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info("[UsersDirectory] Non–super admin without organisation_id; returning empty user list.");
    }
    return [];
  }

  const params = new URLSearchParams();
  params.set("limit", String(options.limit));
  params.set("offset", "0");
  if (options.organisationId) {
    params.set("organisationId", options.organisationId);
  }
  if (options.approvalStatus) {
    params.set("approvalStatus", options.approvalStatus);
  }

  const res = await fetchJson<{ items: Record<string, unknown>[] }>(
    `/data/users?${params.toString()}`
  );
  return (res.items ?? []).map((r) => mapDbUserToUser(r));
}

/** All users visible to Super Admin; tenant-scoped for staff/admin with an organisation. */
export async function fetchWorkspaceUsersList(options: {
  isSuperAdmin: boolean;
  organisationId: string | null;
}): Promise<User[]> {
  return fetchUsersBase({ ...options, limit: 500 });
}

/** Pending approval users via backend filter. */
export async function fetchPendingUsersList(options: {
  isSuperAdmin: boolean;
  organisationId: string | null;
  limit?: number;
}): Promise<User[]> {
  const cap = options.limit ?? 500;
  return fetchUsersBase({
    isSuperAdmin: options.isSuperAdmin,
    organisationId: options.organisationId,
    limit: cap,
    approvalStatus: "pending",
  });
}
