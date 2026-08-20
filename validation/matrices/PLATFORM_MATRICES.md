# Platform Validation Matrices (code-derived)

## Role Permission Matrix (implemented roles only)

| Capability | SUPER_ADMIN | ADMIN | STAFF | FIELD_EXECUTIVE | CLIENT |
|------------|:-----------:|:-----:|:-----:|:---------------:|:------:|
| Login / refresh / logout | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create organisation | ✓ | ✗ | ✗ | ✗ | ✗ |
| Org cross-tenant stats | ✓ | ✗ | ✗ | ✗ | ✗ |
| Enable METADATA mode | ✓ | ✗ | ✗ | ✗ | ✗ |
| Manual ticket create | ✓ | ✓ | ✓ | ✗ | ✓ |
| Assign / reassign | ✓ | ✓ | ✓ | ✗ | ✗ |
| Close / reject / review | ✓ | ✓ | ✓ | ✗ | ✗ |
| List tenant tickets | ✓ | ✓ | ✓ | scoped | scoped |
| FE portal `/fe/me/*` | ✓* | ✗ | ✗ | ✓ | ✗ |
| SM portal `/sm/me/*` | ✓ | ✓ | ✓ | ✗ | ✗ |
| Audit logs | ✓ | ✓ | ✓ | ✗ | ✗ |
| Approve users | ✓ | ✓ | ✗ | ✗ | ✗ |
| Clients CRUD (flag) | ✓ | ✓ write | read | ✗ | ✗ |
| Public complaint admin | ✓ | ✓ | ✗ | ✗ | ✗ |

\* SUPER_ADMIN may hit FE routes if role middleware allows SUPER_ADMIN on status-action; list portals remain role-scoped.

Fictional roles (**Viewer, Support, Platform Admin, Organisation Admin**): **N/A — not in codebase**.

---

## Tenant Isolation Matrix

| Probe | Expected |
|-------|----------|
| Admin A reads ticket B | 403/404 |
| Admin A comments on ticket B | 403/404 |
| Admin A assigns FE-B to ticket A | 403 |
| Client A lists tickets | only own `client_slug` |
| FE A lists tickets | only assigned |
| Org stats | SUPER_ADMIN only |
| METADATA exclusive | METADATA org → 409 on legacy ticket APIs |

---

## Ticket Lifecycle Matrix

| Step | API / mechanism | Assert |
|------|-----------------|--------|
| Create | `POST /tickets` | 200/201 |
| Assign FE | `POST /tickets/:id/assign` | status ASSIGNED |
| On-site | FE status-action or proof | ON_SITE |
| Work complete | FE / auto token | RESOLVED_PENDING_VERIFICATION |
| Close | `POST /tickets/:id/close` | RESOLVED (or 400 missing proof) |
| Reject | `POST /tickets/:id/reject` | REJECTED |
| SM path | assign SM → proof → submit-verification | pending verification |
| Audit | `GET /data/audit-logs` | 200 |
| Metrics | dashboard + analytics | 200 |

---

## Metadata Platform Matrix

| Item | Status |
|------|--------|
| Settings GET (LEGACY readable) | ✓ |
| METADATA enable SUPER_ADMIN only | ✓ |
| Builders + runtime | ✓ METADATA |
| Legacy coexistence | exclusive 409 |
| Branches/Assets as domain | ✗ N/A |

---

## File Storage Matrix

| Item | Status |
|------|--------|
| Image proofs (JPEG/PNG/WebP) | ✓ |
| PDF/DOCX/Excel as FE proofs | ✗ not primary FE path |
| S3 enabled/disabled | ✓ env |
| Presigned GET | ✓ |
| Corrupt/invalid mime | validated in proof controller |
| Video binary | ✗ stub |

---

## API Coverage (validation suite)

Executable suites under `backend/tests/platform-validation/`:

| Suite | Focus |
|-------|-------|
| 01-lifecycle | Empty-ish DB → full FE/SM flows |
| 02-tenant-isolation | A/B/C tenants |
| 03-role-matrix | Allow/deny matrix |
| 04-security-fuzz | Authz, malformed, IDOR, injection strings |
| 05-metadata | LEGACY/METADATA gates |
| 06-api-surface | ~40 endpoint smoke |
| 07-gaps-na | Documented N/A |
| 08-stress-smoke | Bounded volume |

Plus baseline: `npm test`, `test:repo`, `test:integration`, Playwright `e2e/`.
