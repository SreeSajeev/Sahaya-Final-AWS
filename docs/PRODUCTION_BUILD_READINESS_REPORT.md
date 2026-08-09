# Production build / CI readiness report

**Date:** 2026-08-09  
**Scope:** Make repository build, test, and deploy cleanly (no product features)

---

## Summary board

| Area | Result | Notes |
|------|--------|-------|
| Backend install / start | **PASS** | `npm install`; `PROCESS_ROLE=api` boots; `GET /health` → 200 |
| Frontend build | **PASS** | `npm run build` succeeds (chunk-size warnings only) |
| Prisma generate | **PASS** | Client generated |
| Prisma validate | **PASS** | Schema valid |
| Migrations (files) | **PASS** | 10 migrations each have `migration.sql` |
| Migrations (local `_prisma_migrations`) | **WARN** | Local DB used `db push`; CI uses `db push` then tests. Deploy uses `migrate deploy` |
| Unit tests (`npm test`) | **PASS** | 52 files / 387 tests |
| Repository tests (`npm run test:repo`) | **PASS** | 14 files / 33 tests (isolated config) |
| Integration (`npm run test:integration`) | **PASS** | 12 files / 46 tests |
| Coverage scripts | **WARN** | Suites run; global coverage thresholds (60%) not met — not used in CI |
| Frontend lint | **WARN** | Pre-existing eslint errors; **not** used by deploy (`vite build` only) |
| GitHub Actions scripts | **PASS** | Referenced scripts exist; CI now runs full unit+repo+integration |
| Deployment compile | **PASS** | FE build + BE `prisma generate` + node start; no secrets needed to compile |
| Remaining product blockers | **WARN** | Env cutover / migration tasks — outside this build-hardening scope |

---

## Fixes applied (this pass)

1. **`tests/setup/repoSetup.js`** — Guard `$connect` / `$disconnect` when prisma is mocked (matches integration setup).  
2. **`vitest.repo.config.js`** — Stop merging base unit includes so mocked unit suites do not share repo teardown.  
3. **`frontend/.../MetadataTicketCreatePage.tsx`** — Default import for `MetadataFormRenderer` (build blocker).  
4. **`.github/workflows/test.yml`** — Run full `npm test`, `npm run test:repo`, and `npm run test:integration` (no longer skip integration / most unit tests).

---

## GitHub Actions audit

| Workflow | Scripts / commands | Status |
|----------|-------------------|--------|
| `test.yml` | `npm ci`, `prisma generate`, `db push`, `seed:test`, `npm test`, `test:repo`, `test:integration` | **Aligned** after update |
| `deploy-test.yml` | `frontend: npm run build`, `backend: prisma generate`, `migrate deploy`, PM2 | **OK** |
| `phase-d-auth-ops.yml` | `auth:list-roles`, frontend `build`, prisma migrate | **OK** |
| `phase1-rds-ops.yml` | ops scripts | **OK** (ops-only) |

---

## Remaining blockers (not build/CI source defects)

- Production env cutover (dry-run flags, hosts, S3 prod bucket) — ops  
- Data/storage migration — separate project  
- `npm run test:coverage*` fails thresholds without broader test coverage investment  
- `npm run lint` (frontend) has legacy `any` / require issues; deploy does not gate on lint  

---

## Verdict

**Repository is build/test ready for CI and TEST deploy paths** after the harness + import + workflow fixes above.
