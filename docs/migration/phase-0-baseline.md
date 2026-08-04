# Phase 0 Baseline — Sahaya TEST Isolation Gate

**Document updated (UTC):** 2026-08-01 (evidence reconciliation + shared-Supabase mutation freeze implementation — local only, not deployed)  
**Environment in scope:** TEST only (`test-sahaya.pariskq.in` / `api.test-sahaya.pariskq.in`)  
**Production:** DO NOT TOUCH (`sahaya.pariskq.in` / `api.sahaya.pariskq.in`)

This document contains **no secrets**, passwords, tokens, JWTs, or full connection strings.

---

## Decision history

### Initial Phase 0 (Cursor-only)

**Verdict then:** `PHASE 0 FAILED — DO NOT BEGIN PHASE 1`  
**Reasons:**

1. LIVE HTTP verified that TEST and PRODUCTION frontends share Supabase project `bggumdvyvgpqvhqyksid`.
2. EC2 DATABASE_URL / PM2 / Nginx / backups could not be verified from the auditor workstation (no SSH).

Per Absolute Stop Condition: no dumps, no writes, no emails/SMS were performed by Cursor.

### After TEST EC2 operator verification

**Revised verdict:** `PHASE 0 PARTIALLY PASSED — SAFE ONLY FOR SPECIFIC ISOLATED WORK`

- Database identity, Docker Postgres, backups, and restore validation are now **TEST EC2 OPERATOR VERIFIED**.
- Shared Supabase remains a **P0** production-cross-contamination issue for Auth / PostgREST / Storage mutations.
- Isolated work against the standalone TEST Postgres (and future TEST-only RDS restore) does **not** by itself touch Supabase — and can proceed **after explicit approval**, without creating another Supabase project.

### After shared-Supabase mutation freeze (local implementation)

- Application-level freeze implemented (default OFF; TEST enables via env flags).  
- **GATE C remains FAIL** (project still shared).  
- Distinguish: `Supabase isolation = FAIL` vs `TEST shared-Supabase mutation controls = IMPLEMENTED LOCALLY (not yet deployed)`.  
- Runbook: `docs/migration/test-supabase-mutation-freeze.md`.

Do **not** rewrite history: the initial fail was correct given available evidence at that time.

Local Git tag `test-pre-migration-baseline` (SHA `46ed0c4c…`) remains **untouched** by documentation / freeze code updates.

---

## Evidence source legend

| Tag | Meaning |
|-----|---------|
| `REPOSITORY VERIFIED` | From git / source files |
| `LIVE HTTP VERIFIED` | Probed public TEST/PROD HTTPS |
| `TEST EC2 OPERATOR VERIFIED` | Manual inspection on live TEST EC2 (operator-supplied) |
| `STILL UNVERIFIED` | Not yet proven |

---

## 1. Git & CI/CD baseline

`REPOSITORY VERIFIED`

| Item | Value |
|------|--------|
| Repository | `Sahaya-Final-AWS` (`origin` → `https://github.com/SreeSajeev/Sahaya-Final-AWS.git`) |
| Auditor local branch (initial audit) | `main` |
| Local / `origin/main` HEAD | `46ed0c4c2002a98894ee404b4a9dfe9f11c872fb` |
| `origin/develop` | `298e6d25153f5508d4f7f27e04c3eca0a1dc79c7` |
| Relationship | `main` ahead of `develop` (Prisma commits on `main` not on `develop`) |
| Tag `test-pre-migration-baseline` | Local annotated tag at `46ed0c4c…` (not pushed; **not moved** this pass) |

### Deploy workflow (`.github/workflows/deploy-test.yml`)

`REPOSITORY VERIFIED`

| Aspect | Evidence |
|--------|----------|
| Trigger | `push` to **`develop` only** |
| Secrets (names only) | `EC2_HOST`, `EC2_USER`, `SSH_PRIVATE_KEY` |
| Server paths | monorepo `/var/www/apps/sahaya-final-aws-monorepo`; FE → `/var/www/test-sahaya/` |
| PM2 restart name in script | `sahaya-final-aws-monorepo-api` |
| Sets `VITE_CRM_API_URL`? | **NO** — bare `npm run build` |
| Production deploy via this file? | No |

