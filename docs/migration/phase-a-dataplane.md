# Phase A — EC2 PostgreSQL authoritative TEST backend data plane

**Scope:** TEST backend only (`develop` → EC2). No RDS. No frontend PostgREST removal. Auth/Storage remain (freeze on).

## Rollback

1. `git revert` Phase A commit on `develop` (or `git reset --hard` to pre-Phase-A SHA) and push `develop`.
2. Or on EC2: `git reset --hard <pre-phase-a-sha>` in monorepo, `npm install`, `npx prisma generate`, `pm2 restart sahaya-final-aws-monorepo-api --update-env`.
3. Restore `backend/.env` if needed: keep `DATABASE_URL` → `localhost:5436/sahaya`; freeze flags stay `true`.
4. Confirm `/health` and freeze forgot-password 403.

Pre-Phase-A develop tip (before this commit): record at deploy time.

## Gate notes

- `PHASE_A_DB_PROBE_ENABLED` temporary — disable after PASS.
- `S3_FE_PROOFS_ENABLED=false` during Phase A validation (unverified `crm-pariskq`).

## Deployed proof (2026-08-01)

| Item | Value |
|------|--------|
| Commit | `63aeacc` / tip with ops `8e0bfbb` |
| Probe marker | `PHASE_A_VALIDATION_1785603665193` |
| audit_logs id | `f74f16f9-4b39-423c-a6e4-264ddf1168bb` |
| Proven in | `sahaya-migration-db` via `psql` |
| Backend `supabase.from` / `.rpc` on EC2 | **0** |
| `S3_FE_PROOFS_ENABLED` | `false` |
| Freeze | still `true` |

`PHASE_A_DB_PROBE_ENABLED` should be set `false` after gate.
