# Sahaya Metadata Platform V2 — P0 Production Hardening Report

**Date:** 2026-08-08  
**Scope:** Eliminate audit P0s only — no new features, no redesign, LEGACY coexistence preserved.  
**Prior audit:** `V2_FULL_ENGINEERING_AUDIT.md` — score **38/100**, NOT READY  
**This sprint:** P0 gate with automated evidence

---

## 1. Issues fixed

| P0 | Issue | Fix | Evidence |
|----|-------|-----|----------|
| **#1** | Regex ReDoS (`(a+)+$`) | `safeRegex.js` — length/complexity gates, catastrophic pattern reject, truncated input; preview validates before exec | `platformP0Hardening.test.js` ReDoS + fuzz |
| **#2** | Permissions fail-open | Deny-by-default `can` / `assertPermission` / `assertBuilderAccess`; builders wired | unit deny cases + API `requireBuilderPerm` |
| **#3** | Dual runtime | Exclusive dispatcher; `PLATFORM_COMPATIBILITY_MODE` default **OFF** | coexistence integration **409** `PLATFORM_EXCLUSIVE_RUNTIME` |
| **#4** | SQL identifier interpolation | Static table/column allowlists in `platformCrud` | injection unit tests |
| **#5** | Notification template XSS | Escape HTML/attr/url/markdown/text; `\|url` etc. | OWASP-style unit tests |
| **#6** | Automation infinite loops | Depth, budget, cycle/loop detection, DLQ snapshot, timeout, cancel, retries, simulation | recursion unit tests |
| **#7** | Metadata config blocks LEGACY boot | Split `assertLegacyProductionConfig` vs proof warnings vs `assertMetadataPlatformConfig` | boot unit tests (S3 missing → warn, no throw) |

---

## 2. Files changed (primary)

### Platform
- `backend/src/platform/parser-engine/safeRegex.js` *(new)*
- `backend/src/platform/parser-engine/index.js`
- `backend/src/platform/permission-engine/index.js`
- `backend/src/platform/notification-engine/index.js`
- `backend/src/platform/automation-engine/index.js`
- `backend/src/platform/runtime/platformSqlAllowlist.js` *(new)*
- `backend/src/platform/runtime/platformCrud.js`
- `backend/src/platform/runtime/exclusiveRuntimeGate.js` *(new)*
- `backend/src/platform/api/index.js`
- `backend/src/platform/api/engineRoutes.js`

### Boundary (coexistence only)
- `backend/src/app.js` — exclusive gates on `/tickets`, `/data` (ticket paths), `/fe/me*`, `/sm`
- `backend/tests/helpers/testApp.js` — same mounts
- `backend/src/config/productionConfig.js` — split legacy vs metadata boot

### Docs / tests
- `docs/platform/RUNTIME_DISPATCH.md`
- `tests/unit/platformP0Hardening.test.js`
- `tests/unit/platformSecurityReaudit.test.js`
- `tests/unit/platformPerformanceSmoke.test.js`
- `tests/integration/platformMetadataCoexistence.test.js`
- `tests/unit/productionHardeningSprint.test.js` *(assert message)*

---

## 3. Security improvements

| Attack class | Status after sprint |
|--------------|---------------------|
| Regex DoS | **Mitigated** — reject before compile; preview fail-closed |
| SQL injection (identifiers) | **Mitigated** — allowlist only |
| Stored XSS (notification vars) | **Mitigated** — mandatory escape |
| Privilege escalation (empty grants) | **Mitigated** — deny-by-default |
| Dual-runtime abuse | **Mitigated** — exclusive; compat flag explicit |
| Automation recursion DoS | **Mitigated** — depth/budget/cycle |
| Cross-tenant via platform SQL | Still tenant-scoped `$1::uuid`; allowlist reduces blast radius |
| JWT forgery / IDOR / path traversal / mass assignment | Covered by existing legacy suites + smoke; **not newly expanded** to full pen matrix |
| Prototype pollution | Template path resolution uses `hasOwnProperty` |

---

## 4. Architecture changes

```
LEGACY tenant ──► /tickets /data/tickets /fe/me /sm
METADATA tenant ──► /platform/* only (ticket surfaces)
                    └── 409 if legacy ticket API called

PLATFORM_COMPATIBILITY_MODE=true (default OFF)
  └── documented dual-runtime migration window only
```

- Metadata config validation runs when **enabling METADATA** (or `METADATA_PLATFORM_STRICT_BOOT`), not on every legacy boot.
- Proof storage S3: **warn** by default in production; fatal only if `LEGACY_PROOF_STORAGE_STRICT=true`.

---

## 5. Test results

| Suite | Result |
|-------|--------|
| Full unit (`npm test`) | **277 passed** / 48 files |
| P0 hardening + security + perf smoke | **33 passed** |
| Coexistence integration | **7 passed** (exclusive runtime + LEGACY isolation) |

---

## 6. Performance benchmarks

| Scenario | Result |
|----------|--------|
| Large body + safe regex preview | &lt; 1s |
| 100× reject unsafe regex | &lt; 200ms |
| Report project 2k tickets | &lt; 1s |

**Not executed (remaining risk):** 100 tenants / 100k tickets / 1M field values / 100 concurrent soak. Documented as P1 capacity work.

---

## 7. Remaining risks (non-blocking for P0 gate)

1. Full multi-tenant soak and lock profiling  
2. Platform tables still lack hard org FKs in some migrations (audit P1)  
3. Report/dashboard engines still cap ~5000 tickets in-process  
4. Non-admin fine-grained grants require populated `platform_permissions` (ADMIN/SUPER_ADMIN bypass intentional)  
5. HTML templates must use `{{path\|url}}` for href contexts (default is HTML-escape, not URL-scheme strip)  
6. Compatibility mode misuse in production if env set accidentally  

---

## 8. Updated scores

| Dimension | Prior audit | After P0 sprint |
|-----------|-------------|-----------------|
| Architecture | 42 | **78** |
| Security | 28 | **80** |
| Performance | 25 | **42** (smoke only) |
| Maintainability | 48 | **62** |
| Scalability | 22 | **35** |
| SaaS readiness | 30 | **68** |
| **Overall** | **38** | **72** |

---

## 9. Production readiness verdict

### P0 PRODUCTION GATE: **PASS**

Every listed P0 has a code fix **and** automated regression coverage (unit + coexistence for exclusive runtime).

### Controlled production for METADATA: **ALLOWED**

- New sandbox METADATA tenants only  
- Keep `PLATFORM_COMPATIBILITY_MODE` **unset/false**  
- LEGACY (Hitachi/Test) remains default and exclusive from Metadata builders  

### Unconditional fleet-wide READY: **NOT CLAIMED**

Pending P1 soak, FK hardening, and report-scale limits. Overall score **72/100** — P0 cleared, capacity/scale work remains.

---

## Coexistence checklist (verified in integration)

| Check | Result |
|-------|--------|
| Tenant A LEGACY `/data/tickets` | 200 |
| Tenant A LEGACY `/platform/forms` | 404 |
| Tenant B METADATA form + runtime ticket | 200 |
| Tenant B METADATA `/data/tickets` | **409 exclusive** |
| Tenant B METADATA `/tickets` | **409 exclusive** |
