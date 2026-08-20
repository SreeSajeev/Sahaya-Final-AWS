/**
 * Real CRM roles enforced by requireRole / portal guards.
 */
export const REAL_ROLES = ["SUPER_ADMIN", "ADMIN", "STAFF", "FIELD_EXECUTIVE", "CLIENT"];

/**
 * Fictional / marketing roles — NOT implemented in Sahaya-Final-AWS.
 * Documented as N/A for readiness reporting (see 07-gaps-na.test.js).
 */
export const FICTIONAL_ROLES = ["Platform Admin", "Viewer", "Support", "Organisation Admin"];

/**
 * Build role-matrix cases for key endpoints.
 * @param {{ ticketId: string, feId: string, pendingUserId: string, clientSlug: string, orgSlug: string }} fx
 * @returns {Array<{ method: string, pathBuilder: Function, body?: object|null, role: string, expectAllow: boolean|number[], label?: string }>}
 */
export function buildRoleMatrix(fx) {
  const createBody = {
    vehicle_number: "KA01PV1234",
    location: "Platform Validation Site",
    category: "Breakdown",
    issue_type: "Engine",
    client_slug: fx.clientSlug || fx.orgSlug,
  };

  const assignBody = {
    assignment_type: "FIELD_EXECUTIVE",
    feId: fx.feId,
    assignment_remarks: "Role matrix assign",
  };

  const closeBody = {
    verification_remarks: "Role matrix close attempt",
    recipients: [],
  };

  const approvalBody = { approval_status: "approved" };

  /** true → expect 2xx (or soft business 400); false → expect 403 (authz deny). */
  return [
    // POST /tickets (create) — TICKET_CREATE_ROLES
    {
      label: "POST /tickets as SUPER_ADMIN",
      method: "post",
      pathBuilder: () => "/tickets",
      body: createBody,
      role: "SUPER_ADMIN",
      expectAllow: [200, 201, 400],
    },
    {
      label: "POST /tickets as ADMIN",
      method: "post",
      pathBuilder: () => "/tickets",
      body: createBody,
      role: "ADMIN",
      expectAllow: [200, 201, 400],
    },
    {
      label: "POST /tickets as STAFF",
      method: "post",
      pathBuilder: () => "/tickets",
      body: createBody,
      role: "STAFF",
      expectAllow: [200, 201, 400],
    },
    {
      label: "POST /tickets as CLIENT",
      method: "post",
      pathBuilder: () => "/tickets",
      body: { ...createBody, client_slug: fx.clientSlug },
      role: "CLIENT",
      expectAllow: [200, 201, 400],
    },
    {
      label: "POST /tickets as FIELD_EXECUTIVE denied",
      method: "post",
      pathBuilder: () => "/tickets",
      body: createBody,
      role: "FIELD_EXECUTIVE",
      expectAllow: false,
    },

    // POST /tickets/:id/assign — STAFF_OPERATION_ROLES
    {
      label: "POST assign as ADMIN",
      method: "post",
      pathBuilder: () => `/tickets/${fx.ticketId}/assign`,
      body: assignBody,
      role: "ADMIN",
      expectAllow: [200, 201, 400, 409],
    },
    {
      label: "POST assign as STAFF",
      method: "post",
      pathBuilder: () => `/tickets/${fx.ticketId}/assign`,
      body: assignBody,
      role: "STAFF",
      expectAllow: [200, 201, 400, 409],
    },
    {
      label: "POST assign as CLIENT denied",
      method: "post",
      pathBuilder: () => `/tickets/${fx.ticketId}/assign`,
      body: assignBody,
      role: "CLIENT",
      expectAllow: false,
    },
    {
      label: "POST assign as FIELD_EXECUTIVE denied",
      method: "post",
      pathBuilder: () => `/tickets/${fx.ticketId}/assign`,
      body: assignBody,
      role: "FIELD_EXECUTIVE",
      expectAllow: false,
    },

    // POST /tickets/:id/close — STAFF_OPERATION_ROLES
    {
      label: "POST close as ADMIN",
      method: "post",
      pathBuilder: () => `/tickets/${fx.ticketId}/close`,
      body: closeBody,
      role: "ADMIN",
      expectAllow: [200, 400, 422],
    },
    {
      label: "POST close as CLIENT denied",
      method: "post",
      pathBuilder: () => `/tickets/${fx.ticketId}/close`,
      body: closeBody,
      role: "CLIENT",
      expectAllow: false,
    },
    {
      label: "POST close as FIELD_EXECUTIVE denied",
      method: "post",
      pathBuilder: () => `/tickets/${fx.ticketId}/close`,
      body: closeBody,
      role: "FIELD_EXECUTIVE",
      expectAllow: false,
    },

    // GET /data/tickets — authenticated roles (scoped)
    {
      label: "GET /data/tickets as ADMIN",
      method: "get",
      pathBuilder: () => "/data/tickets?limit=10",
      body: null,
      role: "ADMIN",
      expectAllow: true,
    },
    {
      label: "GET /data/tickets as CLIENT",
      method: "get",
      pathBuilder: () => "/data/tickets?limit=10",
      body: null,
      role: "CLIENT",
      expectAllow: true,
    },
    {
      label: "GET /data/tickets as FIELD_EXECUTIVE",
      method: "get",
      pathBuilder: () => "/data/tickets?limit=10",
      body: null,
      role: "FIELD_EXECUTIVE",
      expectAllow: true,
    },

    // GET /data/audit-logs — AUDIT_LOG_READ_ROLES
    {
      label: "GET audit-logs as ADMIN",
      method: "get",
      pathBuilder: () => "/data/audit-logs?limit=10",
      body: null,
      role: "ADMIN",
      expectAllow: true,
    },
    {
      label: "GET audit-logs as STAFF",
      method: "get",
      pathBuilder: () => "/data/audit-logs?limit=10",
      body: null,
      role: "STAFF",
      expectAllow: true,
    },
    {
      label: "GET audit-logs as CLIENT denied",
      method: "get",
      pathBuilder: () => "/data/audit-logs?limit=10",
      body: null,
      role: "CLIENT",
      expectAllow: false,
    },
    {
      label: "GET audit-logs as FIELD_EXECUTIVE denied",
      method: "get",
      pathBuilder: () => "/data/audit-logs?limit=10",
      body: null,
      role: "FIELD_EXECUTIVE",
      expectAllow: false,
    },

    // GET /data/organisations/stats — SUPER_ADMIN only
    {
      label: "GET org stats as SUPER_ADMIN",
      method: "get",
      pathBuilder: () => "/data/organisations/stats",
      body: null,
      role: "SUPER_ADMIN",
      expectAllow: true,
    },
    {
      label: "GET org stats as ADMIN denied",
      method: "get",
      pathBuilder: () => "/data/organisations/stats",
      body: null,
      role: "ADMIN",
      expectAllow: false,
    },

    // POST /data/organisations — SUPER_ADMIN only
    {
      label: "POST organisations as SUPER_ADMIN",
      method: "post",
      pathBuilder: () => "/data/organisations",
      body: {
        name: `PV Org ${Date.now()}`,
        slug: `pv-org-${Date.now()}`,
        short_name: "PV",
      },
      role: "SUPER_ADMIN",
      expectAllow: [200, 201, 400],
    },
    {
      label: "POST organisations as ADMIN denied",
      method: "post",
      pathBuilder: () => "/data/organisations",
      body: { name: "Nope", slug: `nope-${Date.now()}` },
      role: "ADMIN",
      expectAllow: false,
    },

    // GET /sm/me/tickets — STAFF/ADMIN/SUPER_ADMIN portal
    {
      label: "GET /sm/me/tickets as STAFF",
      method: "get",
      pathBuilder: () => "/sm/me/tickets",
      body: null,
      role: "STAFF",
      expectAllow: true,
    },
    {
      label: "GET /sm/me/tickets as ADMIN",
      method: "get",
      pathBuilder: () => "/sm/me/tickets",
      body: null,
      role: "ADMIN",
      expectAllow: true,
    },
    {
      label: "GET /sm/me/tickets as CLIENT denied",
      method: "get",
      pathBuilder: () => "/sm/me/tickets",
      body: null,
      role: "CLIENT",
      expectAllow: false,
    },
    {
      label: "GET /sm/me/tickets as FIELD_EXECUTIVE denied",
      method: "get",
      pathBuilder: () => "/sm/me/tickets",
      body: null,
      role: "FIELD_EXECUTIVE",
      expectAllow: false,
    },

    // GET /fe/me/tickets — returns 200 empty when no FE profile (not role-gated)
    {
      label: "GET /fe/me/tickets as FIELD_EXECUTIVE",
      method: "get",
      pathBuilder: () => "/fe/me/tickets",
      body: null,
      role: "FIELD_EXECUTIVE",
      expectAllow: true,
    },

    // PATCH /admin/users/:id/approval — SUPER_ADMIN, ADMIN
    {
      label: "PATCH approval as ADMIN",
      method: "patch",
      pathBuilder: () => `/admin/users/${fx.pendingUserId}/approval`,
      body: approvalBody,
      role: "ADMIN",
      expectAllow: [200, 400, 404],
    },
    {
      label: "PATCH approval as SUPER_ADMIN",
      method: "patch",
      pathBuilder: () => `/admin/users/${fx.pendingUserId}/approval`,
      body: approvalBody,
      role: "SUPER_ADMIN",
      expectAllow: [200, 400, 404],
    },
    {
      label: "PATCH approval as STAFF denied",
      method: "patch",
      pathBuilder: () => `/admin/users/${fx.pendingUserId}/approval`,
      body: approvalBody,
      role: "STAFF",
      expectAllow: false,
    },
    {
      label: "PATCH approval as CLIENT denied",
      method: "patch",
      pathBuilder: () => `/admin/users/${fx.pendingUserId}/approval`,
      body: approvalBody,
      role: "CLIENT",
      expectAllow: false,
    },
    {
      label: "PATCH approval as FIELD_EXECUTIVE denied",
      method: "patch",
      pathBuilder: () => `/admin/users/${fx.pendingUserId}/approval`,
      body: approvalBody,
      role: "FIELD_EXECUTIVE",
      expectAllow: false,
    },
  ];
}

/** Alias for consumers that expect a static export name. */
export const ROLE_MATRIX = buildRoleMatrix;
