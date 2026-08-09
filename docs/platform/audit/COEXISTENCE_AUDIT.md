# COEXISTENCE AUDIT

**Scope:** METADATA layer impact on LEGACY Sahaya  
**Date:** 2026-08-09  
**Evidence:** Integration suite + code path review

---

## Automated coexistence results

`tests/integration/platformMetadataCoexistence.test.js` — **7/7 PASS**

| Check | Result |
|-------|--------|
| LEGACY settings default LEGACY | ✅ |
| LEGACY `/platform/forms` → 404 `PLATFORM_LEGACY_TENANT` | ✅ |
| LEGACY `/data/tickets` → 200 | ✅ |
| METADATA form publish + runtime ticket | ✅ |
| METADATA `/data/tickets` & `/tickets` → 409 exclusive | ✅ |
| SUPER_ADMIN gate for METADATA enable | ✅ (status in {200,400,403}) |

---

## Absolute Rule 2 stress (“No new queries / middleware for LEGACY”)

| Claim | Reality | Severity |
|-------|---------|----------|
| No new middleware on LEGACY | **FALSE** — `exclusiveLegacyTicketGate` mounted on `/tickets`, `/data` (ticket paths), `/fe/me`, `/sm` in `app.js` | P1 |
| No new queries for LEGACY | **FALSE** — authenticated legacy ticket requests call `getOrganisationPlatformMode` → `platform_tenant_settings` | P1 |
| No UI for LEGACY | ✅ Metadata UI only under `/app/metadata` (admin) | OK |
| No routes for LEGACY builders | ✅ 404 on builders | OK |
| Zero performance impact | **Unproven / likely false** — extra auth+mode lookup on ticket APIs | P1 |

**Note:** Exclusive gate is a P0 dual-runtime fix from hardening sprint; it **does** tax LEGACY. Coexistence of *behavior* is largely preserved; coexistence of *zero overhead* is **not**.

---

## Isolation of data

| Check | Status |
|-------|--------|
| METADATA tickets in `platform_tickets` only | ✅ by design / create path |
| LEGACY `tickets` table not written by platform runtime | ✅ no import of legacy ticket services |
| Cross-list contamination | ✅ exclusive gate + separate tables |

---

## Full V1 regression suite

**Not re-run in full** in this audit (FE/SM lifecycle, SLA, proofs, etc.).  
Only platform coexistence integration + platform unit suites were executed.

---

## Coexistence score: **62 / 100**

Behavioral isolation is credible; “zero middleware/query impact” requirement **fails**.
