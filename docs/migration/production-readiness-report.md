# Sahaya TEST — Production Readiness Hardening Report

**Environment:** TEST only (`test-sahaya.pariskq.in` / `api.test-sahaya.pariskq.in`)  
**Develop SHA:** `cd94237`  
**Date (UTC):** 2026-08-03  
**Prior acceptance:** PASS WITH ISSUES → this phase closes remaining gaps  

---

## Verdict

**PASS — FULL PLATFORM ACCEPTED END TO END**

Evidence:
- Full-platform API acceptance: **76 passed / 0 failed** (run `30810466211`)
- Playwright full-platform suite: **22 passed / 2 skipped / 0 failed** — verdict PASS (run `30811678317`)

---

## Safety ledger

| Check | Value |
|-------|-------|
| PRODUCTION MODIFICATIONS | **0** |
| REAL SUPABASE MUTATIONS | **0** |
| REAL SUPABASE CONFIG CHANGES | **0** |
| crm-pariskq WRITES | **0** |
| RDS CREATED | **0** |
| Architecture changes | **0** |

---

## 1. Ticket-by-ticket results

### TICKET 1 — Fix `/fe/proof` HTTP 500

| Field | Detail |
|-------|--------|
| **Result** | **PASS** — upload returns HTTP 200 |
| **Root cause** | After S3 + comment persist, `markTokenUsed` wrote `used_at` when the PG column existed, but Prisma `FeActionToken` lacked `usedAt`. Prisma threw → outer catch returned generic HTTP 500 despite successful storage. |
| **Why it happened** | Schema drift: live TEST PG had `fe_action_tokens.used_at`; Prisma model omitted it after earlier phantom-field cleanup. |
| **Fix** | Added `usedAt` to Prisma; throw real `Error` from atomic mark; wrap post-S3 `markTokenUsed` / resolution-token activation so storage success is not failed to the client. |
| **Files** | `backend/prisma/schema.prisma`, `backend/src/repositories/feActionTokenRepository.js`, `backend/src/controllers/proofController.js`, `backend/tests/unit/feActionTokenUsedAt.test.js` |
| **Runtime verify** | `PROOF.upload_fe_proof` status 200; DB `proof_storage_paths`; presign 200; object fetch 200 bytes |
| **Regression risks** | Token already-used races still return errors before S3; post-S3 token mark failure is logged and returns success (proof already durable). |

### TICKET 2 — Playwright full platform E2E

| Field | Detail |
|-------|--------|
| **Result** | **PASS** |
| **Deliverable** | `e2e/` suite covering auth, dashboard, tickets, FE, orgs, users, SLA, proofs, security, infrastructure + single acceptance reporter |
| **Files** | `e2e/**`, `.github/workflows/phase-d-auth-ops.yml` (`playwright_acceptance`), `docs/migration/playwright-acceptance-report.md` (generated on EC2) |
| **Browser verify** | Login/session, dashboard, tickets, FE, users, SLA shells against TEST |
| **Ops** | `RATE_LIMIT_LOGIN_MAX=200` on TEST so suite + acceptance do not collide |

### TICKET 3 — Fix `short_description` persistence

| Field | Detail |
|-------|--------|
| **Result** | **PASS** — API == Prisma/PG == GET |
| **Root cause** | Zod create schema accepted `description` (comment only) but **not** `short_description`; unknown keys stripped → never written. |
| **Fix** | Accept `short_description`; persist on insert; backfill from `description` when short missing. |
| **Files** | `backend/src/services/manualTicketService.js`, unit schema tests |
| **Verify** | `short_description_persist`: api/db/get all `E2E_TEST_FULL_PLATFORM_TICKET` |

### TICKET 4 — Fix ticket validation

| Field | Detail |
|-------|--------|
| **Result** | **PASS** — sparse body → HTTP 400 |
| **Root cause** | `{ status: "OPEN" }` stripped to `{}` and still created OPEN tickets. |
| **Fix** | Require ≥1 substantive field (`short_description`, `description`, `category`, `issue_type`, `vehicle_number`, `location`, `complaint_id`, `client_slug`). |
| **Files** | `backend/src/services/manualTicketService.js` |
| **Verify** | `NEGATIVE.create_missing_fields` status 400; no invalid row intended |

### TICKET 5 — SLA reconciliation

| Field | Detail |
|-------|--------|
| **Result** | **PASS** — API totals match PostgreSQL |
| **Root cause** | Prior acceptance compared filtered “tracked” count (exclude REJECTED) to raw `COUNT(*) FROM sla_tracking`. |
| **Fix** | SQL-authoritative `/data/sla/tracked-count`: `totalSlaRows` = raw count; `count` = joined non-REJECTED; `byStatus` breakdown. |
| **Files** | `backend/src/routes/dataApi.js`, acceptance reconcile check |
| **Verify** | `apiTotal=709 == dbTotal=709`, `apiTracked=672 == dbTracked=672`, `byStatusKeys=7` |

---

## 2–10. Verification matrix

| Area | Result | Evidence |
|------|--------|----------|
| Runtime (API) | PASS | health + full suite 76/0 |
| Browser | PASS | Playwright 22 passed |
| Database | PASS | ticket short_description; SLA SQL; proof paths |
| API | PASS | create/validate/SLA/proof/presign |
| S3 | PASS | `sahaya-test-fe-proofs` upload + presign + fetch |
| Security | PASS | tenant list isolation, FE org create 403, garbage JWT 401 |
| Regression | PASS | unit tests for schema + usedAt; concurrency ticket numbers unique |
| Supabase zero (bundle) | PASS | `runtimeHits:0`, `wordHits:0` after UI copy cleanup |

---

## Remaining known issues

- Password coverage for local auth remains **4/34** seeded samples (out of this five-ticket scope).
- Playwright skips FE live proof when `E2E_FE_ACTION_TOKEN_ID` unset (API proof path covered by full acceptance).
- Historical filename leftovers (`tenantTicketsSupabase.ts`) are API wrappers only — no `@supabase` client in TEST bundle.

---

## Commits (develop)

1. `9c5327e` — Harden TEST production readiness: proof 500, ticket fields, SLA, Playwright  
2. `8cad483` — Fix acceptance FE_URL shadowing and Playwright Sign In selector  
3. `1cdd6bb` — Clear leftover Supabase UI copy and harden Playwright against rate limits  
4. `35731f7` — Raise TEST login rate limit and cache Playwright auth sessions  
5. `cd94237` — Stabilize organisations browser E2E assertion on TEST  

---

## Final verdict

**PASS — FULL PLATFORM ACCEPTED END TO END**
