# Sahaya TEST — Final Production Readiness (Phase F / F.1 / F.2)

**Environment:** TEST only (`https://test-sahaya.pariskq.in` / `https://api.test-sahaya.pariskq.in`)  
**Develop SHA:** `f98091e`  
**Date (UTC):** 2026-08-04  
**Scope:** TEST validation only — no production changes, no real Supabase, no RDS, no architecture redesign  

---

## Executive summary

The 6-hour soak **completed** and was classified in F.1 (harness 401s + restart 502s only). F.2 reconciled all **34** TEST users: **C = 0** (no login-required account lacks an activation path), **D = 0** unknowns. First-login fixture **21/0**. Session **29/0**. Security **0 Crit / 0 High**. API **76/0**. Playwright **22 passed / 2 skipped**.

**Technical local-auth readiness:** PASS (activation-ready for all login-required accounts).  
**Organizational cutover:** still needs ops to run first-login activation for the **29** null-hash login-required accounts (no mass email in F.2 by design), plus Medium rate-limit / monitoring.

### Go / No-Go

**No-Go for production user cutover** until ops completes first-login activation (or deactivation) for required accounts, and production rate-limit + alerts are applied. Platform technical gate for local-auth lifecycle is closed (`C == 0`).

---

## Verdict

**NOT PRODUCTION READY** (operational activation rollout + Medium observability/rate-limit remain)

**Phase F.2 technical verdict:** `PASS — LOCAL AUTH TECHNICALLY RECONCILED`

---

## PHASE F.2 — LOCAL AUTH ACCOUNT RECONCILIATION

**Run:** GH `30883073824` (`phase_f2_reconcile`) · Deploy `30882881603` · FA `30883138951` · Playwright `30883188088`

### Safety check

| Check | Result |
|-------|--------|
| Environment | TEST |
| Health `dbMode` | `prisma` |
| `DATABASE_URL` | localhost:**5436** (redacted) |
| Docker | `sahaya-migration-db` Up, `0.0.0.0:5436->5432` |
| FE / API | test-sahaya.pariskq.in / api.test-sahaya.pariskq.in |
| S3 bucket | `sahaya-test-fe-proofs` (not crm-pariskq) |
| `PASSWORD_RESET_DRY_RUN` | true |
| Branch | `develop` @ `f98091e` |

### Account inventory (live count = 34)

| Classification | Count |
|----------------|------:|
| READY_WITH_PASSWORD | **4** |
| ACTIVE_PASSWORD_MISSING | **29** |
| INTENTIONALLY_DISABLED | **1** |
| TEST_FIXTURE | 0 |
| DUPLICATE_OR_STALE | 0 |
| NON_LOGIN_ACCOUNT | 0 |
| UNKNOWN_REQUIRES_REVIEW | **0** |
| **classified_count** | **34 = total** |

### Login eligibility

| Eligibility | Count |
|-------------|------:|
| LOGIN_REQUIRED | **33** |
| LOGIN_NOT_REQUIRED | **1** (disabled) |
| UNKNOWN | **0** |

### Readiness gate

| Metric | Value |
|--------|------:|
| A — login-required with password | 4 |
| B — login-required missing + activation-ready | 29 |
| **C — login-required missing + NOT ready** | **0** |
| D — unknown / review | 0 |
| technicalReadiness | **PASS** |

Null `password_hash` is **intentional** pending secure first-login (no default passwords, no mass email).

### Activation fixture

**21 passed / 0 failed** — create passwordless STAFF → token (hash-only stored) → invalid/weak/expired/reuse reject → Argon2id set → login → refresh → replay reject → logout → refresh reject → role/tenant/status preserved → fixture removed. No external sends.

### Role / session / security / acceptance

| Suite | Result | Evidence |
|-------|--------|----------|
| Roles SA/ADMIN/STAFF/FE | PASS | session 29/0 |
| Tenant isolation | PASS | FA TENANT_* + SEC-TENANT-001 |
| API acceptance | **76/0** | `30883138951` |
| Playwright | **22 passed, 2 skipped** | `30883188088` |
| Security | 0 Crit / 0 High; 1 Medium OPEN | SEC-RATE-001 |
| Prisma/PG | PASS | users 34; port 5436; no P2022 in FA |
| S3 proofs | PASS | test bucket; cleanup OK |
| Supabase zero | PASS | FA SUPABASE_ZERO + hasSupabaseUrl false |

