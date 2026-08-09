/**
 * SQL identifier allowlist for platform_* CRUD.
 * Never interpolate untrusted table/column names.
 */

/** @type {ReadonlySet<string>} */
export const PLATFORM_TABLE_ALLOWLIST = Object.freeze(
  new Set([
    "platform_tenant_settings",
    "platform_forms",
    "platform_form_versions",
    "platform_workflows",
    "platform_email_parsers",
    "platform_assignment_rules",
    "platform_notifications",
    "platform_reports",
    "platform_dashboards",
    "platform_automations",
    "platform_ai_configs",
    "platform_plugins",
    "platform_permissions",
    "platform_ticket_types",
    "platform_tickets",
    "platform_ticket_data",
    "platform_artifact_versions",
    "platform_audit_logs",
  ])
);

/** @type {ReadonlySet<string>} */
export const PLATFORM_COLUMN_ALLOWLIST = Object.freeze(
  new Set([
    "id",
    "organisation_id",
    "key",
    "name",
    "status",
    "created_at",
    "updated_at",
    "current_version",
    "description",
    "icon",
    "color",
    "form_key",
    "workflow_key",
    "channel",
    "role_key",
    "permissions_json",
    "config_json",
    "definition_json",
    "rules_json",
    "template_json",
    "trigger_json",
    "layout_json",
    "schema_json",
    "data_json",
    "ticket_number",
    "form_version_id",
    "workflow_version_id",
    "status_key",
    "source",
    "created_by",
    "artifact_type",
    "artifact_key",
    "version",
    "snapshot_json",
    "published_at",
    "actor_user_id",
    "action",
    "payload_json",
    "mode",
    "enabled_modules",
  ])
);

/**
 * @param {string} table
 * @returns {string}
 * @throws {Error}
 */
export function assertPlatformTable(table) {
  const t = String(table || "");
  if (!PLATFORM_TABLE_ALLOWLIST.has(t)) {
    const err = new Error(`Unknown platform table: ${t}`);
    err.code = "PLATFORM_SQL_TABLE_DENIED";
    throw err;
  }
  return t;
}

/**
 * @param {string} column
 * @returns {string}
 */
export function assertPlatformColumn(column) {
  const c = String(column || "");
  if (!PLATFORM_COLUMN_ALLOWLIST.has(c)) {
    const err = new Error(`Unknown platform column: ${c}`);
    err.code = "PLATFORM_SQL_COLUMN_DENIED";
    throw err;
  }
  return c;
}

export function assertPlatformColumns(columns) {
  return (columns || []).map(assertPlatformColumn);
}
