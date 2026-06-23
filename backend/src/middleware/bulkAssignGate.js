import { BULK_ASSIGN_ENABLED } from "../config/appConfig.js";
import { jsonRes } from "../utils/http.js";

/** Kill switch for POST /tickets/bulk-assign only (single assign unaffected). */
export function requireBulkAssignEnabled(req, res, next) {
  if (!BULK_ASSIGN_ENABLED) {
    return jsonRes(res, 404, { error: "Not found" });
  }
  return next();
}
