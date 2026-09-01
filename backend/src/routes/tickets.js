import express from "express";
import { TOKEN_STATES, revokeTokensForTicket } from "../services/tokenService.js";
import { sendResolutionEmail, sendClientRejectionEmail } from "../services/emailService.js";
import {
  listClientNotificationEmails,
  validateNotifyEmailsAgainstAllowed,
} from "../services/clientNotificationEmailResolver.js";
import {
  parseAdditionalNotifyEmails,
  mergeCloseEmailRecipients,
  mapNotificationEmailsForContext,
} from "../services/closureEmailRecipients.js";
import {
  buildRejectionEvidenceOptions,
  resolveRejectionEvidence,
  parseRejectionUploadImage,
  REJECTION_EMAIL_ATTACHMENT_MAX_BYTES,
} from "../services/rejectionEvidenceService.js";
import { listCommentsForTicket, insertComment, updateCommentById } from "../repositories/commentRepository.js";
import { findActiveTenantClientBySlug } from "../repositories/tenantClientRepository.js";
import { normalizeClientSlug } from "../services/tenantClientService.js";
import { setOnsiteDeadline } from "../services/slaService.js";
import {
  assignOneTicket,
  reassignOneTicket,
  BULK_ASSIGN_MAX_TICKETS,
  getBulkAssignStatusRejectionReason,
  normalizeAssignmentDueAtIso,
  respondTenantMismatchIfNeeded,
} from "../services/assignmentService.js";
import {
  parseAssignmentContextImages,
  persistAssignmentContextImages,
  addPostAssignmentContextImages,
} from "../services/assignmentContextService.js";
import { insertAuditLog } from "../services/auditLogService.js";
import { createManualTicketFromBody } from "../services/manualTicketService.js";
import {
  previewTicketImport,
  confirmTicketImport,
} from "../services/ticketImportService.js";
import { requireAuth, requireAppUser } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireBulkAssignEnabled } from "../middleware/bulkAssignGate.js";
import { requireBulkTicketImportEnabled } from "../middleware/bulkImportGate.js";
import { z } from "zod";
import { FE_GATED_RESOLUTION_TOKEN } from "../config/appConfig.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import {
  attachTenantContext,
  denyTenantMismatch,
  isTenantAllowed,
  requireTenantOrSuperAdmin,
  scopeQueryByTenant,
} from "../middleware/tenantContext.js";
import { validateUuidParam } from "../middleware/validateUuidParam.js";
import { logTicketsAuthObservability } from "../middleware/securityObservability.js";
import { jsonRes, jsonOk, safeDbErrorForClient } from "../utils/http.js";
import { redactEmail } from "../utils/redact.js";
import { logEvent } from "../utils/structuredLog.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { normalizeTicketPriorityInput, priorityDisplayLabel } from "../utils/normalizeTicketPriority.js";
import {
  STAFF_OPERATION_ROLES,
  TICKET_CREATE_ROLES,
} from "../constants/rolePolicies.js";
import { validateTicketClosePreconditions } from "../services/closeValidationService.js";
import {
  listTicketsScoped,
  getTicketsByIdsScoped,
  getTicketByIdForAssign,
  getTicketByIdScoped,
  getTicketByIdUnscoped,
  updateTicketById,
  updateTicketCloseWithFallback,
  reviewCompleteTicketScoped,
  getTicketStatusById,
} from "../repositories/ticketQueryRepository.js";
import { updateSlaByTicketId } from "../repositories/slaRepository.js";
import { getAssignmentById } from "../repositories/assignmentRepository.js";
import { findUserNameById } from "../repositories/userRepository.js";
import { getFieldExecutiveById } from "../repositories/fieldExecutiveRepository.js";
import { findActiveResolutionTokenForTicket } from "../repositories/feActionTokenRepository.js";
import { hideCommentImages } from "../services/imageVisibilityService.js";
import { getCloseFormFields, validateCloseFormSnapshot } from "../services/closeFormService.js";
import { resolveResolutionLocationForTicketClose } from "../services/resolutionLocationService.js";
import { getOrganisationById } from "../repositories/organisationRepository.js";
import { buildClosureTimelineSummary } from "../services/closureTimelineSummary.js";

const router = express.Router();

router.use(requireAuth);
router.use(attachTenantContext({ requireAuthenticated: false }));
router.use(requireAppUser);
router.use(requireTenantOrSuperAdmin);
router.use(logTicketsAuthObservability);

router.param("id", validateUuidParam);

router.post("/:id/comments/:commentId/hide-images", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const parsed = z.object({ reason: z.string().max(2000).optional().nullable() }).safeParse(req.body ?? {});
  if (!parsed.success) return jsonRes(res, 400, { error: "Invalid body", details: parsed.error.flatten() });
  try {
    const outcome = await hideCommentImages({
      req,
      ticketId: req.params.id,
      commentId: req.params.commentId,
      reason: parsed.data.reason,
    });
    if (!outcome.ok) return jsonRes(res, outcome.status ?? 400, { error: outcome.error });
    return jsonOk(res, outcome);
  } catch (error) {
    return jsonRes(res, 500, { error: safeDbErrorForClient(error, "Failed to hide image") });
  }
});

const assignBodySchema = z
  .object({
    assignment_type: z
      .enum(["FIELD_EXECUTIVE", "SERVICE_MANAGER"])
      .optional()
      .default("FIELD_EXECUTIVE"),
    feId: z.string().uuid().optional().nullable(),
    assigned_user_id: z.string().uuid().optional().nullable(),
    assignment_remarks: z.string().max(4000).optional().nullable(),
    // Optional: ISO-ish datetime from frontend (datetime-local → toISOString() or variants).
    assignment_due_at: z.string().max(64).optional().nullable(),
    state: z.string().max(100).optional().nullable(),
    /**
     * Optional manager assignment context images (each with its own remark).
     * Stored via existing proof S3 + one timeline comment per image.
     */
    context_images: z
      .array(
        z
          .object({
            contentType: z.string().max(80),
            filename: z.string().max(120).optional().nullable(),
            remark: z.string().max(4000).optional().nullable(),
            dataBase64: z.string().min(1).max(8_000_000).optional(),
            data_base64: z.string().min(1).max(8_000_000).optional(),
          })
          .refine((v) => Boolean(v.dataBase64 || v.data_base64), {
            message: "context_images entry requires dataBase64",
          })
      )
      .max(10)
      .optional()
      .default([]),
  })
  .superRefine((data, ctx) => {
    if (data.assignment_type === "SERVICE_MANAGER") {
      if (!data.assigned_user_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "assigned_user_id is required for Service Manager assignment",
          path: ["assigned_user_id"],
        });
      }
    } else if (!data.feId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "feId is required for Field Executive assignment",
        path: ["feId"],
      });
    }
  });

const postAssignmentContextSchema = z.object({
  context_images: assignBodySchema.shape.context_images,
});

router.post("/:id/assignment-context", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const ticketId = req.params.id;
  const parsed = postAssignmentContextSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return jsonRes(res, 400, { error: "Invalid request body", details: parsed.error.flatten() });
  }
  try {
    const outcome = await addPostAssignmentContextImages({
      req,
      ticketId,
      contextImagesRaw: parsed.data.context_images,
    });
    if (!outcome.ok) {
      return jsonRes(res, outcome.status ?? 400, { error: outcome.error });
    }
    return jsonOk(res, {
      uploaded: outcome.uploaded ?? 0,
      comment_ids: outcome.commentIds ?? [],
    });
  } catch (err) {
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Failed to add assignment context") });
  }
});

const bulkAssignBodySchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1).max(BULK_ASSIGN_MAX_TICKETS),
  feId: z.string().uuid(),
  assignment_due_at: z.string().max(64).optional().nullable(),
  group_label: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const listTicketsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(500),
  offset: z.coerce.number().int().min(0).max(500000).optional().default(0),
});

