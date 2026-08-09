/**
 * Production boot validation — LEGACY must never be blocked by Metadata-only config.
 *
 * assertProductionConfig / assertLegacyProductionConfig:
 *   JWT, DB, mail, tenant guard, dry-run flags (shared CRM).
 *
 * assertLegacyProofStorageConfig:
 *   S3 FE proofs — warns by default; fatal only when LEGACY_PROOF_STORAGE_STRICT=true.
 *
 * assertMetadataPlatformConfig:
 *   Metadata-only checks. Called when enabling METADATA or METADATA_PLATFORM_STRICT_BOOT=true.
 *   Never invoked as a hard dependency of legacy-only boots.
 */
import { ENFORCE_TENANT_GUARD } from "./appConfig.js";

function isProd() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function missing(name) {
  const v = process.env[name];
  return v == null || String(v).trim() === "";
}

/**
 * Core production config required for LEGACY Sahaya to serve traffic.
 * @throws {Error}
 */
export function assertLegacyProductionConfig() {
  if (!isProd()) return;

  const errors = [];

  if (missing("JWT_ACCESS_SECRET") || String(process.env.JWT_ACCESS_SECRET).trim().length < 32) {
    errors.push("JWT_ACCESS_SECRET must be set and at least 32 characters");
  }
  if (missing("DATABASE_URL")) {
    errors.push("DATABASE_URL is required");
  }
  if (missing("POSTMARK_SERVER_TOKEN")) {
    errors.push("POSTMARK_SERVER_TOKEN is required");
  }
  if (missing("FROM_EMAIL") && missing("MAIL_FROM_EMAIL")) {
    errors.push("FROM_EMAIL or MAIL_FROM_EMAIL is required");
  }
  if (String(process.env.PASSWORD_RESET_DRY_RUN || "false").toLowerCase() === "true") {
    errors.push("PASSWORD_RESET_DRY_RUN must not be true in production");
  }
  if (String(process.env.PASSWORD_RESET_CAPTURE_TOKEN || "").toLowerCase() === "true") {
    errors.push("PASSWORD_RESET_CAPTURE_TOKEN must not be true in production");
  }
  if (!ENFORCE_TENANT_GUARD) {
    errors.push("ENFORCE_TENANT_GUARD must be true in production");
  }
  if (String(process.env.CLOSE_SKIP_PROOF_VALIDATION || "false").toLowerCase() === "true") {
    errors.push("CLOSE_SKIP_PROOF_VALIDATION must not be true in production");
  }

  if (errors.length) {
    const msg = `[FATAL] Legacy production config invalid:\n - ${errors.join("\n - ")}`;
    console.error(msg);
    throw new Error(msg);
  }
}

/**
 * Proof storage (legacy FE proofs). Does NOT block METADATA-unrelated boots unless strict.
 * @returns {{ ok: boolean, warnings: string[], errors: string[] }}
 */
export function assertLegacyProofStorageConfig({ throwOnError = null } = {}) {
  if (!isProd()) return { ok: true, warnings: [], errors: [] };

  const strict =
    throwOnError === true ||
    String(process.env.LEGACY_PROOF_STORAGE_STRICT || "false").toLowerCase() === "true";
  const errors = [];
  const warnings = [];

  const s3Enabled = String(process.env.S3_FE_PROOFS_ENABLED || "false").toLowerCase() === "true";
  if (!s3Enabled) {
    const msg = "S3_FE_PROOFS_ENABLED is not true — FE proof uploads will fail in production";
    if (strict) errors.push(msg);
    else warnings.push(msg);
  } else {
    const bucket = String(process.env.S3_FE_PROOFS_BUCKET || "").trim();
    if (!bucket) {
      const msg = "S3_FE_PROOFS_BUCKET is required when S3_FE_PROOFS_ENABLED=true";
      if (strict) errors.push(msg);
      else warnings.push(msg);
    } else if (bucket === "crm-pariskq") {
      const msg = "S3_FE_PROOFS_BUCKET refuses crm-pariskq";
      if (strict) errors.push(msg);
      else warnings.push(msg);
    }
  }

  for (const w of warnings) console.warn(`[WARN] Proof storage: ${w}`);
  if (errors.length) {
    const msg = `[FATAL] Legacy proof storage config invalid:\n - ${errors.join("\n - ")}`;
    console.error(msg);
    throw new Error(msg);
  }
  return { ok: true, warnings, errors };
}

/**
 * Metadata platform production checks — independent of LEGACY boot.
 * @throws {Error} only when called explicitly / strict metadata boot
 */
export function assertMetadataPlatformConfig() {
  if (!isProd()) return { ok: true, errors: [] };

  const errors = [];
  // Compatibility mode must be intentional in production
  if (String(process.env.PLATFORM_COMPATIBILITY_MODE || "false").toLowerCase() === "true") {
    console.warn(
      "[WARN] PLATFORM_COMPATIBILITY_MODE=true — METADATA tenants can also hit legacy ticket APIs"
    );
  }
  // Placeholder for future metadata-only secrets (LLM keys, etc.)
  if (errors.length) {
    const msg = `[FATAL] Metadata platform config invalid:\n - ${errors.join("\n - ")}`;
    console.error(msg);
    throw new Error(msg);
  }
  return { ok: true, errors };
}

/**
 * App boot entry: always validate LEGACY core. Proof storage warns.
 * Metadata strict boot only when METADATA_PLATFORM_STRICT_BOOT=true.
 */
export function assertProductionConfig() {
  assertLegacyProductionConfig();
  assertLegacyProofStorageConfig();
  if (String(process.env.METADATA_PLATFORM_STRICT_BOOT || "false").toLowerCase() === "true") {
    assertMetadataPlatformConfig();
  }
}
