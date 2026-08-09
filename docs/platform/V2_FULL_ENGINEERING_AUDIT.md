# Sahaya Metadata Platform V2 — Full Engineering Audit & Validation

**Audit type:** Adversarial validation (architect / QA / security / performance / SRE / pentest / release)  
**Date:** 2026-08-08  
**Scope:** Metadata Platform V2 + coexistence with frozen Sahaya V1  
**Rule followed:** Findings only — **no fixes applied**

---

## Executive verdict

### NOT READY FOR PRODUCTION (as a Metadata Platform)

**Production Readiness Score: 38 / 100**

| Dimension | Score | Notes |
|-----------|------:|-------|
| Architecture | 42 | Isolation intent is clear; METADATA does not exclusive-gate legacy runtime |
| Security | 28 | ReDoS, permission bootstrap-open, SQL identifier interpolation, XSS templates |
| Performance | 25 | No 100k soak; report/dashboard load 5k rows; ReDoS proven ~7s |
| Maintainability | 48 | Engines exist but thin; stubs; ~2.1k LOC platform; incomplete contracts |
| Scalability | 22 | Missing FKs/org integrity; no workers/queues; uncapped fan-out risk |
| SaaS Readiness | 30 | Builders/API foundation only; not enterprise-complete |

**Legacy Sahaya (LEGACY tenants):** Regression suite **passes** (unit 244, integration 44). Platform code does **not** import legacy ticket services. However this branch also contains **prior hardening edits** to legacy files (`tenantContext.js`, `ticketController.js`, `assertProductionConfig` in `app.js`) that **do** change production boot and tenant-null behavior — those are separate from `/platform` but ship together.

**Do not claim Metadata V2 production-ready.** Multiple **P0** issues have live evidence.

---

## Step 1 — Legacy regression audit

### Evidence

| Suite | Result |
|--------|--------|
| `npm test` (unit) | **244 passed** |
| Integration (auth, FE lifecycle, SM, security isolation, hardening authz, email, tickets, reports, platform coexistence) | **44 passed** |

### What this proves

- Core legacy API paths exercised by CI still respond.
- Cross-tenant isolation tests still pass.
- FE/SM lifecycle regression tests still pass.

### What this does **not** prove

- Exhaustive manual QA of every UI surface, email template, export, image hide, vehicle master, SLA cards, etc. in a production-like environment.
- Zero behavior change vs pre-hardening commit: `tenantContext.isTenantAllowed` now **denies** null `organisation_id` (was allow). That is a **behavior change** for orphan rows.

### Issues

#### L-1 — Legacy tenant-null policy changed (shipped with this branch)

- **Severity:** High (for “zero legacy change” absolute requirement)
- **Location:** `backend/src/middleware/tenantContext.js` lines **69–70**
- **Description:** `isTenantAllowed` now returns `false` when `resourceOrgId` is null/empty (previously `true`).
- **Root cause:** Production hardening sprint security fix.
- **Impact:** Orphan/legacy rows without `organisation_id` become inaccessible to tenant users.
- **Reproduce:** Call any scoped API against a resource with `organisation_id = null` as non–super-admin → deny.
- **Suggested fix:** Keep deny for new data; document migration for orphans; or feature-flag. Not a Metadata-layer bug, but violates “nothing changed.”
- **Regression risk:** Medium for tenants with historical null-org rows.

#### L-2 — Production boot fail-fast may block Hitachi deploy

- **Severity:** Critical (ops / release)
- **Location:** `backend/src/app.js` (~787) calling `assertProductionConfig`; `backend/src/config/productionConfig.js` lines **48–50**
- **Description:** Production refuses start unless `S3_FE_PROOFS_ENABLED=true` (and other secrets).
- **Root cause:** Hardening requirement wired into boot.
- **Impact:** Legacy deploy without S3 proofs config **will not start**.
- **Reproduce:** `NODE_ENV=production` without S3 enabled → throw `[FATAL] Production config invalid`.
- **Suggested fix:** Confirm prod env checklist before release; or stage flag.
- **Regression risk:** High if env incomplete.