const rejectBodySchema = z.object({
  reason: z
    .string({ required_error: "Rejection reason is required." })
    .max(1000)
    .refine((v) => String(v).trim().length > 0, { message: "Rejection reason is required." }),
  /** Selected client notification emails — re-validated server-side against Client contacts. */
  recipients: z.array(z.string().max(320)).max(50).optional().default([]),
  /** Optional FE proof reference (comment + index); never accept raw S3 keys from client. */
  evidence: z
    .object({
      commentId: z.string().uuid(),
      proofIndex: z.coerce.number().int().min(0).max(50),
    })
    .optional()
    .nullable(),
  /**
   * Optional manager-uploaded rejection photo (base64).
   * Mutually exclusive with `evidence` (FE proof selection).
   */
  evidence_upload: z
    .object({
      contentType: z.string().max(80),
      filename: z.string().max(120).optional().nullable(),
      dataBase64: z.string().min(1).max(8_000_000).optional(),
      data_base64: z.string().min(1).max(8_000_000).optional(),
    })
    .refine((v) => Boolean(v.dataBase64 || v.data_base64), {
      message: "evidence_upload requires dataBase64",
    })
    .optional()
    .nullable(),
});

const closeBodySchema = z.object({
  /**
   * Required when the tenant has active resolution locations configured.
   * Optional/null when the master catalog is empty (ops soft-gate).
   */
  resolution_location_id: z
    .string()
    .uuid({ message: "Resolution location is required." })
    .optional()
    .nullable(),
  /** UI: Resolution Remarks — required non-empty after trim. Stored as verification_remarks. */
  verification_remarks: z
    .string({ required_error: "Resolution remarks are required." })
    .max(12000)
    .refine((v) => String(v).trim().length > 0, { message: "Resolution remarks are required." }),
  /** UI: Location — stored as review_notes (legacy column). */
  review_notes: z.string().max(12000).optional().nullable(),
  resolution_category: z.string().max(500).optional().nullable(),
  /** Required when resolution_category is OTHER; persisted via verification_remarks + audit metadata. */
  resolution_other_details: z.string().max(12000).optional().nullable(),
  /** Selected Client notification emails (must be in listClientNotificationEmails allow-list). */
  recipients: z.array(z.string().max(320)).max(50).optional().default([]),
  /**
   * Optional additional notify address(es); comma/semicolon-separated.
   * Format-validated only; merged with selected recipients (deduped).
   * Backward-compatible with pre-checkbox clients that only sent this field.
   */
  notification_email: z.string().max(2000).optional().nullable(),
  close_form_values: z.record(z.union([z.string().max(12000), z.number(), z.null()])).optional().default({}),
});

const reviewCompleteBodySchema = z.object({
  category: z.string().min(1).max(200),
  issue_type: z.string().min(1).max(200),
  location: z.string().min(1).max(500),
  vehicle_number: z.string().max(80).optional().nullable(),
  priority: z.boolean().optional(),
  priority_level: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

/* ======================================================
   CREATE TICKET (manual) — additive
   POST /tickets
====================================================== */
router.post("/", requireRole(TICKET_CREATE_ROLES), async (req, res) => {
  try {
    const outcome = await createManualTicketFromBody(req, req.body ?? {});
    if (!outcome.ok) {
      return jsonRes(res, outcome.status ?? 400, {
        error: outcome.error,
        ...(outcome.details ? { details: outcome.details } : {}),
      });
    }
    return jsonOk(res, outcome.ticket);
  } catch (err) {
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Failed to create ticket") });
  }
});

const BULK_IMPORT_ROLES = ["ADMIN", "STAFF", "SUPER_ADMIN"];

const importRowsBodySchema = z.object({
  rows: z.array(z.record(z.unknown())).min(1),
});

/* ======================================================
   BULK TICKET IMPORT (additive — manual create helper)
   POST /tickets/import/preview
   POST /tickets/import/confirm
====================================================== */
router.post(
  "/import/preview",
  requireBulkTicketImportEnabled,
  requireRole(BULK_IMPORT_ROLES),
  async (req, res) => {
    try {
      const parsed = importRowsBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return jsonRes(res, 400, { error: "Invalid request body", details: parsed.error.flatten() });
      }
      const result = await previewTicketImport(req, parsed.data.rows);
      if (result.error) {
        return jsonRes(res, result.error.status, { error: result.error.message });
      }
      return jsonOk(res, result.data);
    } catch (err) {
      return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Import preview failed") });
    }
  }
);

router.post(
  "/import/confirm",
  requireBulkTicketImportEnabled,
  requireRole(BULK_IMPORT_ROLES),
  async (req, res) => {
    try {
      const parsed = importRowsBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return jsonRes(res, 400, { error: "Invalid request body", details: parsed.error.flatten() });
      }
      const result = await confirmTicketImport(req, parsed.data.rows);
      if (result.error) {
        return jsonRes(res, result.error.status, { error: result.error.message });
      }
      return jsonOk(res, result.data);
    } catch (err) {
      return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Import confirm failed") });
    }
  }
);

function withTenantScope(query, req, orgColumn = "organisation_id") {
  return scopeQueryByTenant(query, req, orgColumn);
}

/* ======================================================
   READ TICKETS
====================================================== */
router.get("/", async (req, res) => {
  try {
    const q = listTicketsQuerySchema.safeParse(req.query ?? {});
    if (!q.success) {
      return jsonRes(res, 400, { error: "Invalid query", details: q.error.flatten() });
    }
    const { limit, offset } = q.data;

    const { data, error } = await listTicketsScoped(req, { limit, offset, filters: {} });

    if (error) {
      return jsonRes(res, 500, { error: safeDbErrorForClient(error, "Failed to list tickets") });
    }

    return res.status(200).json(data || []);
  } catch (err) {
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Failed to list tickets") });
  }
});

/* ======================================================
   BULK ASSIGN (isolated — does not change single-assign contract)
====================================================== */
const BULK_ASSIGN_ROLES = ["ADMIN", "STAFF", "SUPER_ADMIN"];

