# Production Backend Gap Report

**Prod:** `Pariskq-CRM-Backend` @ `b02ecdae64fc39941a0d33274de6c6d71612b7c6` (`docker-ec2-migration`)  
**AWS:** `Sahaya-Final-AWS/backend` @ workspace HEAD `a1f4505`

---

## Post-divergence backend commits (complete analysis)

### 1. `860d3b9a492e54d399e30242b61e9ae6461c9c50` — 2026-07-14  
**Title:** feat: extend analytics API and reporting exports  
**Category:** Analytics / Reports / Email  
**Files changed:** `src/routes/dataApi.js`, `src/services/dailyTicketReportCsvService.js`, `src/services/emailService.js`

| Question | Answer |
|----------|--------|
| What changed? | Added `staff_users` to analytics summary; CSV columns for Other resolution details/display; email subject/body OTHER label enrichment |
| Why? | Service Manager scorecards + clearer resolution reporting |
| Frontend? | No (consumed later by frontend analytics commit) |
| Backend? | Yes |
| Database? | No schema migration; reads existing `users` / ticket fields |
| API endpoints? | Same path `GET /data/analytics/summary` — **response shape extended** |
| Permissions? | Same tenant scope via `withTenantScope` |
| Models? | No new models |
| User-visible? | Yes (Analytics SM scorecards; report CSV; emails) |
| Breaking? | Additive only |
| Risk? | Low–medium (extra users query) |
| **AWS status** | ❌ **MISSING** |

**Evidence — prod returns `staff_users`:** `dataApi.js` analytics summary loads roles `STAFF`,`ADMIN` and includes `staff_users` in `jsonOk`.  
**Evidence — AWS omits it:** AWS `dataApi.js` returns only `{ tickets, sla, field_executives, ticket_assignments }` (no `staff_users` string in AWS backend tree).  
**Evidence — CSV:** prod headers include `Resolution Other Details`, `Resolution Category Display`; AWS headers end at `Resolution Category`.  
**Evidence — email:** prod appends `Other: ${details}` from verification remarks; AWS maps OTHER → `"Other"` only.

---

### 2. `b02ecdae64fc39941a0d33274de6c6d71612b7c6` — 2026-07-24  
**Title:** feat: enforce maximum proof image upload limit  
**Category:** Proof upload / Security / Validation  
**Files changed:** `src/controllers/proofController.js`

| Question | Answer |
|----------|--------|
| What changed? | `MAX_PROOF_IMAGES = 10`; reject with `400` / `TOO_MANY_IMAGES` |
| Why? | Prevent oversized multi-image proof payloads |
| Frontend? | Companion FE work uses max 10 (`compressProofImage.ts`) |
| Backend? | Yes |
| Database? | No |
| API? | `POST /fe/proof` validation only |
| User-visible? | Yes (error toast/API error) |
| Breaking? | Yes for clients sending >10 images (intentional) |
| Risk? | Low |
| **AWS status** | ❌ **MISSING** |

**Evidence:** Prod `proofController.js` defines `MAX_PROOF_IMAGES` and returns `code: "TOO_MANY_IMAGES"`.  
**Evidence:** AWS `proofController.js` counts images for logging but has **zero** matches for `MAX_PROOF_IMAGES` / `TOO_MANY_IMAGES`.

---

## Pre-divergence backend features (present in AWS)

All major May–June services exist as files on both sides (import, assign, complaint points, public complaint, tenant clients, daily reports, S3 replication, ticket numbering, priority/state normalizers). AWS additionally has:

- Full Prisma domain schema (prod Prisma is Ticket stub only)
- `localAuth` JWT stack
- Primary S3 proof storage (vs additive replication)

No production-only Express mounts found relative to AWS `app.js` (see API gap report).

---

## Behavioral gap (not a named post-clone commit, discovered in comparison)

**Dashboard resolved KPI date semantics**

- Prod: date range filters `resolved_at` for resolved counts  
- AWS: `countResolvedTicketsWithDateFilter` also includes `openedAt` from `buildDashboardTicketWhere`

**Status:** 🟡 PARTIAL / drift  
**Risk:** Medium for dashboard accuracy under date filters
