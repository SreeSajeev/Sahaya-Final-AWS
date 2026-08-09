/**
 * Sahaya V2 — Metadata Platform Layer
 *
 * ISOLATED from frozen Sahaya core. Default tenant mode = LEGACY
 * (no platform_tenant_settings row ⇒ LEGACY ⇒ zero behavior change).
 */

export const PLATFORM_MODES = Object.freeze({
  LEGACY: "LEGACY",
  METADATA: "METADATA",
});

export const PLATFORM_MODULE_KEYS = Object.freeze([
  "forms",
  "email_parsers",
  "workflows",
  "assignments",
  "notifications",
  "reports",
  "dashboards",
  "permissions",
  "automations",
  "ai",
  "plugins",
  "runtime",
]);

/**
 * Single decision point for LEGACY vs METADATA.
 * Absence of settings ⇒ LEGACY (Hitachi / Test Sahaya unchanged).
 *
 * @param {{ mode?: string | null } | null | undefined} settings
 * @returns {"LEGACY" | "METADATA"}
 */
export function resolvePlatformMode(settings) {
  const mode = String(settings?.mode || PLATFORM_MODES.LEGACY).toUpperCase();
  return mode === PLATFORM_MODES.METADATA ? PLATFORM_MODES.METADATA : PLATFORM_MODES.LEGACY;
}

export function isMetadataMode(settings) {
  return resolvePlatformMode(settings) === PLATFORM_MODES.METADATA;
}

export function isLegacyMode(settings) {
  return resolvePlatformMode(settings) === PLATFORM_MODES.LEGACY;
}
