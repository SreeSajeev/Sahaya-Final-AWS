/**
 * Manager assignment context images — validate uploads and persist via existing
 * proof storage (private S3 + proof_storage_paths on ticket_comments).
 *
 * Each image is its own STAFF comment so the activity timeline stays chronological.
 * Soft-delete ready: assignment_context.deleted_at (null = visible).
 */

import {
  parseRejectionUploadImage,
  REJECTION_UPLOAD_MAX_BYTES,
  REJECTION_UPLOAD_ALLOWED_MIME,
} from "./rejectionEvidenceService.js";
import { insertComment, updateCommentById } from "../repositories/commentRepository.js";
import { findUserNameById } from "../repositories/userRepository.js";
import { hasPublicColumn } from "./schemaCompatService.js";
import {
  findFieldExecutiveByUserId,
  findFieldExecutiveByName,
} from "../repositories/fieldExecutiveRepository.js";
import { getAssignmentById } from "../repositories/assignmentRepository.js";
import { getTicketByIdScoped } from "../repositories/ticketQueryRepository.js";
import { isTenantAllowed } from "../middleware/tenantContext.js";

export const ASSIGNMENT_CONTEXT_MAX_IMAGES = 10;
export const ASSIGNMENT_CONTEXT_REMARK_MAX = 4000;
export const ASSIGNMENT_CONTEXT_UPLOAD_MAX_BYTES = REJECTION_UPLOAD_MAX_BYTES;
export const ASSIGNMENT_CONTEXT_ALLOWED_MIME = REJECTION_UPLOAD_ALLOWED_MIME;

/**
 * @param {unknown} raw
 * @returns {{ ok: true; items: Array<{ buffer: Buffer; contentType: string; filename: string; remark: string }> } | { ok: false; error: string; status: number }}
 */
export function parseAssignmentContextImages(raw) {
  if (raw == null) return { ok: true, items: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: "context_images must be an array", status: 400 };
  }
  if (raw.length > ASSIGNMENT_CONTEXT_MAX_IMAGES) {
    return {
      ok: false,
      error: `At most ${ASSIGNMENT_CONTEXT_MAX_IMAGES} assignment context images are allowed`,
      status: 400,
    };
  }

  /** @type {Array<{ buffer: Buffer; contentType: string; filename: string; remark: string }>} */
  const items = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, error: `context_images[${i}] is invalid`, status: 400 };
    }
    const remarkRaw = row.remark != null ? String(row.remark) : "";
    if (remarkRaw.length > ASSIGNMENT_CONTEXT_REMARK_MAX) {
      return {
        ok: false,
        error: `context_images[${i}].remark exceeds ${ASSIGNMENT_CONTEXT_REMARK_MAX} characters`,
        status: 400,
      };
    }
    // Preserve exact multiline content including leading/trailing whitespace inside lines;
    // only refuse totally empty when image present? Allow empty remark.
    const remark = remarkRaw;

    const parsed = parseRejectionUploadImage({
      contentType: row.contentType,
      filename: row.filename ?? `assignment-context-${i + 1}.jpg`,
      dataBase64: row.dataBase64,
      data_base64: row.data_base64,
    });
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error?.replace(/^Rejection photo/, "Assignment context image") ?? "Invalid image",
        status: parsed.status ?? 400,
      };
    }
    if (!parsed.upload) {
      return { ok: false, error: `context_images[${i}] is empty`, status: 400 };
    }
    items.push({
      buffer: parsed.upload.buffer,
      contentType: parsed.upload.contentType,
      filename: parsed.upload.filename.replace(/^rejection-photo/, "assignment-context"),
      remark,
    });
  }
  return { ok: true, items };
}

/**
 * Persist one comment + S3 object per image after a successful assign/reassign.
 *
 * @param {{
 *   req: object;
 *   ticketId: string;
 *   organisationId: string | null;
 *   assignmentId: string | null;
 *   feId: string | null;
 *   items: Array<{ buffer: Buffer; contentType: string; filename: string; remark: string }>;
 *   isReassign?: boolean;
 *   eventType?: string;
 * }} opts
 */
