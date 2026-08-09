/**
 * /platform/* — Metadata Platform APIs.
 * Completely isolated from /tickets, /data, /fe, /sm.
 * LEGACY tenants: settings readable; builder/runtime endpoints return 404.
 */
import { Router } from "express";
import { requireAuth, requireAppUser } from "../../middleware/auth.js";
import { attachTenantContext } from "../../middleware/tenantContext.js";
import { requireRole } from "../../middleware/requireRole.js";
import { jsonOk, jsonError } from "../../utils/http.js";
import { loadPlatformContext, requireMetadataMode } from "../runtime/metadataRuntime.js";
import {
  getPlatformTenantSettings,
  upsertPlatformTenantSettings,
} from "../runtime/tenantSettingsRepository.js";
import { PLATFORM_MODES, PLATFORM_MODULE_KEYS } from "../runtime/platformMode.js";
import * as formService from "../forms/formService.js";
import { PLATFORM_FIELD_TYPES } from "../forms/formSchema.js";
import { createEngineRouter } from "./engineRoutes.js";
import {
  createPlatformTicket,
  listPlatformTickets,
  getPlatformTicket,
  transitionPlatformTicket,
} from "../runtime/ticketRuntime.js";
import {
  workflowService,
  assignmentRulesService,
  notificationsService,
  reportsService,
  dashboardsService,
  automationsService,
  aiConfigService,
  pluginsService,
  upsertEmailParser,
  upsertPermission,
  listPermissions,
} from "./builderBindings.js";
import { assertBuilderAccess } from "../permission-engine/index.js";
import { assertMetadataPlatformConfig } from "../../config/productionConfig.js";
import { validateParserConfig } from "../parser-engine/index.js";

const router = Router();
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

function requireBuilderPerm(resource, action) {
  return (req, res, next) => {
    const result = assertBuilderAccess(req, resource, action);
    if (!result.ok) {
      return jsonError(res, result.status || 403, result.error || "forbidden", { code: result.code });
    }
    return next();
  };
}

router.use(requireAuth);
router.use(attachTenantContext({ requireAuthenticated: false }));
router.use(requireAppUser);

function orgId(req) {
  return req.platformOrganisationId || req.tenantId || req.appUser?.organisation_id || req.appUser?.organisationId;
}

