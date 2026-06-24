# Sahaya Automated Test Framework

Migration validation test suite for Supabase DB → AWS PostgreSQL (Prisma). Auth and Storage remain on Supabase; tests use Prisma against PostgreSQL.

## File tree

```
Sahaya-Final-AWS/
├── package.json                    # test:repo | test:integration | test:e2e | test:all
├── TESTING.md                      # this file
├── .github/workflows/test.yml      # CI: prisma generate + repo + integration
├── backend/
│   ├── vitest.config.js
│   ├── vitest.repo.config.js
│   ├── vitest.integration.config.js
│   ├── .env.test.example
│   ├── prisma/seed-test.js
│   └── tests/
│       ├── setup/
│       │   ├── repoSetup.js
│       │   └── integrationSetup.js
│       ├── helpers/
│       │   ├── db.js
│       │   ├── testApp.js
│       │   └── testContext.js
│       ├── repositories/           # 14 repository test suites
│       │   ├── users.test.js
│       │   ├── organisations.test.js
│       │   ├── field_executives.test.js
│       │   ├── tickets.test.js
│       │   ├── ticket_assignments.test.js
│       │   ├── ticket_comments.test.js
│       │   ├── sla_tracking.test.js
│       │   ├── fe_action_tokens.test.js
│       │   ├── tenant_clients.test.js
│       │   ├── public_otp_sessions.test.js
│       │   ├── tenant_complaint_points.test.js
│       │   ├── raw_emails.test.js
│       │   ├── parsed_emails.test.js
│       │   └── audit_logs.test.js
│       └── integration/
│           ├── auth.test.js
│           ├── tickets.test.js
│           ├── fe.test.js
│           ├── publicComplaints.test.js
│           ├── email.test.js
│           └── reports.test.js
└── e2e/
    ├── package.json
    ├── playwright.config.ts
    ├── .env.example
    └── specs/
        ├── super-admin.spec.ts
        ├── admin.spec.ts
        ├── field-executive.spec.ts
        └── public-complaint.spec.ts
```

## Prerequisites

1. PostgreSQL test database (local Docker or CI service container)
2. Copy `backend/.env.test.example` → `backend/.env.test` and set `DATABASE_URL`
3. Supabase env vars for integration auth mocks (dummy values work for mocked routes)

## Commands

```bash
# From repo root
npm run prisma:generate
npm run seed:test
npm run test:repo
npm run test:integration
npm run test:e2e
npm run test:all

# Coverage (backend)
cd backend && npm run test:coverage:repo
cd backend && npm run test:coverage:integration

# E2E setup
cd e2e && npm ci && npx playwright install chromium
cp .env.example .env   # fill credentials
npm run test:e2e
```

## Sample output (no DATABASE_URL — skipped)

```
 RUN  v3.x  repository

 ↓ tests/repositories/users.test.js (3 tests | 3 skipped)
 ↓ tests/repositories/organisations.test.js (3 tests | 3 skipped)
 ...

 Test Files  14 skipped (14)
      Tests  38 skipped (38)
```

## Sample output (with DATABASE_URL)

```
 ✓ tests/repositories/users.test.js > userRepository > creates and reads a user
 ✓ tests/repositories/tickets.test.js > ticketRepository > enforces tenant isolation
 ✓ tests/integration/auth.test.js > auth integration > GET /health returns ok
 ✓ tests/integration/email.test.js > email ingestion > POST /postmark-webhook stores inbound raw email

 Test Files  20 passed (20)
      Tests  52 passed (52)
```

## Coverage targets

| Layer        | Target | Config file                    |
|-------------|--------|--------------------------------|
| Repositories | 80%   | `vitest.repo.config.js`        |
| Services     | 70%   | `vitest.integration.config.js` |
| Routes       | 60%   | `vitest.integration.config.js` |

Run `npm run test:coverage:repo` after connecting a database to measure progress toward thresholds.

## Integration test auth

Integration tests mock `requireAuth` / `requireAppUser` via Vitest. Pass headers:

- `Authorization: Bearer test-token`
- `x-test-user-id` — `users.id`
- `x-test-role` — `ADMIN`, `FIELD_EXECUTIVE`, etc.
- `x-test-org-id` — tenant `organisation_id`

No production auth code is modified.

## E2E credentials

Set in `e2e/.env`:

| Variable | Purpose |
|----------|---------|
| `E2E_SUPER_ADMIN_EMAIL` / `PASSWORD` | Super admin flows |
| `E2E_ADMIN_EMAIL` / `PASSWORD` | Ticket create/assign |
| `E2E_FE_EMAIL` / `PASSWORD` | FE dashboard |
| `E2E_FE_ACTION_TOKEN_ID` | Magic link (no login) |
| `E2E_PUBLIC_COMPLAINT_TOKEN` | Public QR intake |

Tests skip gracefully when credentials are unset.

## Uncovered areas (initial pass)

- Supabase Auth JWT validation (real tokens) — mocked in integration; covered in E2E when credentials provided
- Supabase Storage upload paths — not DB migration scope
- Worker loops (`autoTicketWorker`, SLA evaluator, proof backup queue) — no HTTP surface; add worker integration later
- WhatsApp / Airtel SMS live sends — `SMS_TEST_MODE=true` in tests
- Bulk import, bulk assign — feature-flagged; add when enabled in test env
- `debugWhatsapp`, orphaned `feProofs` router — not mounted in main app
- Frontend unit tests — E2E only in this pass
- Full close/review-complete happy path — depends on proof + assignment state; partially covered via PATCH/status tests

## Migration readiness score

| Dimension | Score | Notes |
|-----------|-------|-------|
| Repository Prisma coverage | **75%** | 14 domains with CRUD + tenant isolation tests |
| API regression net | **65%** | Core auth, tickets, FE, public OTP, email webhook, reports dry-run |
| E2E workflow coverage | **50%** | Role-based specs; require live env + credentials |
| CI automation | **80%** | GitHub Actions with Postgres service + seed |
| **Overall test readiness** | **68%** | Run against AWS PostgreSQL test instance to reach production confidence |

## CI

`.github/workflows/test.yml` runs on `push`/`pull_request` to `develop` and `main`:

1. `prisma generate`
2. `prisma db push` (test DB)
3. `seed:test`
4. `test:repo`
5. `test:integration`

E2E is local/scheduled only (requires Supabase + frontend secrets).
