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
