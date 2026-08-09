/**
 * In-process platform mode cache — LEGACY traffic must not hit DB per request.
 * Default absence of settings ⇒ LEGACY (cached as LEGACY without repeated misses thrashing).
 */
import { PLATFORM_MODES, resolvePlatformMode } from "./platformMode.js";

/** @type {Map<string, { mode: string, expiresAt: number, fromDb: boolean }>} */
const cache = new Map();

const DEFAULT_TTL_MS = Number(process.env.PLATFORM_MODE_CACHE_TTL_MS || 60_000);
const NEGATIVE_TTL_MS = Number(process.env.PLATFORM_MODE_NEGATIVE_CACHE_TTL_MS || 60_000);

/** Test/metrics counters */
export const modeCacheStats = {
  hits: 0,
  misses: 0,
  dbLoads: 0,
  invalidations: 0,
  reset() {
    this.hits = 0;
    this.misses = 0;
    this.dbLoads = 0;
    this.invalidations = 0;
  },
};

export function invalidatePlatformModeCache(organisationId) {
  if (organisationId) {
    cache.delete(String(organisationId));
  } else {
    cache.clear();
  }
  modeCacheStats.invalidations += 1;
}

/**
 * @param {string} organisationId
 * @param {() => Promise<string>} loader returns LEGACY|METADATA
 */
export async function getOrganisationPlatformModeCached(organisationId, loader) {
  if (!organisationId) return PLATFORM_MODES.LEGACY;
  const key = String(organisationId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    modeCacheStats.hits += 1;
    return hit.mode;
  }
  modeCacheStats.misses += 1;
  modeCacheStats.dbLoads += 1;
  const mode = await loader();
  const resolved = mode === PLATFORM_MODES.METADATA ? PLATFORM_MODES.METADATA : PLATFORM_MODES.LEGACY;
  const ttl = resolved === PLATFORM_MODES.LEGACY ? NEGATIVE_TTL_MS : DEFAULT_TTL_MS;
  cache.set(key, { mode: resolved, expiresAt: now + ttl, fromDb: true });
  return resolved;
}

export function peekPlatformModeCache(organisationId) {
  const hit = cache.get(String(organisationId));
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit.mode;
}

/** Warm cache during auth / settings load without counting as miss thrash. */
export function warmPlatformModeCache(organisationId, settingsOrMode) {
  if (!organisationId) return;
  const mode =
    typeof settingsOrMode === "string"
      ? settingsOrMode
      : resolvePlatformMode(settingsOrMode);
  const resolved = mode === PLATFORM_MODES.METADATA ? PLATFORM_MODES.METADATA : PLATFORM_MODES.LEGACY;
  cache.set(String(organisationId), {
    mode: resolved,
    expiresAt: Date.now() + DEFAULT_TTL_MS,
    fromDb: false,
  });
}
