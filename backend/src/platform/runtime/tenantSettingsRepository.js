/**
 * Platform tenant settings — mode resolution with in-memory cache.
 * LEGACY (no row) is negatively cached so V1 ticket traffic does not query repeatedly.
 */
import { prisma } from "../../db/prisma.js";
import { PLATFORM_MODES, resolvePlatformMode } from "./platformMode.js";
import {
  getOrganisationPlatformModeCached,
  invalidatePlatformModeCache,
  warmPlatformModeCache,
} from "./platformModeCache.js";

export async function getPlatformTenantSettings(organisationId) {
  if (!organisationId) return null;
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT organisation_id, mode, enabled_modules, created_at, updated_at
       FROM platform_tenant_settings
       WHERE organisation_id = $1::uuid
       LIMIT 1`,
      String(organisationId)
    );
    const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!row) return null;
    return {
      organisation_id: row.organisation_id,
      mode: row.mode,
      enabled_modules: row.enabled_modules || {},
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } catch (err) {
    if (String(err?.message || "").includes("platform_tenant_settings") || err?.code === "42P01") {
      return null;
    }
    throw err;
  }
}

async function loadModeFromDb(organisationId) {
  const settings = await getPlatformTenantSettings(organisationId);
  return resolvePlatformMode(settings);
}

export async function getOrganisationPlatformMode(organisationId) {
  return getOrganisationPlatformModeCached(organisationId, () => loadModeFromDb(organisationId));
}

/**
 * Force uncached read (admin / diagnostics).
 */
export async function getOrganisationPlatformModeUncached(organisationId) {
  return loadModeFromDb(organisationId);
}

export async function upsertPlatformTenantSettings(organisationId, { mode, enabledModules } = {}) {
  const nextMode =
    String(mode || PLATFORM_MODES.LEGACY).toUpperCase() === PLATFORM_MODES.METADATA
      ? PLATFORM_MODES.METADATA
      : PLATFORM_MODES.LEGACY;
  const modulesJson = JSON.stringify(enabledModules && typeof enabledModules === "object" ? enabledModules : {});
  await prisma.$executeRawUnsafe(
    `INSERT INTO platform_tenant_settings (organisation_id, mode, enabled_modules, created_at, updated_at)
     VALUES ($1::uuid, $2, $3::jsonb, NOW(), NOW())
     ON CONFLICT (organisation_id) DO UPDATE SET
       mode = EXCLUDED.mode,
       enabled_modules = EXCLUDED.enabled_modules,
       updated_at = NOW()`,
    String(organisationId),
    nextMode,
    modulesJson
  );
  invalidatePlatformModeCache(organisationId);
  warmPlatformModeCache(organisationId, nextMode);
  return getPlatformTenantSettings(organisationId);
}
