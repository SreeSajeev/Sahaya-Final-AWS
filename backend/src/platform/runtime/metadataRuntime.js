/**
 * THE single runtime gate for Metadata vs Legacy.
 * Existing Sahaya routes must NEVER import this into business logic.
 * Only /platform/* and future metadata entrypoints use it.
 */
import { getOrganisationPlatformMode, getPlatformTenantSettings } from "./tenantSettingsRepository.js";
import { PLATFORM_MODES, isMetadataMode } from "./platformMode.js";
import { warmPlatformModeCache } from "./platformModeCache.js";

/**
 * Express middleware: require METADATA mode for this tenant.
 * LEGACY tenants receive 404 (feature does not exist for them) — not 403 —
 * so scanners and accidental FE calls do not leak platform existence.
 */
export function requireMetadataMode() {
  return async function requireMetadataModeMiddleware(req, res, next) {
    try {
      const orgId = req.tenantId || req.appUser?.organisation_id || req.appUser?.organisationId || null;
      if (!orgId && !req.isSuperAdmin) {
        return res.status(404).json({ error: "Not found", code: "PLATFORM_NOT_AVAILABLE" });
      }
      // Super-admin may manage any org via query/body organisationId.
      const targetOrg =
        (req.isSuperAdmin && (req.query?.organisationId || req.body?.organisationId)) || orgId;
      if (!targetOrg) {
        return res.status(400).json({ error: "organisationId required", code: "ORG_REQUIRED" });
      }
      const mode = await getOrganisationPlatformMode(targetOrg);
      if (mode !== PLATFORM_MODES.METADATA) {
        return res.status(404).json({ error: "Not found", code: "PLATFORM_LEGACY_TENANT" });
      }
      req.platformMode = mode;
      req.platformOrganisationId = String(targetOrg);
      return next();
    } catch (err) {
      return res.status(500).json({ error: err?.message || "Platform gate failed" });
    }
  };
}

/**
 * Settings read is allowed in LEGACY (so admin UI can show mode=LEGACY).
 * Mutating to METADATA is separate and role-gated.
 */
export async function loadPlatformContext(req) {
  const orgId = req.tenantId || req.appUser?.organisation_id || req.appUser?.organisationId || null;
  const targetOrg =
    (req.isSuperAdmin && (req.query?.organisationId || req.body?.organisationId)) || orgId;
  if (!targetOrg) {
    return { organisationId: null, mode: PLATFORM_MODES.LEGACY, settings: null, metadataActive: false };
  }
  const settings = await getPlatformTenantSettings(targetOrg);
  const mode = settings ? (isMetadataMode(settings) ? PLATFORM_MODES.METADATA : PLATFORM_MODES.LEGACY) : PLATFORM_MODES.LEGACY;
  warmPlatformModeCache(targetOrg, mode);
  return {
    organisationId: String(targetOrg),
    mode,
    settings,
    metadataActive: mode === PLATFORM_MODES.METADATA,
  };
}
