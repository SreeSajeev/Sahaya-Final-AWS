/**
 * Service Manager resolution proof + submit-for-verification.
 * Reuses proof S3 upload, ticket_comments timeline, and existing status model.
 * No FE tokens / onsite attendance.
 */

import { insertComment, updateCommentById, listCommentsForTicketUnscoped } from "../repositories/commentRepository.js";
import { getAssignmentWithTicketByAssignedUserAndTicket } from "../repositories/assignmentRepository.js";
import { updateTicketById } from "../repositories/ticketQueryRepository.js";
import { uploadProof } from "./proofStorageService.js";
import { parseAssignmentContextImages } from "./assignmentContextService.js";
import { insertAuditLog } from "./auditLogService.js";
import { isTenantAllowed } from "../middleware/tenantContext.js";
import { isServiceManagerAssignment } from "../constants/assignmentTypes.js";

const SM_RESOLVABLE_STATUSES = new Set(["ASSIGNED", "OPEN", "EN_ROUTE"]);

export function assertSmOwnsCurrentAssignment(row, userId) {
  if (!row?.tickets) return { ok: false, status: 404, error: "Ticket not found or not assigned to you" };
  const ticket = row.tickets;
  const currentId = ticket.current_assignment_id;
  if (
    currentId == null ||
    String(currentId).trim() === "" ||
    String(currentId) !== String(row.id)
  ) {
    return { ok: false, status: 403, error: "Ticket is not currently assigned to you" };
  }
  if (!isServiceManagerAssignment(row) && row.assignment_type != null) {
    // Rows without assignment_type are historical FE; SM portal must not claim them.
  }
  if (String(row.assigned_user_id || "") !== String(userId)) {
    return { ok: false, status: 403, error: "Ticket is not currently assigned to you" };
  }
  if (row.assignment_type && !isServiceManagerAssignment(row)) {
    return { ok: false, status: 403, error: "Ticket is assigned to a Field Executive" };
  }
  return { ok: true, ticket, assignment: row };
}

/**
 * Upload resolution proof image(s) for the assigned Service Manager.
 * Creates timeline comments with "RESOLUTION proof uploaded" so close validation accepts them.
 */
