import { BULK_TICKET_IMPORT_ENABLED } from "../config/appConfig.js";
import { jsonRes } from "../utils/http.js";

/** Kill switch for POST /tickets/import/* only. */
export function requireBulkTicketImportEnabled(req, res, next) {
  if (!BULK_TICKET_IMPORT_ENABLED) {
    return jsonRes(res, 404, { error: "Not found" });
  }
  return next();
}
