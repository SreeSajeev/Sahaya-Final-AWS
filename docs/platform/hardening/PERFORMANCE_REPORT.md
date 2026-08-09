# PERFORMANCE REPORT (post-hardening)

## LEGACY mode resolution

| Path | Before | After |
|------|--------|-------|
| Authenticated LEGACY ticket request | DB query `platform_tenant_settings` every time | **Cache hit / peek** → **0 metadata queries** after warm or first miss |
| Metrics | — | `modeCacheStats.hits/misses/dbLoads` |

Warm sources: settings upsert, `loadPlatformContext`, first cached load.

## Regex

| Probe | Before | After |
|-------|--------|-------|
| Form field `(a+)+$` × 25 `a` | ~4428 ms | **~1 ms fail-closed** |

## Registry

LRU catalog cache (TTL 30s) reduces repeat `GET /registry` load; invalidated on publish.

## Not claimed this sprint

100 concurrent form publishes / 1000 concurrent tickets load harness — recommend follow-up soak. Unit suite duration remains healthy (~11s / 387 tests).
