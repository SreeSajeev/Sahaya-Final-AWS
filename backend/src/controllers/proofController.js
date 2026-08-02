// src/controllers/proofController.js
import {
  setOnsiteDeadline,
  setResolutionDeadline,
  clearOnsiteAndResolutionDeadlines,
} from "../services/slaService.js";
import {
  TOKEN_STATES,
  activateResolutionTokenAfterOnSiteProof,
  isTokenExpired,
  markTokenUsed,
} from "../services/tokenService.js";
import { SAFE_TOKEN_LIFECYCLE } from "../config/appConfig.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import {
  getFeActionTokenById,
  markFeActionTokenExpired,
} from "../repositories/feActionTokenRepository.js";
import { logEvent } from "../utils/structuredLog.js";
import { insertAuditLog } from "../services/auditLogService.js";
import { replicateProofsToS3, isProofS3Enabled } from "../services/s3ProofReplication.js";
import { maskTokenForLog } from "../utils/tokenRedact.js";
import { getAssignmentById, updateAssignmentById } from "../repositories/assignmentRepository.js";
import { insertCommentReturning, updateCommentById, getCommentById } from "../repositories/commentRepository.js";
import { getTicketByIdUnscoped, updateTicketById } from "../repositories/ticketQueryRepository.js";

function countProofImages(attachments) {
  if (!attachments || typeof attachments !== "object" || Array.isArray(attachments)) return 0;
  if (Array.isArray(attachments.images)) {
    const n = attachments.images.filter(
      (it) => it && typeof it === "object" && typeof it.image_base64 === "string" && String(it.image_base64).trim() !== ""
    ).length;
    if (n > 0) return n;
  }
  if (typeof attachments.image_base64 === "string" && attachments.image_base64.trim() !== "") return 1;
  return 0;
}

function approxJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return 0;
  }
}

/** Normalize FE proof attachments so multiple images + legacy image_base64 coexist. */
function normalizeProofAttachmentsForStorage(raw) {
  if (raw == null) return {};
  if (Array.isArray(raw)) {
    return { items: raw };
  }
  if (typeof raw !== "object") return {};
  const images = Array.isArray(raw.images) ? raw.images : [];
  const firstB64 =
    images.length > 0 && typeof images[0]?.image_base64 === "string"
      ? images[0].image_base64
      : typeof raw.image_base64 === "string"
        ? raw.image_base64
        : null;
  return {
    ...raw,
    images,
    ...(firstB64 && (!raw.image_base64 || String(raw.image_base64).trim() === "")
      ? { image_base64: firstB64 }
      : {}),
  };
}

/**
 * Persist proof binaries to dedicated TEST S3 and record keys on the comment.
 * When S3 is enabled, failures are returned to the caller (do not claim silent success).
 * Base64 remains in PostgreSQL for historical/compat display.
 */
async function persistProofsToTestS3({
  ticketId,
  organisationId,
  commentId,
  actionType,
  attachments,
  videoAttachmentMeta,
  assignmentId = null,
}) {
  if (!isProofS3Enabled()) {
    return { keys: [], skipped: true };
  }
  const result = await replicateProofsToS3({
    ticketId,
    actionType,
    commentId,
    attachments,
    videoAttachmentMeta,
    organisationId,
  });
  const keys = result?.keys || [];
  if (keys.length === 0 && !result?.skipped) {
    const err = new Error("TEST S3 proof upload produced no object keys");
    err.code = "S3_PROOF_UPLOAD_EMPTY";
    throw err;
  }
  if (keys.length > 0) {
    const { data: commentRow } = await getCommentById(commentId, "attachments");
    if (commentRow) {
      const prev =
        commentRow.attachments &&
        typeof commentRow.attachments === "object" &&
        !Array.isArray(commentRow.attachments)
          ? commentRow.attachments
          : {};
      await updateCommentById(commentId, {
        attachments: { ...prev, proof_storage_paths: keys },
      });
    }
    if (assignmentId) {
      await updateAssignmentById(assignmentId, { proof_storage_path: keys[0] });
    }
  }
  return { keys, skipped: Boolean(result?.skipped) };
}

