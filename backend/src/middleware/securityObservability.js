import { logJson } from "../utils/jsonLog.js";

/**
 * Observability only — never blocks. Use to measure auth coverage before stricter enforcement.
 * Set AUDIT_LOG_MISSING_AUTH=false to silence (e.g. if logs are too noisy).
 */
export function logTicketsAuthObservability(req, res, next) {
  if (String(process.env.AUDIT_LOG_MISSING_AUTH || "true").toLowerCase() === "false") {
    return next();
  }
  const hasAuth =
    typeof req.headers.authorization === "string" &&
    req.headers.authorization.trim().length > 0;
  if (!hasAuth) {
    logJson("warn", "audit_missing_authorization", {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl?.split("?")[0] ?? req.path,
    });
  }
  next();
}