#### L-3 — Incomplete exhaustive UI regression

- **Severity:** Medium
- **Location:** N/A (test coverage gap)
- **Description:** No automated E2E covering every listed legacy feature (vehicles UI, close forms UI, worksheet export UI, etc.).
- **Suggested fix:** Expand Playwright/Cypress matrix against LEGACY tenant.
- **Regression risk:** Unknown unknowns.

---

## Step 2 — Coexistence testing

### Evidence (live probe)

`METADATA` org with settings row `mode=METADATA`:

```text
AUDIT_EVIDENCE {"legacyStatus":200,"legacyItems":1,"platformFormsStatus":200}
```

Same tenant successfully:

1. Lists **legacy** tickets via `GET /data/tickets`
2. Lists **platform** forms via `GET /platform/forms`

### Issues

#### C-1 — METADATA does not disable legacy ticket system (architecture violation)

- **Severity:** Critical
- **Location:** No gate in `backend/src/routes/tickets.js` / `dataApi.js` / FE/SM routers. Confirmed: `legacy_routes_with_mode_gate: none`. Gate only in `backend/src/platform/runtime/metadataRuntime.js` for `/platform/*`.
- **Description:** Spec required: when `mode=METADATA`, legacy ticket system is never used. Implementation only adds a parallel `/platform` stack.
- **Root cause:** Incomplete runtime switch (boundary mount only).
- **Impact:** Dual runtimes, dual data models, operator confusion, split reporting, security policy drift per org.
- **Reproduce:** Set org METADATA → create legacy ticket via `/tickets` or `/data` → still works; create `platform_tickets` → also works.
- **Suggested fix:** Single dispatcher: METADATA org → reject legacy ticket mutations (or proxy); LEGACY → reject platform runtime. Keep reads carefully versioned.
- **Regression risk:** High if naïvely blocking without migration plan.

#### C-2 — Shared auth / tenant middleware is acceptable; shared ticket business logic mostly avoided

- **Severity:** Info / Low
- **Description:** Platform imports `requireAuth`, `attachTenantContext`, `prisma` — allowed. No imports of `assignmentService` / `emailService` / `ticketQueryRepository` under `src/platform` (grep clean).
- **Impact:** Good isolation of domain logic; auth sharing is correct.

#### C-3 — Naming collision `/platform`

- **Severity:** Medium
- **Location:** `backend/src/routes/dataApi.js` `GET /data/platform/overview` vs `app.use("/platform", platformRouter)` and frontend `/app/platform` (SaaS) vs `/app/metadata`.
- **Description:** Overloaded “platform” vocabulary increases operator/dev error risk (not a runtime clash on same path).
- **Suggested fix:** Rename Metadata APIs to `/metadata/*` long-term; keep aliases.

---

## Step 3 — Database validation

### Evidence

- Platform migrations under `*platform*` contain **no** `ALTER`/`DROP`/`TRUNCATE` of legacy tables (grep + unit `platformMigrationSafety`).
- `20260808020000`: some FKs among platform form/workflow/parser/ticket_events.
- `20260808030000`: **no** `REFERENCES` / FK clauses at all.

### Issues

#### D-1 — V2 engine tables lack FK to `organisations` and mostly lack inter-table FKs

- **Severity:** High
- **Location:** `backend/prisma/migrations/20260808030000_platform_v2_engines/migration.sql` (entire file)
- **Description:** `organisation_id` is UUID without FK; `platform_ticket_data.platform_ticket_id` not FK-enforced in V2 file; states/transitions not FK to workflow versions.
- **Impact:** Orphans, silent integrity breaks, hard cleanup.
- **Suggested fix:** Additive FK migration with `ON DELETE CASCADE`/`RESTRICT` carefully chosen.
- **Regression risk:** Low if additive.

#### D-2 — No transactional publish across form + fields + artifact_versions

