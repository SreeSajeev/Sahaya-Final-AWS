# Phase 1 — Isolated TEST RDS (rollback + gate tracking)

**Scope:** TEST only (`api.test-sahaya.pariskq.in` → PM2 `sahaya-final-aws-monorepo-api`)  
**Production / shared Supabase (`bggumdvyvgpqvhqyksid`):** untouched  
**Freeze:** keep `SHARED_SUPABASE_MUTATIONS_DISABLED=true` and `VITE_SHARED_SUPABASE_MUTATIONS_DISABLED=true`

---

## Starting point (pre–Phase 1)

| Item | Value |
|------|--------|
| Git deploy branch | `develop` |
| Freeze commit (live TEST) | `0c9d1fe` |
| App DB (before cutover) | Docker `sahaya-migration-db` → `localhost:5436` / DB `sahaya` / user `sahaya` / PG 18.4 |
| Validated dump | `/var/backups/sahaya/pre-migration/sahaya-20260801-151400.dump` |
| Baseline counts | tables 25, users 34, organisations 3, tickets 829 |
| AWS region (app evidence) | `ap-south-1` |
| Suggested RDS id | `sahaya-test-postgres` |

---

## Rollback procedure (cutover)

If Phase 1 cutover fails or gate fails:

1. On TEST EC2 only, edit `/var/www/apps/sahaya-final-aws-monorepo/backend/.env`:
   - Restore `DATABASE_URL` to the pre-cutover value (host `localhost`, port `5436`, db `sahaya`).
   - Prefer restoring from `/var/backups/sahaya/phase1-rds/cutover-state.env` if present (`OLD_DATABASE_URL_REDACTED` is documentation-only; the actual rollback URL must be taken from the operator-saved backup file created at cutover — never commit secrets).
2. Confirm Docker `sahaya-migration-db` is still running and listening on `5436`.
3. Restart **only** `pm2 restart sahaya-final-aws-monorepo-api` (root PM2).
4. Verify `GET https://api.test-sahaya.pariskq.in/health` → 200.
5. Re-check row counts on Docker Postgres match baseline (unless intentional TEST writes occurred).
6. Do **not** delete the RDS instance until rollback is confirmed and operators approve cleanup.

Do not restart unrelated PM2 apps. Do not touch production. Do not change Supabase.

---

## Gate checklist

- [ ] TEST RDS identifier unmistakably TEST
- [ ] Engine version compatible with dump (prefer PG 18)
- [ ] Not publicly accessible (or documented exception)
- [ ] Restore counts: 25 / 34 / 3 / 829
- [ ] TEST backend `DATABASE_URL` points at RDS
- [ ] Smoke: health + Prisma/Postgres workflows
- [ ] Production unmodified
- [ ] Supabase unmodified
- [ ] Rollback path verified documented

---

## Status

| Field | Value |
|-------|--------|
| Verdict | **BLOCKED — NO RDS CUTOVER** (2026-08-01) |
| RDS endpoint | *not created* |
| Cutover | *not started* — `DATABASE_URL` still `localhost:5436/sahaya` |
| Freeze | still enabled on TEST |

### Blocker (permissions)

| Actor | Finding |
|-------|---------|
| Local IAM `sreeparvathy` | Can `sts:GetCallerIdentity` + limited S3; **denied** `rds:*` and `ec2:Describe*` |
| TEST EC2 `i-0ee303af16930921a` | **No instance IAM role** (`iam/info` → 404); AWS CLI installed for ops but **NoCredentials** |
| VPC (metadata) | `vpc-0e4c5fc6d94f767df` / `subnet-03346bbecad8a2878` / `sg-05370b87ea55fdddc` / AZ `ap-south-1a` |

### Unblock requirements (operator)

1. Attach an IAM instance profile to TEST EC2 **or** provide a dedicated TEST IAM user/role with: `rds:*` (scoped), `ec2:Describe*`, `ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress` (for EC2→RDS:5432), `rds:CreateDBSubnetGroup`, etc.
2. Confirm RDS PostgreSQL **18** (or approved compatible version) in `ap-south-1`.
3. Re-run workflow `Phase 1 TEST RDS Ops` mode=`inspect`, then `provision` / `restore` / `cutover` with `confirm=CONFIRM`.

Do **not** use production Supabase or production RDS.
