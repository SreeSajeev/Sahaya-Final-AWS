# Sahaya-Final-AWS — Platform Feature Inventory

**Generated for:** Platform Validation Framework  
**Mode:** Code-derived only (no invented product claims)  
**Source roots:** `backend/`, `frontend/`, `e2e/`

---

## Honest scope note

The following are **requested in the QA brief but do not exist** as first-class product modules in this repository:

| Requested | Reality |
|-----------|---------|
| Branches | No Branch model/API/UI |
| Assets CMDB | No Asset inventory; only string `asset_reference` / metadata field type |
| Platform Admin / Viewer / Support roles | Only `SUPER_ADMIN`, `ADMIN`, `STAFF`, `FIELD_EXECUTIVE`, `CLIENT` |
| Organisation Admin (separate from ADMIN) | Tenant `ADMIN` is the org admin |
| Swagger / OpenAPI | Not present |
| Redis / Bull / SQS | DB table queues + `setInterval` workers only |
| SSO / MFA | Not present |

Validation suites mark these **N/A (not implemented)** rather than failing false-negatives.

---

## 1. Authentication & sessions

| Feature | Status | Evidence |
|---------|--------|----------|
| Login (password) | ✓ | `POST /auth/login` |
| Logout | ✓ | `POST /auth/logout` |
| Logout all | ✓ | `POST /auth/logout-all` |
| Refresh + rotation | ✓ | `POST /auth/refresh` |
| Change password | ✓ | `POST /auth/change-password` |
| Forgot / reset password | ✓ | `/auth/forgot-password`, `/auth/reset-password` |
| First-login password setup | ✓ | Same forgot path when `password_hash` null |
| Signup (pending) | ✓ | `POST /auth/signup` STAFF\|FE |
| Approval workflow | ✓ | `PATCH /admin/users/:id/approval` |
| Deactivate user | ✓ | `PATCH /admin/users/:id/status` |
| Provision admin path | ✓ gated | `PROVISION_SERVER_SIDE_ENABLED` |
| Argon2id hashing | ✓ | `passwordService` |
| Account lockout after N fails | ✗ / partial | Pending/rejected/deactivated blocked; no discrete lockout counter API |
| MFA / SSO | ✗ | — |

## 2. Organisations & tenancy

| Feature | Status |
|---------|--------|
| Create organisation | ✓ SUPER_ADMIN |
| List / patch organisations | ✓ |
| Cross-tenant stats / platform overview | ✓ SUPER_ADMIN |
| Tenant isolation via `organisation_id` | ✓ |
| Move user between orgs | ✓ SUPER_ADMIN |

## 3. Users & workforce

| Feature | Status |
|---------|--------|
| List users | ✓ |
| Create STAFF / FE / CLIENT (provision) | ✓ gated |
| Field executive CRUD | ✓ |
| Service Manager = STAFF role | ✓ |
| Client portal users (`CLIENT` + `client_slug`) | ✓ |

## 4. Clients & masters

| Feature | Status |
|---------|--------|
| Tenant clients CRUD | ✓ gated `TENANT_CLIENTS_ENABLED` |
| Client vehicles import/export | ✓ |
| Resolution locations CRUD/import/export | ✓ |
| Complaint points (QR) | ✓ gated `PUBLIC_COMPLAINTS_ENABLED` |

## 5. Tickets (LEGACY)

| Feature | Status |
|---------|--------|
| Manual create | ✓ |
| Email → ticket worker | ✓ |
| Bulk import | ✓ gated |
| List / filter / get | ✓ role-scoped |
| Assign FE / SM | ✓ |
| Reassign | ✓ |
| Bulk assign | ✓ gated |
| Assignment context images | ✓ |
| Review complete (NEEDS_REVIEW→OPEN) | ✓ |
| Reject + evidence | ✓ |
| Close / verify | ✓ |
| Comments | ✓ |
| Hide proof images | ✓ |
| Status machine | ✓ |
| Ticket numbering (source-aware) | ✓ |

**Statuses:** OPEN, ASSIGNED, EN_ROUTE, ON_SITE, FE_ATTEMPT_FAILED, RESOLVED_PENDING_VERIFICATION, RESOLVED, REJECTED, NEEDS_REVIEW, REOPENED

## 6. FE / SM portals

| Feature | Status |
|---------|--------|
| FE my tickets / remarks | ✓ |
| FE status-action (on-site / work complete) | ✓ |
| Magic-link proof upload | ✓ `POST /fe/proof` |
| SM my tickets | ✓ |
| SM resolution proof + submit verification | ✓ |
| FE video proof binary upload | ✗ UI stub only |

## 7. Metadata platform

| Feature | Status |
|---------|--------|
| LEGACY default | ✓ |
| Enable METADATA (SUPER_ADMIN only) | ✓ |
| Exclusive runtime (legacy APIs 409) | ✓ |
| Forms / publish / versions | ✓ |
| Workflows, assignments, notifications, reports, dashboards, automations, AI, plugins builders | ✓ |
| Runtime tickets + transition | ✓ |
| Registry / engines / search | ✓ |
| Compatibility mode | ✓ env |

## 8. Notifications

| Feature | Status |
|---------|--------|
| Postmark email (assign, reset, resolution, rejection, daily report) | ✓ |
| Airtel SMS | ✓ gated |
| WhatsApp primary channel | ✗ diagnostic only |
| In-app notification center | ✗ |

## 9. Storage

| Feature | Status |
|---------|--------|
| FE proof S3 private + presign | ✓ gated |
| Proof backup queue (Postgres) | ✓ |
| Assignment context images | ✓ |
| General document library | ✗ |

## 10. Reporting / audit / SLA

| Feature | Status |
|---------|--------|
| Dashboard stats | ✓ |
| Analytics summary + FE/SM scorecards (UI) | ✓ |
| Audit logs + backfill | ✓ |
| SLA monitor + tenant SLA config | ✓ |
| Daily tenant report worker | ✓ gated |
| CSV/Excel ops exports (frontend) | ✓ |

## 11. Security controls

| Feature | Status |
|---------|--------|
| JWT access + refresh cookie | ✓ |
| Role middleware | ✓ |
| Tenant scoping | ✓ |
| Rate limits (login, OTP, FE proof, global soft) | ✓ |
| Helmet + CORS | ✓ |
| Request IDs | ✓ |
| Exclusive METADATA gate | ✓ |

## 12. Frontend surfaces

| Surface | Paths |
|---------|-------|
| Staff CRM | `/app/*` |
| FE portal | `/fe`, `/fe/ticket/:id` |
| SM portal | `/sm` |
| Client portal | `/app/client/*` |
| Super-admin | `/app/platform`, `/app/organisations`, `/super-admin*` |
| Metadata | `/app/metadata/*` (ADMIN+, not in main sidebar) |
| Public | landing, login, FE action token, public complaint (flag) |

## 13. Existing automated tests (baseline)

- Unit: `npm test`
- Repo: `npm run test:repo`
- Integration: `npm run test:integration`
- Platform validation (this framework): `npm run test:platform-validation`
- Playwright e2e: `e2e/specs/*`
- Shell acceptance: `backend/scripts/acceptance-*.sh`
