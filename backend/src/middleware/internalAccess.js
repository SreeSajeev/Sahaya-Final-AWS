import { jsonRes } from "../utils/http.js";
import { logJson } from "../utils/jsonLog.js";

/**
 * Optional defense-in-depth for internal hooks. Set INTERNAL_TRUSTED_IPS to a comma-separated list
 * (e.g. "127.0.0.1,10.0.0.5"). If unset or empty, no IP check (backward compatible).
 */
export function requireInternalTrustedIp(req, res, next) {
  const raw = String(process.env.INTERNAL_TRUSTED_IPS || "").trim();
  if (!raw) return next();

  const allowed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = req.ip || req.socket?.remoteAddress || "";
  const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

  const ok = allowed.some((a) => a === normalized || a === ip);
  if (!ok) {
    logJson("warn", "internal_trusted_ip_rejected", {
      requestId: req.requestId,
      path: req.originalUrl?.split("?")[0] ?? req.path,
    });
    return jsonRes(res, 403, { error: "forbidden" });
  }
  return next();
}
