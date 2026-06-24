import express from "express";
import { z } from "zod";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { attachTenantContext } from "../middleware/tenantContext.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { jsonRes, jsonOk, safeDbErrorForClient } from "../utils/http.js";
import { insertAuditLog } from "../services/auditLogService.js";
import { findUserById, updateUserById } from "../repositories/userRepository.js";

const router = express.Router();

router.use(requireAuth);
router.use(attachTenantContext({ requireAuthenticated: false }));
router.use(requireAppUser);
router.param("id", validateUuidParam);

const patchOrgBody = z.object({
  organisation_id: z.string().uuid(),
});

const patchApprovalBody = z.object({
  approval_status: z.enum(["approved", "rejected"]),
});

const patchStatusBody = z.object({
  is_active: z.boolean(),
});

router.patch(
  "/:id/organisation",
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    const userId = req.params.id;
    const parsed = patchOrgBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return jsonRes(res, 400, { error: "organisation_id (UUID) required", details: parsed.error.flatten() });
    }
    const { organisation_id } = parsed.data;
    try {
      const { data, error } = await updateUserById(
        userId,
        { organisation_id: String(organisation_id).trim() },
        "id, organisation_id"
      );
      if (error) return jsonRes(res, 500, { error: safeDbErrorForClient(error, "Update failed") });
      if (!data) return jsonRes(res, 404, { error: "User not found" });
      return jsonOk(res, data);
    } catch (err) {
      return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Update failed") });
    }
  }
);

router.patch(
  "/:id/approval",
  requireRole(["SUPER_ADMIN", "ADMIN"]),
  async (req, res) => {
    const userId = req.params.id;
    const parsed = patchApprovalBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return jsonRes(res, 400, { error: "approval_status must be approved or rejected", details: parsed.error.flatten() });
    }
    const { approval_status } = parsed.data;
    try {
      const { data: target, error: loadErr } = await findUserById(userId, "id, organisation_id");
      if (loadErr) return jsonRes(res, 500, { error: safeDbErrorForClient(loadErr, "Load failed") });
      if (!target) return jsonRes(res, 404, { error: "User not found" });
      if (!req.isSuperAdmin && req.tenantId && target.organisation_id !== req.tenantId) {
        return jsonRes(res, 403, { error: "Forbidden" });
      }
      const updates =
        approval_status === "approved"
          ? { approval_status: "approved", is_active: true, active: true }
          : { approval_status: "rejected" };
      const { data, error } = await updateUserById(userId, updates);
      if (error) return jsonRes(res, 500, { error: safeDbErrorForClient(error, "Update failed") });
      return jsonOk(res, data);
    } catch (err) {
      return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Update failed") });
    }
  }
);

router.patch(
  "/:id/status",
  requireRole(["SUPER_ADMIN"]),
  async (req, res) => {
    const userId = req.params.id;
    const parsed = patchStatusBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return jsonRes(res, 400, { error: "is_active must be a boolean", details: parsed.error.flatten() });
    }
    const { is_active } = parsed.data;

    try {
      console.log("[TENANT_GUARD] admin_user_status_update", {
        actorUserId: req.appUser?.id || null,
        actorTenantId: req.tenantId || null,
        isSuperAdmin: Boolean(req.isSuperAdmin),
        targetUserId: userId,
      });
      const { data: targetUser, error: loadErr } = await findUserById(userId, "id, organisation_id");
      if (loadErr) {
        return jsonRes(res, 500, { error: safeDbErrorForClient(loadErr, "Load failed") });
      }
      if (!targetUser) {
        return jsonRes(res, 404, { error: "User not found" });
      }

      const { data, error } = await updateUserById(
        userId,
        { is_active, active: is_active },
        "id, is_active, active"
      );

      if (error) {
        return jsonRes(res, 500, { error: safeDbErrorForClient(error, "Update failed") });
      }
      if (!data) {
        return jsonRes(res, 404, { error: "User not found" });
      }

      void insertAuditLog({
        req,
        entity_type: "user",
        entity_id: userId,
        action: is_active ? "user_enabled" : "user_disabled",
        organisation_id: targetUser.organisation_id ?? req.tenantId ?? null,
        metadata: { is_active },
      });

      return jsonOk(res, data);
    } catch (err) {
      return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Update failed") });
    }
  }
);

export default router;
