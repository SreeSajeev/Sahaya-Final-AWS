import { ENFORCE_TENANT_GUARD } from "../config/appConfig.js";
import { jsonRes } from "../utils/http.js";
import { resolveAppUserFromAccessToken } from "./auth.js";

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

export function attachTenantContext({ requireAuthenticated = false } = {}) {
  return async (req, res, next) => {
    try {
      let appUser = req.appUser ?? null;
      if (!appUser) {
        const token = getBearerToken(req);
        if (token) {
          appUser = await resolveAppUserFromAccessToken(token);
          if (appUser) req.appUser = appUser;
        }
      }

      const role = appUser?.role ?? null;
      const isSuperAdmin = role === "SUPER_ADMIN";
      const tenantId = appUser?.organisation_id ?? null;

      req.tenantId = tenantId;
      req.tenantRole = role;
      req.isSuperAdmin = isSuperAdmin;

      if (ENFORCE_TENANT_GUARD && requireAuthenticated && !appUser) {
        return jsonRes(res, 401, { error: "Unauthorized" });
      }
      if (
        ENFORCE_TENANT_GUARD &&
        requireAuthenticated &&
        appUser &&
        !isSuperAdmin &&
        !tenantId
      ) {
        return jsonRes(res, 403, { error: "Tenant context missing" });
      }

      return next();
    } catch (err) {
      console.error("[tenant-context]", err?.message || err);
      if (ENFORCE_TENANT_GUARD && requireAuthenticated) {
        return jsonRes(res, 500, { error: "Tenant context resolution failed" });
      }
      return next();
    }
  };
}

/** No rows match this sentinel UUID — defensive depth when tenant context is missing. */
const TENANT_DENY_SENTINEL = "00000000-0000-0000-0000-000000000000";

export function scopeQueryByTenant(query, req, orgColumn = "organisation_id") {
  if (req?.isSuperAdmin) return query;
  if (!req?.tenantId) {
    return query.eq(orgColumn, TENANT_DENY_SENTINEL);
  }
  return query.eq(orgColumn, req.tenantId);
}

export function isTenantAllowed(req, resourceOrgId) {
  if (req?.isSuperAdmin) return true;
  if (!req?.tenantId) return false;
  // Deny unscoped / orphan rows — null organisation_id must not pass tenant checks.
  if (resourceOrgId == null || String(resourceOrgId).trim() === "") return false;
  return req.tenantId === resourceOrgId;
}

/**
 * Super admins may operate without an organisation; tenant users must have organisation_id.
 */
export function requireTenantOrSuperAdmin(req, res, next) {
  if (req?.isSuperAdmin) return next();
  if (!req?.tenantId) {
    return jsonRes(res, 403, { error: "Tenant context required for this operation" });
  }
  next();
}

export function denyTenantMismatch(res) {
  return jsonRes(res, 403, { error: "Forbidden" });
}