export async function uploadSmResolutionProof({ req, ticketId, images, remarks }) {
  const userId = req.appUser?.id ? String(req.appUser.id) : null;
  if (!userId) return { ok: false, status: 403, error: "Authenticated user required" };

  const role = String(req.tenantRole || req.appUser?.role || "").toUpperCase();
  if (!["STAFF", "ADMIN", "SUPER_ADMIN"].includes(role)) {
    return { ok: false, status: 403, error: "Only Service Managers may upload SM resolution proof" };
  }

  const { data: row, error } = await getAssignmentWithTicketByAssignedUserAndTicket(userId, ticketId);
  if (error) return { ok: false, status: 500, error: error.message };
  const ownership = assertSmOwnsCurrentAssignment(row, userId);
  if (!ownership.ok) return ownership;
  const { ticket, assignment } = ownership;

  if (!isTenantAllowed(req, ticket.organisation_id)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const status = String(ticket.status || "");
  if (status === "RESOLVED" || status === "REJECTED") {
    return { ok: false, status: 400, error: `Cannot upload proof for ticket in status ${status}` };
  }
  if (status === "RESOLVED_PENDING_VERIFICATION") {
    return { ok: false, status: 400, error: "Ticket is already pending verification" };
  }

  const parsed = parseAssignmentContextImages(images);
  if (!parsed.ok) return { ok: false, status: parsed.status ?? 400, error: parsed.error };
  if (!parsed.items.length) {
    return { ok: false, status: 400, error: "At least one resolution image is required" };
  }

  const remarksTrim = remarks != null ? String(remarks).trim() : "";
  const commentIds = [];
  const organisationId = ticket.organisation_id ?? null;
  const uploadedAt = new Date().toISOString();

  for (let i = 0; i < parsed.items.length; i++) {
    const item = parsed.items[i];
    const body =
      i === 0 && remarksTrim
        ? `RESOLUTION proof uploaded\n\n${remarksTrim}`
        : "RESOLUTION proof uploaded";

    const insertRes = await insertComment({
      ticket_id: ticketId,
      source: "STAFF",
      author_id: userId,
      organisation_id: organisationId,
      body,
      attachments: {
        sm_resolution_proof: {
          event_type: "SM_RESOLUTION_PROOF",
          assignment_id: assignment.id,
          uploaded_by_user_id: userId,
          uploaded_at: uploadedAt,
          remark: item.remark || remarksTrim || null,
          sort_index: i,
        },
      },
    });
    if (insertRes.error || !insertRes.data?.id) {
      return {
        ok: false,
        status: 500,
        error: insertRes.error?.message || "Failed to record resolution proof comment",
        commentIds,
      };
    }

    const commentId = insertRes.data.id;
    commentIds.push(commentId);

    try {
      const uploaded = await uploadProof({
        tenantId: organisationId,
        ticketId,
        commentId,
        index: 0,
        buffer: item.buffer,
        contentType: item.contentType,
        filename: item.filename,
      });
      const dataUrl = `data:${item.contentType};base64,${item.buffer.toString("base64")}`;
      const prevAtt =
        insertRes.data.attachments &&
        typeof insertRes.data.attachments === "object" &&
        !Array.isArray(insertRes.data.attachments)
          ? insertRes.data.attachments
          : {};
      await updateCommentById(commentId, {
        attachments: {
          ...prevAtt,
          sm_resolution_proof: {
            ...(prevAtt.sm_resolution_proof && typeof prevAtt.sm_resolution_proof === "object"
              ? prevAtt.sm_resolution_proof
              : {}),
            storage_key: uploaded.key,
            content_type: uploaded.contentType,
            bytes: uploaded.bytes,
          },
          image_base64: dataUrl,
          images: [{ image_base64: dataUrl, mime_type: item.contentType }],
          proof_storage_paths: [uploaded.key],
        },
      });
    } catch (err) {
      return {
        ok: false,
        status: 500,
        error: err?.message || "Failed to store resolution proof",
        commentIds,
      };
    }
  }

  void insertAuditLog({
    req,
    entity_type: "ticket",
    entity_id: ticketId,
    action: "sm_resolution_proof_uploaded",
    organisation_id: organisationId,
    metadata: {
      assignment_id: assignment.id,
      comment_ids: commentIds,
      image_count: commentIds.length,
    },
  });

  return { ok: true, comment_ids: commentIds, uploaded: commentIds.length };
}

/**
 * Submit assigned SM ticket for tenant admin verification (→ RESOLVED_PENDING_VERIFICATION).
 */
export async function submitSmForVerification({ req, ticketId, remarks }) {
  const userId = req.appUser?.id ? String(req.appUser.id) : null;
  if (!userId) return { ok: false, status: 403, error: "Authenticated user required" };

  const { data: row, error } = await getAssignmentWithTicketByAssignedUserAndTicket(userId, ticketId);
  if (error) return { ok: false, status: 500, error: error.message };
  const ownership = assertSmOwnsCurrentAssignment(row, userId);
  if (!ownership.ok) return ownership;
  const { ticket, assignment } = ownership;

  if (!isTenantAllowed(req, ticket.organisation_id)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const status = String(ticket.status || "");
  if (status === "RESOLVED_PENDING_VERIFICATION") {
    return { ok: true, idempotent: true, status };
  }
  if (status === "RESOLVED" || status === "REJECTED") {
    return { ok: false, status: 400, error: `Cannot submit ticket in status ${status}` };
  }
  if (!SM_RESOLVABLE_STATUSES.has(status) && status !== "ON_SITE") {
    return {
      ok: false,
      status: 400,
      error: `Cannot submit for verification from status ${status}`,
    };
  }

  const { data: comments } = await listCommentsForTicketUnscoped(ticketId, { limit: 200, offset: 0 });
  const hasProof = (comments || []).some((c) => {
    const body = c.body != null ? String(c.body).toLowerCase() : "";
    if (body.includes("proof uploaded")) return true;
    const att = c.attachments;
    if (att && typeof att === "object" && !Array.isArray(att)) {
      if (att.sm_resolution_proof) return true;
      if (Array.isArray(att.images) && att.images.length > 0) return true;
      if (Array.isArray(att.proof_storage_paths) && att.proof_storage_paths.length > 0) return true;
    }
    return false;
  });
  if (!hasProof) {
    return {
      ok: false,
      status: 400,
      error: "Upload resolution proof before submitting for verification",
    };
  }

  const remarksTrim = remarks != null ? String(remarks).trim() : "";
  const now = new Date().toISOString();
  const { error: updErr } = await updateTicketById(ticketId, {
    status: "RESOLVED_PENDING_VERIFICATION",
    updated_at: now,
    ...(remarksTrim ? { verification_remarks: remarksTrim } : {}),
  });
  if (updErr) return { ok: false, status: 500, error: updErr.message };

  await insertComment({
    ticket_id: ticketId,
    source: "STAFF",
    author_id: userId,
    organisation_id: ticket.organisation_id ?? null,
    body: remarksTrim
      ? `Submitted for verification\n\n${remarksTrim}`
      : "Submitted for verification",
    attachments: {
      sm_verification_submit: {
        event_type: "SM_SUBMITTED_FOR_VERIFICATION",
        assignment_id: assignment.id,
        submitted_at: now,
        submitted_by_user_id: userId,
      },
    },
  });

  void insertAuditLog({
    req,
    entity_type: "ticket",
    entity_id: ticketId,
    action: "status_changed_to_RESOLVED_PENDING_VERIFICATION",
    organisation_id: ticket.organisation_id ?? null,
    metadata: {
      assignment_id: assignment.id,
      assignment_type: "SERVICE_MANAGER",
      via: "sm_portal",
    },
  });

  return { ok: true, status: "RESOLVED_PENDING_VERIFICATION" };
}
