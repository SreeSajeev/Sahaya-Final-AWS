# Sahaya V2 — Metadata Platform Layer

## Architecture

```
┌─────────────────────────────────────────────┐
│  Frozen Sahaya Core (LEGACY)                │
│  /tickets /data /fe /sm  + existing pages   │
└──────────────────┬──────────────────────────┘
                   │  boundary mount only
                   │  app.use("/platform", …)
                   ▼
┌─────────────────────────────────────────────┐
│  Metadata Platform Layer (NEW)              │
│  backend/src/platform/*                     │
│  frontend/src/platform/*                    │
│  /platform/* APIs · /app/metadata UI        │
└─────────────────────────────────────────────┘
```

### Platform modes

| Mode | Meaning |
|------|---------|
| **LEGACY** (default) | No `platform_tenant_settings` row, or `mode=LEGACY`. All existing Sahaya behavior. `/platform/forms` etc. return **404**. |
| **METADATA** | Explicit opt-in (SUPER_ADMIN). Builders + `platform_tickets` runtime active. |

**Single decision point:** `backend/src/platform/runtime/platformMode.js` + `requireMetadataMode()` — never sprinkled through legacy business logic.

### Isolation rules

- New folders only under `backend/src/platform/` and `frontend/src/platform/`.
- New tables only (`platform_*`). No ALTER of `tickets`, `organisations`, etc.
- Metadata tickets live in `platform_tickets` — never the legacy `tickets` table.
- Legacy Hitachi/Test tenants remain LEGACY forever unless manually migrated.

### Boundary adapters (minimal)

1. `app.js` — `app.use("/platform", platformRouter)`
2. `App.tsx` — additive `/app/metadata/*` routes (lazy)
3. `tests/helpers/testApp.js` — mount for tests

No changes to assignment, email parsing, reports, lifecycle, or existing pages' logic.

---

## Database design (additive)

See migration `20260808020000_platform_metadata_layer`.

Key tables: `platform_tenant_settings`, `platform_forms` + versions/fields, `platform_workflows` + statuses, `platform_email_parsers`, `platform_assignment_rules`, `platform_notifications`, `platform_reports`, `platform_dashboards`, `platform_permissions`, `platform_automations`, `platform_ai_configs`, `platform_plugins`, `platform_tickets`, `platform_ticket_events`.

---

## API design

| Method | Path | LEGACY | METADATA |
|--------|------|--------|----------|
| GET | `/platform/settings` | 200 mode=LEGACY | 200 mode=METADATA |
| PUT | `/platform/settings` | SUPER_ADMIN to enable METADATA | same |
| GET/POST | `/platform/forms` | 404 | CRUD + publish |
| * | `/platform/email-parser`, `/workflows`, `/assignments`, `/notifications`, `/reports`, `/dashboards`, `/automations`, `/ai`, `/plugins`, `/permissions` | 404 | builders |
| * | `/platform/runtime/tickets` | 404 | metadata tickets |

---

## Runtime

`Metadata Runtime` consumes form/workflow versions and stores data in `platform_tickets.data_json`. It has **no** knowledge of vehicles, complaint IDs, FE tokens, or Hitachi.

---

## UI architecture

- Shell: `/app/metadata` → `MetadataPlatformLayout`
- Builders: forms (working MVP), other builders stubbed with API-ready messaging
- Settings: show mode; METADATA enable requires SUPER_ADMIN

---

## Security

- Tenant-scoped SQL (`organisation_id` on every row)
- Builder mutations: ADMIN+
- METADATA enable: SUPER_ADMIN only
- LEGACY tenants get 404 (not 403) on builder routes to avoid feature leakage
- Auth reuses existing JWT / `requireAuth` — no new auth system

---

## Performance

- Indexes on `(organisation_id)`, status, created_at for platform tickets
- Versioned forms avoid rewriting historical tickets
- LEGACY path: zero extra queries on existing ticket routes

---

## Migration strategy

1. Deploy additive migration (no downtime).
2. All existing orgs stay LEGACY (no rows needed).
3. Create new org → SUPER_ADMIN sets METADATA → configure builders.
4. Never auto-migrate Hitachi.

---

## Test plan

- Unit: mode default LEGACY; form schema validation
- Integration: LEGACY 404 on builders; LEGACY `/data/tickets` still works; METADATA form+runtime; isolation from legacy ticket list

---

## Rollout

1. Migrate DB
2. Deploy backend/frontend
3. Verify Hitachi smoke (login, tickets, assign, close)
4. Enable METADATA on a **new** sandbox tenant only
5. Expand builders iteratively without touching core

---

## Status of builders (MVP foundation)

| Builder | Status |
|---------|--------|
| Form | Schema + publish versions + UI |
| Email parser | API list/create |
| Workflow | API CRUD |
| Assignment | API CRUD |
| Notification | API CRUD |
| Report / Dashboard | API CRUD |
| Permissions | API upsert |
| Automation / AI / Plugins | API CRUD |
| Runtime tickets | Create / list / transition |
| Visual canvases | Stub pages (extend without core changes) |
