# Sahaya TEST — Full Platform End-to-End Acceptance

**Status:** IN PROGRESS  
**Environment:** TEST only (`test-sahaya.pariskq.in` / `api.test-sahaya.pariskq.in`)  
**Started (UTC):** 2026-08-03  
**Branch:** `develop`  
**Rules:** No production, no real Supabase, no `crm-pariskq`, no RDS, no real customer SMS/email.

This document is the live audit record. Results are filled as executable tests complete.

---

## Safety ledger

| Check | Value |
|-------|-------|
| REAL SUPABASE MUTATIONS | 0 |
| REAL SUPABASE CONFIG CHANGES | 0 |
| crm-pariskq WRITES | 0 |
| PRODUCTION MODIFICATIONS | 0 |
| RDS CREATED | 0 |

---

## Architecture verification (pending executable proof)

```text
Browser → test-sahaya.pariskq.in → api.test-sahaya.pariskq.in
  → Nginx → PM2 sahaya-final-aws-monorepo-api
  → Local Auth (Argon2id / JWT / refresh cookie / auth_sessions)
  → Prisma → localhost:5436 → sahaya-migration-db → PostgreSQL
  → Proofs → sahaya-test-fe-proofs
```

---

## Sections

Results appended below as tests run. Final 48-section report at end of this file when complete.

### Baseline markers

- TEST health:
- Prod health (read-only):
- Develop SHA:

### Prisma ↔ PostgreSQL contract

(see ops `prisma_contract` output)

### Executable suites

| Suite | Run ID | Result |
|-------|--------|--------|
| prisma_contract | | |
| full_acceptance | | |
| proof_e2e | | |
| backup_restore | | |
| restart_api | | |
| restart_pg | | |

---

## Defects

| Severity | Workflow | Symptom | Root cause | Fix | Commit | Retest |
|----------|----------|---------|------------|-----|--------|--------|

---

## Fixtures created

| ID / marker | Type | Cleanup |
|-------------|------|---------|

---

## Final verdict

_Pending._
