# PLATFORM ARCHITECTURE AUDIT

**Scope:** `backend/src/platform/**`, `frontend/src/platform/**`  
**Method:** Static adversarial review + dependency tracing  
**Date:** 2026-08-09  
**Stance:** External consultancy — evidence over intent

---

## Executive summary

The Metadata Platform is a **metadata skin over raw SQL CRUD + snapshot versioning**, not a finished enterprise metadata mesh. Engines exist, but builders often bypass them; the registry is only honestly written by forms; the runtime trusts client-supplied schemas.

**Verdict for architecture alone:** **ARCHITECTURE REWORK REQUIRED** for registry/runtime integrity; partial reuse of engines is real but incomplete.

---

## 1. Duplication findings

| Area | Evidence | Severity |
|------|----------|----------|
| **Dual permission models** | CRUD: `requireBuilderPerm` (`api/index.js`); engines/versions: `requireRole(ADMIN)` only (`engineRoutes.js`). `req.platformPermissions` never populated in production. | P0 |
| **Triple condition evaluators** | `form-engine/evaluateCondition`, FE `renderer/condition.ts`, `automation-engine/matchCondition` (weaker). | P1 |
| **Dual versioning** | Forms → `platform_form_versions` + registry; others → `platform_artifact_versions`. Form UI does not use shared `VersionPanel`. | P1 |
| **Dual field catalogs** | `FORM_FIELD_TYPES` vs shim `PLATFORM_FIELD_TYPES`; served from `/platform` settings payload and `/catalog/field-types`. | P1 |
| **Dual API surfaces** | Fat `api/index.js` + fat `engineRoutes.js` both under `/platform`. | P1 |
| **Publish double-write** | UI pattern ×7: `upsertBuilderArtifact` + `publishArtifactVersion` without shared orchestrator/transaction. | P1 |
| **Dead registry writer** | `publishWorkflowToRegistry` defined (`metadata-registry/index.js:79`) — **zero call sites**. | P1 |

---

## 2. Coupling & structure

| Finding | Evidence | Severity |
|---------|----------|----------|
| God router | `engineRoutes.js` imports 11 engines + registry + ticketRuntime + CRUD | P1 |
| God UI files | `FormBuilderPage.tsx` ~691 LOC; `EnterpriseBuilders.tsx` ~550 LOC (7 builders); `WorkflowBuilderPage.tsx` ~469 LOC | P1 |
| Runtime hub | `ticketRuntime.js` wires form + workflow + search + automation + audit | P1 |
| Copy-paste builders | Identical publish/message pattern ×7 in `EnterpriseBuilders.tsx` | P1 |
| 1-line module stubs | `workflows/index.js`, `reports/index.js`, `ai/index.js`, etc. export only module keys | P2 |
| Unused prisma import | `metadata-registry/index.js` imports `prisma` unused | P2 |

**Circular imports among engines:** None found (acyclic). Hub coupling is the real problem.

---

## 3. Hidden legacy / boundary dependencies

| Finding | Evidence | Severity |
|---------|----------|----------|
| Platform API uses legacy auth/tenant middleware | `api/index.js` → `middleware/auth.js`, `tenantContext.js`, `requireRole.js` | Expected boundary |
| Exclusive gate mounted on V1 routes | `app.js` mounts `exclusiveLegacyTicketGate` on `/tickets`, `/data`, `/fe`, `/sm` | P1 coexistence |
| Gate queries `platform_tenant_settings` for authenticated LEGACY ticket traffic | `exclusiveRuntimeGate.js` → `getOrganisationPlatformMode` | P1 — violates “no new queries” for LEGACY |
| No imports of legacy ticket/SLA services from platform | Confirmed by grep | OK |

---

## 4. Registry contract vs reality

**Claim (code comment):** builders must not query each other’s tables; use registry.

**Reality:**
- Forms: publish → `publishFormToRegistry` ✅
- Workflows/assignments/notifications/…: CRUD tables + artifact snapshots; **registry workflows map never updated**
- Cross-builder UIs **poll** `GET /platform/registry` on mount — **no event bus, no push, no auto-refresh after publish**
- Runtime create uses **hardcoded SAMPLE_SCHEMA**, not registry (`MetadataTicketCreatePage.tsx`)

---

## 5. Unsafe abstractions

| Pattern | Location | Severity |
|---------|----------|----------|
| `new Function` formula eval | `form-engine/formula.js:77` | P0 |
| `Math.random()` React keys | `MetadataFormRenderer.tsx` layout render | P0 UX/correctness |
| Client `formSchema` / `workflowDefinition` / `automations` on create | `api/index.js:234-236`, `ticketRuntime.js:21-45` | P0 |
| Registry read-modify-write without lock | `metadata-registry/index.js:55-76` | P0 race |
| Artifact `MAX(version)+1` without txn | `versioning.js:31-52` | P0 race |
| Field `regex` via raw `new RegExp` | `form-engine/index.js` validation | P0 ReDoS |

---

## 6. Dead / misleading code

- `emailParserService` JSON column `"/* placeholder */"` (`builderServices.js`)
- `MetadataBuilderStubPage` retained (“stub has been replaced”)
- AI provider options OpenAI/Azure/Bedrock with **no backend implementation**
- Dashboard marketed as “Drag-style” but is button-add cards
- Report “Export CSV” writes JSON content with `.csv` extension

---

## 7. Recommendations (audit only — not implemented)

1. Single publish orchestrator + transactional registry merge.
2. Runtime loads **only** published form/workflow versions; reject client schemas.
3. Replace `new Function` with AST-limited evaluator; pipe field regex through `safeRegex`.
4. One RBAC middleware for all `/platform/*`; load grants or delete grant path.
5. Call registry publishers for every artifact type or shrink registry API to forms-only and document honestly.
6. Split god UI files; delete 1-line stubs.

---

## Architecture score: **38 / 100**
