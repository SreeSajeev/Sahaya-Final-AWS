import express from "express";
import { supabase } from "../supabaseClient.js";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { FE_MANAGEMENT_ROLES } from "../constants/rolePolicies.js";
import {
  attachTenantContext,
  isTenantAllowed,
  requireTenantOrSuperAdmin,
  scopeQueryByTenant,
} from "../middleware/tenantContext.js";

function withTenantScope(query, req, orgColumn = "organisation_id") {
  return scopeQueryByTenant(query, req, orgColumn);
}
import { jsonError, jsonOk, safeTrim } from "../utils/http.js";
import { insertAuditLog } from "../services/auditLogService.js";
import { logEvent } from "../utils/structuredLog.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";

const router = express.Router();

router.use(requireAuth);
router.use(attachTenantContext({ requireAuthenticated: false }));
router.use(requireAppUser);
router.use(requireTenantOrSuperAdmin);

/**
 * POST /field-executives
 * Body: { name, email?, phone?, base_location?, skills?, active }
 */
router.post("/", requireRole(FE_MANAGEMENT_ROLES), async (req, res) => {
  const startedAt = Date.now();
  try {
    const name = safeTrim(req.body?.name);
    if (!name) return jsonError(res, 400, "name is required");

    const orgFromBody = safeTrim(req.body?.organisation_id);
    let organisationId = req.tenantId ?? null;
    if (req.isSuperAdmin && orgFromBody) {
      organisationId = orgFromBody;
    }
    if (!organisationId && !req.isSuperAdmin) {
      return jsonError(res, 403, "Tenant context missing");
    }
    if (!organisationId) {
      return jsonError(res, 400, "organisation_id is required");
    }

    const payload = {
      name,
      email: safeTrim(req.body?.email),
      phone: safeTrim(req.body?.phone),
      base_location: normalizeLocation(safeTrim(req.body?.base_location)),
      skills: req.body?.skills ?? null,
      active: req.body?.active !== false,
      organisation_id: organisationId,
    };
    const userId = safeTrim(req.body?.user_id);
    if (userId) payload.user_id = userId;

    const { data, error } = await supabase.from("field_executives").insert(payload).select("*").single();
    if (error) return jsonError(res, 400, error.message);
    if (!isTenantAllowed(req, data?.organisation_id)) return jsonError(res, 403, "Forbidden");

    void insertAuditLog({
      req,
      entity_type: "field_executive",
      entity_id: data.id,
      action: "field_executive_created",
      organisation_id: organisationId ?? data.organisation_id ?? null,
      metadata: { name: data.name, base_location: data.base_location },
    });

    logEvent("fieldExecutives.create", { tenantId: req.tenantId ?? null, ms: Date.now() - startedAt, feId: data?.id ?? null });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to create field executive");
  }
});

/**
 * PATCH /field-executives/:id
 * Body: partial { name, email, phone, base_location, skills, active }
 */
router.patch("/:id", requireRole(FE_MANAGEMENT_ROLES), async (req, res) => {
  const startedAt = Date.now();
  const id = req.params.id;
  try {
    let q = supabase.from("field_executives").select("id, organisation_id").eq("id", id);
    q = withTenantScope(q, req);
    const { data: existing, error: exErr } = await q.maybeSingle();
    if (exErr) return jsonError(res, 500, exErr.message);
    if (!existing) return jsonError(res, 404, "Field executive not found");
    if (!isTenantAllowed(req, existing.organisation_id)) return jsonError(res, 403, "Forbidden");

    const allowed = ["name", "email", "phone", "base_location", "skills", "active"];
    const patch = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body ?? {}, k)) patch[k] = req.body[k];
    }
    if (Object.prototype.hasOwnProperty.call(patch, "base_location")) {
      patch.base_location = normalizeLocation(safeTrim(patch.base_location));
    }
    if (Object.keys(patch).length === 0) return jsonError(res, 400, "No valid fields to update");

    let uq = supabase.from("field_executives").update(patch).eq("id", id).select("*");
    uq = withTenantScope(uq, req);
    const { data, error } = await uq.single();
    if (error) return jsonError(res, 500, error.message);
    logEvent("fieldExecutives.patch", { tenantId: req.tenantId ?? null, feId: id, ms: Date.now() - startedAt });
    return jsonOk(res, data);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to update field executive");
  }
});

export default router;

