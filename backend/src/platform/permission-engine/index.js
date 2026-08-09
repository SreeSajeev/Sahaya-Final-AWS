/**
 * Permission Engine — DENY BY DEFAULT for METADATA tenants.
 */

export function can(rolePermissions, resource, action) {
  if (!resource || !action) return false;
  const list = Array.isArray(rolePermissions) ? rolePermissions : [];
  if (list.length === 0) return false;
  return list.some(
    (p) =>
      p &&
      (p.resource === resource || p.resource === "*") &&
      (p.action === action || p.action === "*")
  );
}

export function filterFieldsForRole(schemaFields, rolePermissions, action = "read") {
  const fields = Array.isArray(schemaFields) ? schemaFields : [];
  if (!Array.isArray(rolePermissions) || rolePermissions.length === 0) return [];
  return fields.filter((f) => {
    const name = f.internalName || f.internal_name;
    if (!name) return false;
    if (can(rolePermissions, `field:${name}`, action)) return true;
    if (can(rolePermissions, "field:*", action)) return true;
    if (can(rolePermissions, "form", action)) return true;
    return false;
  });
}

/**
 * Fail-closed authorization.
 * Empty / missing permissions → deny.
 */
export function assertPermission(rolePermissions, resource, action, opts = {}) {
  if (!opts.tenantId) {
    return { ok: false, error: "tenant required", code: "PLATFORM_NO_TENANT" };
  }
  if (!opts.role) {
    return { ok: false, error: "role required", code: "PLATFORM_NO_ROLE" };
  }
  if (!resource || !action) {
    return { ok: false, error: "resource and action required", code: "PLATFORM_BAD_PERM" };
  }
  if (!Array.isArray(rolePermissions) || rolePermissions.length === 0) {
    return { ok: false, error: "forbidden", code: "PLATFORM_FORBIDDEN" };
  }
  if (can(rolePermissions, resource, action) || can(rolePermissions, "*", "*")) {
    return { ok: true };
  }
  return { ok: false, error: "forbidden", code: "PLATFORM_FORBIDDEN" };
}

/** Staff roles that may administer platform builders when explicit grants absent — still require role. */
export const PLATFORM_ADMIN_ROLES = Object.freeze(["ADMIN", "SUPER_ADMIN"]);

/**
 * Route helper: ADMIN/SUPER_ADMIN may manage builders; others need explicit grants.
 * Never fail-open on empty grants for non-admin.
 */
export function assertBuilderAccess(req, resource, action) {
  const role = String(req?.tenantRole || req?.appUser?.role || "").toUpperCase();
  const tenantId = req?.platformOrganisationId || req?.tenantId || null;
  if (!tenantId) return { ok: false, error: "tenant required", code: "PLATFORM_NO_TENANT", status: 403 };
  if (!role) return { ok: false, error: "role required", code: "PLATFORM_NO_ROLE", status: 403 };
  if (PLATFORM_ADMIN_ROLES.includes(role)) return { ok: true };
  const grants = req?.platformPermissions;
  const result = assertPermission(grants, resource, action, { tenantId, role });
  return { ...result, status: 403 };
}
