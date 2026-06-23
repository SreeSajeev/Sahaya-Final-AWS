import { safeTrim, jsonError, jsonOk } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { insertAuditLog } from "../services/auditLogService.js";
import {
  parseCreateComplaintPointBody,
  parseUpdateComplaintPointBody,
} from "../services/complaintPointValidation.js";
import {
  listComplaintPoints,
  getComplaintPointById,
  createComplaintPoint,
  updateComplaintPoint,
  disableComplaintPoint,
  regenerateComplaintPointToken,
  deleteComplaintPoint,
} from "../services/complaintPointService.js";

export async function listComplaintPointsHandler(req, res) {
  const startedAt = Date.now();
  const organisationId = safeTrim(req.query.organisation_id) || safeTrim(req.query.organisationId);
  const status = safeTrim(req.query.status);

  try {
    const { data, error } = await listComplaintPoints(req, {
      organisationId: organisationId || null,
      status: status || null,
    });
    if (error) return jsonError(res, 500, error.message);
    logEvent("complaintPoints.list", {
      tenantId: req.tenantId ?? null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
      ms: Date.now() - startedAt,
      count: data.length,
    });
    return jsonOk(res, { items: data });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to list complaint points");
  }
}

export async function getComplaintPointHandler(req, res) {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  try {
    const { data, error, forbidden } = await getComplaintPointById(req, id);
    if (error) return jsonError(res, 500, error.message);
    if (forbidden) return jsonError(res, 403, "Forbidden");
    if (!data) return jsonError(res, 404, "Complaint point not found");
    logEvent("complaintPoints.get", { ms: Date.now() - startedAt, complaintPointId: id });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load complaint point");
  }
}

export async function createComplaintPointHandler(req, res) {
  const startedAt = Date.now();
  const parsed = parseCreateComplaintPointBody(req.body);
  if (!parsed.ok) {
    return jsonError(res, parsed.status, parsed.message, parsed.details ? { details: parsed.details } : {});
  }

  try {
    const outcome = await createComplaintPoint(req, parsed.data);
    if (outcome.error) {
      return jsonError(res, outcome.error.status, outcome.error.message);
    }
    const row = outcome.data;
    void insertAuditLog({
      req,
      entity_type: "complaint_point",
      entity_id: row.id,
      action: "complaint_point_created",
      organisation_id: row.organisation_id ?? null,
      metadata: {
        name: row.name,
        status: row.status,
        public_token: row.public_token,
        token_version: row.token_version,
      },
    });
    logEvent("complaintPoints.create", {
      ms: Date.now() - startedAt,
      complaintPointId: row.id,
      organisationId: row.organisation_id ?? null,
    });
    return jsonOk(res, row);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to create complaint point");
  }
}

export async function updateComplaintPointHandler(req, res) {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  const parsed = parseUpdateComplaintPointBody(req.body);
  if (!parsed.ok) {
    return jsonError(res, parsed.status, parsed.message, parsed.details ? { details: parsed.details } : {});
  }

  try {
    const outcome = await updateComplaintPoint(req, id, parsed.data);
    if (outcome.error) {
      return jsonError(res, outcome.error.status, outcome.error.message);
    }
    const row = outcome.data;
    void insertAuditLog({
      req,
      entity_type: "complaint_point",
      entity_id: row.id,
      action: "complaint_point_updated",
      organisation_id: row.organisation_id ?? null,
      metadata: {
        name: row.name,
        status: row.status,
        token_version: row.token_version,
      },
    });
    logEvent("complaintPoints.update", { ms: Date.now() - startedAt, complaintPointId: id });
    return jsonOk(res, row);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to update complaint point");
  }
}

export async function disableComplaintPointHandler(req, res) {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  try {
    const outcome = await disableComplaintPoint(req, id);
    if (outcome.error) {
      return jsonError(res, outcome.error.status, outcome.error.message);
    }
    const row = outcome.data;
    void insertAuditLog({
      req,
      entity_type: "complaint_point",
      entity_id: row.id,
      action: "complaint_point_disabled",
      organisation_id: row.organisation_id ?? null,
      metadata: { name: row.name, status: row.status },
    });
    logEvent("complaintPoints.disable", { ms: Date.now() - startedAt, complaintPointId: id });
    return jsonOk(res, row);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to disable complaint point");
  }
}

export async function regenerateComplaintPointTokenHandler(req, res) {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  try {
    const outcome = await regenerateComplaintPointToken(req, id);
    if (outcome.error) {
      return jsonError(res, outcome.error.status, outcome.error.message);
    }
    const row = outcome.data;
    void insertAuditLog({
      req,
      entity_type: "complaint_point",
      entity_id: row.id,
      action: "complaint_point_token_regenerated",
      organisation_id: row.organisation_id ?? null,
      metadata: {
        name: row.name,
        token_version: row.token_version,
        previous_token_version: outcome.previous_token_version ?? null,
      },
    });
    logEvent("complaintPoints.regenerateToken", {
      ms: Date.now() - startedAt,
      complaintPointId: id,
      tokenVersion: row.token_version,
    });
    return jsonOk(res, row);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to regenerate token");
  }
}

export async function deleteComplaintPointHandler(req, res) {
  const startedAt = Date.now();
  const id = safeTrim(req.params.id);
  try {
    const outcome = await deleteComplaintPoint(req, id);
    if (outcome.error) {
      return jsonError(res, outcome.error.status, outcome.error.message);
    }
    const row = outcome.data;
    void insertAuditLog({
      req,
      entity_type: "complaint_point",
      entity_id: row.id,
      action: "complaint_point_disabled",
      organisation_id: row.organisation_id ?? null,
      metadata: { name: row.name, status: row.status, soft_delete: true },
    });
    logEvent("complaintPoints.delete", { ms: Date.now() - startedAt, complaintPointId: id });
    return jsonOk(res, { success: true, id: row.id, point: row });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to delete complaint point");
  }
}
