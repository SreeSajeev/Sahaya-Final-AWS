-- Sahaya Metadata Platform V2 — additive engine tables only.
-- Does NOT ALTER legacy Sahaya tables (tickets, organisations, users, …).
-- Does NOT DROP or rewrite existing platform_* tables from 20260808020000.

-- Ticket types (METADATA)
CREATE TABLE IF NOT EXISTS platform_ticket_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT,
  form_key TEXT,
  workflow_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);
CREATE INDEX IF NOT EXISTS platform_ticket_types_org_idx ON platform_ticket_types (organisation_id);

-- Normalized field options
CREATE TABLE IF NOT EXISTS platform_field_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  form_version_id UUID,
  field_internal_name TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_field_options_org_field_idx
  ON platform_field_options (organisation_id, field_internal_name);

-- Validation rules
CREATE TABLE IF NOT EXISTS platform_validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  form_version_id UUID,
  field_internal_name TEXT,
  rule_type TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Layouts / views
CREATE TABLE IF NOT EXISTS platform_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'form',
  layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

CREATE TABLE IF NOT EXISTS platform_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT 'ticket',
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

-- Email parser rules (versioned detail)
CREATE TABLE IF NOT EXISTS platform_email_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  parser_id UUID,
  parser_version_id UUID,
  rule_type TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_email_rules_org_idx ON platform_email_rules (organisation_id);

-- Workflow states & transitions (normalized)
CREATE TABLE IF NOT EXISTS platform_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  workflow_version_id UUID,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  category TEXT,
  properties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_states_org_wf_idx ON platform_states (organisation_id, workflow_version_id);

CREATE TABLE IF NOT EXISTS platform_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  workflow_version_id UUID,
  from_state_key TEXT NOT NULL,
  to_state_key TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  roles_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  requirements_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_transitions_org_wf_idx ON platform_transitions (organisation_id, workflow_version_id);

-- Notification templates
CREATE TABLE IF NOT EXISTS platform_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  subject_template TEXT,
  body_html TEXT,
  body_text TEXT,
  variables_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

-- Report columns
CREATE TABLE IF NOT EXISTS platform_report_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  report_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  column_type TEXT NOT NULL DEFAULT 'field',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dashboard widgets
CREATE TABLE IF NOT EXISTS platform_dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  dashboard_id UUID NOT NULL,
  widget_type TEXT NOT NULL,
  title TEXT,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  layout_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RBAC
CREATE TABLE IF NOT EXISTS platform_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

CREATE TABLE IF NOT EXISTS platform_role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  role_key TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  scope_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, role_key, resource, action)
);

-- Ticket data EAV / JSON document store (METADATA tickets only)
CREATE TABLE IF NOT EXISTS platform_ticket_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  platform_ticket_id UUID NOT NULL,
  form_version_id UUID,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform_ticket_id)
);
CREATE INDEX IF NOT EXISTS platform_ticket_data_org_idx ON platform_ticket_data (organisation_id);
CREATE INDEX IF NOT EXISTS platform_ticket_data_search_idx ON platform_ticket_data USING gin (to_tsvector('simple', coalesce(search_text, '')));

-- AI
CREATE TABLE IF NOT EXISTS platform_ai_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'extraction',
  prompt_text TEXT NOT NULL DEFAULT '',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

CREATE TABLE IF NOT EXISTS platform_ai_extractors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  prompt_key TEXT,
  field_mappings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence_threshold NUMERIC(5,2) NOT NULL DEFAULT 80,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

-- Integrations / plugins / webhooks
CREATE TABLE IF NOT EXISTS platform_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  auth_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

CREATE TABLE IF NOT EXISTS platform_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  headers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

-- Variables, lookup tables, files, SLA, business hours, search, audit
CREATE TABLE IF NOT EXISTS platform_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  value_json JSONB NOT NULL DEFAULT 'null'::jsonb,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

CREATE TABLE IF NOT EXISTS platform_lookup_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  columns_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

CREATE TABLE IF NOT EXISTS platform_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  platform_ticket_id UUID,
  storage_key TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  bytes INT,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_files_org_idx ON platform_files (organisation_id);

CREATE TABLE IF NOT EXISTS platform_business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL DEFAULT 'default',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

CREATE TABLE IF NOT EXISTS platform_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, key)
);

CREATE TABLE IF NOT EXISTS platform_search_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  entity TEXT NOT NULL DEFAULT 'ticket',
  field_key TEXT NOT NULL,
  indexed BOOLEAN NOT NULL DEFAULT TRUE,
  facetable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, entity, field_key)
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  actor_user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS platform_audit_logs_org_created_idx
  ON platform_audit_logs (organisation_id, created_at DESC);

-- Version registry for any builder artifact
CREATE TABLE IF NOT EXISTS platform_artifact_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, artifact_type, artifact_key, version)
);
CREATE INDEX IF NOT EXISTS platform_artifact_versions_org_idx
  ON platform_artifact_versions (organisation_id, artifact_type, artifact_key);
