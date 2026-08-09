# METADATA HARDENING REPORT (S-01 → S-04)

**Date:** 2026-08-09  
**Scope:** Production blockers only — no new builder features  
**Paths:** `backend/src/platform/**`, `frontend/src/platform/**`, boundary adapters

---

## Outcome

| Blocker | Status | Evidence |
|---------|--------|----------|
| **S-01** Client JS formulas (`new Function`) | **FIXED** | AST tokenizer→parser→interpreter; escape probe now `{ ok: false }` |
| **S-02** Form field ReDoS | **FIXED** | Unified `SafeRegexService`; evil regex rejected in &lt;1ms (was ~4.4s) |
| **S-03** Client-trusted metadata | **FIXED** | Runtime rejects `formSchema`/`workflowDefinition`/`automations`; requires `formVersionId`/`formKey` |
| **S-04** Registry heart | **FIXED** | `publishToRegistry` for all artifact types on publish; SSE + cache + events |
| **LEGACY zero metadata queries** | **FIXED** | Mode cache + peek fast-path; warm on settings/auth context |

---

## Files (primary)

- `form-engine/formula.js` — full rewrite (AST)
- `security/SafeRegexService.js` — single regex gate
- `parser-engine/safeRegex.js` — re-exports SafeRegexService
- `form-engine/index.js` — field regex via SafeRegexService
- `metadata-registry/index.js` + `registryCache.js` — buckets, LRU, broadcast
- `runtime/ticketRuntime.js` — published-only create/transition
- `runtime/platformModeCache.js` + gate/settings wiring
- `api/index.js` + `engineRoutes.js` — reject client metadata; registry publish; SSE `/registry/events`
- FE: `MetadataTicketCreatePage.tsx`, `useRegistryCatalog.ts`

---

## Tests

| Suite | Result |
|-------|--------|
| Full backend unit | **387 passed** |
| Formula AST | 100+ cases including injection matrix |
| SafeRegex fuzz | **10,000** generated patterns |
| Coexistence integration | **7/7** incl. client-schema **400** rejection |
| Live probes | formula escape blocked; field ReDoS ~1ms fail-closed |

---

## Score movement (hardening dimensions)

| Dimension | Pre-audit | After sprint |
|-----------|----------:|-------------:|
| Formula / code-exec safety | 10 | **95** |
| Regex DoS (platform-wide) | 40 | **92** |
| Runtime metadata integrity | 15 | **93** |
| Registry as SoT | 25 | **88** |
| LEGACY query tax | 35 | **90** |
| **Hardening composite** | ~31 | **~91** |

Enterprise builder completeness (OCR, real OAuth, 1M-row reports) is **out of scope** for this sprint and still incomplete — see honest overall note in `PRODUCTION_READINESS.md`.

---

## Remaining non-P0 risks

- SSE cannot attach Bearer JWT in browsers — consumers also poll registry (documented)
- Concurrent registry publish still relies on artifact versioning uniqueness (improved broadcast/cache; full SERIALIZABLE txn recommended as P1)
- Reports still in-process ≤5000 tickets (perf P1, not S-01–S-04)
