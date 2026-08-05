# Production API Gap Report

**Mount source:** `src/app.js` in both backends  
**Method:** Route registration comparison + post-divergence commit diffs

---

## Headline

**Production has no Express routes that AWS lacks.**  
AWS adds routes/middleware for local auth, org PATCH, proof signed URLs, and internal Phase A probe.

---

## Shared mounts (both)

| Mount | Notes |
|-------|-------|
| `/tickets` | create, import preview/confirm, list, bulk-assign, assign, reassign, reject, on-site-token, close, review-complete |
| `/data` | dashboard, FEs, configs, tickets, clients, orgs, users, raw-emails, audit-logs, SLA, analytics, insights, platform overview |
| `POST /fe/proof` | Public FE proof upload |
| `/fe` | public context + me tickets/status-action |
| `/auth/public` | orgs, forgot-password, access-tokens |
| `/auth` | provision-user, me, provision/admin |
| `/field-executives` | POST, PATCH |
| `/complaint-points` | CRUD + disable + regenerate-token |
| `/public` | OTP + complaint submit |
| `/admin/users` | organisation, approval, status |
| `/fe/action/:token` | feActions |
| `/health`, `/internal/ticket-resolved`, `/postmark-webhook` | ops |
| Admin SMS test posts | present |

---

## AWS-only routes / mounts

| Route | Evidence |
|-------|----------|
| `/auth/*` localAuth (login, refresh, logout, change-password, reset-password, signup…) | `src/routes/localAuth.js` mounted in AWS `app.js` |
| `POST /auth/public/reset-password` | AWS `publicAuth.js` |
| `GET /data/tickets/:id/comments/:commentId/proofs/:index/url` | AWS `dataApi.js` |
| `PATCH /data/organisations/:id` | AWS `dataApi.js` |
| `POST /internal/phase-a-db-probe` | AWS `app.js` |

---

## Changed response / validation (production newer)

### `GET /data/analytics/summary` — commit `860d3b9`

| Field | Prod | AWS |
|-------|------|-----|
| `tickets` | ✅ | ✅ |
| `sla` | ✅ | ✅ |
| `field_executives` | ✅ | ✅ |
| `ticket_assignments` | ✅ | ✅ |
| `staff_users` | ✅ | ❌ MISSING |

Query params (`clientSlug`, `state`, `startDate`, `endDate`): present on both.

### `POST /fe/proof` — commit `b02ecda`

| Validation | Prod | AWS |
|------------|------|-----|
| Max images 10 | ✅ `TOO_MANY_IMAGES` | ❌ none |

### Dashboard stats date semantics (drift)

Same query params; AWS resolved-count applies `openedAt` **and** `resolvedAt` — prod filters resolved by `resolved_at` only.

---

## Permission / gate flags (both)

`BULK_ASSIGN_ENABLED`, `BULK_TICKET_IMPORT_ENABLED`, `TENANT_CLIENTS_ENABLED`, `PROVISION_SERVER_SIDE_ENABLED`, `PUBLIC_COMPLAINTS_ENABLED`, `DAILY_TENANT_REPORT_ENABLED`, `USE_SOURCE_AWARE_TICKET_NUMBERS`, SMS/S3 toggles.

Unable to verify runtime env values on TEST vs production (filesystem audit only).

---

## Orphan route files (both)

- `src/routes/index.js` stub — not mounted  
- `src/routes/feProofs.js` — not mounted by `app.js`  
- `src/routes/debugWhatsapp.js` — not mounted on either `app.js`
