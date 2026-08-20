import { jsonRes } from '../utils/http.js';

/**
 * Role-based authorization middleware.
 * Prefer CRM profile role; fall back to JWT claims (local auth puts role on req.user.role).
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const raw =
      req.appUser?.role ??
      req.user?.role ??
      req.user?.user_metadata?.role ??
      null;
    const role = raw != null ? String(raw).trim().toUpperCase() : null;
    const allowed = (allowedRoles || []).map((r) => String(r).trim().toUpperCase());

    if (!role || !allowed.includes(role)) {
      console.warn("[authz] requireRole denied", {
        path: req.originalUrl || req.url,
        method: req.method,
        role: role || null,
        allowed,
        requestId: req.requestId ?? null,
      });
      return jsonRes(res, 403, { error: 'Forbidden' });
    }

    next();
  };
}
