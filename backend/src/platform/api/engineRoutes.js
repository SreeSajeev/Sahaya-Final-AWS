/**
 * Engine-facing /platform routes — METADATA only (mounted after requireMetadataMode).
 */
import { Router } from "express";
import { requireRole } from "../../middleware/requireRole.js";
import { jsonOk, jsonError } from "../../utils/http.js";
import { FORM_FIELD_TYPES, validateFormDefinition, validateTicketDataAgainstSchema, evaluateFormula, listSupportedFormulaFunctions, validateLayout } from "../form-engine/index.js";
import { validateWorkflowDefinition, listAllowedTransitions, applyTransition, detectWorkflowCycles, detectWorkflowDeadlocks } from "../workflow-engine/index.js";
import { previewEmailParse, simulateAiExtraction } from "../parser-engine/index.js";
import { simulateAutomation } from "../automation-engine/index.js";
import { renderNotification, shouldSend } from "../notification-engine/index.js";
import { resolveAssignee } from "../assignment-engine/index.js";
import { projectTickets, aggregateKpi } from "../report-engine/index.js";
import { bindDashboard } from "../dashboard-engine/index.js";
import { gateByConfidence } from "../ai-engine/index.js";
import { validateWebhook, buildWebhookPayload } from "../plugin-engine/index.js";
import { filterTicketsByQuery } from "../search-engine/index.js";
import {
  publishArtifactVersion,
  listArtifactVersions,
  getPublishedSnapshot,
  rollbackArtifactVersion,
  cloneArtifact,
  compareSnapshots,
} from "../builders/versioning.js";
import { listPlatformTickets } from "../runtime/ticketRuntime.js";
import { upsertKeyedEntity, listByOrg } from "../runtime/platformCrud.js";
import { getRegistryCatalog, listRegistryHistory, diffRegistrySnapshots, publishToRegistry } from "../metadata-registry/index.js";
import { registryEvents } from "../metadata-registry/registryCache.js";
import { FORM_TEMPLATES, getFormTemplate } from "../forms/templates.js";

const ARTIFACT_TO_BUCKET = Object.freeze({
  workflow: "workflows",
  assignment: "assignments",
  automation: "automations",
  notification: "notifications",
  report: "reports",
  dashboard: "dashboards",
  ai: "ai",
  email_parser: "parsers",
  parser: "parsers",
  plugin: "plugins",
  permission: "permissions",
  search: "search",
  form: "forms",
});

const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"];