export async function uploadFeProof(req, res) {
  try {
    const { token, attachments = [], outcome, failure_reason, video_attachment_meta: videoAttachmentMeta } =
      req.body || {};

    if (!token) {
      return res.status(400).json({ error: "Token required" });
    }

    const hasTokenStateColumn = await hasPublicColumn("fe_action_tokens", "token_state");
    const { data: actionToken } = await getFeActionTokenById(token);

    if (!actionToken) {
      return res.status(404).json({ error: "Invalid token" });
    }
    const effectiveTokenState =
      actionToken.token_state == null && SAFE_TOKEN_LIFECYCLE
        ? TOKEN_STATES.ACTIVE
        : actionToken.token_state;

    if (actionToken.used || effectiveTokenState === TOKEN_STATES.USED) {
      return res.status(409).json({ error: "Token already used", code: "TOKEN_USED" });
    }
    if (effectiveTokenState === TOKEN_STATES.REVOKED) {
      return res.status(410).json({ error: "Token revoked", code: "TOKEN_REVOKED" });
    }
    if (effectiveTokenState === TOKEN_STATES.EXPIRED || isTokenExpired(actionToken.expires_at)) {
      if (hasTokenStateColumn) {
        await markFeActionTokenExpired(token);
      }
      return res.status(410).json({ error: "Token expired", code: "TOKEN_EXPIRED" });
    }

    const ticketId = actionToken.ticket_id;

    const attForCount =
      attachments && typeof attachments === "object" && !Array.isArray(attachments) ? attachments : {};
    const imageCount = countProofImages(attForCount);
    const payloadBytes = approxJsonBytes(req.body);
    logEvent("proof_upload_image_count", {
      ticket_id: ticketId,
      token_id: maskTokenForLog(token),
      action_type: actionToken.action_type,
      image_count: imageCount,
    });
    logEvent("proof_upload_payload_size", {
      ticket_id: ticketId,
      token_id: maskTokenForLog(token),
      bytes: payloadBytes,
    });

    const { data: ticketLifecycleRow } = await getTicketByIdUnscoped(
      ticketId,
      "status, current_assignment_id, organisation_id, client_slug"
    );

    if (ticketLifecycleRow?.status === "REJECTED") {
      return res.status(400).json({ error: "Ticket has been rejected" });
    }
    if (
      actionToken.organisation_id &&
      ticketLifecycleRow?.organisation_id &&
      actionToken.organisation_id !== ticketLifecycleRow.organisation_id
    ) {
      console.warn("[FE_PROOF] tenant mismatch", {
        ticketId,
        tokenId: maskTokenForLog(token),
        tokenOrg: actionToken.organisation_id,
        ticketOrg: ticketLifecycleRow.organisation_id,
      });
      return res.status(403).json({ error: "Forbidden" });
    }

    /* =====================================================
       RESOLUTION: multi-attempt outcome (SUCCESS | FAILED)
    ===================================================== */
    if (actionToken.action_type === "RESOLUTION") {
      const resolutionStateForGuard =
        effectiveTokenState == null && SAFE_TOKEN_LIFECYCLE
          ? TOKEN_STATES.ACTIVE
          : effectiveTokenState;
      if (resolutionStateForGuard !== TOKEN_STATES.ACTIVE) {
        return res.status(409).json({
          error: "Resolution token is locked until on-site proof is uploaded",
          code: "RESOLUTION_TOKEN_LOCKED",
        });
      }
      const resolvedOutcome = outcome === "FAILED" ? "FAILED" : "SUCCESS";

      const { data: ticketRow } = await getTicketByIdUnscoped(ticketId, "current_assignment_id");

      const assignmentId = ticketRow?.current_assignment_id;
      if (!assignmentId) {
        return res.status(400).json({ error: "No current assignment" });
      }

      const { data: assignment } = await getAssignmentById(assignmentId, "id, outcome");

      if (!assignment) {
        return res.status(400).json({ error: "Assignment not found" });
      }
      if (assignment.outcome != null && assignment.outcome !== undefined) {
        return res.status(400).json({ error: "Resolution already submitted for this attempt" });
      }

      const nowIso = new Date().toISOString();

      if (resolvedOutcome === "FAILED") {
        const reason = failure_reason != null && String(failure_reason).trim() !== ""
          ? String(failure_reason).trim()
          : null;
        if (!reason) {
          return res.status(400).json({ error: "Failure reason is required when outcome is FAILED" });
        }

        // Attach proofs if provided; otherwise keep legacy attachments={} behaviour.
        const normalizedAttachments = Array.isArray(attachments)
          ? { items: attachments }
          : normalizeProofAttachmentsForStorage(
              attachments && typeof attachments === "object" ? attachments : {}
            );

        const hasImagesArray =
          normalizedAttachments &&
          typeof normalizedAttachments === "object" &&
          Array.isArray(normalizedAttachments.images);

        // Ensure legacy backup trigger compatibility: trigger enqueues only when attachments.image_base64 exists.
        if (
          normalizedAttachments &&
          typeof normalizedAttachments === "object" &&
          (!normalizedAttachments.image_base64 || typeof normalizedAttachments.image_base64 !== "string") &&
          hasImagesArray &&
          normalizedAttachments.images[0]?.image_base64
        ) {
          normalizedAttachments.image_base64 = normalizedAttachments.images[0].image_base64;
        }

        const hasAnyProof =
          normalizedAttachments &&
          typeof normalizedAttachments === "object" &&
          ((hasImagesArray && normalizedAttachments.images.length > 0) ||
            (typeof normalizedAttachments.image_base64 === "string" &&
              normalizedAttachments.image_base64.trim() !== ""));

        const attachmentsToStore = hasAnyProof ? normalizedAttachments : {};
        logEvent("proof_upload_saved_images", {
          ticket_id: ticketId,
          token_id: maskTokenForLog(token),
          action_type: "RESOLUTION_FAILED",
          image_count: countProofImages(attachmentsToStore),
        });

        await updateAssignmentById(assignmentId, {
          outcome: "FAILED",
          ended_at: nowIso,
          failure_reason: reason,
        });

        const { data: failedProofComment, error: failedProofCommentErr } = await insertCommentReturning({
            ticket_id: ticketId,
            source: "FE",
            author_id: actionToken.fe_id,
          body: `Field Executive reported resolution failed: ${reason}`,
          attachments: attachmentsToStore,
        });

        if (!failedProofCommentErr && failedProofComment?.id && hasAnyProof) {
          try {
            await persistProofsToTestS3({
              ticketId,
              organisationId:
                ticketLifecycleRow?.organisation_id ?? actionToken.organisation_id ?? null,
              commentId: failedProofComment.id,
              actionType: "RESOLUTION",
              attachments: attachmentsToStore,
              videoAttachmentMeta,
              assignmentId,
            });
          } catch (s3Err) {
            console.error("[s3-proof-upload] required upload failed (resolution failed)", s3Err?.message || s3Err);
            return res.status(502).json({
              error: "Proof saved to database but TEST S3 object storage failed",
              code: "S3_PROOF_UPLOAD_FAILED",
            });
          }
        }

        await updateTicketById(ticketId, {
          status: "FE_ATTEMPT_FAILED",
          updated_at: nowIso,
        });

        clearOnsiteAndResolutionDeadlines(ticketId).catch((err) =>
          console.error("[SLA] clearOnsiteAndResolutionDeadlines", ticketId, err.message)
        );

        await markTokenUsed(token);

        return res.json({
          success: true,
          nextStatus: "FE_ATTEMPT_FAILED",
          outcome: "FAILED",
        });
      }

      /* SUCCESS */
      await updateAssignmentById(assignmentId, {
        outcome: "SUCCESS",
        ended_at: nowIso,
      });

      const resolutionAttachments = normalizeProofAttachmentsForStorage(
        attachments && typeof attachments === "object" ? attachments : {}
      );
      logEvent("proof_upload_saved_images", {
        ticket_id: ticketId,
        token_id: maskTokenForLog(token),
        action_type: "RESOLUTION",
        image_count: countProofImages(resolutionAttachments),
      });

      const { data: resolutionComment, error: commentError } = await insertCommentReturning({
        ticket_id: ticketId,
        source: "FE",
        author_id: actionToken.fe_id,
        body: "Field Executive uploaded resolution proof",
        attachments: resolutionAttachments,
      });

      if (commentError) {
        console.error("Comment Insert Error:", commentError?.message || commentError);
        console.error("[s3-proof-upload] schedule skipped (resolution success comment insert failed)", {
          ticketId,
          commentError: commentError?.message ?? null,
        });
      } else if (resolutionComment?.id) {
        try {
          await persistProofsToTestS3({
            ticketId,
            organisationId:
              ticketLifecycleRow?.organisation_id ?? actionToken.organisation_id ?? null,
            commentId: resolutionComment.id,
            actionType: actionToken.action_type || "RESOLUTION",
            attachments: resolutionAttachments,
            videoAttachmentMeta,
            assignmentId,
          });
        } catch (s3Err) {
          console.error("[s3-proof-upload] required upload failed (resolution success)", s3Err?.message || s3Err);
          return res.status(502).json({
            error: "Proof saved to database but TEST S3 object storage failed",
            code: "S3_PROOF_UPLOAD_FAILED",
          });
        }
      } else {
        console.error("[s3-proof-upload] schedule skipped (resolution success — no comment id)", {
          ticketId,
        });
      }

      await updateTicketById(ticketId, {
        status: "RESOLVED_PENDING_VERIFICATION",
        updated_at: nowIso,
      });

      void insertAuditLog({
        entity_type: "ticket",
        entity_id: ticketId,
        action: "fe_proof_uploaded",
        ticket_organisation_id:
          ticketLifecycleRow?.organisation_id ?? actionToken.organisation_id ?? null,
        client_slug: ticketLifecycleRow?.client_slug ?? null,
        actor_fe_id: actionToken.fe_id ?? null,
        actor_role: "FIELD_EXECUTIVE",
        metadata: {
          proof_type: "RESOLUTION",
          outcome: "SUCCESS",
          image_count: countProofImages(resolutionAttachments),
        },
      });
      void insertAuditLog({
        entity_type: "ticket",
        entity_id: ticketId,
        action: "status_changed_to_RESOLVED_PENDING_VERIFICATION",
        ticket_organisation_id:
          ticketLifecycleRow?.organisation_id ?? actionToken.organisation_id ?? null,
        client_slug: ticketLifecycleRow?.client_slug ?? null,
        actor_fe_id: actionToken.fe_id ?? null,
        actor_role: "FIELD_EXECUTIVE",
        metadata: { proof_type: "RESOLUTION", token_id: token },
      });

      setResolutionDeadline(ticketId).catch((err) =>
        console.error("[SLA] setResolutionDeadline after proof", ticketId, err.message)
      );

      await markTokenUsed(token);
      console.log(JSON.stringify({
        event: "resolution_token_used",
        ticket_id: ticketId,
        token_id: maskTokenForLog(token),
        outcome: resolvedOutcome,
      }));

      return res.json({
        success: true,
        nextStatus: "RESOLVED_PENDING_VERIFICATION",
        outcome: "SUCCESS",
      });
    }

    /* =====================================================
       ON_SITE: existing flow (no outcome)
    ===================================================== */

    const nowIso = new Date().toISOString();
    const onsiteAttachments = normalizeProofAttachmentsForStorage(
      attachments && typeof attachments === "object" ? attachments : {}
    );
    logEvent("proof_upload_saved_images", {
      ticket_id: ticketId,
      token_id: maskTokenForLog(token),
      action_type: actionToken.action_type,
      image_count: countProofImages(onsiteAttachments),
    });

    const { data: ticketComment, error: commentError } = await insertCommentReturning({
      ticket_id: ticketId,
      source: "FE",
      author_id: actionToken.fe_id,
      body: `Demo ${actionToken.action_type} proof uploaded`,
      attachments: onsiteAttachments,
      created_at: nowIso,
    });

    if (commentError) {
      console.error("Comment Insert Error:", commentError?.message || commentError);
    } else if (ticketComment?.id) {
      try {
        await persistProofsToTestS3({
          ticketId,
          organisationId:
            ticketLifecycleRow?.organisation_id ?? actionToken.organisation_id ?? null,
          commentId: ticketComment.id,
          actionType: actionToken.action_type || "ON_SITE",
          attachments: onsiteAttachments,
          videoAttachmentMeta,
          assignmentId: ticketLifecycleRow?.current_assignment_id ?? null,
        });
      } catch (s3Err) {
        console.error("[s3-proof-upload] required upload failed (on_site)", s3Err?.message || s3Err);
        return res.status(502).json({
          error: "Proof saved to database but TEST S3 object storage failed",
          code: "S3_PROOF_UPLOAD_FAILED",
        });
      }
    } else if (!commentError) {
      console.error("[s3-proof-upload] schedule skipped (on_site — no comment id)", { ticketId });
    }

    const nextStatus =
      actionToken.action_type === "ON_SITE"
        ? "ON_SITE"
        : "RESOLVED_PENDING_VERIFICATION";

    const { error: updateError } = await updateTicketById(ticketId, {
      status: nextStatus,
      updated_at: nowIso,
    });

    if (updateError) {
      console.error("Status Update Error:", updateError?.message || updateError);
    }

    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: ticketId,
      action: "fe_proof_uploaded",
      ticket_organisation_id:
        ticketLifecycleRow?.organisation_id ?? actionToken.organisation_id ?? null,
      client_slug: ticketLifecycleRow?.client_slug ?? null,
      actor_fe_id: actionToken.fe_id ?? null,
      actor_role: "FIELD_EXECUTIVE",
      metadata: {
        proof_type: actionToken.action_type,
        image_count: countProofImages(onsiteAttachments),
        token_id: token,
      },
    });
    void insertAuditLog({
      req,
      entity_type: "ticket",
      entity_id: ticketId,
      action: `status_changed_to_${nextStatus}`,
      ticket_organisation_id:
        ticketLifecycleRow?.organisation_id ?? actionToken.organisation_id ?? null,
      client_slug: ticketLifecycleRow?.client_slug ?? null,
      actor_fe_id: actionToken.fe_id ?? null,
      actor_role: "FIELD_EXECUTIVE",
      metadata: { proof_type: actionToken.action_type, token_id: token },
    });

    if (nextStatus === "ON_SITE") {
      setOnsiteDeadline(ticketId).catch((err) =>
        console.error("[SLA] setOnsiteDeadline after proof", ticketId, err.message)
      );
    } else if (nextStatus === "RESOLVED_PENDING_VERIFICATION") {
      setResolutionDeadline(ticketId).catch((err) =>
        console.error("[SLA] setResolutionDeadline after proof", ticketId, err.message)
      );
    }

    await markTokenUsed(token);

    if (actionToken.action_type === "ON_SITE") {
      const hasOnSiteConfirmedAt = await hasPublicColumn("ticket_assignments", "on_site_confirmed_at");
      const hasOnSiteProofCommentId = await hasPublicColumn("ticket_assignments", "on_site_proof_comment_id");
      const assignmentMetaPayload = {};
      if (hasOnSiteConfirmedAt) assignmentMetaPayload.on_site_confirmed_at = nowIso;
      if (hasOnSiteProofCommentId) assignmentMetaPayload.on_site_proof_comment_id = ticketComment?.id ?? null;
      if (Object.keys(assignmentMetaPayload).length > 0) {
        await updateAssignmentById(
          ticketLifecycleRow?.current_assignment_id ?? null,
          assignmentMetaPayload
        );
      } else {
        console.warn("[proof] assignment metadata columns missing; skipping safe write");
      }

      const activatedTokenId = await activateResolutionTokenAfterOnSiteProof({
        ticketId,
        feId: actionToken.fe_id,
      });
      console.log(JSON.stringify({
        event: "resolution_token_activated",
        ticket_id: ticketId,
        token_id: maskTokenForLog(activatedTokenId),
        trigger_token_id: maskTokenForLog(token),
      }));
    }

    return res.json({
      success: true,
      nextStatus,
      demo: true,
    });
  } catch (err) {
    console.error("[DEMO uploadFeProof ERROR]", err?.message || err);
    return res.status(500).json({
      error: "Demo proof upload failed",
    });
  }
}
