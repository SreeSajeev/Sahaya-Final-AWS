# Metadata schema overview

All tables are additive (`platform_*`). Legacy Sahaya tables are never altered.

## Tenant gate

**platform_tenant_settings**
- PK `organisation_id`
- `mode` ∈ {`LEGACY`,`METADATA`} default conceptually LEGACY when row absent
- `enabled_modules` JSONB

## Forms

- **platform_forms** — keyed form definition per org
- **platform_form_versions** — immutable published schemas (`schema_json`, `layout_json`)
- **platform_fields** — optional normalized field rows per version

## Workflows

- **platform_workflows** / **platform_workflow_versions** / **platform_statuses**

## Intake & automation

- **platform_email_parsers** (+ versions)
- **platform_assignment_rules**
- **platform_notifications**
- **platform_automations**
- **platform_ai_configs**
- **platform_plugins**

## Insights

- **platform_reports**
- **platform_dashboards**
- **platform_permissions**

## Runtime (METADATA only)

- **platform_tickets** — `data_json`, `status_key`, form/workflow version FKs
- **platform_ticket_events** — append-only timeline

Tickets created here never appear in legacy `tickets`.