/** Settings — available to LEGACY (read). Mutate mode = ADMIN+. */
router.get("/settings", async (req, res) => {
  try {
    const ctx = await loadPlatformContext(req);
    return jsonOk(res, {
      organisationId: ctx.organisationId,
      mode: ctx.mode,
      metadataActive: ctx.metadataActive,
      enabledModules: ctx.settings?.enabled_modules || {},
      availableModules: PLATFORM_MODULE_KEYS,
      fieldTypes: PLATFORM_FIELD_TYPES,
      note: "Default mode is LEGACY. Existing Sahaya tenants are unchanged until explicitly set to METADATA.",
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load platform settings");
  }
});

router.put("/settings", requireRole(ADMIN_ROLES), async (req, res) => {
  try {
    const ctx = await loadPlatformContext(req);
    if (!ctx.organisationId) return jsonError(res, 400, "organisationId required");
    // Only SUPER_ADMIN may enable METADATA (safety for Hitachi freeze).
    const role = String(req.tenantRole || req.appUser?.role || "").toUpperCase();
    const requestedMode = String(req.body?.mode || "").toUpperCase();
    if (requestedMode === PLATFORM_MODES.METADATA && role !== "SUPER_ADMIN") {
      return jsonError(res, 403, "Only SUPER_ADMIN may enable METADATA mode");
    }
    // Metadata config validation only when switching to METADATA — never blocks LEGACY boot
    if (requestedMode === PLATFORM_MODES.METADATA) {
      try {
        assertMetadataPlatformConfig();
      } catch (cfgErr) {
        return jsonError(res, 400, cfgErr?.message || "Metadata platform config invalid");
      }
    }
    const settings = await upsertPlatformTenantSettings(ctx.organisationId, {
      mode: requestedMode || ctx.mode,
      enabledModules: req.body?.enabledModules,
    });
    return jsonOk(res, {
      organisationId: ctx.organisationId,
      mode: settings?.mode || PLATFORM_MODES.LEGACY,
      enabledModules: settings?.enabled_modules || {},
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to update platform settings");
  }
});

/** Everything below requires METADATA mode (404 for LEGACY). */
router.use(requireMetadataMode());
router.use(createEngineRouter({ orgId }));

function mountCrud(path, service, resource) {
  router.get(path, requireBuilderPerm(resource, "read"), async (req, res) => {
    const { data, error } = await service.list(orgId(req), {
      limit: Number(req.query.limit || 100),
      offset: Number(req.query.offset || 0),
    });
    if (error) return jsonError(res, 500, error.message || String(error));
    return jsonOk(res, { items: data || [] });
  });
  router.post(path, requireRole(ADMIN_ROLES), requireBuilderPerm(resource, "write"), async (req, res) => {
    if (!req.body?.key) return jsonError(res, 400, "key required");
    const { data, error } = await service.upsert(orgId(req), req.body);
    if (error) return jsonError(res, 500, error.message || String(error));
    return jsonOk(res, data);
  });
  router.get(`${path}/:id`, requireBuilderPerm(resource, "read"), async (req, res) => {
    const { data, error } = await service.get(orgId(req), req.params.id);
    if (error) return jsonError(res, 500, error.message || String(error));
    if (!data) return jsonError(res, 404, "Not found");
    return jsonOk(res, data);
  });
}

// Forms
router.get("/forms", requireBuilderPerm("form", "read"), async (req, res) => {
  const { data, error } = await formService.listForms(orgId(req));
  if (error) return jsonError(res, 500, error.message || String(error));
  return jsonOk(res, { items: data || [], fieldTypes: PLATFORM_FIELD_TYPES });
});

router.post("/forms", requireRole(ADMIN_ROLES), requireBuilderPerm("form", "write"), async (req, res) => {
  if (!req.body?.key) return jsonError(res, 400, "key required");
  const { data, error } = await formService.createOrUpdateForm(orgId(req), req.body);
  if (error) return jsonError(res, 500, error.message || String(error));
  return jsonOk(res, data);
});

router.post("/forms/:id/publish", requireRole(ADMIN_ROLES), requireBuilderPerm("form", "write"), async (req, res) => {
  const { data, error } = await formService.publishFormVersion(orgId(req), req.params.id, {
    schema: req.body?.schema,
    layout: req.body?.layout,
    createdBy: req.appUser?.id || null,
  });
  if (error) return jsonError(res, 400, error.message || String(error));
  return jsonOk(res, data);
});

router.get("/forms/:id/versions", requireBuilderPerm("form", "read"), async (req, res) => {
  const { data, error } = await formService.listFormVersions(orgId(req), req.params.id);
  if (error) return jsonError(res, 500, error.message || String(error));
  return jsonOk(res, { items: data || [] });
});

// Email parsers (header)
router.get("/email-parser", requireBuilderPerm("parser", "read"), async (req, res) => {
  const { listByOrg } = await import("../runtime/platformCrud.js");
  const { data, error } = await listByOrg("platform_email_parsers", orgId(req));
  if (error) return jsonError(res, 500, error.message || String(error));
  return jsonOk(res, { items: data || [] });
});

router.post("/email-parser", requireRole(ADMIN_ROLES), requireBuilderPerm("parser", "write"), async (req, res) => {
  if (!req.body?.key) return jsonError(res, 400, "key required");
  if (req.body?.config) {
    const gate = validateParserConfig(req.body.config);
    if (!gate.ok) return jsonError(res, 400, gate.error || "unsafe parser config", { code: gate.code });
  }
  const { data, error } = await upsertEmailParser(orgId(req), req.body);
  if (error) return jsonError(res, 500, error.message || String(error));
  return jsonOk(res, data);
});

mountCrud("/workflows", workflowService, "workflow");
mountCrud("/assignments", assignmentRulesService, "assignment");
mountCrud("/notifications", notificationsService, "notification");
mountCrud("/reports", reportsService, "report");
mountCrud("/dashboards", dashboardsService, "dashboard");
mountCrud("/automations", automationsService, "automation");
mountCrud("/ai", aiConfigService, "ai");
mountCrud("/plugins", pluginsService, "plugin");

router.get("/permissions", requireBuilderPerm("permission", "read"), async (req, res) => {
  const { data, error } = await listPermissions(orgId(req));
  if (error) return jsonError(res, 500, error.message || String(error));
  return jsonOk(res, { items: data || [] });
});

router.put("/permissions/:roleKey", requireRole(ADMIN_ROLES), requireBuilderPerm("permission", "write"), async (req, res) => {
  const { data, error } = await upsertPermission(orgId(req), {
    roleKey: req.params.roleKey,
    permissions: req.body?.permissions || req.body,
  });
  if (error) return jsonError(res, 500, error.message || String(error));
  return jsonOk(res, data);
});

// Runtime tickets (METADATA only — never touches legacy tickets)
router.get("/runtime/tickets", requireBuilderPerm("runtime", "read"), async (req, res) => {
  const { data, error } = await listPlatformTickets(orgId(req), {
    limit: Number(req.query.limit || 50),
    offset: Number(req.query.offset || 0),
    statusKey: req.query.status || undefined,
  });
  if (error) return jsonError(res, 500, error.message || String(error));
  return jsonOk(res, { items: data || [] });
});

router.post("/runtime/tickets", requireRole(ADMIN_ROLES), requireBuilderPerm("runtime", "write"), async (req, res) => {
  if (req.body?.formSchema != null || req.body?.workflowDefinition != null || req.body?.automations != null) {
    return jsonError(res, 400, "Client metadata rejected. Use formVersionId/formKey only.", {
      code: "PLATFORM_CLIENT_METADATA_FORBIDDEN",
    });
  }
  const { data, error, validation, code } = await createPlatformTicket(orgId(req), {
    ticketNumber: req.body?.ticketNumber,
    formVersionId: req.body?.formVersionId || null,
    formKey: req.body?.formKey || null,
    workflowVersionId: req.body?.workflowVersionId || null,
    workflowKey: req.body?.workflowKey || null,
    statusKey: req.body?.statusKey || undefined,
    data: req.body?.data || {},
    source: req.body?.source || "manual",
    actorUserId: req.appUser?.id || null,
  });
  if (validation && !validation.ok) {
    return jsonError(res, 400, validation.error || "validation failed", { errors: validation.errors });
  }
  if (error) {
    const status = code === "PLATFORM_CLIENT_METADATA_FORBIDDEN" ? 400 : code === "PLATFORM_FORM_VERSION_REQUIRED" ? 400 : 500;
    return jsonError(res, status, error.message || String(error), { code });
  }
  return jsonOk(res, data);
});

router.get("/runtime/tickets/:id", requireBuilderPerm("runtime", "read"), async (req, res) => {
  const { data, error } = await getPlatformTicket(orgId(req), req.params.id);
  if (error) return jsonError(res, 500, error.message || String(error));
  if (!data) return jsonError(res, 404, "Not found");
  return jsonOk(res, data);
});

router.post("/runtime/tickets/:id/transition", requireRole(ADMIN_ROLES), requireBuilderPerm("runtime", "write"), async (req, res) => {
  if (!req.body?.toStatus && !req.body?.transitionKey) {
    return jsonError(res, 400, "toStatus or transitionKey required");
  }
  const { data, error, code } = await transitionPlatformTicket(orgId(req), req.params.id, {
    toStatus: req.body.toStatus,
    transitionKey: req.body.transitionKey,
    role: req.tenantRole || req.appUser?.role,
    workflowDefinition: req.body.workflowDefinition || null,
    payload: req.body.payload || {},
    actorUserId: req.appUser?.id || null,
    context: req.body.context || {},
  });
  if (error) return jsonError(res, code === "TRANSITION_DENIED" ? 403 : 400, error.message || String(error), { code });
  return jsonOk(res, data);
});

router.get("/health", async (req, res) => {
  return jsonOk(res, {
    ok: true,
    layer: "metadata-platform",
    mode: req.platformMode,
    organisationId: orgId(req),
  });
});

export default router;
