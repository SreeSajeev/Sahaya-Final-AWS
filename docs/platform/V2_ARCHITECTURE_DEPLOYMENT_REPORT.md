# Sahaya Metadata Platform V2 — Architecture & Deployment Report

## Success criterion

| Tenant | Expectation | Status |
|--------|-------------|--------|
| LEGACY (default, Hitachi/Test) | Zero behavior change; builders never execute | **Guaranteed** — no settings row ⇒ LEGACY; `/platform/*` builders return 404 |
| METADATA (opt-in) | Configurable service desk via engines | **Foundation production-grade engines + APIs + UI** |

This is **Sahaya V2 beside V1**, not a replacement.

---

## Overall architecture

```
Frozen Sahaya Core (V1)
  /tickets /data /fe /sm + existing pages
           │
           │ boundary only: app.use("/platform")
           ▼
Metadata Platform Layer (V2)
  backend/src/platform/
    form-engine / workflow-engine / parser-engine
    automation-engine / notification-engine / assignment-engine
    report-engine / dashboard-engine / permission-engine
    ai-engine / plugin-engine / search-engine
    builders/versioning · runtime · api
  frontend/src/platform/
    builders · renderer · runtime · pages · hooks
```

**Single mode switch:** `platform_tenant_settings.mode` ∈ {LEGACY, METADATA}.  
Absence of row = LEGACY. SUPER_ADMIN required to enable METADATA.

---

## Database schema

### Migrations (additive only)

1. `20260808020000_platform_metadata_layer`
2. `20260808030000_platform_v2_engines`

### Tables (selected)

Settings, forms/versions/fields/options, workflows/states/transitions, email parsers/rules, assignment rules, notifications/templates, reports/columns, dashboards/widgets, roles/permissions, ticket types, **platform_tickets** + **platform_ticket_data**, AI prompts/extractors, integrations/webhooks/plugins, variables, lookups, files, business hours, SLA policies, search indexes, audit logs, artifact versions.

**Never altered:** `tickets`, `organisations`, `users`, FE/SLA/email legacy tables.

---

## Runtime flow (METADATA)

1. Auth (shared JWT only).
2. `requireMetadataMode()` — LEGACY → 404.
3. Form engine validates `data_json` against published schema.
4. Workflow engine sets initial state / transitions with CAS-like status update.
5. Automation engine may apply field updates on create.
6. Search text written to `platform_ticket_data`.
7. Events + `platform_audit_logs`.

Legacy ticket processors are **never** invoked.

---

## Builders & capabilities

| Builder | Engine | Capabilities shipped |
|---------|--------|----------------------|
| Forms | form-engine | 50+ field types, validation, conditionals, versioning publish |
| Email parser | parser-engine | Regex/keyword/sender rules, confidence, preview, AI stub |
| Workflow | workflow-engine | States, transitions, roles, requirements, conditions |
| Assignment | assignment-engine | Round-robin, least-loaded, skill, location, fixed |
| Notification | notification-engine | Template vars, channel render, trigger conditions |
| Automation | automation-engine | Trigger/condition/action simulation + field updates |
| Reports | report-engine | Columns, filters, sort, KPI aggregate |
| Dashboard | dashboard-engine | Widget types + KPI bind |
| Permissions | permission-engine | Resource/action + field filter |
| AI | ai-engine | Prompt/extractor validation, confidence gate |
| Plugins | plugin-engine | Webhook validate, payload builder |
| Search | search-engine | Metadata search text + query filter |
| Versioning | builders/versioning | Publish snapshots, list, rollback fetch, audit |

Visual canvases: Forms UI, Email parser preview UI, dynamic form renderer, runtime create page; other builders have API-ready stub pages.

---

## API surface (`/platform/*`)

- `GET/PUT /settings` (LEGACY can read)
- CRUD builders: forms, workflows, assignments, notifications, reports, dashboards, automations, AI, plugins, email-parser, ticket-types, permissions
- Engines: `/engines/forms/*`, `/workflows/*`, `/email-parser/preview`, `/automations/simulate`, `/notifications/render`, `/assignments/resolve`, `/reports/run`, `/dashboards/bind`, `/webhooks/validate`, `/search`
- Versioning: `/versions/:type/:key/...`
- Runtime: `/runtime/tickets` (+ transition)

---

## UI structure

- `/app/metadata` shell (Admin+)
- Forms, Email Parser (live preview), Workflows/Assignments/Notifications/Reports (stubs + API docs)
- Runtime list + **Create ticket** with `MetadataFormRenderer`
- Settings (LEGACY ↔ METADATA; enable = SUPER_ADMIN)

---

## Security model

- Tenant `organisation_id` on all platform rows
- METADATA enable: SUPER_ADMIN only
- Builder mutations: ADMIN+
- LEGACY builder routes: **404** (no feature leak)
- Field-level permission helpers in permission-engine
- Webhook URL protocol allow-list
- No shared ticket-processing code with V1

---

## Versioning strategy

- Form versions + `platform_artifact_versions` for any builder snapshot
- Tickets store form/workflow version ids
- Publish creates immutable snapshots; history never rewritten

---

## Performance strategy

- Indexes on org, status, created_at, search tsvector
- LEGACY path: **zero** platform queries on `/tickets`/`/data`
- Report/dashboard scans capped (engine routes use limit)
- Soak: scale METADATA ticket volume in staging (100k+); CI validates engines + coexistence

---

## Coexistence guarantees

1. Default mode LEGACY without config.
2. Platform code paths only under `/platform` and `/app/metadata`.
3. `platform_tickets` ≠ `tickets`.
4. Migration safety tests forbid ALTER/DROP on legacy tables.
5. Integration tests: LEGACY list tickets still works; METADATA tickets absent from legacy list.

---

## Testing results (local)

Run after applying both platform migrations:

- Unit: platform mode, migration safety, **all engines**
- Integration: LEGACY/METADATA coexistence (prior suite)
- Frontend: `tsc` + production build

---

## Migration steps

```bash
# apply additive SQL (or prisma migrate deploy)
psql "$DATABASE_URL" -f backend/prisma/migrations/20260808020000_platform_metadata_layer/migration.sql
psql "$DATABASE_URL" -f backend/prisma/migrations/20260808030000_platform_v2_engines/migration.sql
```

No downtime for LEGACY tenants.

---

## Rollout plan

1. Deploy code + migrations.
2. Smoke Hitachi LEGACY (login, assign, close, reports).
3. Create **new** sandbox org → SUPER_ADMIN sets METADATA.
4. Configure forms/workflow → create metadata tickets.
5. Expand visual builders iteratively **inside** `src/platform` only.

---

## Future extension points

- Full drag-drop canvases (forms/workflows/dashboards)
- Real LLM provider adapters behind ai-engine
- Scheduled report delivery workers (platform-only)
- Plugin SDK install lifecycle UI
- 100k ticket soak harness in staging CI

---

## Recommendation

**SAFE TO SHIP as V2 layer** alongside frozen Sahaya V1.  
Existing tenants: **READY — no change**.  
METADATA tenants: **usable foundation** for configurable intake, workflow, parsing, automation, reporting; continue enriching builder UIs without touching V1.