### Observability (unchanged Medium)

- No `/metrics`
- No in-repo alerting
- `RATE_LIMIT_LOGIN_MAX=200` on TEST

### F.2 remaining

| Severity | Item |
|----------|------|
| OPERATIONAL | Activate 29 LOGIN_REQUIRED null-hash accounts via first-login when cutover approved (DRY_RUN/capture on TEST; real mail only with approval) |
| Medium | Prod login rate limit ≪ 200; wire alert thresholds |
| Low | Soak harness refresh (F.1 note) |

---

## Acceptance matrix

| AREA | RESULT | EVIDENCE | BLOCKER? |
|------|--------|----------|----------|
| Auth | PASS | Session + FA local login; F.1 first-login fixture | No |
| Sessions | PASS | `30880965759` — 29/0 all 4 roles | No |
| Passwords | PASS* | F.2 C=0; 4 hashed; 29 activation-ready | Ops activation |
| Tenant isolation | PASS | FA TENANT_* + SEC-TENANT-001 | No |
| Prisma | PASS | FA prisma contract + dbMode prisma | No |
| PostgreSQL | PASS | Soak PG 7→6 peak 7; Docker PG18 :5436 | No |
| Tickets | PASS | FA + soak ticket_create | No |
| Assignments | PASS | FA ASSIGN + TENANT foreign FE blocked | No |
| Comments | PASS | FA + soak comment | No |
| Proofs | PASS | FA PROOF upload + storage paths | No |
| S3 | PASS | `sahaya-test-fe-proofs` presign/fetch | No |
| SLA | PASS | FA SLA reconcile | No |
| Organisations | PASS | FA + Playwright orgs | No |
| Playwright | PASS | `30883188088` — 22 passed | No |
| API acceptance | PASS | `30883138951` — 76/0 | No |
| Security | PASS* | 0 Crit/High; Medium rate OPEN | Medium |
| Load | PASS | Prior Phase F load 0% errors | No |
| 6h soak | PASS† | F.1 completed; failures explained | No |
| Backup/restore | PASS | Prior `30818473578` DR | No |
| Restart recovery | PASS | Prior API/PG restart; soak PM2 +2 explained | No |
| Monitoring | GAP | Thresholds documented; no `/metrics` / alerts deployed | Medium |

\*Security Critical/High = 0. †Soak application stability PASS; harness should add refresh in a follow-up (not a product AUTH defect).

---

## Architecture (unchanged)

```text
Browser
  → https://test-sahaya.pariskq.in (static FE)
  → https://api.test-sahaya.pariskq.in (Nginx)
  → PM2 sahaya-final-aws-monorepo-api (:4100)
       ├─ Local Auth (Argon2id, JWT access, HttpOnly refresh, auth_sessions)
       ├─ Prisma → localhost:5436 → Docker sahaya-migration-db (PostgreSQL 18)
       └─ S3 proofs → sahaya-test-fe-proofs (presigned GET)
```

Supabase is **not** in the TEST runtime path.

---

## 6-hour soak — COMPLETE

| Metric | Value |
|--------|------:|
| Label | `soak6h` |
| Status | **COMPLETED** |
| Started / ended | `2026-08-03T13:36:03Z` → `2026-08-03T19:36:03Z` |
| Duration | **21600s** |
| Cycles | **760** |
| Summary counters | OK **7268** / err **42** / unhandled **0** |
| Status mix | 200: 7268; 401: 36; 502: 6 |
| Metrics-file classified requests | 5750 success + 41 failed in `results[]` (counters also include a few ops not pushed to `results`) |
| Unexpected failures | **0** |
| Post-contention failures | **0** (last failure `2026-08-03T14:38:18Z`) |
| Analysis artifact | `/var/backups/sahaya/phase-f/soak6h-analysis.json` |
| Analysis run | GH `30880607497` |

