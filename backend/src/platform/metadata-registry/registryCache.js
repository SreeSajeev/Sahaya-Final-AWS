/**
 * Registry event bus + LRU catalog cache — METADATA only.
 */
import { EventEmitter } from "events";

/** @type {Map<string, { version: number, catalog: object, expiresAt: number }>} */
const lru = new Map();
const MAX_ENTRIES = Number(process.env.PLATFORM_REGISTRY_CACHE_MAX || 500);
const TTL_MS = Number(process.env.PLATFORM_REGISTRY_CACHE_TTL_MS || 30_000);

export const registryEvents = new EventEmitter();
registryEvents.setMaxListeners(100);

export const registryCacheStats = {
  hits: 0,
  misses: 0,
  invalidations: 0,
  reset() {
    this.hits = 0;
    this.misses = 0;
    this.invalidations = 0;
  },
};

export function getCachedCatalog(organisationId) {
  const key = String(organisationId);
  const hit = lru.get(key);
  if (!hit) {
    registryCacheStats.misses += 1;
    return null;
  }
  if (hit.expiresAt <= Date.now()) {
    lru.delete(key);
    registryCacheStats.misses += 1;
    return null;
  }
  // refresh LRU order
  lru.delete(key);
  lru.set(key, hit);
  registryCacheStats.hits += 1;
  return hit;
}

export function setCachedCatalog(organisationId, version, catalog) {
  const key = String(organisationId);
  if (lru.size >= MAX_ENTRIES && !lru.has(key)) {
    const oldest = lru.keys().next().value;
    lru.delete(oldest);
  }
  lru.set(key, { version, catalog, expiresAt: Date.now() + TTL_MS });
}

export function invalidateRegistryCache(organisationId) {
  if (organisationId) lru.delete(String(organisationId));
  else lru.clear();
  registryCacheStats.invalidations += 1;
}

/**
 * Broadcast publish event to SSE subscribers and in-process listeners.
 */
export function broadcastRegistryPublish(organisationId, payload) {
  invalidateRegistryCache(organisationId);
  const event = {
    type: "registry.published",
    organisationId: String(organisationId),
    at: new Date().toISOString(),
    ...payload,
  };
  registryEvents.emit("publish", event);
  registryEvents.emit(`publish:${organisationId}`, event);
  return event;
}
