import { logJson } from "../utils/jsonLog.js";
import { jsonRes } from "../utils/http.js";

/**
 * 404 — must be registered after all routes.
 */
export function notFoundHandler(req, res) {
  return jsonRes(res, 404, { error: "Not found" });
}

/**
 * Centralized error handler — include requestId; avoid leaking stack in production.
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const status =
    typeof err.status === "number"
      ? err.status
      : typeof err.statusCode === "number"
        ? err.statusCode
        : 500;

  const isDev = process.env.NODE_ENV === "development";
  const safeMessage =
    status === 500 && !isDev
      ? "Internal server error"
      : err.message || "Internal server error";

  logJson("error", "unhandled_exception", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl?.split("?")[0] ?? req.path,
    status,
    message: err.message,
    name: err.name,
    ...(isDev && err.stack ? { stack: err.stack } : {}),
  });

  return jsonRes(res, status, {
    error: safeMessage,
    ...(isDev && status >= 500 ? { detail: err.message } : {}),
  });
}