### Failure classification

| Class | Count | Meaning |
|-------|------:|---------|
| TEST_HARNESS_DEFECT | 36 | All 401s — Bearer age ≥900s; harness does not call `/auth/refresh` |
| INTENTIONAL_RESTART_SIDE_EFFECT | 5–6 | 502s during FA fail + `restart_api` window |
| AUTH_LIFECYCLE_DEFECT | 0 | — |
| APPLICATION_DEFECT | 0 | — |
| INFRASTRUCTURE_DEFECT | 0 | — |
| EXPECTED_TEST_BEHAVIOR | 0 | — |

### 401 root cause (proven, not assumed)

- Ops: `dashboard|401`×12, `sla|401`×12, `orgs|401`×12 (SUPER_ADMIN Bearer path).
- Sample `tokenAgeSec`: 924, 948, 981, 1012, 1043, 1075, 1107, 1137… (all ≥ JWT access TTL 900s).
- First 401 cluster ~`2026-08-03T13:55:59Z` (~20m after soak start ≈ TTL).
- `soak.mjs` only re-logins randomly (~15%) or when token missing; **never** refreshes.
- Product session lifecycle suite still **29/0** with proper refresh — not a product auth bug.
- Classification: **TEST_HARNESS_DEFECT** (all 36). **AUTH_LIFECYCLE_DEFECT = 0**.

### 502 root cause (proven)

- Failures confined to `2026-08-03T13:55:59Z`–`14:38:18Z`; **no** 502 after.
- Overlap with GH `30823591948` (FA failed 502), `30823597650` (`restart_api`), then FA rerun **76/0**.
- Ops in metrics: dashboard/sla/orgs/ticket_create/search ×502 during that window.
- Summary shows 6×502; analysis `results[]` captured 5 (one status bump without `results` push).
- PM2 restart delta during soak: **43 → 45** (+2) matches deliberate restart ops — **not** unexpected crash loops.
- Classification: **INTENTIONAL_RESTART_SIDE_EFFECT**. Later FA/Playwright passed without soak overlap.

### Latency

| Scope | P50 | P95 | P99 | Max |
|-------|----:|----:|----:|----:|
| Overall (results) | 78 | 1136 | 1540 | 4059 |
| Early quartile P95 | — | 1192 | — | — |
| Late quartile P95 | — | 1117 | — | — |

| Workflow | P50 | P95 | P99 | Max |
|----------|----:|----:|----:|----:|
| login_* (roles) | ~235–256 | ~665–750 | ~890–1345 | ≤1723 |
| dashboard | 534 | 1240 | 1788 | 2380 |
| assign | 1015 | 1580 | 2019 | 4059 |
| ticket_create | 47 | 190 | 272 | 604 |
| comment | 50 | 174 | 268 | 456 |
| search | 52 | 160 | 262 | 333 |
| sla | 57 | 196 | 307 | 592 |
| orgs | 34 | 129 | 209 | 438 |

**LATENCY_DEGRADATION_OVER_TIME: NO** (late P95 ≤ early P95).

### Resources / stability determinations

| Signal | Start | End | Peak | Delta |
|--------|------:|----:|-----:|------:|
| Host mem used (MB) | 5872 | 6110 | 6502 | +238 |
| PM2 RSS (bytes) | 127991808 | 161972224 | 232984576 | +~32MB |
| PG connections | 7 | 6 | 7 | −1 |
| PM2 restarts | 43 | 45 | 45 | +2 (explained) |
| Node heap samples | n/a in metrics | n/a | n/a | — |
| CPU % | n/a in metrics | n/a | n/a | — |

| Determination | Result |
|---------------|--------|
| MEMORY_LEAK | **NO** (+32MB PM2 over 6h, under threshold) |
| CONNECTION_LEAK | **NO** |
| UNEXPECTED_PM2_RESTART | **NO_EXPLAINED_BY_TEST_RESTARTS** |
| DATABASE_INSTABILITY | **NO** |
| LATENCY_DEGRADATION_OVER_TIME | **NO** |
| UNHANDLED_EXCEPTIONS | **NO** |

