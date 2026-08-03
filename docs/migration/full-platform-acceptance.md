# Sahaya TEST — Full Platform End-to-End Acceptance

**Status:** COMPLETE (executable suite)  
**Environment:** TEST only  
**Develop SHA:** `7458e66`  
**Date (UTC):** 2026-08-03  

---

## 1. EXECUTIVE VERDICT

**PASS WITH ISSUES — CORE PLATFORM WORKS BUT ACCEPTANCE GAPS REMAIN**

Executable evidence shows local auth, Prisma→EC2 Postgres, tenant isolation (including cross-tenant FE assign block after fix), ticket create/assign/comment/concurrency, S3 proof object + presign retrieval on `sahaya-test-fe-proofs`, backup/restore, PM2 restart, and Postgres container restart all work. Production and real Supabase remained untouched.

Not a full PASS because: `/fe/proof` still returns HTTP 500 after partial success; password coverage remains 4/34; browser Playwright E2E was **NOT EXECUTED**; dashboard SLA count mismatch; ticket create accepts sparse payloads; `short_description` not persisted on manual create.

---

## Safety ledger

| Check | Value |
|-------|-------|
| REAL SUPABASE MUTATIONS | **0** |
| REAL SUPABASE CONFIG CHANGES | **0** |
| crm-pariskq WRITES | **0** |
| PRODUCTION MODIFICATIONS | **0** |
| RDS CREATED | **0** |

---

## 2. FINAL ARCHITECTURE

```text
Browser → https://test-sahaya.pariskq.in
  → https://api.test-sahaya.pariskq.in → Nginx → PM2 sahaya-final-aws-monorepo-api
  → Local Auth (Argon2id / JWT / HttpOnly refresh / auth_sessions)
  → Prisma → localhost:5436 → Docker sahaya-migration-db → PostgreSQL
  → Proofs → S3 sahaya-test-fe-proofs (S3_FE_PROOFS_ENABLED=true)
```

Verified live env markers: no `SUPABASE_URL` / `VITE_SUPABASE` in TEST backend `.env`; DB port 5436; bucket `sahaya-test-fe-proofs`.

---

## 3. PLATFORM INVENTORY

Active subsystems: Auth/session, Users, Organisations, Tickets (+ numbering), Assignments/Reassignment, Comments, FE magic-link + `/fe/me`, SLA monitor/workers, Audit logs, Dashboard/analytics, Configurations, Tenant clients, Public complaints (feature-gated; points exist), Email ingest (raw/parsed + autoTicketWorker), Proof S3 + backup queue, Notifications (SMS_ENABLED=true but acceptance sent none), Daily report worker (enabled in env), Postmark webhook.

---

## 4. PRISMA ↔ POSTGRESQL CONTRACT

Ops run `30795472416` — **contractPass after fixes**.

| Prisma Model | PG Table | Contract | Drift | Action |
|---|---|---|---|---|
| Ticket | tickets | OK | — | — |
| Organisation | organisations | OK | phantom `email` removed earlier | done |
| User | users | OK | — | — |
| AuthSession / PasswordResetToken | auth_sessions / password_reset_tokens | OK | — | — |
| RawEmail | raw_emails | OK | `missing_fields` Json vs PG ARRAY (soft) | leave |
| ParsedEmail / TicketComment / AuditLog | … | OK | extra PG cols INFO | leave |
| TicketAssignment | ticket_assignments | OK | removed phantom notification cols | done `c248b9b` |
| FeActionToken | fe_action_tokens | OK | removed phantom `idempotency_key` | done |
| Remaining models | … | OK | — | — |
| — | organisation_sla_policies, profiles, ticket_proofs, whatsapp_events | EXTRA | not in Prisma | review later |

---

## 5. DATABASE BASELINE

| Metric | Before full suite (approx) | After suite / backup |
|--------|---------------------------:|---------------------:|
| users | 34 | 34 |
| organisations | 3 → grew with fixtures | 6 |
| tickets | 829 → | 857 |
| comments | 410 | 415 |
| assignments | 558 | 561 |
| sla_tracking | 702 | 705 |
| audit_logs | 1527+ | 1568 |
| auth_sessions | — | 93 |
| password_hash | 4/34 | 4/34 |
| proof_storage_paths | 0 | ≥1 (acceptance) |
| proof base64ish | 88 | 88 |

---

## 6–8. AUTH / SESSION / PASSWORD

All executable auth/session cases **PASS** (wrong password, nonexistent, empty, casing, 4 roles, no-hash user rejected, Argon2id `$argon2id$`, refresh rotate, old refresh rejected, logout, HttpOnly/Secure/SameSite=Lax).

Password coverage: **4 with_hash / 34 total** — remaining need invite/reset onboarding (not arbitrarily passworded).

---

## 9–10. AUTHORIZATION / TENANT