`STILL UNVERIFIED`: whether GitHub `EC2_HOST` secret points exclusively at this TEST box (operator confirmed TEST host behaviour; secret value itself not re-read here).

---

## 2. Updated live TEST architecture

`LIVE HTTP VERIFIED` + `TEST EC2 OPERATOR VERIFIED`

```text
TEST FRONTEND
https://test-sahaya.pariskq.in
        │
        ├───────────────┐
        │               │
        ▼               ▼
TEST API          SHARED SUPABASE
api.test-sahaya…  bggumdvyvgpqvhqyksid
        │               │
        │          Auth / PostgREST /
        │          Storage (legacy deps)
        │
        ▼
Nginx (server_name api.test-sahaya.pariskq.in)
        │
        ▼
localhost:4100
        │
        ▼
root PM2 → sahaya-final-aws-monorepo-api (id 4)
        │
        ▼
/var/www/apps/sahaya-final-aws-monorepo/backend/src/app.js
        │
        ▼
DATABASE_URL → localhost:5436 / database sahaya
        │
        ▼
Docker container sahaya-migration-db (postgres:18)
        │
        ▼
PostgreSQL 18.4 — public schema only — 25 application tables
```

**Architectural conclusion (do not conflate):**

1. Live TEST **application database** is already a **standalone PostgreSQL** instance (no `auth` / `storage` / `vault` schemas).  
2. TEST still has **legacy/shared Supabase** dependencies for Auth, FE PostgREST, and Storage uploads.

---

## 3. CRITICAL — shared Supabase (unchanged)

`LIVE HTTP VERIFIED` + `TEST EC2 OPERATOR VERIFIED` (backend/frontend `.env` project ref)

| Consumer | Project ref | Isolation |
|----------|-------------|-----------|
| TEST FE live bundle | `bggumdvyvgpqvhqyksid` | SHARED WITH PRODUCTION |
| PROD FE live bundle | `bggumdvyvgpqvhqyksid` | SHARED |
| TEST EC2 backend `SUPABASE_URL` | `bggumdvyvgpqvhqyksid` | SHARED |
| TEST EC2 frontend `VITE_SUPABASE_URL` | `bggumdvyvgpqvhqyksid` | SHARED |
| `frontend/supabase/config.toml` | `shzklzddcfnwtfmbuiqc` | Stale / unlabeled vs live |

```text
GATE C — SUPABASE ISOLATION = FAIL
CRITICAL — TEST AUTH / PostgREST / Storage project SHARED WITH PRODUCTION
```

Standalone Postgres does **not** make shared Supabase safe.

---

## 4. Nginx / API routing

`TEST EC2 OPERATOR VERIFIED`

```text
server_name api.test-sahaya.pariskq.in;
location / { proxy_pass http://localhost:4100; }
```

Node process listening on port **4100**.

`LIVE HTTP VERIFIED`: `GET https://api.test-sahaya.pariskq.in/health` → 200.

---

## 5. PM2 processes

`TEST EC2 OPERATOR VERIFIED`

### Active TEST API (root PM2)

| Field | Value |
|-------|--------|
| Access note | User-level `pm2 describe` misses process; use **root** PM2 (`/root/.pm2`) |
| Name | `sahaya-final-aws-monorepo-api` |
| Status | online |
| Script id | 4 |
| Script | `/var/www/apps/sahaya-final-aws-monorepo/backend/src/app.js` |
| cwd | `/var/www/apps/sahaya-final-aws-monorepo/backend` |
| Node | 20.20.2 |
| Created | 2026-06-23T17:40:12.869Z |
| Example PID (at inspection) | 840296 |
| Parent | PM2 v7.0.1 God Daemon |

### Stopped older deployment (do not confuse)

| Field | Value |
|-------|--------|
| Name | `sahaya-final-aws-api` |
| Status | **stopped** |
| Script | `/var/www/apps/sahaya-final-aws/backend/src/app.js` |
| cwd | `/var/www/apps/sahaya-final-aws/backend` |