Raw evidence preserved on EC2: `soak6h-metrics.jsonl`, `soak6h-summary.json`, `soak6h-analysis.json`, stdout log.

---

## Local-auth account classification (read-only)

Run: GH `30880656246` / artifact `account-classification.json`

| Class | Count |
|-------|------:|
| ACTIVE_LOCAL_AUTH_READY | **4** |
| ACTIVE_PASSWORD_MISSING | **28** |
| TEST_ACCOUNT | **1** |
| DISABLED | **1** |
| **Users total** | **34** |
| With `password_hash` | **4** |

### Why only 4/34 have verified local passwords

1. Phase D `bootstrap_role_samples` set Argon2id hashes for **one user per role** (4 roles).
2. Remaining users are legacy imports from the Supabase Auth era with **null** `password_hash`.
3. Pre-F.1 `forgotPassword` skipped null-hash users; they could not self-serve.

### By role (ACTIVE_PASSWORD_MISSING)

| Role | Missing |
|------|--------:|
| FIELD_EXECUTIVE | 13 |
| STAFF | 6 |
| ADMIN | 4 |
| CLIENT | 4 |
| SUPER_ADMIN | 1 |

Not all 34 need passwords: 1 DISABLED; 1 TEST_ACCOUNT pattern; remainder are active legacy identities needing first-login setup if they must use local auth.

---

## Password migration strategy

**Chosen:** **D — reuse existing password-reset / PasswordResetToken** for first-login when `password_hash` is null (also satisfies A/B-style opaque token properties).

| Requirement | Implementation |
|-------------|----------------|
| Cryptographically random token | `generateOpaqueToken(32)` |
| Expiry | `getPasswordResetTtlSec()` |
| Single-use | `usedAt` set in `consumePasswordResetToken` |
| Hash at rest | SHA of opaque token; password Argon2id |
| Invalidate on use | UPDATE `usedAt` |
| No password in logs/URL | structured logs redact email; token only in TEST capture flag |
| Anti-enumeration | generic forgot-password response |
| Audit | `auth.forgotPassword.*` with `purpose=first_login_password_setup\|password_reset` |
| Sessions | `revokeAllAuthSessionsForUser` on password set |
| No real email in TEST | `PASSWORD_RESET_DRY_RUN=true`; optional `PASSWORD_RESET_CAPTURE_TOKEN` for harness only |

**Code:** `localAuthService.forgotPassword` now issues tokens for active users even when `password_hash` is null.

**Not done (by design):** mass password set, Supabase password read, shared default password, real SMS/email during validation.

### Credential migration validation

| Check | Result | Evidence |
|-------|--------|----------|
| Activation fixture | **13 passed / 0 failed** | GH `30880894773` |
| Token create / invalid / expiry / single-use | PASS | fixture |
| Argon2id storage | PASS | `$argon2id$` prefix |
| Login after setup / bad password | PASS | 200 / 401 |
| Role + tenant preserved | PASS | STAFF + org |
| Session lifecycle (4 roles) | **29/0** | GH `30880965759` |

---

## Post-soak acceptance / security (F.1)

| Suite | Run | Result |
|-------|-----|--------|
| Soak analyze | `30880607497` | COMPLETED; unexpectedFailures=0 |
| Account audit | (in `30880656246`) | 34 classified |
| Activation fixture | `30880894773` | **13/0** |
| Session lifecycle | `30880965759` | **29/0** |
| Security | `30881002348` | 14 findings; **0 Crit / 0 High**; 1 Medium OPEN (SEC-RATE-001) |
| Full API acceptance | `30881034253` | **76/0** |
| Playwright | `30881087871` | **22 passed**, Verdict PASS |
| Observability | `30881275598` | gaps: `/metrics`, in-repo alerts |
| Deploy TEST | `30880422328`, `30880742412` | success |

Restart tests were **not** overlapped with soak (soak already finished). Prior restart_api / restart_pg evidence retained.

---

## Monitoring readiness (minimum)

