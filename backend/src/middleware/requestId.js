import { randomUUID } from "node:crypto";

const INBOUND_ID = /^[a-zA-Z0-9-]{8,128}$/;

/**
 * Sets req.requestId and X-Request-Id on the response. Observability only.
 * Accepts inbound X-Request-Id / X-Correlation-Id when they match a safe pattern; otherwise generates a UUID.
 */
export function requestIdMiddleware(req, res, next) {
  const raw =
    req.headers["x-request-id"] || req.headers["x-correlation-id"];
  let id;
  if (typeof raw === "string" && INBOUND_ID.test(raw.trim())) {
    id = raw.trim();
  } else {
    id = randomUUID();
  }
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
