/**
 * Structured product-gap inventory for readiness reports.
 * status: NOT_IMPLEMENTED | N_A_ROLE | TEST_HARNESS_GAP
 */
export const PRODUCT_GAPS = [
  { id: "branches", claim: "Create Branches", status: "NOT_IMPLEMENTED" },
  { id: "assets_cmdb", claim: "Assets / CMDB", status: "NOT_IMPLEMENTED" },
  { id: "viewer_role", claim: "Viewer role", status: "N_A_ROLE" },
  { id: "support_role", claim: "Support role", status: "N_A_ROLE" },
  { id: "platform_admin_role", claim: "Platform Admin role", status: "N_A_ROLE" },
  { id: "organisation_admin_role", claim: "Organisation Admin role", status: "N_A_ROLE" },
  { id: "swagger", claim: "Swagger / OpenAPI UI", status: "NOT_IMPLEMENTED" },
  { id: "redis_queues", claim: "Redis job queues", status: "NOT_IMPLEMENTED" },
  { id: "fe_video_proof_upload", claim: "FE video proof binary upload", status: "NOT_IMPLEMENTED" },
  { id: "in_app_notifications", claim: "In-app notification center", status: "NOT_IMPLEMENTED" },
  { id: "sso_mfa", claim: "SSO / MFA", status: "NOT_IMPLEMENTED" },
];

export const IMPLEMENTED_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "STAFF",
  "FIELD_EXECUTIVE",
  "CLIENT",
];

export const FICTIONAL_ROLE_CLAIMS = [
  "Platform Admin",
  "Viewer",
  "Support",
  "Organisation Admin",
];
