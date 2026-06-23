/**
 * Centralized app config for environment-based URLs.
 * Use APP_BASE_URL for all external links (emails, SMS, redirects) to the frontend app.
 *
 * development:  APP_BASE_URL=http://localhost:3000
 * production:   APP_BASE_URL=https://sahaya.pariskq.in
 */
const APP_BASE_URL = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const FE_GATED_RESOLUTION_TOKEN = String(process.env.FE_GATED_RESOLUTION_TOKEN || "").toLowerCase() === "true";
const SAFE_TOKEN_LIFECYCLE = String(process.env.SAFE_TOKEN_LIFECYCLE || "true").toLowerCase() !== "false";
const DISABLE_AUTO_RESOLUTION_WORKER = String(process.env.DISABLE_AUTO_RESOLUTION_WORKER || "false").toLowerCase() === "true";
const ENFORCE_TENANT_GUARD = String(process.env.ENFORCE_TENANT_GUARD || "false").toLowerCase() === "true";
const WORKER_TENANT_ISOLATION_ENABLED =
  String(process.env.WORKER_TENANT_ISOLATION_ENABLED || "false").toLowerCase() === "true";
const USE_POSTGRES_DB = String(process.env.USE_POSTGRES_DB || "false").toLowerCase() === "true";
/** When false, POST /tickets/bulk-assign returns 404. Single assign is unaffected. */
const BULK_ASSIGN_ENABLED = String(process.env.BULK_ASSIGN_ENABLED || "false").toLowerCase() === "true";
/** When false, POST /tickets/import/* returns 404. Manual single create is unaffected. */
const BULK_TICKET_IMPORT_ENABLED =
  String(process.env.BULK_TICKET_IMPORT_ENABLED || "false").toLowerCase() === "true";
const BULK_IMPORT_MAX_ROWS = Number(process.env.BULK_IMPORT_MAX_ROWS) || 100;
/** When false, /data/clients/* returns 404. Ticket create / import unchanged. */
const TENANT_CLIENTS_ENABLED =
  String(process.env.TENANT_CLIENTS_ENABLED || "false").toLowerCase() === "true";
/** When false, POST /auth/provision/admin returns 404; admin UIs keep browser signUp. */
const PROVISION_SERVER_SIDE_ENABLED =
  String(process.env.PROVISION_SERVER_SIDE_ENABLED || "false").toLowerCase() === "true";
/** When false, /complaint-points/* and /public/* OTP routes return 404. */
const PUBLIC_COMPLAINTS_ENABLED =
  String(process.env.PUBLIC_COMPLAINTS_ENABLED || "false").toLowerCase() === "true";
/** When false, daily tenant ops report worker is inert (default off). */
const DAILY_TENANT_REPORT_ENABLED =
  String(process.env.DAILY_TENANT_REPORT_ENABLED || "false").toLowerCase() === "true";
const DAILY_REPORT_DRY_RUN =
  String(process.env.DAILY_REPORT_DRY_RUN || "false").toLowerCase() === "true";
/** IST instant when PKQS/PKQE/PKQC numbering activates (default 2026-06-20 00:00 IST). */
const TICKET_NUMBERING_CUTOVER_IST =
  process.env.TICKET_NUMBERING_CUTOVER_IST || "2026-06-20 00:00:00 Asia/Kolkata";
/** When false, legacy PKQ/TKT generators are used even after cutover (emergency rollback). */
const USE_SOURCE_AWARE_TICKET_NUMBERS =
  String(process.env.USE_SOURCE_AWARE_TICKET_NUMBERS ?? "true").trim().toLowerCase() !== "false";

const OTP_EXPIRY_MINUTES = Math.min(
  60,
  Math.max(1, Number(process.env.OTP_EXPIRY_MINUTES) || 5)
);
const OTP_MAX_ATTEMPTS = Math.min(20, Math.max(1, Number(process.env.OTP_MAX_ATTEMPTS) || 5));
const OTP_MAX_RESENDS = Math.min(10, Math.max(0, Number(process.env.OTP_MAX_RESENDS) || 3));
const OTP_MAX_REQUESTS_PER_MOBILE = Math.min(
  50,
  Math.max(1, Number(process.env.OTP_MAX_REQUESTS_PER_MOBILE) || 10)
);
/** Sliding window for per-mobile send caps (minutes). */
const OTP_REQUEST_WINDOW_MINUTES = Math.min(
  1440,
  Math.max(5, Number(process.env.OTP_REQUEST_WINDOW_MINUTES) || 60)
);
const OTP_VERIFICATION_TOKEN_TTL_MINUTES = Math.min(
  120,
  Math.max(5, Number(process.env.OTP_VERIFICATION_TOKEN_TTL_MINUTES) || 30)
);
/** FE magic-link action tokens (on-site / resolution proof). Not used for auth or OTP. */
const FE_ACTION_TOKEN_EXPIRY_HOURS = Math.min(
  720,
  Math.max(1, Number(process.env.FE_ACTION_TOKEN_EXPIRY_HOURS) || 168)
);

/**
 * Database access mode for repositories (incremental migration).
 * When unset, behavior matches pre-Prisma defaults: Supabase unless USE_POSTGRES_DB forces direct PG.
 *
 * @typedef {"supabase"|"shadow_pg"|"postgres"|"prisma"|"shadow_prisma"} DbMode
 */

/** @returns {DbMode} */
export function resolveDbMode() {
  const raw = String(process.env.DB_MODE || "").trim().toLowerCase();
  const allowed = new Set(["supabase", "shadow_pg", "postgres", "prisma", "shadow_prisma"]);
  if (raw && allowed.has(raw)) {
    return /** @type {DbMode} */ (raw);
  }
  // Preserve legacy flag semantics when DB_MODE is not set
  if (USE_POSTGRES_DB) return "postgres";
  return "supabase";
}

export {
  APP_BASE_URL,
  FE_GATED_RESOLUTION_TOKEN,
  SAFE_TOKEN_LIFECYCLE,
  DISABLE_AUTO_RESOLUTION_WORKER,
  ENFORCE_TENANT_GUARD,
  WORKER_TENANT_ISOLATION_ENABLED,
  USE_POSTGRES_DB,
  BULK_ASSIGN_ENABLED,
  BULK_TICKET_IMPORT_ENABLED,
  BULK_IMPORT_MAX_ROWS,
  TENANT_CLIENTS_ENABLED,
  PROVISION_SERVER_SIDE_ENABLED,
  PUBLIC_COMPLAINTS_ENABLED,
  DAILY_TENANT_REPORT_ENABLED,
  DAILY_REPORT_DRY_RUN,
  TICKET_NUMBERING_CUTOVER_IST,
  USE_SOURCE_AWARE_TICKET_NUMBERS,
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_RESENDS,
  OTP_MAX_REQUESTS_PER_MOBILE,
  OTP_REQUEST_WINDOW_MINUTES,
  OTP_VERIFICATION_TOKEN_TTL_MINUTES,
  FE_ACTION_TOKEN_EXPIRY_HOURS,
};
