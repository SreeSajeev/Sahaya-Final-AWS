export function toInt(value, { defaultValue = null, min = null, max = null } = {}) {
  const n = Number.parseInt(String(value ?? ""), 10);
  const base = Number.isFinite(n) ? n : defaultValue;
  if (base == null) return base;
  if (min != null && base < min) return min;
  if (max != null && base > max) return max;
  return base;
}

export function safeTrim(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * 200 JSON. Adds requestId when payload is a plain object (not array) — avoids breaking callers that return raw arrays.
 */
export function jsonOk(res, payload) {
  const req = res.req;
  const rid = req?.requestId;
  if (rid != null && payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    return res.status(200).json({ ...payload, requestId: rid });
  }
  return res.status(200).json(payload);
}

/** Hide PostgREST / DB detail in production responses. */
export function safeDbErrorForClient(err, defaultMessage = "Request failed") {
  if (process.env.NODE_ENV === "development" && err && typeof err.message === "string" && err.message) {
    return err.message;
  }
  return defaultMessage;
}

export function jsonError(res, status, message, extra = {}) {
  const isDev = process.env.NODE_ENV === "development";
  const safeMessage = status >= 500 && !isDev ? "Internal server error" : message;
  const payload = { error: safeMessage, ...extra };
  const req = res.req;
  if (req?.requestId) payload.requestId = req.requestId;
  return res.status(status).json(payload);
}

/** Standard JSON response with requestId when available (auth middleware, etc.). */
export function jsonRes(res, status, body) {
  const req = res.req;
  const payload = { ...body };
  if (req?.requestId) payload.requestId = req.requestId;
  return res.status(status).json(payload);
}

