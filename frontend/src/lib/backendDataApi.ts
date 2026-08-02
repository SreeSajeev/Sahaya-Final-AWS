import { crmApiUrl, getCrmApiBase } from "@/lib/crmApiConfig";

export { getCrmApiBase, crmApiUrl } from "@/lib/crmApiConfig";

const ACCESS_TOKEN_KEY = "sahaya_access_token";

let memoryAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function getStoredAccessToken(): string | null {
  if (memoryAccessToken) return memoryAccessToken;
  try {
    memoryAccessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    memoryAccessToken = null;
  }
  return memoryAccessToken;
}

export function setStoredAccessToken(token: string | null) {
  memoryAccessToken = token;
  try {
    if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearStoredAccessToken() {
  setStoredAccessToken(null);
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(crmApiUrl("/auth/refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        clearStoredAccessToken();
        return null;
      }
      const token = (data as { accessToken?: string })?.accessToken ?? null;
      if (token) setStoredAccessToken(token);
      return token;
    } catch {
      clearStoredAccessToken();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function getAccessToken(): Promise<string | null> {
  return getStoredAccessToken();
}

export async function fetchJson<T>(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
): Promise<T> {
  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    return fetch(crmApiUrl(path), {
      method: init?.method ?? "GET",
      headers,
      body: init?.body != null ? JSON.stringify(init.body) : undefined,
      credentials: "include",
    });
  };

  let token = getStoredAccessToken();
  let res = await doFetch(token);

  if (res.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      token = refreshed;
      res = await doFetch(token);
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = data as { error?: string; code?: string | null; requestId?: string | null };
    const msg = payload?.error || `Request failed (${res.status})`;
    const suffixParts = [
      payload?.code ? `code=${payload.code}` : null,
      payload?.requestId ? `requestId=${payload.requestId}` : null,
    ].filter(Boolean);
    throw new Error(suffixParts.length ? `${msg} (${suffixParts.join(", ")})` : msg);
  }
  return data as T;
}

/** Unauthenticated JSON (e.g. login/signup org list). */
export async function fetchPublicJson<T>(path: string): Promise<T> {
  const res = await fetch(crmApiUrl(path), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "omit",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export type PublicJsonErrorBody = {
  error?: string;
  code?: string;
  ticket_number?: string;
  details?: unknown;
};

/** Structured error from public CRM routes (OTP, submit, etc.). */
export class PublicRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly ticket_number?: string;

  constructor(message: string, status: number, code?: string, ticket_number?: string) {
    super(message);
    this.name = "PublicRequestError";
    this.status = status;
    this.code = code;
    this.ticket_number = ticket_number;
  }
}

/** Unauthenticated POST JSON (e.g. forgot password). */
export async function postPublicJson<T>(
  path: string,
  body: unknown
): Promise<T> {
  const res = await fetch(crmApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = data as PublicJsonErrorBody;
    throw new PublicRequestError(
      payload?.error || `Request failed (${res.status})`,
      res.status,
      payload?.code,
      payload?.ticket_number
    );
  }
  return data as T;
}

/** Unauthenticated PATCH JSON (e.g. public complaint session profile). */
export async function patchPublicJson<T>(
  path: string,
  body: unknown
): Promise<T> {
  const res = await fetch(crmApiUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

/**
 * Magic-link proof upload — no Sahaya JWT; token is in JSON body.
 * Never send Authorization (avoids accidental Bearer from cookies/extensions).
 */
export async function postFeProofPublic(body: unknown): Promise<unknown> {
  const res = await fetch(crmApiUrl("/fe/proof"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
  });
  const rawText = await res.text();
  let data: Record<string, unknown> = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    const msg = (typeof data.error === "string" && data.error) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}