Different path (`sahaya-final-aws` vs `sahaya-final-aws-monorepo`). Not the live TEST API.

---

## 6. Live TEST backend environment (safe identifiers)

`TEST EC2 OPERATOR VERIFIED`  
Path: `/var/www/apps/sahaya-final-aws-monorepo/backend/.env`  
(**Secrets present on disk — never copy into docs.**)

| Key | Safe value |
|-----|------------|
| `PORT` | `4100` |
| `DATABASE_URL` | host `localhost`, port `5436`, database `sahaya` |
| `APP_BASE_URL` | `https://test-sahaya.pariskq.in` |
| `PUBLIC_APP_URL` | `https://test-sahaya.pariskq.in` |
| `CORS_ORIGIN` | `https://test-sahaya.pariskq.in` |
| `SUPABASE_URL` project ref | `bggumdvyvgpqvhqyksid` |
| `AWS_REGION` | `ap-south-1` |
| `S3_FE_PROOFS_BUCKET` | `crm-pariskq` |
| `S3_FE_PROOFS_ENABLED` | `true` |
| `SMS_ENABLED` | `true` |
| `SMS_ASSIGNMENT_ENABLED` | `true` |
| `SMS_TEST_MODE` | `false` |
| `DAILY_TENANT_REPORT_ENABLED` | `true` |
| `DAILY_REPORT_DRY_RUN` | `true` |

**Note:** Application CORS in `backend/src/app.js` still hardcodes `https://sahaya.pariskq.in` in addition to `APP_BASE_URL`. Live preflight previously allowed production origin (`LIVE HTTP VERIFIED`). Env `CORS_ORIGIN` alone does not remove that hardcoded allowlist.

---

## 7. Live TEST frontend environment (safe identifiers)

`TEST EC2 OPERATOR VERIFIED`  
Path: `/var/www/apps/sahaya-final-aws-monorepo/frontend/.env`

| Key | Safe value |
|-----|------------|
| `VITE_CRM_API_URL` | `https://api.test-sahaya.pariskq.in` |
| `VITE_APP_BASE_URL` | `https://test-sahaya.pariskq.in` |
| `VITE_SUPABASE_URL` project ref | `bggumdvyvgpqvhqyksid` |

Matches `LIVE HTTP VERIFIED` inlined CRM URL in deployed JS.  
CI still does **not** pin `VITE_CRM_API_URL` (`REPOSITORY VERIFIED` — deployment hardening / Gate F).

---

## 8. Database container & network

`TEST EC2 OPERATOR VERIFIED`

| Item | Value |
|------|--------|
| Container | `sahaya-migration-db` |
| Image | `postgres:18` |
| Host mapping | `0.0.0.0:5436` → container `5432` |
| Database | `sahaya` |
| App DB user | `sahaya` (password not recorded) |
| Persistence | Docker **volume** mount at `/var/lib/postgresql` |
| Network | bridge; container IP observed `172.17.0.2` |
| Established conns on :5436 at snapshot | none (does **not** mean unused; pools are on-demand) |

---

## 9. Database schema inventory

`TEST EC2 OPERATOR VERIFIED`

| Item | Value |
|------|--------|
| PostgreSQL | **18.4** |
| Database | `sahaya` |
| Schemas | **`public` only** |
| Supabase schemas `auth` / `storage` / `vault` | **ABSENT** |
| Public tables | **25** |

Tables:

```text
access_tokens
audit_logs
configurations
daily_tenant_report_runs
fe_action_tokens
fe_proof_backup_queue
field_executives
organisation_sla_policies
organisations
parsed_emails
profiles
public_complaint_submissions
public_otp_sessions
raw_emails
sla_tracking
tenant_clients
tenant_complaint_points
ticket_assignments
ticket_comments
ticket_number_sequences
ticket_proofs
ticket_resolution_notifications
tickets
users
whatsapp_events
```

### Functions present in dump (flag for later classification — do not classify yet)

