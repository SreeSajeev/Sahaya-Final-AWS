import { PUBLIC_COMPLAINTS_ENABLED } from "../config/appConfig.js";
import { jsonRes } from "../utils/http.js";

/** Kill switch for /complaint-points/* (admin) and /public/* (reporter intake). */
export function requirePublicComplaintsEnabled(req, res, next) {
  if (!PUBLIC_COMPLAINTS_ENABLED) {
    return jsonRes(res, 404, { error: "Not found" });
  }
  return next();
}
