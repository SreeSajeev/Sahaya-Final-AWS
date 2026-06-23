import express from "express";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { attachTenantContext, requireTenantOrSuperAdmin } from "../middleware/tenantContext.js";
import { requireRole } from "../middleware/requireRole.js";
import { requirePublicComplaintsEnabled } from "../middleware/publicComplaintsGate.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import {
  listComplaintPointsHandler,
  getComplaintPointHandler,
  createComplaintPointHandler,
  updateComplaintPointHandler,
  disableComplaintPointHandler,
  regenerateComplaintPointTokenHandler,
  deleteComplaintPointHandler,
} from "../controllers/complaintPointController.js";

const router = express.Router();

const COMPLAINT_POINT_READ_ROLES = ["ADMIN", "SUPER_ADMIN"];
const COMPLAINT_POINT_WRITE_ROLES = ["ADMIN", "SUPER_ADMIN"];

router.use(requireAuth);
router.use(attachTenantContext({ requireAuthenticated: false }));
router.use(requireAppUser);
router.use(requireTenantOrSuperAdmin);
router.use(requirePublicComplaintsEnabled);

router.param("id", validateUuidParam);

router.get("/", requireRole(COMPLAINT_POINT_READ_ROLES), listComplaintPointsHandler);
router.get("/:id", requireRole(COMPLAINT_POINT_READ_ROLES), getComplaintPointHandler);
router.post("/", requireRole(COMPLAINT_POINT_WRITE_ROLES), createComplaintPointHandler);
router.put("/:id", requireRole(COMPLAINT_POINT_WRITE_ROLES), updateComplaintPointHandler);
router.post("/:id/disable", requireRole(COMPLAINT_POINT_WRITE_ROLES), disableComplaintPointHandler);
router.post(
  "/:id/regenerate-token",
  requireRole(COMPLAINT_POINT_WRITE_ROLES),
  regenerateComplaintPointTokenHandler
);
router.delete("/:id", requireRole(COMPLAINT_POINT_WRITE_ROLES), deleteComplaintPointHandler);

export default router;
