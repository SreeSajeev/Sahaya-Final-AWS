# Platform Validation Framework

Prove Sahaya-Final-AWS works (and document what does not exist) with one command.

## Single command

```bash
cd Sahaya-Final-AWS
chmod +x validation/run-platform-validation.sh
./validation/run-platform-validation.sh
```

Requires `DATABASE_URL` (or `backend/.env.test`) for DB-backed suites. Without it, unit + gaps still run; integration/platform suites skip via `describeIfDb`.

### Options

```bash
SKIP_UNIT=1 SKIP_REPO=1 SKIP_E2E=1 ./validation/run-platform-validation.sh
PV_STRESS=1 PV_TICKET_COUNT=200 ./validation/run-platform-validation.sh
```

Reports land in `validation/reports/LATEST.md` and `LATEST.html`.

## What this covers

| Phase | Deliverable |
|-------|-------------|
| 1 Inventory | `FEATURE_INVENTORY.md` |
| 2 Matrices | `matrices/PLATFORM_MATRICES.md` |
| 3–12 API/lifecycle/tenant/role/security/metadata | `backend/tests/platform-validation/*` |
| 13 Stress (bounded) | `08-stress-smoke.test.js` |
| 14 Failure recovery | Ops scripts `acceptance-restart-pg.sh`, `acceptance-backup-restore.sh` (not auto in default CLI) |
| 15 DX | Gaps: no Swagger; request IDs asserted indirectly |

## npm shortcuts

```bash
cd backend
npm run test:platform-validation
```

## Honesty rule

Roles like Viewer/Support/Platform Admin and modules like Branches/Assets CMDB are **not implemented**. Suites record them as N/A instead of inventing APIs.