- **Severity:** High
- **Location:** `backend/src/platform/forms/formService.js` (`publishFormVersion`); `builders/versioning.js`
- **Description:** Multiple raw SQL statements without explicit transaction boundary.
- **Impact:** Partial publish on mid-failure.
- **Suggested fix:** `prisma.$transaction` / single SQL CTE.

#### D-3 — Prisma schema not fully modeling new platform tables

- **Severity:** Medium
- **Location:** `backend/prisma/schema.prisma` (only minor diff vs HEAD; platform tables accessed via raw SQL)
- **Description:** Runtime uses `$queryRawUnsafe` primarily — schema drift risk, no client types.
- **Suggested fix:** Add Prisma models for platform_* (additive).

#### D-4 — Migrations appear idempotent (`IF NOT EXISTS`)

- **Severity:** Info (positive)
- **Description:** Re-run safe for create-table style.

---

## Step 4 — Engine validation (summary)

| Engine | Validation | Txn | Concurrency | Security | Perf | Versioning | Tenant | Audit |
|--------|------------|-----|-------------|----------|------|------------|--------|-------|
| Form | Partial | No | N/A | Weak scale limits | OK small | Form versions yes | Via org SQL | Partial |
| Workflow | Weak (no cycle/orphan rules) | No | Race on status update | Empty roles = allow all | OK | Artifact optional | Via API gate | Partial |
| Parser | Regex unbounded | No | N/A | **ReDoS Critical** | Fail | No | Via API | No |
| Automation | No loop detection | No | N/A | Fan-out unrestricted | Fail | No | Via API | No |
| Notification | Minimal | No | N/A | **XSS** | OK | Templates table | Via API | No |
| Assignment | Basic | No | Cursor race | OK-ish | OK | No | Via API | No |
| Permission | Bootstrap-open | N/A | N/A | **Critical** | OK | No | Not enforced on routes | No |
| Report/Dashboard | Cap 5000 | No | N/A | Authz role-only | Weak | No | Org list | No |
| Search | ILIKE | No | N/A | OK | Weak at scale | No | Org | No |
| AI | Stub | No | N/A | N/A | N/A | Table only | Org | No |
| Plugin | URL check only | No | N/A | No sandbox | N/A | No | Org | No |

---

## Steps 5–14 — Builder / load audits (adversarial)

### Form builder

#### F-1 — Empty schema accepted

- **Severity:** Medium  
- **Location:** `form-engine/index.js` `validateFormDefinition` (empty `fields: []` → ok)  
- **Evidence:** Probe `FORM-EMPTY`  
- **Suggested fix:** Require ≥1 non-layout field for publish.

#### F-2 — No caps on field count / nesting / repeater depth

- **Severity:** High (DoS / UX)  
- **Location:** `form-engine/index.js`; publish APIs  
- **Description:** 2000 fields validates in ~2ms CPU but error payload huge; no max fields, no circular conditional detection.  
- **Suggested fix:** Hard caps (e.g. 200 fields), cycle detection on visibility graphs.

### Workflow

#### W-1 — Circular transitions accepted

- **Severity:** High  
- **Location:** `workflow-engine/index.js` lines **9–34**  
- **Evidence:** `WF-CIRCULAR` probe  
- **Suggested fix:** Optional warn/block cycles; require terminal path analysis.

#### W-2 — Empty `roles: []` allows any role

- **Severity:** High  
- **Location:** `workflow-engine/index.js` line **48**  
- **Evidence:** VIEWER closed ticket when roles empty  
- **Suggested fix:** Empty roles = deny (or only system).

#### W-3 — Transition race not verified by count

- **Severity:** Medium  
- **Location:** `runtime/ticketRuntime.js` status `UPDATE` without checking rowcount → conflict  
- **Suggested fix:** Return 409 when `rowCount=0`.

### Email parser

#### P-1 — Catastrophic ReDoS (proven)

- **Severity:** Critical  
- **Location:** `parser-engine/index.js` line **23** `new RegExp(rule.pattern, …)`  
- **Evidence:** Pattern `(a+)+$` on 25×`a`+`!` → **~6897ms**  
- **Impact:** Single preview request can stall event loop (DoS).  
- **Suggested fix:** Regex timeout/complexity analyzer; deny nested quantifiers; run in worker with timeout.  
- **Regression risk:** Low if reject unsafe patterns.

