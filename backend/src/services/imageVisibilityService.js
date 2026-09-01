import { getCommentById, insertComment, updateCommentById } from "../repositories/commentRepository.js";
import { getTicketByIdUnscopedSingle } from "../repositories/ticketQueryRepository.js";
import { insertAuditLog } from "./auditLogService.js";
import { findUserNameById } from "../repositories/userRepository.js";
import { deleteProof, isProofS3Enabled } from "./proofStorageService.js";

const ALLOWED_ROLES = new Set(["ADMIN", "STAFF", "SUPER_ADMIN"]);

export function isCommentImagesHidden(attachments) {
  if (!attachments || typeof attachments !== "object" || Array.isArray(attachments)) return false;
  const a = attachments;
  return Boolean(
    (a.image_visibility && typeof a.image_visibility.hidden_at === "string" && a.image_visibility.hidden_at.trim()) ||
      (a.assignment_context && typeof a.assignment_context === "object" && a.assignment_context.deleted_at)
  );
}

/** Collect S3 object keys referenced by a comment attachment payload. */
export function collectAttachmentStorageKeys(attachments) {
  if (!attachments || typeof attachments !== "object" || Array.isArray(attachments)) return [];
  const keys = new Set();
  const add = (k) => {
    if (typeof k === "string" && k.trim()) keys.add(k.trim());
  };
  if (Array.isArray(attachments.proof_storage_paths)) {
    for (const k of attachments.proof_storage_paths) add(k);
  }
  add(attachments.proof_storage_path);
  const ctx = attachments.assignment_context;
  if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
    add(ctx.storage_key);
  }
  return [...keys];
}

export async function deleteAttachmentStorageKeys(keys) {
  if (!keys.length || !isProofS3Enabled()) {
    return { attempted: 0, deleted: [], failed: [], skipped: !isProofS3Enabled() };
  }
  const deleted = [];
  const failed = [];
  for (const key of keys) {
    try {
      await deleteProof({ key });
      deleted.push(key);
    } catch (err) {
      failed.push({ key, error: err?.message || String(err) });
    }
  }
  return { attempted: keys.length, deleted, failed, skipped: false };
}

export async function hideCommentImages({ req, ticketId, commentId, reason }) {
  if (!ALLOWED_ROLES.has(req?.tenantRole) && !req?.isSuperAdmin) {
    return { ok: false, status: 403, error: "Only staff administrators may hide images" };
  }
  const { data: comment, error } = await getCommentById(commentId);
  if (error) throw error;
  if (!comment || comment.ticket_id !== ticketId) return { ok: false, status: 404, error: "Comment not found" };

  let organisationId = comment.organisation_id ?? null;
  if (!organisationId) {
    const { data: ticket } = await getTicketByIdUnscopedSingle(ticketId, "id, organisation_id");
    organisationId = ticket?.organisation_id ?? null;
  }
  if (req.tenantId && organisationId && req.tenantId !== organisationId && !req.isSuperAdmin) {
    return { ok: false, status: 403, error: "Ticket does not belong to your organisation" };
  }
  if (req.tenantId && !organisationId && !req.isSuperAdmin) {
    return { ok: false, status: 403, error: "Ticket does not belong to your organisation" };
  }

  const attachments = comment.attachments && typeof comment.attachments === "object" && !Array.isArray(comment.attachments)
    ? { ...comment.attachments }
    : {};
  if (isCommentImagesHidden(attachments)) {
    return { ok: true, idempotent: true, hidden: true, storage_fully_deleted: false };
  }

  const storageKeys = collectAttachmentStorageKeys(attachments);
  const storageCleanup = await deleteAttachmentStorageKeys(storageKeys);

  const now = new Date().toISOString();
  const reasonTrim = String(reason ?? "").trim() || null;
  const { data: user } = req?.appUser?.id ? await findUserNameById(req.appUser.id) : { data: null };
  const hiddenByName = user?.name?.trim() || "Unknown";
  const actorId = req.appUser?.id ?? null;

  const hasKeys = storageKeys.length > 0;
  const storageFullyDeleted =
    !hasKeys || (storageCleanup.attempted > 0 && storageCleanup.failed.length === 0);
  const storageDeleteFailed = hasKeys && storageCleanup.failed.length > 0;
  const storageDeletePartial =
    hasKeys && storageCleanup.deleted.length > 0 && storageCleanup.failed.length > 0;

  /** @type {Record<string, unknown>} */
  const visibility = {
    hidden_at: now,
    hidden_by_user_id: actorId,
    hidden_by_name: hiddenByName,
    hidden_reason: reasonTrim,
    storage_keys: storageKeys,
    storage_keys_deleted: storageCleanup.deleted,
    storage_keys_failed: storageCleanup.failed,
    storage_fully_deleted: storageFullyDeleted,
    storage_delete_failed: storageDeleteFailed,
    storage_delete_partial: storageDeletePartial,
    s3_untouched: hasKeys && storageCleanup.deleted.length === 0 && !storageCleanup.skipped,
  };

  if (storageFullyDeleted) {
    visibility.deleted_at = now;
    visibility.deleted_by = actorId;
    visibility.deleted_by_name = hiddenByName;
    visibility.deleted_reason = reasonTrim;
  }

  attachments.image_visibility = visibility;

  if (attachments.assignment_context && typeof attachments.assignment_context === "object") {
    attachments.assignment_context = {
      ...attachments.assignment_context,
      hidden_at: now,
      ...(storageFullyDeleted
        ? {
            deleted_at: now,
            deleted_by: actorId,
            deleted_by_name: hiddenByName,
            deleted_reason: reasonTrim,
          }
        : {}),
    };
  }

  const update = await updateCommentById(commentId, { attachments });
  if (update.error) throw update.error;

  void insertAuditLog({
    req,
    entity_type: "ticket_comment",
    entity_id: commentId,
    action: "image_hidden",
    organisation_id: organisationId,
    metadata: {
      ticket_id: ticketId,
      reason: reasonTrim,
      hidden_at: now,
      hidden_by: actorId,
      storage_keys: storageKeys,
      storage_deleted: storageCleanup.deleted,
      storage_failed: storageCleanup.failed,
      storage_fully_deleted: storageFullyDeleted,
      storage_delete_failed: storageDeleteFailed,
    },
  });

  await insertComment({
    ticket_id: ticketId,
    source: "STAFF",
    author_id: actorId,
    organisation_id: organisationId,
    body: storageDeleteFailed ? "Image Hidden (storage cleanup incomplete)" : "Image Hidden",
    attachments: {
      image_hidden_event: {
        comment_id: commentId,
        reason: reasonTrim,
        hidden_at: now,
        hidden_by_name: hiddenByName,
        storage_deleted: storageCleanup.deleted,
        storage_failed: storageCleanup.failed,
        storage_fully_deleted: storageFullyDeleted,
        storage_delete_failed: storageDeleteFailed,
        ...(storageFullyDeleted
          ? {
              deleted_at: now,
              deleted_by: actorId,
              deleted_by_name: hiddenByName,
              deleted_reason: reasonTrim,
            }
          : {}),
      },
    },
  });

  return {
    ok: true,
    hidden: true,
    hidden_at: now,
    hidden_by_name: hiddenByName,
    storage_deleted: storageCleanup.deleted,
    storage_failed: storageCleanup.failed,
    storage_fully_deleted: storageFullyDeleted,
    storage_delete_failed: storageDeleteFailed,
    storage_delete_partial: storageDeletePartial,
    partial_failure: storageDeleteFailed,
  };
}
