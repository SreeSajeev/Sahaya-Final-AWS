import { jsonRes } from '../utils/http.js';

/**
 * Role-based authorization middleware
 */
export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const role = req.appUser?.role ?? req.user?.user_metadata?.role;

    if (!role || !allowedRoles.includes(role)) {
      return jsonRes(res, 403, { error: 'Forbidden' });
    }

    next();
  };
}
