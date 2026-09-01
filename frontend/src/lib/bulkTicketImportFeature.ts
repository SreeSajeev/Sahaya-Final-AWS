import type { UserRole } from "@/lib/types";

/** Must match backend `BULK_TICKET_IMPORT_ENABLED=true`. */
export function isBulkTicketImportEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_BULK_TICKET_IMPORT ?? "").trim().toLowerCase() === "true";
}

export const BULK_TICKET_IMPORT_MAX_ROWS = 100;

export const BULK_TICKET_IMPORT_ALLOWED_ROLES: UserRole[] = ["ADMIN", "STAFF", "SUPER_ADMIN"];

export function canRoleBulkTicketImport(role: UserRole | undefined | null): boolean {
  if (!role) return false;
  return BULK_TICKET_IMPORT_ALLOWED_ROLES.includes(role);
}

export const BULK_TICKET_TEMPLATE_HEADERS = [
  "client_slug",
  "vehicle_number",
  "category",
  "issue_type",
  "incident_title",
  "location",
  "state",
  "priority",
  "complaint_id",
  "description",
] as const;

/** Alternate CSV headers mapped to `complaint_id` (matches Hitachi email parser labels). */
export const BULK_TICKET_COMPLAINT_ID_ALIASES = [
  "complaint_id",
  "record_id",
  "incident_number",
  "complaint_number",
] as const;