Including (non-exhaustive):

```text
allocate_ticket_sequence(character)
assign_ticket_atomic(uuid, uuid)
backup_fe_proof_to_storage()
handle_field_executive_signup()
handle_new_auth_user()
handle_new_user()
is_staff_or_above(uuid)
is_super_admin_user(uuid)
notify_backend_ticket_resolved()
```

**Later phases must classify each as KEEP / REWRITE / REMOVE** after reading implementations. Especially flag for review: `backup_fe_proof_to_storage`, `handle_new_auth_user`, `handle_new_user` (possible Supabase-era assumptions). **Do not modify now.**

---

## 10. Source data baseline counts

`TEST EC2 OPERATOR VERIFIED`

| Table | Count |
|-------|------:|
| users | 34 |
| organisations | 3 |
| tickets | 829 |

---

## 11. Backup & restore (Gate G)

`TEST EC2 OPERATOR VERIFIED`  
Location: **outside Git** `/var/backups/sahaya/pre-migration/`

| Artifact | Path | Size (approx) | SHA-256 |
|----------|------|---------------|---------|
| Full custom dump | `sahaya-20260801-151400.dump` | 58 MB | `ce7ff01297ea3ee5448e881367da30ad36449039b61074c0b9c2ace75a4f9636` |
| Schema-only SQL | `sahaya-schema-20260801-151400.sql` | 78 KB | `6eb9ca6869fd8ad75498a0660b978ae738e7175d41427d5a17481c868c9a5709` |
| Checksums file | `SHA256SUMS` in same directory | — | — |

### Readability

`pg_restore --list` succeeded:

- Archive created: 2026-08-01 15:14 UTC  
- Database: `sahaya`  
- TOC entries: 257  
- Format: CUSTOM  
- Source / pg_dump: PostgreSQL 18.4  

### Independent restore test

Temporary container `sahaya-restore-validation`, DB `sahaya_restore_test`, restore with `pg_restore --no-owner` — **success, no reported errors**.

| Metric | Source | Restore |
|--------|-------:|--------:|
| public tables | 25 | 25 |
| users | 34 | 34 |
| organisations | 3 | 3 |
| tickets | 829 | 829 |

Temporary restore container **removed** (`docker rm -f sahaya-restore-validation`).  
Source `sahaya-migration-db` **not** modified/restarted/removed.

```text
GATE G — RECOVERY BASELINE = PASS
```

---

## 12. Other Sahaya Docker resources on EC2

`TEST EC2 OPERATOR VERIFIED` — **LEGACY / PURPOSE REQUIRES LATER REVIEW** — do **not** delete now.

| Container | Observed publish | Notes |
|-----------|------------------|-------|
| `sahaya_api` | `127.0.0.1:3000→3000` | Not live TEST API path |
| `sahaya_worker` | (present) | Review later |
| `sahaya_backend` | `0.0.0.0:4000→4000` | Not live TEST API path |
| `sahaya_db` | `0.0.0.0:5434→5432` | Different from migration DB |
| `sahaya-migration-db` | `0.0.0.0:5436→5432` | **Live TEST app DB** |

Live TEST API path is Nginx → **4100** → root PM2 monorepo — **not** Docker 3000/4000.

---

## 13. Frontend API isolation (Gate A)

| Check | Status | Evidence |
|-------|--------|----------|
| Current live TEST FE → TEST API | **PASS** | EC2 FE `.env` + live JS inlines `https://api.test-sahaya.pariskq.in` |
| CI guarantees future builds | **NO** | `deploy-test.yml` does not set/fail on `VITE_CRM_API_URL`; code still has prod API fallback (`crmApiConfig.ts`) |

---

## 14. CORS (unchanged code risk)

`LIVE HTTP VERIFIED` + `REPOSITORY VERIFIED`

TEST API accepts `https://sahaya.pariskq.in` (hardcoded in `app.js`) **and** test origin.  
EC2 env lists `CORS_ORIGIN=https://test-sahaya.pariskq.in` but does not eliminate the hardcoded production origin.

---