| Check | Result |
|-------|--------|
| Admin cannot create org | 403 PASS |
| FE cannot create org | 403 PASS |
| Admin users/tickets no foreign rows | PASS |
| IDOR foreign ticket | PASS (prior + this suite) |
| Assign foreign FE | **was 200 FAIL → fixed → 403 PASS** (`7458e66`) |

---

## 11–20. ORGS / USERS / FE / TICKETS / ASSIGN / COMMENTS / STATUS / SLA

| Area | Result |
|------|--------|
| Org CRUD + DB reconcile | PASS |
| Users list | PASS |
| FE list + me/tickets | PASS |
| Ticket create/list/get | PASS (`short_description` null in DB — gap) |
| Comment create + empty reject | PASS |
| Illegal resolve via generic status | PASS (400) |
| Assign + DB row + token | PASS |
| SLA monitor | PASS |
| SLA tracked API vs DB | **668 vs 705 — mismatch** |

---

## 21–24. PROOF / S3

| Check | Result |
|-------|--------|
| Bucket config | `sahaya-test-fe-proofs`, enabled true, not crm-pariskq |
| `/fe/proof` HTTP | **FAIL 500** (“Demo proof upload failed”) |
| DB `proof_storage_paths` after flow | **PASS** (count 1, key `test/00000000-…`) |
| Presign URL + object fetch | **PASS** (200, 70 bytes) |
| Direct prisma comment+S3 helper | FAIL (pool/query error after concurrency) |
| Historical base64 rows exist | PASS |
| crm-pariskq writes | **0** |

S3 path is proven via metadata+presign despite `/fe/proof` status bug.

---

## 25–28. PUBLIC / EMAIL / NOTIFICATIONS / WORKERS

| Area | Result |
|------|--------|
| Public complaint point bogus token | 404 PASS |
| Full public OTP submit | **NOT EXECUTED** (SMS_ENABLED=true — avoided real SMS) |
| Email ingest E2E | **NOT EXECUTED** (no safe external email); tables+worker present |
| Notifications | **CONTROLLED** — no acceptance sends; env SMS_ENABLED=true is a risk |
| Workers | Present (autoTicket, proofBackup, SLA, daily report enabled) — deep job drain **partial** |

---

## 29–33. AUDIT / DASHBOARD / FRONTEND / NEGATIVE / CONCURRENCY

