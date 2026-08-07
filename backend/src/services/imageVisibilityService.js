import { getCommentById, insertComment, updateCommentById } from "../repositories/commentRepository.js";
import { insertAuditLog } from "./auditLogService.js";
import { findUserNameById } from "../repositories/userRepository.js";

const ALLOWED_ROLES = new Set(["ADMIN", "STAFF", "SUPER_ADMIN"]);

export function isCommentImagesHidden(attachments) {
  if (!attachments || typeof attachments !== "object" || Array.isArray(attachments)) return false;
  const a = attachments;
  return Boolean(
    (a.image_visibility && typeof a.image_visibility.hidden_at === "string" && a.image_visibility.hidden_at.trim()) ||
      (a.assignment_context && typeof a.assignment_context === "object" && a.assignment_context.deleted_at)
  );
}

export async function hideCommentImages({ req, ticketId, commentId, reason }) {
  if (!ALLOWED_ROLES.has(req?.tenantRole) && !req?.isSuperAdmin) {
    return { ok: false, status: 403, error: "Only staff administrators may hide images" };
  }
  const { data: comment, error } = await getCommentById(commentId);
  if (error) throw error;
  if (!comment || comment.ticket_id !== ticketId) return { ok: false, status: 404, error: "Comment not found" };
  if (req.tenantId && comment.organisation_id && req.tenantId !== comment.organisation_id && !req.isSuperAdmin) {
    return { ok: false, status: 403, error: "Ticket does not belong to your organisation" };
  }

  const attachments = comment.attachments && typeof comment.attachments === "object" && !Array.isArray(comment.attachments)
    ? { ...comment.attachments }
    : {};
  if (isCommentImagesHidden(attachments)) return { ok: true, idempotent: true };

  const now = new Date().toISOString();
  const { data: user } = req?.appUser?.id ? await findUserNameById(req.appUser.id) : { data: null };
  const hiddenByName = user?.name?.trim() || "Unknown";
  attachments.image_visibility = {
    hidden_at: now,
    hidden_by_user_id: req.appUser?.id ?? null,
    hidden_by_name: hiddenByName,
    hidden_reason: String(reason ?? "").trim() || null,
  };
  if (attachments.assignment_context && typeof attachments.assignment_context === "object") {
    attachments.assignment_context = { ...attachments.assignment_context, deleted_at: now, hidden_at: now };
  }
  const update = await updateCommentById(commentId, { attachments });
  if (update.error) throw update.error;

  void insertAuditLog({
    req, entity_type: "ticket_comment", entity_id: commentId, action: "image_hidden",
    organisation_id: comment.organisation_id ?? null,
    metadata: { ticket_id: ticketId, reason: attachments.image_visibility.hidden_reason },
  });
  await insertComment({
    ticket_id: ticketId, source: "STAFF", author_id: req.appUser?.id ?? null,
    organisation_id: comment.organisation_id ?? null, body: "Image Hidden",
    attachments: { image_hidden_event: { comment_id: commentId, reason: attachments.image_visibility.hidden_reason, hidden_at: now, hidden_by_name: hiddenByName } },
  });
  return { ok: true, hidden_at: now, hidden_by_name: hiddenByName };
}