## 15. Password reset / communications (safe identifiers)

| Item | Status |
|------|--------|
| FE reset base on TEST | TEST host via `VITE_APP_BASE_URL` |
| Auth recovery issuer | Shared Supabase → **unsafe to exercise** |
| SMS | `SMS_ENABLED=true`, `SMS_TEST_MODE=false` on live TEST BE |
| Daily report | enabled but `DAILY_REPORT_DRY_RUN=true` |
| Postmark server vs prod | `STILL UNVERIFIED` |
| S3 bucket vs prod | `crm-pariskq` — `STILL UNVERIFIED` |

---

## 16. Updated isolation matrix

| Resource | TEST Identifier | Isolation Status | Evidence | Blocks What? |
|----------|-----------------|------------------|----------|--------------|
| Frontend | `test-sahaya.pariskq.in` | ISOLATED (host) | LIVE HTTP + EC2 | — |
| API | `api.test-sahaya.pariskq.in` → `:4100` | ISOLATED (host) | Nginx + PM2 + HTTP | — |
| Nginx | → `localhost:4100` | CONFIRMED TEST path | EC2 | — |
| PM2 active | `sahaya-final-aws-monorepo-api` (root) | CONFIRMED TEST | EC2 | — |
| PM2 stopped legacy | `sahaya-final-aws-api` | STOPPED / other path | EC2 | Cleanup later only |
| PostgreSQL | `sahaya-migration-db` / `localhost:5436` / `sahaya` / PG 18.4 | **CONFIRMED TEST standalone** | EC2 schema + routing | Does **not** block isolated RDS prep; still verify no prod clients use this host |
| DB recovery | validated dump + restore match | **PASS** | EC2 | Unblocks deliberate TEST DB break/restore drills |
| Supabase Auth | `bggumdvyvgpqvhqyksid` | **SHARED** | LIVE HTTP + EC2 env | Destructive Auth testing, signup, reset, password change, admin createUser |
| Supabase PostgREST | same project | **SHARED** | LIVE HTTP | FE `.from` writes (org CRUD/settings); reads share prod data plane |
| Supabase Storage | same project (`fe-proofs`) | **SHARED** | code + shared project | Proof Storage uploads / backup worker Storage path |
| S3 | `crm-pariskq` | **UNVERIFIED** | EC2 env name only | Phase 3 cutover; any write if bucket is prod |
| Postmark | configured | **UNVERIFIED** | token present, server id unknown | Sending real emails / webhook experiments |
| SMS | enabled, test mode false | **UNSAFE DEFAULTS** | EC2 env + code templates use prod domain | Real SMS / prod deep links |
| GitHub Actions | `deploy-test.yml` | PARTIAL | repo; host secret unverified | Accidental bad FE build (prod API fallback); branch skew |
| Legacy Docker Sahaya | ports 3000/4000/5434 etc. | LEGACY REVIEW | EC2 | Accidental ops against wrong container |

---

## 17. Updated gates

| Gate | Status | Notes |
|------|--------|-------|
| **A Frontend isolation** | **PASS** (current) | CI pin still missing |
| **B Database isolation** | **PASS (PARTIAL)** | Live TEST API DB is identified standalone Postgres on TEST EC2. Remaining: confirm no production consumers of this instance; EC2 co-tenancy of other containers is review-only. Sufficient to authorize **isolated** Postgres→RDS work **after approval**. |
| **C Supabase isolation** | **FAIL** | Shared project confirmed |
| **C′ Mutation controls** | **IMPLEMENTED LOCALLY** | App freeze (not deployed); see §24 |
| **D Storage isolation** | **FAIL / UNVERIFIED** | Supabase Storage shared; S3 `crm-pariskq` unlabeled |
| **E Communication isolation** | **CONTROL REQUIRED** | SMS live; Postmark unknown |
| **F Deployment isolation** | **PARTIAL** | Test paths only; no VITE pin; `develop`≠`main`; EC2 secret host not re-proven |
| **G Recovery baseline** | **PASS** | Dump + independent restore counts match |

---

