import express from "express";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { attachTenantContext } from "../middleware/tenantContext.js";
import { requireRole } from "../middleware/requireRole.js";
import { jsonError, jsonOk } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { authorizeAdminProvision, provisionAdminUser } from "../services/userProvisioningService.js";
import { getMeProfile } from "../services/localAuthService.js";

const router = express.Router();

/**
 * Legacy no-op: profiles are created via local signup / admin provision.
 * Kept for compatibility with older clients.
 */
router.post("/provision-user", attachTenantContext({ requireAuthenticated: true }), requireAuth, async (req, res) => {
  const profile = await getMeProfile(req.user.id);
  return jsonOk(res, { profile, created: false });
});

/**
 * GET /auth/me — also available on localAuth router; keep for existing mount order.
 */
router.get("/me", attachTenantContext({ requireAuthenticated: true }), requireAuth, async (req, res) => {
  const startedAt = Date.now();
  try {
    const profile = await getMeProfile(req.user.id);
    logEvent("authProvision.me", { userId: req.user.id, ms: Date.now() - startedAt });
    return jsonOk(res, { profile });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load profile");
  }
});

/**
 * Admin-only server-side provisioning (PostgreSQL only).
 * Gated by PROVISION_SERVER_SIDE_ENABLED.
 */
router.post(
  "/provision/admin",
  attachTenantContext({ requireAuthenticated: true }),
  requireAuth,
  requireAppUser,
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  async (req, res) => {
    const startedAt = Date.now();
    try {
      const authz = authorizeAdminProvision(req, req.body);
      if (!authz.ok) return jsonError(res, authz.status, authz.message);

      const result = await provisionAdminUser({ req, body: authz.body });
      if (!result.ok) return jsonError(res, result.status, result.message);

      logEvent("authProvision.admin", {
        actorUserId: req.appUser?.id ?? null,
        createdUserId: result.payload?.profile?.id ?? null,
        ms: Date.now() - startedAt,
      });
      return jsonOk(res, result.payload);
    } catch (err) {
      return jsonError(res, 500, err?.message || "Provisioning failed");
    }
  }
);

export default router;
