/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** CRM REST API base URL (no trailing slash). Optional: production builds fall back to https://api.sahaya.pariskq.in */
  readonly VITE_CRM_API_URL?: string;
  /** SPA origin for password recovery redirect (e.g. https://sahaya.pariskq.in). Used by forgot-password only. */
  readonly VITE_APP_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
