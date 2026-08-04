import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../.env") });

export const API_URL = process.env.E2E_API_URL || "https://api.test-sahaya.pariskq.in";
export const BASE_URL = process.env.E2E_BASE_URL || "https://test-sahaya.pariskq.in";

export type Role = "SUPER_ADMIN" | "ADMIN" | "STAFF" | "FIELD_EXECUTIVE";

const ROLE_ENV: Record<Role, { email?: string; password?: string }> = {
  SUPER_ADMIN: {
    email: process.env.E2E_SUPER_ADMIN_EMAIL,
    password: process.env.E2E_SUPER_ADMIN_PASSWORD,
  },
  ADMIN: {
    email: process.env.E2E_ADMIN_EMAIL,
    password: process.env.E2E_ADMIN_PASSWORD,
  },
  STAFF: {
    email: process.env.E2E_STAFF_EMAIL || process.env.E2E_ADMIN_EMAIL,
    password: process.env.E2E_STAFF_PASSWORD || process.env.E2E_ADMIN_PASSWORD,
  },
  FIELD_EXECUTIVE: {
    email: process.env.E2E_FE_EMAIL,
    password: process.env.E2E_FE_PASSWORD,
  },
};

export function roleCreds(role: Role) {
  return ROLE_ENV[role];
}

export function hasCreds(role: Role) {
  const c = roleCreds(role);
  return Boolean(c.email && c.password);
}

export type ApiResult = {
  status: number;
  json: any;
  headers: Headers;
};

export async function api(
  method: string,
  path: string,
  opts: {
    token?: string | null;
    body?: unknown;
    cookie?: string | null;
  } = {}
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    Origin: BASE_URL,
    Accept: "application/json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.Cookie = opts.cookie;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API_URL}${path}`, { method, headers, body });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, json, headers: res.headers };
}

type Session = {
  status: number;
  accessToken: string | undefined;
  profile: Record<string, unknown> | undefined;
  cookie: string;
  error: string | undefined;
};

/** Cache successful logins per role for the suite run (avoids login rate limits). */
const sessionCache = new Map<Role, Session>();

export async function login(role: Role, opts: { force?: boolean } = {}) {
  if (!opts.force && sessionCache.has(role)) {
    return sessionCache.get(role)!;
  }
  const { email, password } = roleCreds(role);
  if (!email || !password) throw new Error(`Missing credentials for ${role}`);

  let last: Session = {
    status: 0,
    accessToken: undefined,
    profile: undefined,
    cookie: "",
    error: "not_attempted",
  };

  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await api("POST", "/auth/login", { body: { email, password } });
    const setCookie = res.headers.getSetCookie?.() || [];
    const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
    last = {
      status: res.status,
      accessToken: res.json?.accessToken as string | undefined,
      profile: res.json?.profile as Record<string, unknown> | undefined,
      cookie,
      error: res.json?.error as string | undefined,
    };
    if (res.status === 200 && last.accessToken) {
      sessionCache.set(role, last);
      return last;
    }
    // Rate limit / transient — backoff
    const waitMs = Math.min(30_000, 2000 * attempt * attempt);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return last;
}

export function redactEmail(email: string) {
  const [l, d] = String(email).split("@");
  if (!d) return "***";
  return `${l.slice(0, 2)}***@${d}`;
}
