import { APP_BASE_URL } from "../config/appConfig.js";
import { safeTrim } from "./http.js";

const PRODUCTION_APP_ORIGIN = "https://sahaya.pariskq.in";

/** Canonical SPA reset page URL (env-driven, never bare localhost in production). */
export function getCanonicalPasswordResetUrl() {
  const explicit = safeTrim(process.env.PASSWORD_RESET_REDIRECT_URL);
  if (explicit) return explicit;

  const base = safeTrim(process.env.APP_BASE_URL) || APP_BASE_URL;
  const normalized = String(base).replace(/\/$/, "");

  if (isProductionBackend() && isLocalhostUrl(normalized)) {
    return `${PRODUCTION_APP_ORIGIN}/reset-password`;
  }

  return `${normalized}/reset-password`;
}

function isProductionBackend() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

function isLocalhostUrl(urlString) {
  try {
    const host = new URL(urlString).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(String(urlString));
  }
}

/** @returns {Set<string>} allowed origins for reset-password redirect (non-production only). */
export function getAllowedPasswordResetOrigins() {
  const origins = new Set();
  const addOrigin = (raw) => {
    const t = safeTrim(raw);
    if (!t) return;
    try {
      origins.add(new URL(t).origin);
    } catch {
      /* ignore */
    }
  };

  addOrigin(getCanonicalPasswordResetUrl());
  addOrigin(APP_BASE_URL);
  const extra = process.env.PASSWORD_RESET_REDIRECT_ORIGINS || "";
  for (const part of extra.split(",")) addOrigin(part);

  addOrigin("http://localhost:3000");
  addOrigin("http://localhost:5173");
  addOrigin("http://localhost:8080");
  addOrigin("http://127.0.0.1:5173");
  addOrigin("https://opsxbypariskq.vercel.app");
  addOrigin(PRODUCTION_APP_ORIGIN);

  return origins;
}

/**
 * Resolve redirect URL passed to Supabase generateLink.
 * Production: always canonical (ignores client origin — prevents localhost in emails).
 * Development: validated client redirect or canonical fallback.
 */
export function resolvePasswordResetRedirectTo(clientRedirect) {
  const canonical = getCanonicalPasswordResetUrl();

  if (isProductionBackend()) {
    return canonical;
  }

  const candidate = safeTrim(clientRedirect) || canonical;
  const allowed = getAllowedPasswordResetOrigins();

  try {
    const url = new URL(candidate);
    if (!allowed.has(url.origin)) return canonical;
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (path !== "/reset-password") return canonical;
    return url.toString();
  } catch {
    return canonical;
  }
}

/**
 * Ensure Supabase verify link redirects to our SPA /reset-password (not Site URL root).
 * Rewrites redirect_to query param without logging tokens.
 */
export function rewriteActionLinkRedirect(actionLink, redirectTo) {
  const target = safeTrim(redirectTo);
  if (!target || !actionLink || typeof actionLink !== "string") {
    return actionLink;
  }

  try {
    const url = new URL(actionLink);
    url.searchParams.set("redirect_to", target);
    return url.toString();
  } catch {
    return actionLink;
  }
}
