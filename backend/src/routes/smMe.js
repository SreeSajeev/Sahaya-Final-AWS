/**
 * Service Manager assigned-tickets portal (mirrors /fe/me without tokens / onsite).
 */
import express from "express";
import { z } from "zod";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { attachTenantContext, isTenantAllowed, requireTenantOrSuperAdmin } from "../middleware/tenantContext.js";
import { jsonError, jsonOk } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { listAssignmentsByAssignedUserId } from "../repositories/assignmentRepository.js";
import {
  uploadSmResolutionProof,
  submitSmForVerification,
  assertSmOwnsCurrentAssignment,
} from "../services/smResolutionService.js";
import { getAssignmentWithTicketByAssignedUserAndTicket } from "../repositories/assignmentRepository.js";
import { listCommentsForTicket } from "../repositories/commentRepository.js";
import { computeTicketSlaView } from "../services/tenantSlaEngine.js";

const router = express.Router();

router.use(requireAuth);
router.use(attachTenantContext({ requireAuthenticated: false }));
router.use(requireAppUser);
router.use(requireTenantOrSuperAdmin);

function requireSmPortalRole(req, res) {
  const role = String(req.tenantRole || req.appUser?.role || "").toUpperCase();
  if (!["STAFF", "ADMIN", "SUPER_ADMIN"].includes(role)) {
    jsonError(res, 403, "Service Manager portal requires STAFF or ADMIN role");
    return false;
  }
  return true;
}

function mapSmTicketRow(assignment, slaView = null) {
  const ticket = assignment.tickets || {};
  return {
    ...ticket,
    assignment_id: assignment.id,
    assignment_type: assignment.assignment_type || "SERVICE_MANAGER",
    assigned_user_id: assignment.assigned_user_id,
    assigned_at: assignment.assigned_at ?? assignment.created_at ?? null,
    assignment_due_at: assignment.assignment_due_at ?? null,
    assignment_remarks: assignment.assignment_remarks ?? null,
    sla: slaView,
  };
}

/**
 * GET /sm/me/tickets — tickets currently assigned to this Service Manager.
 */
router.get("/me/tickets", async (req, res) => {
  const startedAt = Date.now();
  if (!requireSmPortalRole(req, res)) return;
  try {
    const userId = req.appUser?.id ? String(req.appUser.id) : null;
    if (!userId) return jsonOk(res, { items: [] });

    const { data: assignments, error } = await listAssignmentsByAssignedUserId(userId);
    if (error) return jsonError(res, 500, error.message);

    const current = (assignments || []).filter((a) => {
      const ticket = a.tickets;
      if (!ticket?.id) return false;
      if (!isTenantAllowed(req, ticket.organisation_id)) return false;
      const currentId = ticket.current_assignment_id;
      return (
        currentId != null &&
        String(currentId).trim() !== "" &&
        String(currentId) === String(a.id)
      );
    });

    const items = current.map((a) => {
      const slaView = computeTicketSlaView(a.tickets, {
        assignedAt: a.assigned_at ?? a.created_at ?? null,
        now: new Date(),
      });
      return mapSmTicketRow(a, slaView);
    });

    logEvent("smMe.tickets", {
      tenantId: req.tenantId ?? null,
      userId,
      count: items.length,
      ms: Date.now() - startedAt,
    });
    return jsonOk(res, { items });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load assigned tickets");
  }
});

router.get("/me/tickets/:ticketId", async (req, res) => {
  if (!requireSmPortalRole(req, res)) return;
  try {
    const userId = req.appUser?.id ? String(req.appUser.id) : null;
    if (!userId) return jsonOk(res, { item: null });
    const { data: row, error } = await getAssignmentWithTicketByAssignedUserAndTicket(
      userId,
      req.params.ticketId
    );
    if (error) return jsonError(res, 500, error.message);
    const ownership = assertSmOwnsCurrentAssignment(row, userId);
    if (!ownership.ok) return jsonOk(res, { item: null });
    if (!isTenantAllowed(req, ownership.ticket.organisation_id)) {
      return jsonError(res, 403, "Forbidden");
    }
    return jsonOk(res, { item: mapSmTicketRow(row) });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load ticket");
  }
});

router.get("/me/tickets/:ticketId/comments", async (req, res) => {
  if (!requireSmPortalRole(req, res)) return;
  try {
    const userId = req.appUser?.id ? String(req.appUser.id) : null;
    const { data: row, error } = await getAssignmentWithTicketByAssignedUserAndTicket(
      userId,
      req.params.ticketId
    );
    if (error) return jsonError(res, 500, error.message);
    const ownership = assertSmOwnsCurrentAssignment(row, userId);
    if (!ownership.ok) return jsonError(res, ownership.status, ownership.error);
    const { data, error: cErr } = await listCommentsForTicket(req, req.params.ticketId, {
      limit: 200,
      offset: 0,
    });
    if (cErr) return jsonError(res, 500, cErr.message);
    return jsonOk(res, { items: data || [] });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to load comments");
  }
});

router.post("/me/tickets/:ticketId/resolution-proof", async (req, res) => {
  if (!requireSmPortalRole(req, res)) return;
  const parsed = z
    .object({
      remarks: z.string().max(4000).optional().nullable(),
      images: z.array(z.any()).min(1).max(10),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return jsonError(res, 400, "images (1–10) required");
  }
  try {
    const result = await uploadSmResolutionProof({
      req,
      ticketId: req.params.ticketId,
      images: parsed.data.images,
      remarks: parsed.data.remarks,
    });
    if (!result.ok) return jsonError(res, result.status ?? 400, result.error);
    return jsonOk(res, result);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to upload proof");
  }
});

router.post("/me/tickets/:ticketId/submit-verification", async (req, res) => {
  if (!requireSmPortalRole(req, res)) return;
  const remarks = req.body?.remarks ?? req.body?.verification_remarks ?? null;
  try {
    const result = await submitSmForVerification({
      req,
      ticketId: req.params.ticketId,
      remarks,
    });
    if (!result.ok) return jsonError(res, result.status ?? 400, result.error);
    return jsonOk(res, result);
  } catch (err) {
    return jsonError(res, 500, err?.message || "Failed to submit for verification");
  }
});

export default router;
