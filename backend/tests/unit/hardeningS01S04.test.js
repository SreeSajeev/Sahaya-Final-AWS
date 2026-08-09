/**
 * Hardening S-01..S-04 regression + LEGACY mode cache zero-query path.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { evaluateFormula } from "../../src/platform/form-engine/formula.js";
import {
  modeCacheStats,
  invalidatePlatformModeCache,
  warmPlatformModeCache,
  peekPlatformModeCache,
  getOrganisationPlatformModeCached,
} from "../../src/platform/runtime/platformModeCache.js";
import { PLATFORM_MODES } from "../../src/platform/runtime/platformMode.js";
import { publishToRegistry, getRegistryCatalog, buildFormCatalogEntry } from "../../src/platform/metadata-registry/index.js";
import { registryCacheStats, invalidateRegistryCache, broadcastRegistryPublish, registryEvents } from "../../src/platform/metadata-registry/registryCache.js";

describe("S-01 formula no Function", () => {
  it("blocks sandbox escape that previously returned 2", () => {
    const r = evaluateFormula('([]).constructor.constructor("return 1+1")()', {});
    expect(r.ok).toBe(false);
  });
});

describe("LEGACY mode cache", () => {
  beforeEach(() => {
    invalidatePlatformModeCache();
    modeCacheStats.reset();
  });

  it("second lookup is cache hit without loader", async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      return PLATFORM_MODES.LEGACY;
    };
    const a = await getOrganisationPlatformModeCached("org-1", loader);
    const b = await getOrganisationPlatformModeCached("org-1", loader);
    expect(a).toBe("LEGACY");
    expect(b).toBe("LEGACY");
    expect(loads).toBe(1);
    expect(modeCacheStats.hits).toBe(1);
    expect(peekPlatformModeCache("org-1")).toBe("LEGACY");
  });

  it("warm cache enables zero-db peek for exclusive gate path", () => {
    warmPlatformModeCache("org-legacy", PLATFORM_MODES.LEGACY);
    expect(peekPlatformModeCache("org-legacy")).toBe("LEGACY");
  });
});

describe("S-04 registry events", () => {
  it("broadcast emits publish event", async () => {
    let seen = null;
    const handler = (e) => {
      seen = e;
    };
    registryEvents.on("publish", handler);
    broadcastRegistryPublish("org-x", { bucket: "forms", key: "f1", registryVersion: 1 });
    registryEvents.off("publish", handler);
    expect(seen?.type).toBe("registry.published");
    expect(seen?.bucket).toBe("forms");
  });

  it("buildFormCatalogEntry includes schema for runtime resolve", () => {
    const e = buildFormCatalogEntry("intake", 2, { fields: [{ internalName: "t", fieldType: "single_line_text" }] }, { type: "root" });
    expect(e.schema.fields).toHaveLength(1);
    expect(e.version).toBe(2);
  });
});

describe("registry cache stats", () => {
  it("invalidates", () => {
    invalidateRegistryCache();
    registryCacheStats.reset();
    invalidateRegistryCache("o");
    expect(registryCacheStats.invalidations).toBe(1);
  });
});
