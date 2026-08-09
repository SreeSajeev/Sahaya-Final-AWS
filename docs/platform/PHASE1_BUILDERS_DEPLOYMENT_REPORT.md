# Sahaya V2 — Metadata Platform Phase 1 Deployment Report

**Enterprise Builder Completion**  
**Date:** 2026-08-09  
**Scope:** Phase 1 — all builders production-usable (no stubs). Phases 2–4 foundations where required for cross-builder publishing.

---

## Absolute rules compliance

| Rule | Status |
|------|--------|
| No V1 business logic changes (tickets/SLA/FE/SM/…) | **Kept** — no edits under legacy services/routes beyond existing platform mounts |
| LEGACY tenants identical | **Kept** — builders only under `/app/metadata` + `/platform/*`; LEGACY still 404 on builders |
| New code in `**/platform/**` | **Kept** — plus minimal `App.tsx` route wiring (boundary adapter only) |
| Builders communicate via registry / published versions | **Implemented** — `metadata-registry` + `/platform/registry` |

---

## Architecture changes

```
Form publish ──► platform_form_versions ──► Metadata Registry catalog
Workflow/others publish ──► platform_artifact_versions ──► optional registry consumers
Reports / Notifications / Assignments / Search ──► read /platform/registry (not peer tables)
```

### New backend modules
- `backend/src/platform/metadata-registry/` — catalog publish, history, diff
- `backend/src/platform/form-engine/formula.js` — SUM/COUNT/AVG/IF/DATEADD/DATEDIFF/NOW/CONCAT/ROUND/ABS
- `backend/src/platform/form-engine/layout.js` — sections/columns/tabs/wizard/accordion validation
- `backend/src/platform/forms/templates.js` — Incident, Complaint, Asset, Maintenance, IT Support, HR
- Workflow cycle + deadlock analysis
- Version rollback / clone / compare APIs

### New frontend builders (all real UIs)
| Builder | Path | Capabilities |
|---------|------|----------------|
| Form | `/app/metadata/forms` | Palette, DnD add, 1–4 col / tabs / wizard / accordion, properties, validation, formulas, preview (desktop/tablet/mobile/print/dark), templates, import/export, publish→registry |
| Workflow | `/app/metadata/workflows` | Visual canvas, pan/zoom, snap drag, connect transitions, roles/requirements, analyze cycles/deadlocks, version panel |
| Email Parser | `/app/metadata/email-parser` | Regex/keyword/sender rules, live preview, AI prompt, replay history, publish |
| Assignment | `/app/metadata/assignments` | Strategies + simulation + registry fields |
| Notification | `/app/metadata/notifications` | Channels + variable picker from registry + escaped preview |
| Automation | `/app/metadata/automations` | Definition editor + simulate + publish |
| Dashboard | `/app/metadata/dashboards` | Widget grid + bind preview |
| Report | `/app/metadata/reports` | Registry columns + run + CSV export |
| AI | `/app/metadata/ai` | Prompt / provider / threshold / versioning |
| Plugin | `/app/metadata/plugins` | Webhook/REST config + validate + package export |

Shared: `BuilderShell`, `VersionPanel` (history, rollback, clone, compare, import/export helpers).

---

## APIs added/extended

- `GET /platform/catalog/form-templates`, `GET …/:key`
- `GET /platform/registry`, `GET /platform/registry/history`, `POST /platform/registry/diff`
- `POST /platform/engines/forms/formula`
- `POST /platform/engines/forms/validate` (layout aware)
- `POST /platform/engines/workflows/analyze`
- `POST /platform/versions/:type/:key/rollback|clone`
- `POST /platform/versions/compare`
- Form publish → registry side-effect

---

## Schema

No new migration required for Phase 1 — reuses additive `platform_*` + `platform_artifact_versions` + `platform_audit_logs`. Registry stored as artifact type `metadata_registry` / key `catalog`.

---

## Security review

- Metadata APIs remain behind auth + METADATA mode gate  
- Formula evaluator blocks `process` / `Function` / backticks  
- Notification render still XSS-escapes variables  
- Registry is tenant-scoped via existing versioning SQL  
- LEGACY exclusive ticket gate unchanged  

---

## Performance impact

- LEGACY ticket paths: no new builder code executed  
- Registry read is one snapshot query per catalog request  
- Form publish writes form version + registry version (2 writes)

---

## Test results

```
platformPhase1Builders.test.js — PASS (formulas, layout, catalog, workflow analysis, templates)
platformEngines.test.js — PASS
platformP0Hardening.test.js — PASS
frontend tsc --noEmit — PASS
```

---

## Backwards compatibility

- Existing LEGACY orgs: no UI change outside `/app/metadata`  
- Stub routes replaced with real builders (additive routes for automations/dashboards/ai/plugins)  
- Default tenant mode remains LEGACY  

---

## Phase coverage honesty

| Phase | Status |
|-------|--------|
| **Phase 1** Complete every builder (no stubs) | **Done** — all 10 builders are working applications |
| Phase 2 polish (a11y audit suite, bulk actions everywhere) | Partial — loading/empty/error/autosave patterns present; full WCAG suite deferred |
| Phase 3 registry auto-sync | **Done for forms** (publish → registry); other artifacts publish to version store and consume registry |
| Phase 4 runtime polish (offline-first, mentions, …) | Out of Phase 1 scope — not claimed complete |

Items intentionally deferred as P2 (still no stubs): native OCR pipeline, handwriting, live OAuth dance UI, parallel-approval swimlanes, true pixel DnD library, scheduled report email worker.

---

## How to verify

1. Enable METADATA on a sandbox org (SUPER_ADMIN).  
2. Open `/app/metadata/forms` → load Incident template → Publish.  
3. Open Reports / Notifications — registry columns/variables appear.  
4. Open Workflows → Analyze → Publish.  
5. Confirm LEGACY org still uses `/data/tickets` and gets 404 on `/platform/forms`.
