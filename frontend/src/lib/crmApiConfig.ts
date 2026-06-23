/**
 * Central CRM REST API base URL for the Vite frontend.
 *
 * Resolution order:
 * 1. VITE_CRM_API_URL (trimmed) when set at build time
 * 2. Non-localhost browsers: production fallback https://api.sahaya.pariskq.in (avoids bad builds defaulting to localhost)
 * 3. localhost / 127.0.0.1 (or non-browser): development fallback http://localhost:3000
 *
 * Production bundles must never default to localhost when the env var is missing.
 */

export const CRM_API_PRODUCTION_FALLBACK = "https://api.sahaya.pariskq.in" as const;
export const CRM_API_DEVELOPMENT_FALLBACK = "http://localhost:3000" as const;

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function readEnvApiBase(): string | null {
  const raw = import.meta.env.VITE_CRM_API_URL;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? normalizeBaseUrl(trimmed) : null;
}

/** Resolved API base URL (no trailing slash). */
export function getCrmApiBase(): string {
  const fromEnv = readEnvApiBase();
  if (fromEnv) return fromEnv;

  /**
   * Production/browser safety:
   * Never allow deployed domains to fall back to localhost.
   */
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const isLocalhost =
      host === "localhost" ||
      host === "127.0.0.1";
    if (!isLocalhost) {
      return CRM_API_PRODUCTION_FALLBACK;
    }
  }

  return CRM_API_DEVELOPMENT_FALLBACK;
}

/** Absolute URL for a CRM API path (path must start with `/`). */
export function crmApiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${getCrmApiBase()}${p}`;
}

function logActiveApiBaseOnce(): void {
  if (!import.meta.env.DEV) return;
  const fromEnv = readEnvApiBase();
  const source = fromEnv
    ? "VITE_CRM_API_URL"
    : import.meta.env.PROD
      ? "production fallback"
      : "development fallback";
  // eslint-disable-next-line no-console
  console.info(`[CRM API] base URL: ${getCrmApiBase()} (${source})`);
}

logActiveApiBaseOnce();