### Automation

#### A-1 — No loop / retry storm protection

- **Severity:** Critical  
- **Location:** `automation-engine/index.js` `simulateAutomation`  
- **Evidence:** Plan allows `emit_event` back to same trigger type; no depth/budget.  
- **Suggested fix:** Execution DAG depth limit, cycle detection, per-tenant rate budget, dead-letter.

### Permissions

#### R-1 — Empty permissions allow everything

- **Severity:** Critical  
- **Location:** `permission-engine/index.js` lines **33–34**  
- **Evidence:** `assertPermission([], 'admin', 'delete_all')` → `{ ok:true, bootstrap:true }`  
- **Impact:** If ever wired as sole gate → privilege escalation. Currently many routes use `requireRole(ADMIN)` instead — engine itself is unsafe.  
- **Suggested fix:** Fail closed; bootstrap only under SUPER_ADMIN setup flag.

#### R-2 — Permission engine not enforced on `/platform` CRUD

- **Severity:** High  
- **Location:** `platform/api/index.js` / `engineRoutes.js` — only `requireRole(ADMIN_ROLES)`  
- **Description:** Field-level / workflow permissions unused.  
- **Suggested fix:** Enforce `assertPermission` per resource.

### Notifications

#### N-1 — HTML/XSS via unescaped template variables

- **Severity:** High  
- **Location:** `notification-engine/index.js` lines **14–24**, **33–34**  
- **Evidence:** `{{name}}` with `<script>` rendered into `bodyHtml` unchanged  
- **Suggested fix:** Context-aware escape (HTML/attr/JS); sanitize HTML templates.

### Reports / dashboards / search / notifications scale

#### S-1 — Reports/dashboards load up to 5000 tickets into memory

- **Severity:** High  
- **Location:** `engineRoutes.js` lines **101**, **109**  
- **Suggested fix:** SQL aggregates, cursor pagination, streaming exports.

#### S-2 — No 100k ticket / 1M comment soak executed

- **Severity:** High (evidence gap)  
- **Description:** Required stress tests not run; cannot claim performance readiness.

#### S-3 — Plugin “sandbox” does not exist

- **Severity:** High  
- **Location:** `plugin-engine/index.js` — URL protocol check only  
- **Suggested fix:** No arbitrary code execution; signed webhooks; egress allow-list; SSRF protections.

---

## Step 15 — Security audit (pentest-style)

| Attack | Result | Severity |
|--------|--------|----------|
| ReDoS via parser regex | **Confirmed** ~6.9s | Critical |
| XSS in notification HTML | **Confirmed** | High |
| Permission bootstrap open | **Confirmed** | Critical |
| SQL table/column string interpolation | **Confirmed** pattern (`platformCrud.js:14,89,103`) — today callers pass constants, but **no allowlist** → future injection footgun | Critical |
| METADATA dual runtime / IDOR across systems | Dual path confirmed | Critical (arch) |
| JWT forge / expired | Relies on shared auth — not re-broken by platform; not newly tested here | — |
| SSRF via webhook URL | Only http/https check; no private-IP block | High |
| CSRF | Cookie auth + no CSRF tokens on mutating `/platform` (same as app baseline) | Medium |
| Rate limit on `/platform` | Global limiter only; no parser-preview specific limit | Medium |
| Path traversal uploads | Platform file table exists; no hardened upload pipeline audited | High (gap) |
| Mass assignment | JSON configs accepted broadly | Medium |
| Prototype pollution | `Object` spreads on configs; limited | Low–Medium |
| OpenAPI contract | **Missing** | Medium |

---

## Step 16 — Performance

- No 100-tenant / 100k-ticket / concurrent upload suite run.
- ReDoS alone demonstrates event-loop risk.
- Report path materializes up to 5k rows per request.
- Search uses `ILIKE '%'||q||'%'` — non-sargable at scale despite gin index on `search_text` (query path often bypasses tsquery).

