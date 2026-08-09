# Metadata Platform — Deployment Report

**Date:** 2026-08-08  
**Layer:** Sahaya V2 Metadata Platform (non-breaking)

## Recommendation

**SAFE TO DEPLOY alongside frozen Sahaya core** after running additive migration `20260808020000_platform_metadata_layer`.

Existing tenants (Hitachi / Test) remain **LEGACY** with **zero behavioral change** unless a SUPER_ADMIN explicitly sets `METADATA`.

## What was added

- `backend/src/platform/**` — runtime, forms, builders, `/platform` API
- `frontend/src/platform/**` — `/app/metadata` UI shell
- Additive SQL migration + docs under `docs/platform/`
- Coexistence tests (LEGACY vs METADATA)

## What was deliberately not changed

- Ticket creation, email parsing, assignment, lifecycle, reports, FE/SM portals
- Existing `/data/*`, `/tickets/*`, `/fe/*`, `/sm/*` business logic
- Existing migrations (only new folder added)
- No removal or rename of APIs

## Boundary adapters (only)

- `backend/src/app.js` — mount `/platform`
- `frontend/src/App.tsx` — lazy `/app/metadata/*` routes
- `tests/helpers/testApp.js` — test mount

## Rollback

1. Stop using `/app/metadata` and `/platform`.
2. Optionally leave tables in place (harmless for LEGACY).
3. Remove mount lines if needed — core Sahaya unaffected.