router.post(
  "/bulk-assign",
  requireBulkAssignEnabled,
  requireRole(BULK_ASSIGN_ROLES),
  async (req, res) => {
  const parsed = bulkAssignBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return jsonRes(res, 400, { error: "Invalid request body", details: parsed.error.flatten() });
  }

  const { ticketIds, feId, assignment_due_at: rawDue, group_label, notes } = parsed.data;
  const assignmentDueAt = normalizeAssignmentDueAtIso(rawDue);
  const uniqueIds = [...new Set(ticketIds)];

  console.log("[TENANT_GUARD] bulk_assign_attempt", {
    ticketCount: uniqueIds.length,
    feId,
    tenantId: req.tenantId || null,
    role: req.tenantRole || null,
    isSuperAdmin: Boolean(req.isSuperAdmin),
  });

  try {
    const { data: tickets, error: ticketsError } = await getTicketsByIdsScoped(
      req,
      uniqueIds,
      "id, ticket_number, status, organisation_id"
    );

    if (ticketsError) {
      return jsonRes(res, 500, { error: safeDbErrorForClient(ticketsError, "Failed to load tickets") });
    }

    const ticketById = new Map((tickets || []).map((t) => [t.id, t]));
    const results = [];

    for (const ticketId of uniqueIds) {
      const ticket = ticketById.get(ticketId);
      if (!ticket) {
        results.push({
          ticket_id: ticketId,
          success: false,
          error: "Ticket not found",
        });
        continue;
      }

      if (!isTenantAllowed(req, ticket.organisation_id)) {
        results.push({
          ticket_id: ticketId,
          success: false,
          error: "Tenant mismatch",
        });
        continue;
      }

      const statusReason = getBulkAssignStatusRejectionReason(ticket.status);
      if (statusReason) {
        results.push({
          ticket_id: ticketId,
          ticket_number: ticket.ticket_number ?? null,
          success: false,
          error: statusReason,
        });
        continue;
      }

      const assignResult = await assignOneTicket({
        req,
        ticketId,
        feId,
        assignmentDueAt,
      });

      if (!assignResult.ok) {
        results.push({
          ticket_id: ticketId,
          ticket_number: ticket.ticket_number ?? null,
          success: false,
          error: assignResult.error,
        });
        continue;
      }

      const { assignment_id, notifications, token, onSiteToken, resolutionToken } = assignResult.data;
      results.push({
        ticket_id: ticketId,
        ticket_number: ticket.ticket_number ?? null,
        success: true,
        assignment_id,
        token,
        onSiteToken,
        resolutionToken,
        notifications,
      });
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.length - succeeded;

    const organisationId =
      req.isSuperAdmin && tickets?.length
        ? tickets.find((t) => ticketById.has(t.id))?.organisation_id ?? req.tenantId
        : req.tenantId ?? null;

    void insertAuditLog({
      req,
      entity_type: "bulk_assignment",
      entity_id: uniqueIds[0] ?? null,
      action: "bulk_ticket_assignment",
      organisation_id: organisationId,
      summary: `Bulk assignment: ${succeeded} of ${uniqueIds.length} tickets assigned`,
      metadata: {
        fe_id: feId,
        group_label: group_label?.trim() || null,
        notes: notes?.trim() || null,
        ticket_ids: uniqueIds,
        summary: { requested: uniqueIds.length, succeeded, failed },
      },
    });

    return jsonOk(res, {
      group_label: group_label?.trim() || null,
      fe_id: feId,
      summary: {
        requested: uniqueIds.length,
        succeeded,
        failed,
      },
      results,
    });
  } catch (err) {
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Bulk assignment failed") });
  }
});