export function createEngineRouter({ orgId }) {
  const router = Router();

  router.get("/catalog/field-types", (_req, res) =>
    jsonOk(res, { items: FORM_FIELD_TYPES, formulaFunctions: listSupportedFormulaFunctions() })
  );

  router.get("/catalog/form-templates", (_req, res) => jsonOk(res, { items: FORM_TEMPLATES }));

  router.get("/catalog/form-templates/:key", (req, res) => {
    const t = getFormTemplate(req.params.key);
    if (!t) return jsonError(res, 404, "Template not found");
    return jsonOk(res, t);
  });

  router.get("/registry", async (req, res) => {
    const { data, error } = await getRegistryCatalog(orgId(req));
    if (error) return jsonError(res, 500, error.message || String(error));
    return jsonOk(res, data);
  });

  router.get("/registry/history", async (req, res) => {
    const { data, error } = await listRegistryHistory(orgId(req));
    if (error) return jsonError(res, 500, error.message || String(error));
    return jsonOk(res, { items: data || [] });
  });

  router.post("/registry/diff", requireRole(ADMIN_ROLES), async (req, res) => {
    const left = await getPublishedSnapshot(orgId(req), "metadata_registry", "catalog", req.body?.leftVersion);
    const right = await getPublishedSnapshot(orgId(req), "metadata_registry", "catalog", req.body?.rightVersion);
    return jsonOk(res, {
      diff: diffRegistrySnapshots(left.data?.snapshot_json, right.data?.snapshot_json),
    });
  });

  router.post("/engines/forms/validate", requireRole(ADMIN_ROLES), (req, res) => {
    const result = validateFormDefinition(req.body?.schema);
    if (!result.ok) return jsonError(res, 400, result.error);
    const layout = validateLayout(req.body?.layout);
    if (!layout.ok) return jsonError(res, 400, layout.error);
    return jsonOk(res, { ...result, layout: layout.layout });
  });

  router.post("/engines/forms/formula", requireRole(ADMIN_ROLES), (req, res) => {
    const result = evaluateFormula(req.body?.formula, req.body?.data || {});
    if (!result.ok) return jsonError(res, 400, result.error);
    return jsonOk(res, result);
  });

  router.post("/engines/workflows/analyze", requireRole(ADMIN_ROLES), (req, res) => {
    const cycles = detectWorkflowCycles(req.body?.definition);
    const deadlocks = detectWorkflowDeadlocks(req.body?.definition);
    return jsonOk(res, { cycles, deadlocks });
  });

  router.post("/versions/:type/:key/rollback", requireRole(ADMIN_ROLES), async (req, res) => {
    const { data, error } = await rollbackArtifactVersion(
      orgId(req),
      req.params.type,
      req.params.key,
      Number(req.body?.toVersion),
      req.appUser?.id
    );
    if (error) return jsonError(res, 400, error.message || String(error));
    return jsonOk(res, data);
  });

  router.post("/versions/:type/:key/clone", requireRole(ADMIN_ROLES), async (req, res) => {
    if (!req.body?.newKey) return jsonError(res, 400, "newKey required");
    const { data, error } = await cloneArtifact(
      orgId(req),
      req.params.type,
      req.params.key,
      req.body.newKey,
      req.appUser?.id
    );
    if (error) return jsonError(res, 400, error.message || String(error));
    return jsonOk(res, data);
  });

  router.post("/versions/compare", requireRole(ADMIN_ROLES), async (req, res) => {
    const a = await getPublishedSnapshot(orgId(req), req.body?.type, req.body?.key, req.body?.leftVersion);
    const b = await getPublishedSnapshot(orgId(req), req.body?.type, req.body?.key, req.body?.rightVersion);
    return jsonOk(res, compareSnapshots(a.data?.snapshot_json, b.data?.snapshot_json));
  });

  router.post("/engines/forms/validate-data", requireRole(ADMIN_ROLES), (req, res) => {
    const result = validateTicketDataAgainstSchema(req.body?.schema, req.body?.data);
    if (!result.ok) return jsonError(res, 400, result.error || "validation failed", { errors: result.errors });
    return jsonOk(res, result);
  });

  router.post("/engines/workflows/validate", requireRole(ADMIN_ROLES), (req, res) => {
    const result = validateWorkflowDefinition(req.body?.definition);
    if (!result.ok) return jsonError(res, 400, result.error);
    return jsonOk(res, result);
  });

  router.post("/engines/workflows/preview-transition", requireRole(ADMIN_ROLES), (req, res) => {
    const result = applyTransition(req.body?.definition, {
      currentState: req.body?.currentState,
      transitionKey: req.body?.transitionKey,
      role: req.body?.role || req.tenantRole,
      context: req.body?.context || {},
    });
    if (!result.ok) return jsonError(res, 400, result.error, { code: result.code });
    return jsonOk(res, result);
  });

  router.post("/engines/workflows/allowed", (req, res) => {
    const items = listAllowedTransitions(
      req.body?.definition,
      req.body?.currentState,
      req.body?.role || req.tenantRole
    );
    return jsonOk(res, { items });
  });

  router.post("/engines/email-parser/preview", requireRole(ADMIN_ROLES), (req, res) => {
    const result = previewEmailParse(req.body?.config || {}, req.body?.email || {});
    if (result.error) return jsonError(res, 400, result.error, { code: result.code });
    return jsonOk(res, result);
  });

  router.post("/engines/email-parser/ai-stub", requireRole(ADMIN_ROLES), (req, res) => {
    const extracted = simulateAiExtraction(req.body?.promptConfig || {}, req.body?.email || {});
    const gated = gateByConfidence(extracted.fields, Number(req.body?.threshold ?? 80));
    return jsonOk(res, { ...extracted, ...gated });
  });

  router.post("/engines/automations/simulate", requireRole(ADMIN_ROLES), (req, res) => {
    const result = simulateAutomation(req.body?.definition, req.body?.context || {});
    if (!result.ok) return jsonError(res, 400, result.error);
    return jsonOk(res, result);
  });

  router.post("/engines/notifications/render", requireRole(ADMIN_ROLES), (req, res) => {
    if (!shouldSend(req.body?.trigger, req.body?.context || {})) {
      return jsonOk(res, { skipped: true });
    }
    const result = renderNotification(req.body?.template || {}, req.body?.vars || {});
    if (!result.ok) return jsonError(res, 400, result.error);
    return jsonOk(res, result);
  });

  router.post("/engines/assignments/resolve", requireRole(ADMIN_ROLES), (req, res) => {
    const result = resolveAssignee(req.body?.rules || {}, req.body?.data || {}, req.body?.candidates || []);
    if (!result.ok) return jsonError(res, 400, result.error);
    return jsonOk(res, result);
  });

  router.post("/engines/reports/run", requireRole(ADMIN_ROLES), async (req, res) => {
    const { data: tickets, error } = await listPlatformTickets(orgId(req), { limit: 5000 });
    if (error) return jsonError(res, 500, error.message || String(error));
    const projected = projectTickets(req.body?.definition || { columns: [] }, tickets);
    if (!projected.ok) return jsonError(res, 400, projected.error);
    return jsonOk(res, projected);
  });

  router.post("/engines/dashboards/bind", requireRole(ADMIN_ROLES), async (req, res) => {
    const { data: tickets, error } = await listPlatformTickets(orgId(req), { limit: 5000 });
    if (error) return jsonError(res, 500, error.message || String(error));
    const kpi = aggregateKpi(req.body?.definition || {}, tickets);
    const bound = bindDashboard(req.body?.layout || { widgets: [] }, kpi);
    if (!bound.ok) return jsonError(res, 400, bound.error);
    return jsonOk(res, { kpi, ...bound });
  });

  router.post("/engines/webhooks/validate", requireRole(ADMIN_ROLES), (req, res) => {
    const result = validateWebhook(req.body || {});
    if (!result.ok) return jsonError(res, 400, result.error);
    return jsonOk(res, {
      ...result,
      samplePayload: buildWebhookPayload("ticket.created", req.body?.ticket || {}),
    });
  });

  router.get("/engines/search", async (req, res) => {
    const { data: tickets, error } = await listPlatformTickets(orgId(req), {
      limit: Number(req.query.limit || 100),
      q: req.query.q,
    });
    if (error) return jsonError(res, 500, error.message || String(error));
    const items = req.query.q ? tickets : filterTicketsByQuery(tickets, req.query.q);
    return jsonOk(res, { items });
  });

  // Generic artifact versioning
  router.get("/versions/:type/:key", async (req, res) => {
    const { data, error } = await listArtifactVersions(orgId(req), req.params.type, req.params.key);
    if (error) return jsonError(res, 500, error.message || String(error));
    return jsonOk(res, { items: data });
  });

  router.post("/versions/:type/:key/publish", requireRole(ADMIN_ROLES), async (req, res) => {
    const snapshot = req.body?.snapshot || req.body;
    const { data, error } = await publishArtifactVersion(orgId(req), {
      artifactType: req.params.type,
      artifactKey: req.params.key,
      snapshot,
      createdBy: req.appUser?.id,
    });
    if (error) return jsonError(res, 500, error.message || String(error));
    const bucket = ARTIFACT_TO_BUCKET[req.params.type];
    let registry = null;
    if (bucket && bucket !== "forms") {
      // forms publish via formService → publishFormToRegistry
      const reg = await publishToRegistry(
        orgId(req),
        bucket,
        req.params.key,
        data.version,
        snapshot,
        req.appUser?.id
      );
      registry = reg.data;
    }
    return jsonOk(res, { ...data, registry });
  });

  /** Live registry events (SSE) — METADATA consumers auto-reload without page refresh */
  router.get("/registry/events", (req, res) => {
    const organisationId = orgId(req);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    res.write(`event: connected\ndata: ${JSON.stringify({ organisationId })}\n\n`);

    const onPublish = (event) => {
      if (String(event.organisationId) !== String(organisationId)) return;
      res.write(`event: registry.published\ndata: ${JSON.stringify(event)}\n\n`);
    };
    registryEvents.on(`publish:${organisationId}`, onPublish);

    const heartbeat = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      registryEvents.off(`publish:${organisationId}`, onPublish);
    });
  });

  router.get("/versions/:type/:key/published", async (req, res) => {
    const { data, error } = await getPublishedSnapshot(
      orgId(req),
      req.params.type,
      req.params.key,
      req.query.version ? Number(req.query.version) : null
    );
    if (error) return jsonError(res, 500, error.message || String(error));
    if (!data) return jsonError(res, 404, "No published version");
    return jsonOk(res, data);
  });

  // Ticket types
  router.get("/ticket-types", async (req, res) => {
    const { data, error } = await listByOrg("platform_ticket_types", orgId(req));
    if (error) return jsonError(res, 500, error.message || String(error));
    return jsonOk(res, { items: data || [] });
  });

  router.post("/ticket-types", requireRole(ADMIN_ROLES), async (req, res) => {
    if (!req.body?.key) return jsonError(res, 400, "key required");
    const { data, error } = await upsertKeyedEntity("platform_ticket_types", orgId(req), {
      key: req.body.key,
      name: req.body.name,
      status: req.body.status || "draft",
      jsonColumns: { config_json: req.body.config || {} },
      extra: {
        description: req.body.description ?? null,
        icon: req.body.icon ?? null,
        color: req.body.color ?? null,
        form_key: req.body.formKey ?? null,
        workflow_key: req.body.workflowKey ?? null,
      },
    });
    if (error) return jsonError(res, 500, error.message || String(error));
    return jsonOk(res, data);
  });

  return router;
}