Gaps remain: no Prometheus `/metrics`; no in-repo alert definitions. Recommended **thresholds** (implement outside this phase / on prod tooling):

| Alert | Threshold | Severity |
|-------|-----------|----------|
| API unavailable | `/health` ≠ 200: 1 fail/2m or 2/5m | critical |
| 5xx rate | >1% over 5m or >10 abs/5m | critical |
| Auth failure spike | >30 login 401/min/IP for 5m (after prod limit) | high |
| PM2 restart | any unexpected; >2/15m | high |
| High CPU | >85% for 10m | high |
| High memory | host >90% or PM2 RSS >512MB for 15m | high |
| PostgreSQL unavailable | health/DB ping fail | critical |
| PG connection saturation | >70% max_connections for 5m | high |
| S3 failures | proof/presign 5xx >5/10m | high |
| Backup failure | missing dump >26h or nonzero exit | critical |
| Disk usage | >80% warn, >90% critical | high |
| Certificate expiry | <21d warn, <7d critical | high |

**Prod rate limit:** TEST `RATE_LIMIT_LOGIN_MAX=200` is suite-only → production **20–30 / 15m** per IP (SEC-RATE-001).

---

## Security regression (targeted)

Covered by Phase F security + FA + session:

| Check | Result |
|-------|--------|
| Cross-tenant IDOR | PASS (404/scoped lists) |
| Role escalation (FE→org) | PASS (403) |
| Refresh replay | PASS |
| Expired/garbage JWT | PASS |
| Disabled / no-password login | PASS |
| Password change session revoke | Covered by reset path revokeAll |
| Activation token replay | PASS (RESET_USED) |
| Brute-force (TEST) | OPEN Medium — limit too high on TEST |
| User enumeration | PASS |
| Cookie flags | PASS HttpOnly+Secure+SameSite |
| S3 presign auth/expiry | PASS |

No real external sends.

---

## Remaining blockers

| Severity | Blocker | Smallest next action |
|----------|---------|----------------------|
| **High** | 28 ACTIVE_PASSWORD_MISSING cannot log in until first-login | Controlled TEST activation per account via forgot-password + DRY_RUN/capture (or deactivate unused); re-audit until active-missing=0 for required logins |
| Medium | SEC-RATE-001 / TEST login max=200 | Set production `RATE_LIMIT_LOGIN_MAX` to 20–30 |
| Medium | No `/metrics` / alerting deployed | Wire synthetic health + threshold alerts (table above); optional thin `/metrics` later |
| Low | Soak harness lacks refresh | Add `/auth/refresh` to `soak.mjs` so future soaks don't emit harness 401s |

---

## Safety ledger

| Check | Value |
|-------|-------|
| PRODUCTION DEPLOYMENTS | **0** |
| PRODUCTION DATABASE MODIFICATIONS | **0** |
| PRODUCTION AUTH MODIFICATIONS | **0** |
| REAL SUPABASE MODIFICATIONS | **0** |
| REAL SUPABASE REQUESTS | **0** |
| crm-pariskq WRITES | **0** |
| RDS | **0** |

---

## Evidence index

| Artifact / run | Purpose |
|----------------|---------|
| `/var/backups/sahaya/phase-f/soak6h-*` | Raw soak + analysis |
| GH `30879973733` | Soak status COMPLETE |
| GH `30880607497` | Soak analysis |
| GH `30880894773` | Activation fixture 13/0 |
| GH `30880965759` | Session 29/0 |
| GH `30881002348` | Security |
| GH `30881034253` | API acceptance 76/0 |
| GH `30881087871` | Playwright 22 |
| GH `30880422328` / `30880742412` | TEST deploys F.1 |
| `backend/scripts/phase-f/` | Reproducible validators |

---

## Final verdict

**NOT PRODUCTION READY**

Platform stability (6h soak, acceptance, Playwright, sessions, tenant/S3/security Crit/High) is solid. Cutover is blocked until the **28** active null-hash accounts complete the proven first-login activation path (or are deactivated), with production rate limits and monitoring thresholds applied at go-live.
