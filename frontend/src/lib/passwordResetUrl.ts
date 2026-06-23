/**
 * SPA URL for Supabase recovery redirect_to (forgot-password API).
 * Prefer VITE_APP_BASE_URL so production builds never send localhost to the API.
 */

const PRODUCTION_RESET_URL = "https://sahaya.pariskq.in/reset-password";

export function getPasswordResetRedirectUrl(): string {
  const fromEnv = import.meta.env.VITE_APP_BASE_URL?.trim();
  if (fromEnv) {
    const base = fromEnv.replace(/\/$/, "");
    return `${base}/reset-password`;
  }

  if (import.meta.env.PROD) {
    return PRODUCTION_RESET_URL;
  }

  return `${window.location.origin}/reset-password`;
}