export async function persistAssignmentContextImages(opts) {
  const {
    req,
    ticketId,
    organisationId,
    assignmentId,
    feId,
    items,
    isReassign = false,
    eventType = null,
  } = opts;

  const contextEventType =
    eventType ||
    (isReassign ? "REASSIGNMENT_CONTEXT" : "ASSIGNMENT_CONTEXT");

  if (!items?.length) {
    return { ok: true, commentIds: [], uploaded: 0 };
  }

  const { uploadProof, isProofS3Enabled } = await import("./proofStorageService.js");
  if (!isProofS3Enabled()) {
    return {
      ok: false,
      error: "Assignment context image storage is temporarily unavailable",
      status: 503,
    };
  }

  let uploadedByName = "Unknown";
  if (req.appUser?.id) {
    const { data: row } = await findUserNameById(req.appUser.id);
    uploadedByName =
      row?.name != null && String(row.name).trim() !== ""
        ? String(row.name).trim()
        : "Unknown";
  }

  if (!req.appUser?.id) {
    return { ok: false, error: "User profile required to upload assignment context", status: 403 };
  }

  /** @type {string[]} */
  const commentIds = [];
  const uploadedAt = new Date().toISOString();

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const remark = item.remark ?? "";
    const insertRes = await insertComment({
      ticket_id: ticketId,
      source: "STAFF",
      author_id: req.appUser.id,
      organisation_id: organisationId ?? null,
      body: remark,
      attachments: {
        assignment_context: {
          event_type: contextEventType,
          assignment_id: assignmentId,
          fe_id: feId,
          uploaded_by_user_id: req.appUser.id,
          uploaded_by_name: uploadedByName,
          uploaded_at: uploadedAt,
          remark,
          sort_index: i,
          deleted_at: null,
        },
      },
    });
    if (insertRes.error || !insertRes.data?.id) {
      return {
        ok: false,
        error: insertRes.error?.message || "Failed to record assignment context comment",
        status: 500,
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

      const updateRes = await updateCommentById(commentId, {
        attachments: {
          ...prevAtt,
          assignment_context: {
            ...(prevAtt.assignment_context && typeof prevAtt.assignment_context === "object"
              ? prevAtt.assignment_context
              : {}),
            event_type: contextEventType,
            assignment_id: assignmentId,
            fe_id: feId,
            uploaded_by_user_id: req.appUser.id,
            uploaded_by_name: uploadedByName,
            uploaded_at: uploadedAt,
            remark,
            sort_index: i,
            deleted_at: null,
            storage_key: uploaded.key,
            content_type: uploaded.contentType,
            bytes: uploaded.bytes,
          },
          image_base64: dataUrl,
          images: [{ image_base64: dataUrl, mime_type: item.contentType }],
          proof_storage_paths: [uploaded.key],
        },
      });
      if (updateRes.error) {
        return {
          ok: false,
          error: updateRes.error.message || "Failed to store assignment context metadata",
          status: 500,
          commentIds,
        };
      }
    } catch (e) {
      return {
        ok: false,
        error: e?.message || "Failed to upload assignment context image",
        status: 500,
        commentIds,
      };
    }
  }

  return { ok: true, commentIds, uploaded: commentIds.length };
}

/**
 * Add manager context images/remarks after FE assignment (without reassigning).
 */
export async function addPostAssignmentContextImages({ req, ticketId, contextImagesRaw }) {
  const parsed = parseAssignmentContextImages(contextImagesRaw);
  if (!parsed.ok) return parsed;
  if (!parsed.items.length) {
    return { ok: false, error: "At least one context image is required", status: 400 };
  }

  const { data: ticket, error: ticketError } = await getTicketByIdScoped(
    req,
    ticketId,
    "id, organisation_id, current_assignment_id, status"
  );
  if (ticketError || !ticket) {
    return { ok: false, error: "Ticket not found", status: 404 };
  }
  if (!isTenantAllowed(req, ticket.organisation_id)) {
    return { ok: false, error: "Ticket does not belong to your organisation", status: 403 };
  }
  if (!ticket.current_assignment_id) {
    return { ok: false, error: "Ticket has no active assignment", status: 400 };
  }

  const { data: assignment, error: assignErr } = await getAssignmentById(
    ticket.current_assignment_id,
    "id, fe_id, assignment_type, organisation_id"
  );
  if (assignErr || !assignment) {
    return { ok: false, error: "Assignment not found", status: 404 };
  }
  if (assignment.assignment_type === "SERVICE_MANAGER") {
    return {
      ok: false,
      error: "Post-assignment context images apply to Field Executive assignments only",
      status: 400,
    };
  }
  if (!assignment.fe_id) {
    return { ok: false, error: "No Field Executive on current assignment", status: 400 };
  }

  return persistAssignmentContextImages({
    req,
    ticketId,
    organisationId: ticket.organisation_id ?? null,
    assignmentId: assignment.id,
    feId: assignment.fe_id,
    items: parsed.items,
    isReassign: false,
    eventType: "POST_ASSIGNMENT_CONTEXT",
  });
}

