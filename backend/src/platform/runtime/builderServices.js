/**
 * Thin services for keyed metadata builders (email, workflow, etc.).
 */
import { listByOrg, getById, getByOrgAndKey, upsertKeyedEntity, softArchive } from "../runtime/platformCrud.js";

function makeKeyedService(table, jsonColumn) {
  return {
    table,
    list: (orgId, opts) => listByOrg(table, orgId, opts),
    get: async (orgId, idOrKey) => {
      const byId = await getById(table, orgId, idOrKey);
      if (byId.data) return byId;
      return getByOrgAndKey(table, orgId, idOrKey);
    },
    upsert: (orgId, body) =>
      upsertKeyedEntity(table, orgId, {
        key: body.key,
        name: body.name,
        status: body.status || "draft",
        jsonColumns: { [jsonColumn]: body.config || body.definition || body.rules || body.template || {} },
        extra: body.extra || {},
      }),
    archive: (orgId, id) => softArchive(table, orgId, id),
  };
}

export const emailParserService = makeKeyedService("platform_email_parsers", "/* placeholder */");
// email parsers use versions — simple list/create on header table via dedicated helpers below.

export async function upsertEmailParser(organisationId, { key, name, status = "draft" }) {
  return upsertKeyedEntity("platform_email_parsers", organisationId, {
    key,
    name,
    status,
    jsonColumns: {},
    extra: { current_version: 1 },
  });
}

export const workflowService = {
  list: (orgId, opts) => listByOrg("platform_workflows", orgId, opts),
  get: async (orgId, idOrKey) => {
    const byId = await getById("platform_workflows", orgId, idOrKey);
    if (byId.data) return byId;
    return getByOrgAndKey("platform_workflows", orgId, idOrKey);
  },
  upsert: (orgId, body) =>
    upsertKeyedEntity("platform_workflows", orgId, {
      key: body.key,
      name: body.name,
      status: body.status || "draft",
      jsonColumns: {},
      extra: { current_version: 1, description: body.description ?? null },
    }),
};

export const assignmentRulesService = makeKeyedService("platform_assignment_rules", "rules_json");
export const notificationsService = {
  list: (orgId, opts) => listByOrg("platform_notifications", orgId, opts),
  get: async (orgId, idOrKey) => {
    const byId = await getById("platform_notifications", orgId, idOrKey);
    if (byId.data) return byId;
    return getByOrgAndKey("platform_notifications", orgId, idOrKey);
  },
  upsert: (orgId, body) =>
    upsertKeyedEntity("platform_notifications", orgId, {
      key: body.key,
      name: body.name,
      status: body.status || "draft",
      jsonColumns: {
        template_json: body.template || {},
        trigger_json: body.trigger || {},
      },
      extra: { channel: body.channel || "email" },
    }),
};
export const reportsService = makeKeyedService("platform_reports", "definition_json");
export const dashboardsService = makeKeyedService("platform_dashboards", "layout_json");
export const automationsService = makeKeyedService("platform_automations", "definition_json");
export const aiConfigService = makeKeyedService("platform_ai_configs", "config_json");
export const pluginsService = makeKeyedService("platform_plugins", "config_json");

export async function upsertPermission(organisationId, { roleKey, permissions }) {
  const { prisma } = await import("../../db/prisma.js");
  const crypto = await import("crypto");
  const id = crypto.randomUUID();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO platform_permissions (id, organisation_id, role_key, permissions_json, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, NOW(), NOW())
       ON CONFLICT (organisation_id, role_key) DO UPDATE SET
         permissions_json = EXCLUDED.permissions_json,
         updated_at = NOW()`,
      id,
      String(organisationId),
      String(roleKey),
      JSON.stringify(permissions || {})
    );
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM platform_permissions WHERE organisation_id = $1::uuid AND role_key = $2 LIMIT 1`,
      String(organisationId),
      String(roleKey)
    );
    return { data: rows?.[0] || null, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function listPermissions(organisationId) {
  return listByOrg("platform_permissions", organisationId, { limit: 200 });
}
