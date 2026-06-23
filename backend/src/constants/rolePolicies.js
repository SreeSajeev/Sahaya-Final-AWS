/**
 * Shared role allowlists for backend enforcement (additive — mirrors UI intent).
 * FIELD_EXECUTIVE and CLIENT must not invoke staff-only mutation endpoints.
 */

/** Service Manager + tenant/platform admin ticket operations */
export const STAFF_OPERATION_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"];

/** Manual / client-portal ticket creation */
export const TICKET_CREATE_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF", "CLIENT"];

/** Field executive registry writes */
export const FE_MANAGEMENT_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"];

/** Inbound email ops visibility */
export const RAW_EMAIL_READ_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"];

/** Compliance / audit visibility */
export const AUDIT_LOG_READ_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF"];
