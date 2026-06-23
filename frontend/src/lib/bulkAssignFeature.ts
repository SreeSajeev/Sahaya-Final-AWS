import type { UserRole } from "@/lib/types";

/** Frontend kill switch — must match deployed backend `BULK_ASSIGN_ENABLED=true`. */
export function isBulkAssignFeatureEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_BULK_ASSIGN ?? "").trim().toLowerCase() === "true";
}

export const BULK_ASSIGN_ALLOWED_ROLES: UserRole[] = ["ADMIN", "STAFF", "SUPER_ADMIN"];

export function canRoleBulkAssign(role: UserRole | undefined | null): boolean {
  if (!role) return false;
  return BULK_ASSIGN_ALLOWED_ROLES.includes(role);
}