## 18. Supabase strategy recommendation (planning only)

End goal: **remove Supabase entirely**. Creating a temporary TEST Supabase project would mean:

`shared Supabase → TEST Supabase → AWS`

for platforms we intend to delete.

### Actual mutation / dependency surface (`REPOSITORY VERIFIED`)

| Surface | Mutates shared Supabase? | Examples |
|---------|--------------------------|----------|
| Auth login/session | Read session; login hits Auth | `signInWithPassword`, `getSession`, `/auth/v1/user` |
| Auth signup / password | **YES mutate** | `signUp`, `updateUser`, `signOut`; BE `auth.admin.createUser`, `generateLink`, `deleteUser` |
| PostgREST reads | Read shared DB via PostgREST (may not be same as Docker Postgres) | `tenantTicketsSupabase`, users directory selects |
| PostgREST writes | **YES mutate** | org insert/update (`useOrganisationsTable`), TicketSettings org update |
| Storage | **YES mutate** | `fe-proofs` upload in `proofController`, `proofBackupQueueProcessor` |
| JWT validation | Read Auth API | `requireAuth` |

**Important:** Backend Prisma already uses **standalone** `localhost:5436/sahaya`. FE PostgREST still talks to **Supabase-hosted** API for some tables — those may be a **different data plane** than the Docker DB until PostgREST is removed. Treat FE PostgREST as shared-prod risk; do not assume it reads the Docker DB.

### Recommendation: **Strategy B (direct removal) with an operational freeze** — justified hybrid only as discipline, not as a new Supabase project

**Choose B over A.**

Why (code-based):

1. App DB for the live API is already off Supabase schemas.  
2. Remaining Supabase is Auth + FE PostgREST + Storage — exactly Phase 2–5 targets.  
3. A temporary TEST Supabase doubles Auth/user migration cost for disposable infra.  
4. Migration-necessary work (RDS restore of validated dump, Data API parity, S3 primary) does **not** require a new Supabase project.

**Operational freeze while B proceeds** (policy, not a new project):

- Avoid TEST signup / password reset / admin `createUser` / org PostgREST writes / proof Storage uploads against shared project during migration windows.  
- Prefer server-side provision flag paths only when intentionally accepted; prefer disabling mutation UIs or using already-provisioned TEST users.  
- Read-only Auth session + `/auth/v1/user` still touch shared Auth (login side effects) — keep TEST user set small and known.

**Strategy A** only if product requires uninterrupted TEST Auth/FE for weeks with full mutation parity before AWS Auth exists. Current goal (full removal) makes A low leverage.

---

## 19. What is now safe vs unsafe

### Safe (after explicit approval; no shared Supabase writes)

- Provision **new** TEST-only AWS RDS and restore `/var/backups/sahaya/pre-migration/sahaya-20260801-151400.dump` into it (**does not** require touching Supabase).  
- Schema inventory / function review against schema-only SQL.  
- Design/implement FE→backend Data API replacements in a branch (no deploy until ready).  
- Design S3 TEST bucket plan (create bucket only after proving `crm-pariskq` isolation).  
- Git branch reconciliation planning (`develop` vs `main`).  
- Continue documentation.

### Unsafe / freeze

- Any Supabase Auth mutation (signup, reset, password update, admin create/delete user).  
- FE `supabase.from` **writes**.  
- Supabase Storage uploads / proof backup to `fe-proofs`.  
- Assuming S3 `crm-pariskq` is TEST-only.  
- Real SMS (`SMS_TEST_MODE=false`).  
- Non-dry-run emails if Postmark is shared.  
- Cleaning legacy Docker/PM2 without review.  
- Pointing live `DATABASE_URL` at RDS without approved Phase 1.  
- Production hosts / processes.

---

## 20. Remaining blockers

### P0 — could affect production

1. Shared Supabase project `bggumdvyvgpqvhqyksid` — Auth/PostgREST/Storage.  
2. TEST API CORS allows production SPA (`app.js`).  
3. SMS enabled with `SMS_TEST_MODE=false`; templates reference prod domain.  
4. S3 bucket `crm-pariskq` possibly shared (`STILL UNVERIFIED`).

