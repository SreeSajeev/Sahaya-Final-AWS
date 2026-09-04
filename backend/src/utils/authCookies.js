/**
 * Refresh-cookie helpers for Sahaya local auth.
 * Prefer Domain=.sahaya.pariskq.in so FE (sahaya.pariskq.in) + API (api.sahaya.pariskq.in) share the refresh cookie.
 */

export const REFRESH_COOKIE_NAME = "sahaya_refresh";

export function getRefreshCookieOptions() {
  const secure = String(process.env.AUTH_COOKIE_SECURE || "true").toLowerCase() !== "false";
  const sameSiteRaw = String(process.env.AUTH_COOKIE_SAMESITE || "lax").toLowerCase();
  const sameSite = ["lax", "strict", "none"].includes(sameSiteRaw) ? sameSiteRaw : "lax";
  const domain = String(process.env.AUTH_COOKIE_DOMAIN || "").trim() || undefined;
  const maxAgeSec = Number(process.env.JWT_REFRESH_TTL_SEC || 604800);

  return {
    httpOnly: true,
    secure: sameSite === "none" ? true : secure,
    sameSite,
    path: "/auth",
    ...(domain ? { domain } : {}),
    maxAge: Math.max(60, maxAgeSec) * 1000,
  };
}

export function setRefreshCookie(res, rawRefresh) {
  res.cookie(REFRESH_COOKIE_NAME, rawRefresh, getRefreshCookieOptions());
}

export function clearRefreshCookie(res) {
  const opts = getRefreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
    ...(opts.domain ? { domain: opts.domain } : {}),
  });
}

export function readRefreshCookie(req) {
  const fromCookie = req?.cookies?.[REFRESH_COOKIE_NAME];
  if (fromCookie) return String(fromCookie);
  const bodyToken = req?.body?.refreshToken;
  if (bodyToken) return String(bodyToken);
  return null;
}