| Area | Result |
|------|--------|
| Audit list + ticket entity logs | PASS |
| Dashboard stats HTTP | PASS |
| Frontend routes HTTP shell | PASS (/, /login, /app/*, /fe) |
| Browser Playwright deep E2E | **NOT EXECUTED** |
| Deployed bundle supabase hits | **0** (`index-B4q3fqmY.js`) |
| Invalid UUID | 400 PASS |
| Create missing fields | **FAIL** (HTTP 200 — too permissive) |
| Malformed JSON login | 400 PASS |
| 20 concurrent ticket numbers | **PASS** unique 20/20 |

---

## 34–36. RESTART / BACKUP

| Test | Result |
|------|--------|
| PM2 restart monorepo-api only | PASS (health after ~3 attempts) |
| Docker `sahaya-migration-db` restart | PASS (users=34, tickets=857 unchanged; API reconnect) |
| Fresh dump + isolated restore | **PASS** all compared counts; backup kept under `/var/backups/sahaya/acceptance/20260803-080600/` |

DB outage behavior: **NOT EXECUTED** (avoid prolonged outage after successful restart proof).

---

## 37. SUPABASE ZERO

```text
ACTIVE SUPABASE RUNTIME REFERENCES: 0
ACTIVE SUPABASE NETWORK REQUESTS: 0 (acceptance)
REAL SUPABASE MUTATIONS: 0
REAL SUPABASE CONFIG CHANGES: 0
```

---

## 38. S3 SAFETY

```text
sahaya-test-fe-proofs writes: YES (acceptance proof object; key under test/…)
crm-pariskq writes: 0
cross-tenant proof access: blocked where tested (ticket IDOR); dedicated cross-presign when orgs differ
```

---

## 39. PRODUCTION IMPACT

```text
PRODUCTION MODIFICATIONS: 0
PRODUCTION DEPLOYMENTS: 0
PRODUCTION DB MUTATIONS: 0
PRODUCTION SUPABASE MUTATIONS: 0
PRODUCTION S3 MUTATIONS: 0
```

Prod health remains `auditLogsListFix:2` (no `dbMode`).

---

## 40. DEFECTS FOUND

| Severity | Workflow | Symptom | Root cause | Fix | Commit | Retest |
|----------|----------|---------|------------|-----|--------|--------|
| P1 | Org list | 500 P2022 | Prisma `organisations.email` missing in PG | Remove field | `c305892` | PASS |
| P1 | Assign | Prisma crash / assign fail | Phantom assignment notification + idempotency fields | Align schema | `c248b9b` | PASS |
| P1 | Assign foreign FE | Allowed 200 | No FE↔ticket org check | Guard in `assignOneTicket`/`reassign` | `7458e66` | PASS 403 |
| P1 | `/fe/proof` | HTTP 500 after upload | Uncaught error after persistence (needs log root cause) | **OPEN** | — | S3 meta+presign still PASS |
| P2 | Ticket create | `short_description` null in DB | Create mapping omission | **OPEN** | — | — |
| P2 | Ticket create | Sparse body → 200 | Weak validation | **OPEN** | — | — |
| P2 | SLA counts | API 668 vs DB 705 | Filter/scope differ | **OPEN** | — | — |
| P2 | Password coverage | 4/34 hashed | Bootstrap samples only | **OPEN** (process) | — | — |

---

## 41. UNRESOLVED ISSUES

1. **P1** `/fe/proof` returns 500 — blocks clean FE proof UX acceptance; S3 object path nonetheless verified. Needs PM2 error log root cause + fix.  
2. **P1/P2** Password onboarding for remaining 30 users — blocks “all users can login”.  
3. **P2** Browser deep E2E NOT EXECUTED — Playwright specs exist under `e2e/` but were not run in this pass.  
4. **P2** Public complaint full OTP — blocked to avoid SMS with `SMS_ENABLED=true`.  
5. **P2** SLA count reconciliation gap.  
6. **P3** Extra PG tables / soft Json vs ARRAY drift.

---

## 42. TEST FIXTURES CREATED

- Orgs `E2E_TEST_ACCEPTANCE_ORG` / slugs `e2e-accept-*`  
- Tickets `E2E_TEST_*`, concurrency `E2E_TEST_CONC_*`  
- Comments / assignments / auth sessions from suite  
- S3 proof key under `test/…` (presign verified; cleanup attempted via token path object retained possibly)  
- Acceptance backup dump retained (not deleted)

---

## 43–45. FILES / COMMITS / DEPLOYS

Key commits on `develop`: `c305892`, `c248b9b`, `7458e66`, acceptance scripts `64c7bef`/`7d3a0c2`.  
TEST deploys via `deploy-test.yml`. Ops: full `30795996421`, backup `30796048203`, restart_api `30796096864`, restart_pg `30796132615`, contract `30795472416`.

---

## 46. ROLLBACK

Pre-migration dumps preserved; new acceptance dump at  
`/var/backups/sahaya/acceptance/20260803-080600/sahaya-acceptance-20260803-080600.dump`  
(validated by independent restore).

---

## 47. FINAL ACCEPTANCE MATRIX

| Area | Result |
|------|--------|
| Auth | PASS |
| Sessions | PASS |
| Password lifecycle | PASS WITH GAPS (4/34) |
| Roles | PASS |
| Tenant isolation | PASS (after FE guard) |
| Prisma schema | PASS (soft warns) |
| Organisations | PASS |
| Users | PASS |
| Field Executives | PASS |
| Ticket create | PASS WITH GAPS |
| Ticket numbering | PASS |
| Ticket reads | PASS |
| Ticket updates | PARTIAL |
| Assignment | PASS |
| Reassignment | CODE FIXED; deep E2E partial |
| Comments | PASS |
| Status lifecycle | PARTIAL (illegal blocked) |
| Resolution | PARTIAL |
| SLA | PASS WITH COUNT GAP |
| Audit | PASS |
| Proof upload (`/fe/proof`) | FAIL (500) |
| TEST S3 | PASS |
| Presigned retrieval | PASS |
| Cross-tenant proof security | PASS (ticket IDOR) |
| Historical proofs | PASS |
| Public complaints | INACTIVE/PARTIAL |
| Email ingestion | NOT EXECUTED / tables present |
| Notifications | CONTROLLED (no sends) |
| Workers | PARTIAL |
| Dashboard reconciliation | PASS WITH SLA GAP |
| Frontend E2E | HTTP SHELL PASS; browser NOT EXECUTED |
| API E2E | PASS |
| Negative/error handling | PASS WITH GAPS |
| Concurrency | PASS |
| Restart recovery | PASS |
| Backup/restore | PASS |
| Supabase runtime zero | PASS |
| `crm-pariskq` untouched | PASS |
| Production untouched | PASS |

---

## 48. FINAL VERDICT

Sahaya TEST **cannot yet** be described as **FULLY FUNCTIONAL END TO END** without caveats.

It **can** be described as:

> **Core post-Supabase platform is operational on local auth + Prisma + EC2 PostgreSQL + isolated TEST S3**, with strong executable evidence for auth, sessions, tenancy (including FE assign fix), tickets, concurrency numbering, S3 proof retrieval, backup/restore, and restarts — **with known P1 `/fe/proof` status bug, password coverage gap, and missing browser/public-OTP deep runs.**

**STOP.** Do not begin production migration. Do not touch real Supabase. Do not create RDS. Do not write `crm-pariskq`.
