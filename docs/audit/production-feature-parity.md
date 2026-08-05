# Production Feature Parity Matrix

**Divergence:** 2026-06-23 (`Sahaya-Final-AWS` initial workspace)  
**Production HEADs:** backend `b02ecda`, frontend `fb1bd84`  
**AWS HEAD:** `a1f4505`

Status legend: **COMPLETE** | **PARTIAL** | **MISSING** | **N/A (AWS-ahead)**

---

## Post-divergence functional commit classification

### Ignored (non-functional / polish-only within functional themes)

| SHA | Reason ignored as standalone |
|-----|------------------------------|
| `b0524a8`, `a6da307` | Hero video sizing only (bundled under Hero Demo Video feature) |
| `a8f70bf`, `78c7a5e` | Tiny analytics follow-ups (bundled under Enterprise Analytics) |
| Pure logo/login visual commits (pre-divergence) | Branding-only; not product workflow |

### Functional commits after clone (11 unique feature deltas from 15 raw commits)

| # | SHA(s) | Category | AWS status |
|---|--------|----------|------------|
| 1 | `860d3b9` | Analytics / Reports / Email | ❌ MISSING deltas |
| 2 | `b02ecda` | Proof upload / Security | ❌ MISSING |
| 3 | `b4f055d`+`68de95f` | Other (marketing landing) | ❌ MISSING |
| 4 | `dd3edce`+`98e6e4d` | Analytics / Reports | ❌ MISSING / PARTIAL base page |
| 5 | `91d9ddc` | Performance / Mobile / Other (PWA) | ❌ MISSING |
| 6 | `ae1b647` | Field Executives / Search / Filtering | ❌ MISSING (FE portal) |
| 7 | `43dca0d` | Tickets / Validation | ❌ MISSING |
| 8 | `f65d45b`+`fb1bd84` | Proof upload | 🟡 PARTIAL |

**Summary counts (post-divergence functional deltas):**

1. Functional production deltas after clone: **11** (2 backend + 9 frontend feature units; 15 raw commits)
2. Fully present in AWS: **0**
3. Partially present: **2** (enterprise analytics page shell; proof upload UX at lower limits)
4. Missing completely: **9**

Pre-divergence May–June features were snapshotted into AWS and remain **COMPLETE** for presence (see matrix below). AWS additionally rewrote auth/storage to JWT + Prisma + S3 (AWS-ahead).

---

## Module matrix

### Authentication
- **Production:** Supabase Auth JWT validation (`416a3ff`); password reset via Supabase recovery + Postmark (`e08509e`)
- **AWS:** Local JWT sessions (`localAuth.js`, Phase D commit `2781e193`); argon2; refresh cookies; `POST /auth/reset-password`
- **Status:** COMPLETE for login/session on AWS (different implementation). Password reset present on both.
- **Evidence:** AWS `src/routes/localAuth.js`; prod still uses Supabase Auth REST.

### Authorization / Permissions / RBAC
- **Production / AWS:** Shared role policies pattern (`rolePolicies.js`); route-level role checks in `dataApi.js` / tickets
- **Status:** COMPLETE (presence). Unable to verify every policy bit-equality without exhaustive line diff of every handler.

### Tenancy / Tenant onboarding / Organisation management
- **Both:** Organisations CRUD/list/stats under `/data/organisations*`
- **AWS-only:** `PATCH /data/organisations/:id`
- **Status:** COMPLETE (+ AWS ahead on org PATCH)

### Tenant configuration
- **Both:** `TicketSettings` + `configurations` API; feature flag `VITE_TENANT_CONFIGURATION_ENABLED`
- **Status:** COMPLETE  
- **Evidence:** frontend pages identical; backend `/data/configurations*`

### Users / Admins / Service Managers / Field Executives
- **Both:** Users APIs, FE create/patch, outsourced `resource_kind` (frontend `7f17a8d`)
- **Status:** COMPLETE for core CRUD. FE **portal ticket list UX** PARTIAL (see Field Executives row below).

### Clients
- **Both:** Tenant clients behind `TENANT_CLIENTS_ENABLED` / `VITE_TENANT_CLIENTS_ENABLED` (`8ea4666`, `354dcb0`)
- **Status:** COMPLETE

