import { TENANT_CLIENTS_ENABLED } from "../config/appConfig.js";
import { jsonRes } from "../utils/http.js";

/** Kill switch for /data/clients/* only. */
export function requireTenantClientsEnabled(req, res, next) {
  if (!TENANT_CLIENTS_ENABLED) {
    return jsonRes(res, 404, { error: "Not found" });
  }
  return next();
}