/* ======================================================
   ASSIGN FIELD EXECUTIVE
   (Always generate ON_SITE token)
====================================================== */
router.post("/:id/assign", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const ticketId = req.params.id;
  const parsedAssign = assignBodySchema.safeParse(req.body ?? {});
  if (!parsedAssign.success) {
    return jsonRes(res, 400, { error: "Invalid request body", details: parsedAssign.error.flatten() });
  }
  const {
    feId,
    assigned_user_id: assignedUserId,
    assignment_type: assignmentType,
    assignment_remarks: assignmentRemarks,
    assignment_due_at: rawAssignmentDue,
    state: assignState,
    context_images: contextImagesRaw,
  } = parsedAssign.data;
  const assignmentDueAt = normalizeAssignmentDueAtIso(rawAssignmentDue);
  console.log("[TENANT_GUARD] assign_attempt", {
    ticketId,
    tenantId: req.tenantId || null,
    role: req.tenantRole || null,
    isSuperAdmin: Boolean(req.isSuperAdmin),
    assignment_type: assignmentType,
  });

  const parsedImages = parseAssignmentContextImages(contextImagesRaw);
  if (!parsedImages.ok) {
    return jsonRes(res, parsedImages.status ?? 400, { error: parsedImages.error });
  }

  try {
    const result = await assignOneTicket({
      req,
      ticketId,
      feId: feId ?? null,
      assignedUserId: assignedUserId ?? null,
      assignmentType,
      assignmentDueAt,
      state: assignState,
      assignmentRemarks: assignmentRemarks ?? null,
    });

    if (!result.ok) {
      const mismatch = respondTenantMismatchIfNeeded(res, result);
      if (mismatch) return mismatch;
      return jsonRes(res, result.statusCode, { error: result.error });
    }

    let context_images_status = {
      attempted: false,
      uploaded: 0,
      comment_ids: [],
    };

    if (parsedImages.items.length > 0) {
      const persist = await persistAssignmentContextImages({
        req,
        ticketId,
        organisationId: result.data?.organisation_id ?? req.tenantId ?? null,
        assignmentId: result.data?.assignment_id ?? null,
        feId: result.data?.fe_id ?? feId ?? null,
        items: parsedImages.items,
        isReassign: false,
      });
      if (!persist.ok) {
        return jsonRes(res, persist.status ?? 500, {
          error: persist.error,
          assignment: result.data,
          context_images_status: {
            attempted: true,
            uploaded: persist.commentIds?.length ?? 0,
            comment_ids: persist.commentIds ?? [],
            failed: true,
          },
        });
      }
      context_images_status = {
        attempted: true,
        uploaded: persist.uploaded,
        comment_ids: persist.commentIds,
      };
    }

    return jsonOk(res, { ...result.data, context_images_status });
  } catch (err) {
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

/* ======================================================
   REASSIGN FIELD EXECUTIVE (new assignment row; history preserved)
====================================================== */
router.post("/:id/reassign", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const ticketId = req.params.id;
  const parsedReassign = assignBodySchema.safeParse(req.body ?? {});
  if (!parsedReassign.success) {
    return jsonRes(res, 400, { error: "Invalid request body", details: parsedReassign.error.flatten() });
  }
  const {
    feId,
    assigned_user_id: assignedUserId,
    assignment_type: assignmentType,
    assignment_remarks: assignmentRemarks,
    assignment_due_at: rawAssignmentDue,
    state: assignState,
    context_images: contextImagesRaw,
  } = parsedReassign.data;
  const assignmentDueAt = normalizeAssignmentDueAtIso(rawAssignmentDue);
  console.log("[TENANT_GUARD] reassign_attempt", {
    ticketId,
    tenantId: req.tenantId || null,
    role: req.tenantRole || null,
    isSuperAdmin: Boolean(req.isSuperAdmin),
    assignment_type: assignmentType,
  });

  const parsedImages = parseAssignmentContextImages(contextImagesRaw);
  if (!parsedImages.ok) {
    return jsonRes(res, parsedImages.status ?? 400, { error: parsedImages.error });
  }

  try {
    const result = await reassignOneTicket({
      req,
      ticketId,
      feId: feId ?? null,
      assignedUserId: assignedUserId ?? null,
      assignmentType,
      assignmentDueAt,
      state: assignState,
      assignmentRemarks: assignmentRemarks ?? null,
    });

    if (!result.ok) {
      const mismatch = respondTenantMismatchIfNeeded(res, result);
      if (mismatch) return mismatch;
      return jsonRes(res, result.statusCode, { error: result.error });
    }

    let context_images_status = {
      attempted: false,
      uploaded: 0,
      comment_ids: [],
    };

    if (parsedImages.items.length > 0) {
      const persist = await persistAssignmentContextImages({
        req,
        ticketId,
        organisationId: result.data?.organisation_id ?? req.tenantId ?? null,
        assignmentId: result.data?.assignment_id ?? null,
        feId: result.data?.fe_id ?? feId ?? null,
        items: parsedImages.items,
        isReassign: true,
      });
      if (!persist.ok) {
        return jsonRes(res, persist.status ?? 500, {
          error: persist.error,
          assignment: result.data,
          context_images_status: {
            attempted: true,
            uploaded: persist.commentIds?.length ?? 0,
            comment_ids: persist.commentIds ?? [],
            failed: true,
          },
        });
      }
      context_images_status = {
        attempted: true,
        uploaded: persist.uploaded,
        comment_ids: persist.commentIds,
      };
    }

    return jsonOk(res, { ...result.data, context_images_status });
  } catch (err) {
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

/* ======================================================
   REJECTION CONTEXT (recipients + FE proof options)
   GET /tickets/:id/rejection-context
====================================================== */
router.get("/:id/rejection-context", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const ticketId = req.params.id;
  try {
    const { data: ticket, error: ticketError } = await getTicketByIdScoped(
      req,
      ticketId,
      "id, status, organisation_id, ticket_number, client_slug, issue_type, category, location, opened_by_email, remarks, short_description, rejection_reason, rejected_at, rejected_by"
    );
    if (ticketError || !ticket) {
      return jsonRes(res, 404, { error: "Ticket not found" });
    }
    if (!isTenantAllowed(req, ticket.organisation_id)) {
      return denyTenantMismatch(res);
    }

    const slug = normalizeClientSlug(ticket.client_slug);
    let client = null;
    if (slug) {
      const { data: tc } = await findActiveTenantClientBySlug(slug, ticket.organisation_id ?? null);
      if (tc) {
        client = {
          id: tc.id,
          name: tc.name ?? null,
          slug: tc.slug ?? slug,
        };
      } else {
        client = { id: null, name: null, slug };
      }
    }

    /** @type {{ id: string; email: string; name: string | null; source: string }[]} */
    let recipients = [];
    if (slug) {
      const result = await listClientNotificationEmails(req, {
        clientSlug: slug,
        organisationId: ticket.organisation_id ?? null,
      });
      if (result.error) {
        return jsonRes(res, result.status ?? 500, { error: result.error });
      }
      recipients = mapNotificationEmailsForContext(result.items ?? [], client);
    }

    const { data: comments, error: commentsErr } = await listCommentsForTicket(req, ticketId, {
      limit: 200,
      offset: 0,
    });
    if (commentsErr) {
      return jsonRes(res, 500, { error: safeDbErrorForClient(commentsErr, "Failed to load proofs") });
    }

    const evidenceOptions = buildRejectionEvidenceOptions(comments || [], {
      ticketId,
      organisationId: ticket.organisation_id ?? null,
    }).map(({ key: _key, ...rest }) => rest);

    return jsonOk(res, {
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        issue_type: ticket.issue_type ?? null,
        category: ticket.category ?? null,
        location: ticket.location ?? null,
        client_slug: ticket.client_slug ?? null,
      },
      client,
      recipients,
      evidenceOptions,
      canReject:
        ticket.status === "OPEN" ||
        ticket.status === "NEEDS_REVIEW" ||
        ticket.status === "REJECTED",
    });
  } catch (err) {
    console.error("[rejection-context]", err);
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

/* ======================================================
   CLOSURE CONTEXT (recipients for Verify & Close)
   GET /tickets/:id/closure-context
   Reuses listClientNotificationEmails (same aggregation as rejection).
====================================================== */
router.get("/:id/closure-context", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const ticketId = req.params.id;
  try {
    const { data: ticket, error: ticketError } = await getTicketByIdScoped(
      req,
      ticketId,
      "id, status, organisation_id, ticket_number, client_slug, issue_type, category, location, opened_by_email"
    );
    if (ticketError || !ticket) {
      return jsonRes(res, 404, { error: "Ticket not found" });
    }
    if (!isTenantAllowed(req, ticket.organisation_id)) {
      return denyTenantMismatch(res);
    }

    const slug = normalizeClientSlug(ticket.client_slug);
    let client = null;
    if (slug) {
      const { data: tc } = await findActiveTenantClientBySlug(slug, ticket.organisation_id ?? null);
      if (tc) {
        client = {
          id: tc.id,
          name: tc.name ?? null,
          slug: tc.slug ?? slug,
        };
      } else {
        client = { id: null, name: null, slug };
      }
    }

    /** @type {{ id: string; email: string; name: string | null; source: string }[]} */
    let recipients = [];
    if (slug) {
      const result = await listClientNotificationEmails(req, {
        clientSlug: slug,
        organisationId: ticket.organisation_id ?? null,
      });
      if (result.error) {
        return jsonRes(res, result.status ?? 500, { error: result.error });
      }
      recipients = mapNotificationEmailsForContext(result.items ?? [], client);
    }

    const closeable =
      ticket.status === "ON_SITE" || ticket.status === "RESOLVED_PENDING_VERIFICATION";

    let organisationReview = null;
    if (ticket.organisation_id) {
      const { data: orgRow } = await getOrganisationById(
        ticket.organisation_id,
        "review_field_label, review_field_helper_text"
      );
      if (orgRow) {
        organisationReview = {
          review_field_label: orgRow.review_field_label ?? null,
          review_field_helper_text: orgRow.review_field_helper_text ?? null,
        };
      }
    }

    return jsonOk(res, {
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        status: ticket.status,
        issue_type: ticket.issue_type ?? null,
        category: ticket.category ?? null,
        location: ticket.location ?? null,
        client_slug: ticket.client_slug ?? null,
      },
      client,
      recipients,
      canClose: closeable,
      organisation: organisationReview,
    });
  } catch (err) {
    console.error("[closure-context]", err);
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

/* ======================================================
   REJECT TICKET (manager)
   - Requires rejection reason
   - Optional Client contact recipients (re-validated)
   - Optional FE proof evidence (commentId + proofIndex)
   - Sets tickets.status = REJECTED + structured rejection fields
   - Clears SLA + revokes FE tokens
   - Sends rejection email (non-transactional on Postmark failure)
   - Idempotent: if already REJECTED, returns success (no re-email)
====================================================== */
router.post("/:id/reject", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  console.log("[TENANT_GUARD] reject_attempt", {
    ticketId: req.params.id,
    tenantId: req.tenantId || null,
    role: req.tenantRole || null,
    isSuperAdmin: Boolean(req.isSuperAdmin),
  });

  const ticketId = req.params.id;
  const parsedBody = rejectBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return jsonRes(res, 400, {
      error: "Rejection reason is required.",
      details: parsedBody.error.flatten(),
    });
  }
  const reasonTrimmed = parsedBody.data.reason.trim();
  const requestedRecipients = parsedBody.data.recipients ?? [];
  const evidenceRef = parsedBody.data.evidence ?? null;
  const evidenceUploadRaw = parsedBody.data.evidence_upload ?? null;

  if (evidenceRef && evidenceUploadRaw) {
    return jsonRes(res, 400, {
      error: "Provide either an FE proof selection or a rejection photo upload, not both",
    });
  }

  if (!req.appUser?.id) {
    return jsonRes(res, 403, { error: "User profile required to reject tickets" });
  }

  try {
    const { data: ticket, error: ticketError } = await getTicketByIdScoped(
      req,
      ticketId,
      "id, status, organisation_id, ticket_number, client_slug, opened_by_email, complaint_id, vehicle_number, category, issue_type, location, remarks, short_description"
    );

    if (ticketError || !ticket) {
      console.log("[REJECT] ticket fetch failed or missing:", { ticketId, hasError: Boolean(ticketError) });
      return jsonRes(res, 404, { error: "Ticket not found" });
    }
    if (!isTenantAllowed(req, ticket.organisation_id)) {
      return denyTenantMismatch(res);
    }

    console.log("[REJECT] fetched ticket.status BEFORE update:", ticket.status);

    const alreadyRejected = ticket.status === "REJECTED";

    if (!alreadyRejected && ticket.status !== "OPEN" && ticket.status !== "NEEDS_REVIEW") {
      console.log("[REJECT] status eligibility check failed:", {
        ticketId,
        ticketStatus: ticket.status,
      });
      return jsonRes(res, 400, {
        error: `Cannot reject ticket in status ${ticket.status}`,
      });
    }

    let validatedRecipients = [];
    const slug = normalizeClientSlug(ticket.client_slug);
    if (requestedRecipients.length > 0) {
      if (!slug) {
        return jsonRes(res, 400, {
          error: "Cannot send rejection email: ticket has no client association",
        });
      }
      const allowedResult = await listClientNotificationEmails(req, {
        clientSlug: slug,
        organisationId: ticket.organisation_id ?? null,
      });
      if (allowedResult.error) {
        return jsonRes(res, allowedResult.status ?? 500, { error: allowedResult.error });
      }
      const check = validateNotifyEmailsAgainstAllowed(requestedRecipients, allowedResult.items);
      if (!check.ok) {
        return jsonRes(res, 400, { error: check.error });
      }
      validatedRecipients = check.validated;
    }

    let evidenceSnapshot = null;
    /** @type {{ buffer: Buffer; contentType: string; filename: string } | null} */
    let managerUpload = null;

    if (evidenceUploadRaw && !alreadyRejected) {
      const parsedUpload = parseRejectionUploadImage(evidenceUploadRaw);
      if (!parsedUpload.ok) {
        return jsonRes(res, parsedUpload.status ?? 400, { error: parsedUpload.error });
      }
      managerUpload = parsedUpload.upload;
    } else if (evidenceRef && !alreadyRejected) {
      const { data: comments, error: commentsErr } = await listCommentsForTicket(req, ticketId, {
        limit: 200,
        offset: 0,
      });
      if (commentsErr) {
        return jsonRes(res, 500, {
          error: safeDbErrorForClient(commentsErr, "Failed to validate rejection evidence"),
        });
      }
      const withTicket = (comments || []).map((c) => ({ ...c, ticket_id: c.ticket_id ?? ticketId }));
      const resolved = resolveRejectionEvidence(evidenceRef, {
        ticketId,
        organisationId: ticket.organisation_id ?? null,
        comments: withTicket,
      });
      if (!resolved.ok) {
        return jsonRes(res, resolved.status ?? 400, { error: resolved.error });
      }
      evidenceSnapshot = resolved.evidence;
    }

    const nowIso = new Date().toISOString();

    try {
      await revokeTokensForTicket({ ticketId, reason: "ticket_rejected" });
    } catch (tokenErr) {
      console.error("[REJECT] revoke tokens failed:", tokenErr?.message || tokenErr);
      return jsonRes(res, 500, {
        error: safeDbErrorForClient(tokenErr, "Failed to revoke field action tokens"),
      });
    }

    const ticketPatch = {
      status: "REJECTED",
      needs_review: false,
      current_assignment_id: null,
      updated_at: nowIso,
    };
    if (!alreadyRejected) {
      ticketPatch.rejection_reason = reasonTrimmed;
      ticketPatch.rejected_at = nowIso;
      ticketPatch.rejected_by = req.appUser.id;
    }

    const updateTicketRes = await updateTicketById(
      ticketId,
      ticketPatch,
      alreadyRejected ? {} : { expectedStatus: ["OPEN", "NEEDS_REVIEW"] }
    );
    if (updateTicketRes.conflict) {
      return jsonRes(res, 409, { error: "Ticket was updated by another user. Refresh and retry." });
    }
    if (updateTicketRes.error) {
      console.error("[REJECT] update tickets failed:", updateTicketRes.error.message);
      return jsonRes(res, 500, {
        error: safeDbErrorForClient(updateTicketRes.error, "Failed to reject ticket"),
      });
    }

    const updateSlaRes = await updateSlaByTicketId(ticketId, {
      assignment_deadline: null,
      onsite_deadline: null,
      resolution_deadline: null,
      assignment_breached: false,
      onsite_breached: false,
      resolution_breached: false,
      updated_at: nowIso,
    });
    if (updateSlaRes.error) {
      console.error("[REJECT] update sla_tracking failed:", updateSlaRes.error.message);
      return jsonRes(res, 500, {
        error: safeDbErrorForClient(updateSlaRes.error, "Failed to clear SLA for rejected ticket"),
      });
    }

    const { data: rejectorRow } = await findUserNameById(req.appUser.id);
    const rejectedByName =
      rejectorRow?.name != null && String(rejectorRow.name).trim() !== ""
        ? String(rejectorRow.name).trim()
        : "Unknown";

    /** In-memory manager upload buffer for email (avoids re-fetch when just uploaded). */
    let evidenceAttachmentFromUpload = null;

    if (!alreadyRejected) {
      const insertCommentRes = await insertComment({
        ticket_id: ticketId,
        source: "STAFF",
        author_id: req.appUser.id,
        organisation_id: ticket.organisation_id ?? null,
        body: `Ticket rejected: ${reasonTrimmed}`,
        attachments: {
          rejection: {
            reason: reasonTrimmed,
            rejected_by_user_id: req.appUser.id,
            rejected_by_name: rejectedByName,
            rejected_at: nowIso,
            recipients: validatedRecipients,
            evidence: evidenceSnapshot,
          },
        },
      });
      if (insertCommentRes.error) {
        console.error("[REJECT] insert ticket_comments failed:", insertCommentRes.error.message);
        return jsonRes(res, 500, {
          error: safeDbErrorForClient(insertCommentRes.error, "Failed to record rejection comment"),
        });
      }

      const rejectionComment = insertCommentRes.data;
      if (managerUpload && rejectionComment?.id) {
        try {
          const { uploadProof, isProofS3Enabled } = await import("../services/proofStorageService.js");
          if (!isProofS3Enabled()) {
            return jsonRes(res, 503, { error: "Rejection photo storage is temporarily unavailable" });
          }
          const uploaded = await uploadProof({
            tenantId: ticket.organisation_id,
            ticketId,
            commentId: rejectionComment.id,
            index: 0,
            buffer: managerUpload.buffer,
            contentType: managerUpload.contentType,
            filename: managerUpload.filename,
          });
          evidenceSnapshot = {
            comment_id: rejectionComment.id,
            proof_index: 0,
            storage_key: uploaded.key,
            category: "REJECTION_EVIDENCE",
            source: "MANAGER_UPLOAD",
            content_type: uploaded.contentType,
            bytes: uploaded.bytes,
          };
          const dataUrl = `data:${managerUpload.contentType};base64,${managerUpload.buffer.toString("base64")}`;
          const prevAtt =
            rejectionComment.attachments &&
            typeof rejectionComment.attachments === "object" &&
            !Array.isArray(rejectionComment.attachments)
              ? rejectionComment.attachments
              : {};
          const updateAttRes = await updateCommentById(rejectionComment.id, {
            attachments: {
              ...prevAtt,
              rejection: {
                ...(prevAtt.rejection && typeof prevAtt.rejection === "object" ? prevAtt.rejection : {}),
                reason: reasonTrimmed,
                rejected_by_user_id: req.appUser.id,
                rejected_by_name: rejectedByName,
                rejected_at: nowIso,
                recipients: validatedRecipients,
                evidence: evidenceSnapshot,
              },
              image_base64: dataUrl,
              images: [{ image_base64: dataUrl, mime_type: managerUpload.contentType }],
              proof_storage_paths: [uploaded.key],
            },
          });
          if (updateAttRes.error) {
            console.error("[REJECT] update rejection evidence comment failed:", updateAttRes.error.message);
            return jsonRes(res, 500, {
              error: safeDbErrorForClient(updateAttRes.error, "Failed to store rejection photo metadata"),
            });
          }
          evidenceAttachmentFromUpload = {
            buffer: managerUpload.buffer,
            contentType: managerUpload.contentType,
            filename: managerUpload.filename || "rejection-evidence.jpg",
          };
        } catch (e) {
          console.error("[REJECT] manager photo upload failed:", e?.message || e);
          return jsonRes(res, 500, {
            error: safeDbErrorForClient(e, "Failed to store rejection photo"),
          });
        }
      }
    }

    const { data: finalTicket, error: finalTicketError } = await getTicketStatusById(ticketId);
    if (finalTicketError || !finalTicket || finalTicket.status !== "REJECTED") {
      console.error("[REJECT] final status verification failed:", {
        ticketId,
        status: finalTicket?.status ?? null,
        error: finalTicketError?.message ?? null,
      });
      return jsonRes(res, 500, { error: "Ticket rejection could not be verified" });
    }

    /** @type {{ attempted: boolean; sent: boolean; skipped: boolean; reason: string | null; recipient_count?: number; sent_count?: number }} */
    let rejection_email_status = {
      attempted: false,
      sent: false,
      skipped: true,
      reason: alreadyRejected ? "already_rejected" : "not_attempted",
    };

    let evidenceAttachment = evidenceAttachmentFromUpload;
    if (
      !alreadyRejected &&
      !evidenceAttachment &&
      evidenceSnapshot?.storage_key &&
      validatedRecipients.length > 0
    ) {
      try {
        const { getProof, isProofS3Enabled } = await import("../services/proofStorageService.js");
        if (isProofS3Enabled()) {
          const proof = await getProof({ key: evidenceSnapshot.storage_key });
          if (
            proof?.buffer?.length > 0 &&
            proof.buffer.length <= REJECTION_EMAIL_ATTACHMENT_MAX_BYTES &&
            String(proof.contentType || "").toLowerCase().startsWith("image/")
          ) {
            evidenceAttachment = {
              buffer: proof.buffer,
              contentType: proof.contentType,
              filename: "rejection-evidence.jpg",
            };
          }
        }
      } catch (e) {
        console.error("[REJECT] evidence attach failed (continuing without attachment):", e?.message || e);
        logEvent("reject_evidence_attach_failed", {
          ticketId,
          reason: e?.message || String(e),
        });
      }
    }

    if (!alreadyRejected && validatedRecipients.length === 0) {
      rejection_email_status = {
        attempted: false,
        sent: false,
        skipped: true,
        reason: "no_recipients",
        recipient_count: 0,
        sent_count: 0,
      };
      logEvent("reject_email_skipped", {
        ticketId,
        tenantId: req.tenantId ?? null,
        reason: "no_recipients",
      });
    } else if (!alreadyRejected) {
      try {
        let sentCount = 0;
        let attemptedAny = false;
        const reasons = [];
        for (const toEmail of validatedRecipients) {
          logEvent("reject_email_attempt", {
            ticketId,
            tenantId: req.tenantId ?? null,
            to_redacted: redactEmail(toEmail),
            ticket_number: ticket.ticket_number ?? null,
          });
          const emailResult = await sendClientRejectionEmail({
            toEmail,
            ticketNumber: ticket.ticket_number,
            rejectionReason: reasonTrimmed,
            rejectedAt: nowIso,
            complaintId: ticket.complaint_id ?? null,
            vehicleNumber: ticket.vehicle_number ?? null,
            category: ticket.category ?? null,
            issueType: ticket.issue_type ?? null,
            location: ticket.location ?? null,
            evidenceAttachment,
          });
          attemptedAny = attemptedAny || Boolean(emailResult?.attempted);
          if (emailResult?.sent) sentCount += 1;
          if (emailResult?.reason) reasons.push(`${redactEmail(toEmail)}:${emailResult.reason}`);

          if (emailResult?.sent) {
            logEvent("reject_email_success", { ticketId, ticket_number: ticket.ticket_number ?? null });
          } else if (emailResult?.attempted && !emailResult?.sent) {
            logEvent("reject_email_provider_failure", {
              ticketId,
              reason: emailResult?.reason ?? "unknown",
            });
          }
        }

        const allSent = sentCount === validatedRecipients.length;
        const partial = attemptedAny && sentCount > 0 && !allSent;
        rejection_email_status = {
          attempted: attemptedAny,
          sent: allSent,
          skipped: !attemptedAny,
          reason: allSent ? "sent" : partial ? "partial_failure" : reasons[0] ?? "provider_failure",
          recipient_count: validatedRecipients.length,
          sent_count: sentCount,
        };
      } catch (e) {
        rejection_email_status = {
          attempted: true,
          sent: false,
          skipped: false,
          reason: "exception",
          recipient_count: validatedRecipients.length,
          sent_count: 0,
        };
        console.error("[REJECT] Rejection email failed:", e?.message || e);
        logEvent("reject_email_provider_failure", {
          ticketId,
          reason: "exception",
          message: e?.message || String(e),
        });
      }
    }

    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: ticketId,
      action: "ticket_rejected",
      ticket_organisation_id: ticket.organisation_id ?? null,
      client_slug: ticket.client_slug ?? null,
      metadata: {
        ticket_number: ticket.ticket_number ?? null,
        reason: reasonTrimmed,
        already_rejected: alreadyRejected,
        recipients: validatedRecipients,
        evidence: evidenceSnapshot
          ? {
              comment_id: evidenceSnapshot.comment_id,
              proof_index: evidenceSnapshot.proof_index,
              category: evidenceSnapshot.category,
              source: evidenceSnapshot.source ?? "FE_PROOF",
              storage_key_present: Boolean(evidenceSnapshot.storage_key),
            }
          : null,
        rejection_email_status,
      },
    });

    return jsonOk(res, {
      success: true,
      rejection_email_status,
      recipients: validatedRecipients,
    });
  } catch (err) {
    console.error("[reject-ticket]", err);
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

/* ======================================================
   STAFF VERIFY ON-SITE
   (Generate RESOLUTION token)
====================================================== */
router.post("/:id/on-site-token", async (req, res) => {
  if (FE_GATED_RESOLUTION_TOKEN) {
    return jsonRes(res, 410, {
      error: "Deprecated route. Resolution tokens activate after on-site proof upload.",
      code: "ROUTE_DEPRECATED",
    });
  }

  const ticketId = req.params.id;

  try {
    const { data: ticket, error: ticketError } = await getTicketByIdForAssign(req, ticketId);

    if (ticketError || !ticket) {
      return jsonRes(res, 404, { error: "Ticket not found" });
    }
    if (!isTenantAllowed(req, ticket.organisation_id)) {
      return denyTenantMismatch(res);
    }

    if (ticket.status === "REJECTED") {
      return jsonRes(res, 400, { error: "Ticket has been rejected" });
    }

    if (!ticket.current_assignment_id) {
      return jsonRes(res, 400, { error: "Assignment missing" });
    }

    const { data: assignment, error: assignmentError } = await getAssignmentById(
      ticket.current_assignment_id,
      "fe_id"
    );

    if (assignmentError || !assignment) {
      return jsonRes(res, 400, { error: "Assignment missing" });
    }

    const nowIso = new Date().toISOString();
    const { data: existingActiveToken } = await findActiveResolutionTokenForTicket({
      ticketId,
      nowIso,
      tokenState: TOKEN_STATES.ACTIVE,
    });

    if (!existingActiveToken?.id) {
      return jsonRes(res, 409, {
        error: "Resolution token is not active yet. Complete on-site proof first.",
        code: "RESOLUTION_TOKEN_LOCKED",
      });
    }

    await updateTicketById(ticketId, { status: "ON_SITE" }, { expectedStatus: ticket.status }).then(
      (result) => {
        if (result.conflict) {
          const err = new Error("Ticket status changed; refresh and retry");
          err.statusCode = 409;
          err.code = "STATUS_CONFLICT";
          throw err;
        }
        if (result.error) throw result.error;
      }
    );

    setOnsiteDeadline(ticketId).catch((err) =>
      console.error("[SLA] setOnsiteDeadline after on-site-token", ticketId, err.message)
    );

    return jsonOk(res, {
      success: true,
      resolutionToken: existingActiveToken.id,
    });

  } catch (err) {
    if (err?.statusCode === 409 || err?.code === "STATUS_CONFLICT") {
      return jsonRes(res, 409, { error: err.message || "Ticket status changed", code: "STATUS_CONFLICT" });
    }
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

/* ======================================================
   STAFF FINAL CLOSE
====================================================== */
router.post("/:id/close", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const ticketId = req.params.id;
  const bodyParsed = closeBodySchema.safeParse(req.body ?? {});
  if (!bodyParsed.success) {
    return jsonRes(res, 400, { error: "Invalid body", details: bodyParsed.error.flatten() });
  }
  const {
    verification_remarks,
    review_notes,
    resolution_category,
    resolution_other_details,
    resolution_location_id,
    notification_email,
    recipients: requestedRecipientsRaw,
    close_form_values,
  } = bodyParsed.data;
  const requestedRecipients = requestedRecipientsRaw ?? [];
  console.log("[TENANT_GUARD] close_attempt", {
    ticketId,
    tenantId: req.tenantId || null,
    role: req.tenantRole || null,
    isSuperAdmin: Boolean(req.isSuperAdmin),
  });

  const resolutionCategoryValue =
    resolution_category != null && String(resolution_category).trim() !== ""
      ? String(resolution_category).trim()
      : null;
  const resolutionOtherDetailsValue =
    resolution_other_details != null && String(resolution_other_details).trim() !== ""
      ? String(resolution_other_details).trim()
      : null;

  if (resolutionCategoryValue === "OTHER" && !resolutionOtherDetailsValue) {
    return jsonRes(res, 400, {
      error: "Resolution details are required when resolution category is Other",
    });
  }

  const optionalRemarks =
    verification_remarks != null && String(verification_remarks).trim() !== ""
      ? String(verification_remarks).trim()
      : null;
  const reviewNotesValue =
    review_notes != null && String(review_notes).trim() !== ""
      ? String(review_notes).trim()
      : null;
  let remarksValue = optionalRemarks;
  if (resolutionCategoryValue === "OTHER" && resolutionOtherDetailsValue) {
    remarksValue = optionalRemarks
      ? `${resolutionOtherDetailsValue}\n\n${optionalRemarks}`
      : resolutionOtherDetailsValue;
  }

  try {
    const selectFields =
      "ticket_number, opened_by_email, complaint_id, vehicle_number, vehicle_name, vehicle_type, registration_number, category, issue_type, location, organisation_id, status, current_assignment_id, client_slug, remarks, short_description, priority, priority_level, resolution_location_id, resolution_location_name";

    const { data: existing, error: loadErr } = await getTicketByIdUnscoped(ticketId, selectFields);

    if (loadErr) {
      console.error("[CLOSE] load ticket", {
        message: loadErr?.message,
        code: loadErr?.code,
        details: loadErr?.details,
        hint: loadErr?.hint,
      });
      return jsonRes(res, 500, {
        error: safeDbErrorForClient(loadErr, "Failed to load ticket"),
        code: loadErr?.code ?? null,
      });
    }
    if (!existing) {
      return jsonRes(res, 404, { error: "Ticket not found" });
    }
    if (!isTenantAllowed(req, existing.organisation_id)) {
      return denyTenantMismatch(res);
    }
    const closeFormFields = await getCloseFormFields(existing.organisation_id);
    const closeFormResult = validateCloseFormSnapshot(closeFormFields, close_form_values);
    if (!closeFormResult.ok) return jsonRes(res, 400, { error: closeFormResult.error });
    const resolutionLocation = await resolveResolutionLocationForTicketClose({
      bodyLocationId: resolution_location_id,
      existingLocationId: existing.resolution_location_id ?? null,
      existingLocationName: existing.resolution_location_name ?? null,
      organisationId: existing.organisation_id,
    });
    if (resolutionLocation.error) {
      return jsonRes(res, resolutionLocation.error.status, { error: resolutionLocation.error.message });
    }

    const closeValidation = await validateTicketClosePreconditions({
      ticketId,
      ticket: existing,
      body: {
        verification_remarks,
        review_notes,
        resolution_category: resolutionCategoryValue,
      },
    });
    if (!closeValidation.ok) {
      return jsonRes(res, closeValidation.statusCode, { error: closeValidation.error });
    }
    if (closeValidation.idempotent) {
      return jsonOk(res, {
        success: true,
        idempotent: true,
        resolution_email_status: {
          attempted: false,
          sent: false,
          skipped: true,
          reason: "already_resolved",
        },
      });
    }

    const additionalParsed = parseAdditionalNotifyEmails(notification_email);
    if (!additionalParsed.ok) {
      return jsonRes(res, 400, { error: additionalParsed.error });
    }

    /** @type {string[]} */
    let validatedSelected = [];
    const slug = normalizeClientSlug(existing.client_slug);
    if (requestedRecipients.length > 0) {
      if (!slug) {
        return jsonRes(res, 400, {
          error: "Cannot send closure email: ticket has no client association",
        });
      }
      const allowedResult = await listClientNotificationEmails(req, {
        clientSlug: slug,
        organisationId: existing.organisation_id ?? null,
      });
      if (allowedResult.error) {
        return jsonRes(res, allowedResult.status ?? 500, { error: allowedResult.error });
      }
      const check = validateNotifyEmailsAgainstAllowed(requestedRecipients, allowedResult.items);
      if (!check.ok) {
        return jsonRes(res, 400, { error: check.error });
      }
      validatedSelected = check.validated;
    }

    const closeRecipients = mergeCloseEmailRecipients(validatedSelected, additionalParsed.emails);

    let updatePayload = {
      status: "RESOLVED",
      resolved_at: new Date(),
      verification_remarks: remarksValue,
      review_notes: reviewNotesValue,
      resolution_category: resolutionCategoryValue,
      close_form_snapshot: closeFormResult.snapshot,
      resolution_location_id: resolutionLocation.data?.id ?? null,
      resolution_location_name: resolutionLocation.data?.name ?? null,
    };

    let result = await updateTicketCloseWithFallback(
      ticketId,
      updatePayload,
      {
        status: "RESOLVED",
        resolved_at: new Date(),
        ...(remarksValue ? { verification_remarks: remarksValue } : {}),
        ...(closeFormFields.length > 0 ? { close_form_snapshot: closeFormResult.snapshot } : {}),
        resolution_location_id: resolutionLocation.data?.id ?? null,
        resolution_location_name: resolutionLocation.data?.name ?? null,
      },
      { expectedStatus: ["ON_SITE", "RESOLVED_PENDING_VERIFICATION"] }
    );
    if (result.conflict) {
      return jsonRes(res, 409, { error: "Ticket was updated by another user. Refresh and retry." });
    }

    if (result.error) {
      console.error("[CLOSE] update", {
        ticketId,
        existingOrgId: existing.organisation_id ?? null,
        tenantId: req.tenantId ?? null,
        isSuperAdmin: Boolean(req.isSuperAdmin),
        updatePayload,
        message: result.error?.message,
        code: result.error?.code,
        details: result.error?.details,
        hint: result.error?.hint,
      });
      return jsonRes(res, 500, {
        error: safeDbErrorForClient(result.error, "Failed to close ticket"),
        code: result.error?.code ?? null,
      });
    }

    const ticket = result.data;
    if (!ticket) {
      return jsonRes(res, 404, { error: "Ticket not found" });
    }

    const nowIso = new Date().toISOString();
    let closedByName = "Unknown";
    if (req.appUser?.id) {
      const { data: closerRow } = await findUserNameById(req.appUser.id);
      closedByName =
        closerRow?.name != null && String(closerRow.name).trim() !== ""
          ? String(closerRow.name).trim()
          : "Unknown";
    }

    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: ticketId,
      action: "status_changed_to_RESOLVED",
      organisation_id: existing.organisation_id ?? ticket.organisation_id ?? null,
      metadata: {
        ticket_number: ticket.ticket_number ?? null,
        verification_remarks: remarksValue,
        resolution_category: resolutionCategoryValue,
        recipients: closeRecipients,
        ...(resolutionCategoryValue === "OTHER" && resolutionOtherDetailsValue
          ? { resolution_other_details: resolutionOtherDetailsValue }
          : {}),
      },
    });

    /** @type {{ attempted: boolean; sent: boolean; skipped: boolean; reason: string | null; recipient_count?: number; sent_count?: number }} */
    let resolution_email_status = {
      attempted: false,
      sent: false,
      skipped: true,
      reason: "not_attempted",
    };

    if (closeRecipients.length === 0) {
      resolution_email_status = {
        attempted: false,
        sent: false,
        skipped: true,
        reason: "no_recipients",
        recipient_count: 0,
        sent_count: 0,
      };
      logEvent("close_email_skipped", {
        ticketId,
        tenantId: req.tenantId ?? null,
        reason: "no_recipients",
      });
    } else {
      try {
        let assignedFeName = null;
        if (existing.current_assignment_id) {
          const { data: assignment } = await getAssignmentById(
            existing.current_assignment_id,
            "fe_id, assigned_user_id, assignment_type"
          );
          if (assignment?.fe_id) {
            const { data: fe } = await getFieldExecutiveById(assignment.fe_id);
            assignedFeName = fe?.name?.trim() || null;
          } else if (assignment?.assigned_user_id) {
            const { data: smRow } = await findUserNameById(assignment.assigned_user_id);
            assignedFeName = smRow?.name?.trim() || null;
          }
        }
        const { data: timelineComments } = await listCommentsForTicket(req, ticketId, {
          limit: 200,
          offset: 0,
        });
        const timelineSummary = buildClosureTimelineSummary({
          comments: timelineComments ?? [],
          closedByName,
          resolutionLocationName:
            resolutionLocation.data?.name ??
            ticket.resolution_location_name ??
            existing.resolution_location_name ??
            null,
          closeFormSnapshot: closeFormResult.snapshot,
        });
        const priorityLabel = priorityDisplayLabel(
          existing.priority_level ?? ticket.priority_level,
          ticket.priority ?? existing.priority
        );
        let tenantResolutionInstructions = null;
        if (existing.organisation_id) {
          const { data: orgRow } = await getOrganisationById(
            existing.organisation_id,
            "review_field_helper_text"
          );
          const helper = orgRow?.review_field_helper_text;
          if (helper != null && String(helper).trim() !== "") {
            tenantResolutionInstructions = String(helper).trim();
          }
        }
        let sentCount = 0;
        let attemptedAny = false;
        const reasons = [];
        for (const toEmail of closeRecipients) {
          logEvent("close_email_attempt", {
            ticketId,
            tenantId: req.tenantId ?? null,
            to_redacted: redactEmail(toEmail),
            ticket_number: ticket.ticket_number ?? null,
          });
          const emailResult = await sendResolutionEmail({
            toEmail,
            ticketNumber: ticket.ticket_number,
            verificationRemarks: remarksValue,
            resolutionRemarks: optionalRemarks,
            resolutionCategory: resolutionCategoryValue,
            reviewNotes: reviewNotesValue,
            complaintId: ticket.complaint_id ?? null,
            vehicleNumber: ticket.vehicle_number ?? null,
            category: ticket.category ?? null,
            issueType: resolutionCategoryValue || ticket.issue_type || null,
            location: ticket.location ?? null,
            assignedFeName,
            priority: priorityLabel,
            resolutionLocationName:
              resolutionLocation.data?.name ??
              ticket.resolution_location_name ??
              existing.resolution_location_name ??
              null,
            closeFormSnapshot: closeFormResult.snapshot,
            timelineSummary,
            tenantResolutionInstructions,
          });
          attemptedAny = attemptedAny || Boolean(emailResult?.attempted);
          if (emailResult?.sent) sentCount += 1;
          if (emailResult?.reason) reasons.push(`${redactEmail(toEmail)}:${emailResult.reason}`);

          if (emailResult?.reason === "invalid_recipient") {
            logEvent("close_email_invalid_recipient", { ticketId, ticket_number: ticket.ticket_number ?? null });
          } else if (emailResult?.skipped) {
            logEvent("close_email_skipped", { ticketId, reason: emailResult.reason ?? "unknown" });
          } else if (emailResult?.attempted && !emailResult?.sent) {
            logEvent("close_email_provider_failure", {
              ticketId,
              reason: emailResult?.reason ?? "unknown",
            });
          } else if (emailResult?.sent) {
            logEvent("close_email_success", { ticketId, ticket_number: ticket.ticket_number ?? null });
          }
        }

        const allSent = sentCount === closeRecipients.length;
        const partial = attemptedAny && sentCount > 0 && !allSent;
        resolution_email_status = {
          attempted: attemptedAny,
          sent: allSent,
          skipped: !attemptedAny,
          reason: allSent ? "sent" : partial ? "partial_failure" : reasons[0] ?? "provider_failure",
          recipient_count: closeRecipients.length,
          sent_count: sentCount,
        };
      } catch (e) {
        resolution_email_status = {
          attempted: true,
          sent: false,
          skipped: false,
          reason: "exception",
          recipient_count: closeRecipients.length,
          sent_count: 0,
        };
        console.error("[CLOSE] Resolution email failed:", e?.message || e);
        logEvent("close_email_provider_failure", {
          ticketId,
          reason: "exception",
          message: e?.message || String(e),
        });
      }
    }

    if (req.appUser?.id) {
      const insertCommentRes = await insertComment({
        ticket_id: ticketId,
        source: "STAFF",
        author_id: req.appUser.id,
        organisation_id: existing.organisation_id ?? ticket.organisation_id ?? null,
        body:
          `${closeRecipients.length > 0
            ? `Closure email sent to ${closeRecipients.length} recipient(s)`
            : "Ticket closed (no closure email recipients)"}${
              closeFormFields.length ? ` · Verify & Close form submitted (${closeFormFields.length} field(s))` : ""
            }`,
        attachments: {
          closure_email: {
            closed_by_user_id: req.appUser.id,
            closed_by_name: closedByName,
            closed_at: nowIso,
            recipients: closeRecipients,
            resolution_email_status,
            close_form_snapshot: closeFormResult.snapshot,
            resolution_location_name: resolutionLocation.data?.name ?? null,
          },
        },
      });
      if (insertCommentRes.error) {
        console.error("[CLOSE] insert closure comment failed:", insertCommentRes.error.message);
      }
    }

    return jsonOk(res, {
      success: true,
      resolution_email_status,
      recipients: closeRecipients,
    });
  } catch (err) {
    console.error("[CLOSE ROUTE ERROR]", err);
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

/* ======================================================
   COMPLETE REVIEW (Needs Review → 100% confidence)
   PATCH /tickets/:id/review-complete
   Body: { category, issue_type, location, vehicle_number?, priority? }
   Sets: needs_review = false, confidence_score = 100, updated_at = now()
====================================================== */
router.patch("/:id/review-complete", requireRole(STAFF_OPERATION_ROLES), async (req, res) => {
  const ticketId = req.params.id;
  const parsed = reviewCompleteBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return jsonRes(res, 400, {
      error: "category, issue_type, and location are required",
      details: parsed.error.flatten(),
    });
  }
  const { category: cat, issue_type: issue, location: loc, vehicle_number, priority, priority_level } = parsed.data;

  const priorityNorm = normalizeTicketPriorityInput({
    priority,
    priority_level,
    defaultLevel: "LOW",
  });
  if (!priorityNorm.ok) {
    return jsonRes(res, 400, { error: priorityNorm.error });
  }

  try {
    const { data: ticket, error } = await reviewCompleteTicketScoped(req, ticketId, {
      category: cat,
      issue_type: issue,
      location: normalizeLocation(loc),
      vehicle_number:
        vehicle_number != null && String(vehicle_number).trim() !== ""
          ? String(vehicle_number).trim()
          : null,
      priority: priorityNorm.priority,
      priority_level: priorityNorm.priority_level,
      needs_review: false,
      confidence_score: 100,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      return jsonRes(res, 404, { error: safeDbErrorForClient(error, "Ticket not found") });
    }
    if (!ticket) {
      return jsonRes(res, 404, { error: "Ticket not found" });
    }

    return jsonOk(res, ticket);
  } catch (err) {
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

export default router;
//works