### Tickets / Ticket workflow / Assignment / Review queue
- **Both:** assign, reassign (`d30cc42`/`d5073a3`), reject, on-site token, close, review-complete, priority L/M/H (`3c23b69`), geographic state (`54ad9b5`), notification recipients (`1fb9937`), numbering PKQS/E/C (`399ddc6`)
- **Status:** COMPLETE for core workflow APIs/UI presence
- **Gap:** Location required + backfill (`43dca0d`) ❌ MISSING on AWS frontend

### Proof upload / Storage
- **Production:** MAX 10 images backend (`b02ecda`); FE compress + zoom viewer (`f65d45b`, `fb1bd84`); S3 replication (`4e8acda`)
- **AWS:** S3 primary storage (Phase C); FE `MAX_PROOF_IMAGES = 5`; **no** backend `TOO_MANY_IMAGES`; no `compressProofImage.ts`
- **Status:** 🟡 PARTIAL

### Dashboard
- **Both:** `/data/dashboard/stats` with client/state/date filters (`b7b457f`)
- **Gap:** AWS resolved-count date filter also applies `openedAt` (prod uses `resolved_at` only) — behavioral PARTIAL
- **Status:** 🟡 PARTIAL (filter params present; resolved KPI date semantics differ)

### Analytics / Reports
- **Production:** Enterprise Analytics (`dd3edce`…), `staff_users` API (`860d3b9`), ops Excel/CSV (`operationsExcelExport.ts`), daily CSV columns for Other details (`860d3b9`)
- **AWS:** Basic Analytics page + `/analytics/summary` **without** `staff_users`; daily CSV without Other columns; no ops Excel libs
- **Status:** 🟡 PARTIAL → effectively ❌ for July enterprise suite

### Raw Emails
- **Both:** `/data/raw-emails`, Postmark webhook
- **Status:** COMPLETE (presence)

### Notifications / SMS / Email
- **Both:** Postmark emailService, Airtel SMS, assignment/resolution SMS flags
- **Gap:** Email OTHER category display enrichment from `860d3b9` ❌ MISSING on AWS
- **Status:** 🟡 PARTIAL

### Public complaints / OTP
- **Both:** complaint-points, public OTP, submit-complaint; gated by `PUBLIC_COMPLAINTS_ENABLED`
- **Status:** COMPLETE

### Search / Filtering / Pagination
- **Both:** Tickets list search/sort (`6016325`)
- **Gap:** FE portal searchable table (`ae1b647`) ❌ MISSING on AWS (cards remain)
- **Status:** 🟡 PARTIAL

### Performance / Security
- **Production:** PII redaction (`3ae0e4c`, `71cc90f`); PWA (`91d9ddc`); proof image cap 10
- **AWS:** Has security redaction patterns in snapshot; JWT/rate-limits added in AWS phases; missing PWA + proof cap
- **Status:** 🟡 PARTIAL

### Bug fixes
- See `production-feature-parity.md` companion `missing-production-features.md` / bug section in workflow report. Pre-June fixes generally present; post-June proof preview fix missing.

### API / Database / Workers / Cron / Infrastructure
- **API:** See `production-api-gap-report.md` — production has **no** unique routes AWS lacks; AWS adds localAuth + proof URL + org PATCH
- **Database:** Prod runtime Supabase-primary + stub Prisma; AWS full Prisma models — see DB report
- **Workers:** Both have autoTicket, resolution token, daily report, proof backup workers
- **Status:** COMPLETE for worker presence; schema modeling AWS-ahead

### Other
- Hero demo video on landing ❌ MISSING
- PasswordRecoveryHashRedirect component ❌ MISSING on AWS (prod-only)

---

## Pre-divergence feature presence spot-check (file evidence)

| File | Prod | AWS |
|------|------|-----|
| `ticketImportService.js` | Y | Y |
| `assignmentService.js` | Y | Y |
| `complaintPointService.js` | Y | Y |
| `publicComplaintSubmitService.js` | Y | Y |
| `tenantClientService.js` | Y | Y |
| `dailyTenantReportService.js` | Y | Y |
| `s3ProofReplication.js` | Y | Y |
| `ticketNumber.js` | Y | Y |
| `normalizeTicketPriority.js` | Y | Y |
| `normalizeTicketState.js` | Y | Y |