/**
 * Resolve FE id for the authenticated app user (same rules as /fe/me).
 * @param {object} req
 * @returns {Promise<string | null>}
 */
export async function resolveFeIdFromAppUser(req) {
  const appUserId = req.appUser?.id ? String(req.appUser.id) : null;
  if (appUserId && (await hasPublicColumn("field_executives", "user_id"))) {
    const { data: byUserRow } = await findFieldExecutiveByUserId(appUserId, req.tenantId ?? null);
    if (byUserRow?.id) return byUserRow.id;
  }
  const name = req.appUser?.name ? String(req.appUser.name).trim() : "";
  if (!name) return null;
  const { data } = await findFieldExecutiveByName(name, req.tenantId ?? null);
  return data?.id ?? null;
}

/**
 * Staff (tenant) or currently assigned FE may read proof objects.
 * Clients are denied.
 *
 * @param {object} req
 * @param {{ organisation_id?: string | null; current_assignment_id?: string | null }} ticket
 */
export async function assertTicketProofReadableByCaller(req, ticket) {
  const role = String(req.tenantRole ?? req.appUser?.role ?? "").toUpperCase();
  if (req.isSuperAdmin || role === "SUPER_ADMIN") return { ok: true };
  if (role === "ADMIN" || role === "STAFF") return { ok: true };
  if (role === "CLIENT") {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (role === "FIELD_EXECUTIVE") {
    const feId = await resolveFeIdFromAppUser(req);
    if (!feId) {
      return { ok: false, status: 403, error: "Field executive profile not linked" };
    }
    const assignmentId = ticket.current_assignment_id ?? null;
    if (!assignmentId) {
      return { ok: false, status: 403, error: "Ticket is not assigned" };
    }
    const { data: assignment, error } = await getAssignmentById(assignmentId, "id, fe_id, ticket_id");
    if (error || !assignment) {
      return { ok: false, status: 403, error: "Assignment not found" };
    }
    if (String(assignment.fe_id) !== String(feId)) {
      return { ok: false, status: 403, error: "Only the assigned field executive may access these images" };
    }
    return { ok: true };
  }
  return { ok: false, status: 403, error: "Forbidden" };
}

/**
 * @param {unknown} attachments
 * @returns {null | Record<string, unknown>}
 */
export function getAssignmentContextMeta(attachments) {
  if (!attachments || typeof attachments !== "object" || Array.isArray(attachments)) return null;
  const meta = attachments.assignment_context;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  if (meta.deleted_at != null && String(meta.deleted_at).trim() !== "") return null;
  return /** @type {Record<string, unknown>} */ (meta);
}

/**
 * List visible assignment-context comments (for Assignment Context panels).
 * @param {Array<{ id: string; created_at?: string | null; body?: string | null; attachments?: unknown }>} comments
 */
export function listVisibleAssignmentContextItems(comments) {
  /** @type {Array<{ commentId: string; remark: string; uploadedAt: string | null; sortIndex: number; managerName: string | null; attachments: unknown }>} */
  const out = [];
  for (const c of comments ?? []) {
    const meta = getAssignmentContextMeta(c.attachments);
    if (!meta) continue;
    const remark =
      meta.remark != null
        ? String(meta.remark)
        : c.body != null
          ? String(c.body)
          : "";
    const sortIndex = Number.isFinite(Number(meta.sort_index)) ? Number(meta.sort_index) : 0;
    out.push({
      commentId: String(c.id),
      remark,
      uploadedAt:
        meta.uploaded_at != null
          ? String(meta.uploaded_at)
          : c.created_at != null
            ? String(c.created_at)
            : null,
      sortIndex,
      managerName:
        meta.uploaded_by_name != null && String(meta.uploaded_by_name).trim() !== ""
          ? String(meta.uploaded_by_name).trim()
          : null,
      attachments: c.attachments,
    });
  }
  out.sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return ta - tb;
  });
  return out;
}
