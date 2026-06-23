import { supabase } from '../supabaseClient.js';
import { jsonRes } from '../utils/http.js';

async function fetchSupabaseAuthUser(accessToken) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const apiKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!base || !apiKey) return { user: null, errorMessage: "Supabase env missing" };

  try {
    const res = await fetch(`${base}/auth/v1/user`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: apiKey,
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { user: null, errorMessage: (data && data.msg) ? String(data.msg) : `HTTP ${res.status}` };
    }
    return { user: data ?? null, errorMessage: null };
  } catch (e) {
    return { user: null, errorMessage: e?.message ? String(e.message) : "fetch failed" };
  }
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "===".slice((normalized.length + 3) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Backend authentication middleware
 * Verifies Supabase JWT sent from frontend.
 * Loads app user from public.users and denies access if is_active === false.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    console.warn("[auth] missing authorization", {
      method: req.method,
      path: req.originalUrl || req.url,
      origin: req.headers.origin ?? null,
      requestId: req.requestId ?? null,
    });
    return jsonRes(res, 401, { error: 'Missing Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  // Prefer direct REST call to avoid SDK edge cases ("Auth session missing!") in server contexts.
  const { user: authUser, errorMessage: authErrMsg } = await fetchSupabaseAuthUser(token);

  if (!authUser?.id) {
    const payload = decodeJwtPayload(token);
    console.warn("[auth] invalid token", {
      method: req.method,
      path: req.originalUrl || req.url,
      origin: req.headers.origin ?? null,
      requestId: req.requestId ?? null,
      supabaseHost: (() => {
        try {
          return process.env.SUPABASE_URL ? new URL(process.env.SUPABASE_URL).host : null;
        } catch {
          return null;
        }
      })(),
      iss: payload?.iss ?? null,
      aud: payload?.aud ?? null,
      exp: payload?.exp ?? null,
      now: Math.floor(Date.now() / 1000),
      sub: payload?.sub ? String(payload.sub).slice(0, 8) + "…" : null,
      errorMessage: authErrMsg ?? null,
    });
    return jsonRes(res, 401, { error: 'Invalid or expired token' });
  }

  req.user = authUser;

  const { data: appUser, error: appError } = await supabase
    .from('users')
    .select('id, role, is_active, active, organisation_id, name, email')
    .eq('auth_id', authUser.id)
    .maybeSingle();

  if (!appError && appUser) {
    const isActive = appUser.is_active !== false && appUser.is_active !== null;
    if (!isActive) {
      return jsonRes(res, 403, {
        error: 'Account deactivated. Contact administrator.',
      });
    }
    req.appUser = appUser;
  }

  next();
}

/**
 * Requires a row in public.users (CRM profile). Use after requireAuth on protected CRM routes.
 * Do NOT use on POST /auth/provision-user or flows that intentionally run before provisioning.
 */
export function requireAppUser(req, res, next) {
  if (!req.appUser) {
    return jsonRes(res, 403, {
      error:
        'User profile not provisioned. Complete onboarding or POST /auth/provision-user.',
    });
  }
  next();
}
