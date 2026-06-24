import express from "express";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { attachTenantContext } from "../middleware/tenantContext.js";
import { requireRole } from "../middleware/requireRole.js";
import { jsonError, jsonOk, safeTrim } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { authorizeAdminProvision, provisionAdminUser } from "../services/userProvisioningService.js";
import {
  findUserByAuthId,
  findUserByEmail,
  insertUser,
  updateUserAuthIdById,
  findMeProfileByAuthId,
} from "../repositories/userRepository.js";

const router = express.Router();

/**
 * Idempotent user provisioning endpoint.
 *
 * Purpose:
 * - Remove browser-side inserts into public.users.
 * - On first login (or after email confirmation), ensure a public.users row exists.
 *
 * Auth:
 * - Requires Authorization: Bearer <supabase_jwt>
 *
 * POST /auth/provision-user
 */
router.post("/provision-user", attachTenantContext({ requireAuthenticated: true }), requireAuth, async (req, res) => {
  const startedAt = Date.now();
  try {
    const authUser = req.user;
    if (!authUser?.id) return jsonError(res, 401, "Unauthorized");

    const { data: existing, error: existingErr } = await findUserByAuthId(authUser.id);
    if (existingErr) return jsonError(res, 500, existingErr.message);
    if (existing) {
      logEvent("authProvision.exists", { authUserId: authUser.id, userId: existing.id, ms: Date.now() - startedAt });
      return jsonOk(res, { profile: existing, created: false });
    }

    const email = safeTrim(authUser.email);
    if (email) {
      const { data: byEmail, error: emailErr } = await findUserByEmail(email);
      if (emailErr) return jsonError(res, 500, emailErr.message);
      if (byEmail) {
        const { data: updated, error: updErr } = await updateUserAuthIdById(byEmail.id, authUser.id);
        if (updErr) return jsonError(res, 500, updErr.message);
        logEvent("authProvision.backfilledAuthId", {
          authUserId: authUser.id,
          userId: updated.id,
          ms: Date.now() - startedAt,
        });
        return jsonOk(res, { profile: updated, created: false });
      }
    }

    const name =
      safeTrim(authUser.user_metadata?.name) ||
      (email ? email : `user_${String(authUser.id).slice(0, 8)}`);

    const role = safeTrim(authUser.user_metadata?.role) || "STAFF";
    const organisationId = safeTrim(authUser.user_metadata?.organisation_id);
    const clientSlug = safeTrim(authUser.user_metadata?.client_slug);
    const approvalStatus = safeTrim(authUser.user_metadata?.approval_status) || null;

    const payload = {
      auth_id: authUser.id,
      email: email,
      name: name,
      role,
      active: approvalStatus === "pending" || approvalStatus === "rejected" ? false : true,
      is_active: approvalStatus === "pending" || approvalStatus === "rejected" ? false : true,
      ...(approvalStatus ? { approval_status: approvalStatus } : {}),
      ...(organisationId && role !== "SUPER_ADMIN" ? { organisation_id: organisationId } : {}),
      ...(clientSlug ? { client_slug: clientSlug } : {}),
    };

    const { data: created, error: insertErr } = await insertUser(payload);
    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: retry } = await findUserByAuthId(authUser.id);
        if (retry) {
          logEvent("authProvision.raceRecovered", { authUserId: authUser.id, userId: retry.id, ms: Date.now() - startedAt });
          return jsonOk(res, { profile: retry, created: false });
        }
      }
      return jsonError(res, 500, insertErr.message);
    }

    logEvent("authProvision.created", { authUserId: authUser.id, userId: created?.id ?? null, ms: Date.now() - startedAt });
    return jsonOk(res, { profile: created, created: true });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Provisioning failed");
  }
});

/**
 * Return current app user profile (public.users row) for the caller.
 *
 * GET /auth/me
 */
router.get("/me", attachTenantContext({ requireAuthenticated: true }), requireAuth, async (req, res) => {
  const startedAt = Date.now();
  try {
    const authUser = req.user;
    if (!authUser?.id) return jsonError(res, 401, "Unauthorized");

    const { data, error } = await findMeProfileByAuthId(authUser.id);
    if (error) return jsonError(res, 500, error.message);
    if (!data) {
      const email = safeTrim(authUser.email);
      if (!email) return jsonOk(res, { profile: null });

      const { data: byEmail, error: emailErr } = await findUserByEmail(email, "id, name, email, role, active, is_active, client_slug, organisation_id, approval_status, created_at");
      if (emailErr) return jsonError(res, 500, emailErr.message);
      if (!byEmail) return jsonOk(res, { profile: null });

      const { data: updated, error: updErr } = await updateUserAuthIdById(
        byEmail.id,
        authUser.id,
        "id, name, email, role, active, is_active, client_slug, organisation_id, approval_status, created_at"
      );
      if (updErr) return jsonError(res, 500, updErr.message);

      logEvent("authProvision.meBackfilledAuthId", {
        authUserId: authUser.id,
        userId: updated.id,
        ms: Date.now() - startedAt,
      });
      return jsonOk(res, { profile: updated });
    }

    logEvent("authProvision.me", { authUserId: authUser.id, userId: data.id, ms: Date.now() - startedAt });
    return jsonOk(res, { profile: data });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load profile");
  }
});

/**
 * Admin-only server-side provisioning (auth.users + public.users + optional FE).
 * Gated by PROVISION_SERVER_SIDE_ENABLED.
 *
 * POST /auth/provision/admin
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