**Performance Score rationale: 25/100.**

---

## Step 17 — Frontend

- `/app/metadata` lazy routes exist; build passes.
- Many builders are stubs — not production UX.
- No a11y / memory-leak / offline audit performed.
- Adding routes to `App.tsx` is a boundary change; legacy pages not replaced (positive).

---

## Step 18 — API contracts

- No OpenAPI for `/platform/*`.
- Inconsistent error shapes (`code` sometimes present).
- Pagination partial; no stable sort contract docs.
- Zod barely used in platform layer.

---

## Step 19 — Code quality

- Placeholder modules (`platform/email/index.js` etc. export string only).
- Dual form validators historically (shim now re-exports engine) — OK.
- Raw SQL ubiquity without query builder.
- Dead risk: unused permission engine vs routes.
- Docs claim stronger readiness than evidence supports (`V2_ARCHITECTURE_DEPLOYMENT_REPORT.md`).

---

## Step 20 — Final release review

### Architecture

Intentional side-by-side layering is directionally correct. **Fails** exclusive METADATA runtime requirement (C-1).

### Security

Multiple Critical findings with reproduction. **Fails** release bar.

### Performance / Scalability

Unproven at required load; ReDoS and 5k materialization are red flags.

### Maintainability

Readable small engines; incomplete product surface; raw SQL drift.

### Migration

Additive platform SQL is good. Combined branch’s legacy behavior/boot changes must be release-managed explicitly.

### Testing

Unit engines + coexistence smoke are useful but **far below** the audit charter (1000 emails, 100k tickets, full pentest automation, etc.).

---

## Prioritized backlog

### P0 — must fix before any METADATA production tenant

1. **P-1 ReDoS** — regex execution guard / worker timeout  
2. **R-1 Permission fail-closed** — remove bootstrap-open  
3. **C-1 Exclusive runtime switch** — METADATA must not freely use legacy ticket APIs (or explicitly amend product policy & docs)  
4. **SQL identifier allowlist** in `platformCrud.js`  
5. **L-2 Confirm prod env** for `assertProductionConfig` before deploy (blocks whole app, including LEGACY)  
6. **N-1 HTML escape** notification templates  
7. **A-1 Automation loop/depth budget**

### P1 — high priority

- Enforce permission engine on routes (R-2)  
- Workflow empty-roles deny (W-2); cycle/orphan policy (W-1)  
- Transactional publishes (D-2)  
- Org FKs + ticket_data FKs (D-1)  
- SSRF allow-list for webhooks  
- Report/dashboard SQL aggregates (S-1)  
- Transition 409 on CAS miss (W-3)  
- Document/ reconcile legacy null-org deny (L-1)  
- Rate-limit parser preview / engine endpoints  

### P2 — technical debt

- Prisma models for platform_*  
- OpenAPI for `/platform`  
- Rename `/platform` vs SaaS “platform”  
- Field-count caps; conditional cycle detection  
- Replace stubs with real builder UIs  
- E2E LEGACY matrix  

### P3 — future

- 100k soak harness, multi-tenant load  
- Real LLM providers behind ai-engine  
- Plugin sandbox / capability tokens  
- Full visual workflow/form canvases  
- CSRF tokens if cookie session relied upon  

---

## Scores (summary)

| Score | /100 |
|-------|-----:|
| **Production Readiness** | **38** |
| Architecture | 42 |
| Security | 28 |
| Performance | 25 |
| Maintainability | 48 |
| Scalability | 22 |
| SaaS Readiness | 30 |

---

## Final recommendation

**NOT READY FOR PRODUCTION** for Metadata Platform V2.

**LEGACY-only operation** can continue **only if**:

1. Production env satisfies `assertProductionConfig`, and  
2. Stakeholders accept prior hardening behavior changes (null-org deny, proof CAS, etc.), and  
3. METADATA mode remains **disabled** for all real tenants until P0 coexistence + security items are fixed and re-audited with evidence.

**Do not enable METADATA in production** until P0 is eliminated with regression proof.