### P1 — prevents some migration steps / full Phase 0 “all clear”

5. Postmark TEST vs PROD server unknown.  
6. Deploy workflow missing `VITE_CRM_API_URL` pin.  
7. `develop` behind `main` — CI deploys older tip than local prisma work.  
8. FE PostgREST may not be the same data plane as Docker Postgres — must remove/rewire before trusting FE lists against RDS-only.

### P2 — hardening

9. Legacy containers / stopped PM2 app review.  
10. Stale `config.toml` project id.  
11. Classify dump SQL functions (KEEP/REWRITE/REMOVE) in later phase.  
12. Prefer IAM role over static AWS keys on EC2 (ops).

**Shared Supabase does NOT block:** creating isolated TEST RDS + restoring the validated dump (no Supabase I/O).  
**Shared Supabase DOES block:** Auth cutover experiments, Storage experiments, PostgREST write tests, “break TEST Auth freely”.

---

## 21. Next safe action (recommendation only — not executed)

**ONE next step (updated):**

> Review the local freeze implementation + runbook, then **deploy freeze flags to TEST only** (`SHARED_SUPABASE_MUTATIONS_DISABLED` + `VITE_SHARED_SUPABASE_MUTATIONS_DISABLED` rebuild). After freeze is live on TEST, authorize Phase 1 isolated RDS provision + restore.

Previous recommendation (freeze runbook) is now implemented locally — activation requires separate deploy approval.

---

## 22. Smoke / inventory status snapshot

| Check | Result |
|-------|--------|
| TEST FE / API health | PASS (prior LIVE HTTP) |
| Authenticated CRM flows | NOT RETESTED this pass |
| DB dump + restore | PASS |
| Supabase isolation | FAIL |
| Shared-Supabase mutation freeze | IMPLEMENTED LOCALLY — unit tests PASS — **not deployed** |
| Phase 1 | **NOT AUTHORIZED** until freeze reviewed/deployed to TEST + explicit approval |

---

## 23. Baseline document status

- File: `docs/migration/phase-0-baseline.md` (this update)  
- Freeze runbook: `docs/migration/test-supabase-mutation-freeze.md`  
- No credentials included  
- Git: **do not commit / push** until instructed  
- Tag `test-pre-migration-baseline`: **unchanged**

---

## 24. Shared-Supabase mutation freeze (2026-08-01)

### Audit summary

- Auth mutation surfaces: signup, password update/reset, admin createUser/deleteUser, generateLink  
- PostgREST mutations: organisations insert/update only (selects remain)  
- Storage mutations: `fe-proofs` upload (controller + queue worker)  
- RPC mutating calls: none in app runtime  
- Strategy: **B** — freeze in TEST app flags; no shared Supabase config changes  

### Frozen (when flags true)

Signup, password change/reset, forgot-password link generation, admin Auth provision, org PostgREST writes, Supabase Storage proof uploads.

### Allowed (with residual risk)

Login / session / logout / JWT validate; PostgREST SELECT; Prisma→Docker Postgres writes; proof DB path (Storage skipped).

### Implementation status

`IMPLEMENTED LOCALLY` — awaiting review; **DO NOT DEPLOY** without approval.

Flags (default OFF):

- Backend: `SHARED_SUPABASE_MUTATIONS_DISABLED=true`  
- Frontend build: `VITE_SHARED_SUPABASE_MUTATIONS_DISABLED=true`  

Unit tests: `backend/tests/unit/sharedSupabaseMutationFreeze.test.js`, `forgotPasswordFreeze.test.js` — prove SDK mutation methods not called when frozen.

### Remaining shared risk after freeze (even when deployed)

- Login still touches shared Auth (last-sign-in).  
- PostgREST reads still hit shared project data plane.  
- S3 / Postmark / SMS unchanged.  
- FE PostgREST freeze requires Vite rebuild with flag; CI does not pin it today.

---

*End of Phase 0 baseline (evidence reconciliation + freeze note).*
