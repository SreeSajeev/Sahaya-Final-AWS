import express from "express";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { attachTenantContext, requireTenantOrSuperAdmin } from "../middleware/tenantContext.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { jsonOk, jsonRes } from "../utils/http.js";
import {
  buildResolutionLocationsCsv, createResolutionLocation, getResolutionLocation, importResolutionLocations,
  listResolutionLocations, updateResolutionLocation,
} from "../services/resolutionLocationService.js";

const router = express.Router();
const ROLES = ["STAFF", "ADMIN", "SUPER_ADMIN"];
router.use(requireAuth, attachTenantContext({ requireAuthenticated: false }), requireAppUser, requireTenantOrSuperAdmin);
router.param("id", validateUuidParam);
function respond(res, result) {
  if (result.error) return jsonRes(res, result.error.status || 400, { error: result.error.message, details: result.error.details });
  if (result.forbidden) return jsonRes(res, 403, { error: "Forbidden" });
  if (!result.data) return jsonRes(res, 404, { error: "Resolution location not found" });
  return jsonOk(res, result.data);
}
router.get("/", requireRole(ROLES), async (req, res) => respond(res, await listResolutionLocations(req, req.query)));
router.get("/export", requireRole(ROLES), async (req, res) => {
  const result = await listResolutionLocations(req, { ...req.query, active_only: false });
  if (result.error) return respond(res, result);
  res.type("text/csv").attachment("resolution-locations.csv").send(buildResolutionLocationsCsv(result.data));
});
router.post("/import", requireRole(ROLES), async (req, res) => respond(res, await importResolutionLocations(req, req.body?.rows)));
router.post("/", requireRole(ROLES), async (req, res) => respond(res, await createResolutionLocation(req, req.body || {})));
router.get("/:id", requireRole(ROLES), async (req, res) => respond(res, await getResolutionLocation(req, req.params.id)));
router.patch("/:id", requireRole(ROLES), async (req, res) => respond(res, await updateResolutionLocation(req, req.params.id, req.body || {})));
router.delete("/:id", requireRole(ROLES), async (req, res) => respond(res, await updateResolutionLocation(req, req.params.id, { is_active: false })));
export default router;
