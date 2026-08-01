// src/controllers/proofController.js
import { supabaseAuth } from "../supabaseAuthClient.js";
import { areSharedSupabaseMutationsDisabled } from "../security/sharedSupabaseMutationFreeze.js";
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
import { replicateProofsToS3 } from "../services/s3ProofReplication.js";
import { redactStoragePath } from "../utils/redact.js";
import { maskTokenForLog } from "../utils/tokenRedact.js";
import { getAssignmentById, updateAssignmentById } from "../repositories/assignmentRepository.js";
import { insertCommentReturning } from "../repositories/commentRepository.js";
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
          console.error("[s3-proof-upload] schedule detached replication (resolution failed)", {
            ticketId,
            commentId: failedProofComment.id,
          });
          void replicateProofsToS3({
            ticketId,
            actionType: "RESOLUTION",
            commentId: failedProofComment.id,
            attachments: attachmentsToStore,
            videoAttachmentMeta,
          }).catch((err) =>
            console.error("[s3-proof-upload] detached replication failed", err?.message || err)
          );
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
        console.error("[s3-proof-upload] schedule detached replication (resolution success)", {
          ticketId,
          commentId: resolutionComment.id,
          actionType: actionToken.action_type || "RESOLUTION",
        });
        void replicateProofsToS3({
          ticketId,
          actionType: actionToken.action_type || "RESOLUTION",
          commentId: resolutionComment.id,
          attachments: resolutionAttachments,
          videoAttachmentMeta,
        }).catch((err) =>
          console.error("[s3-proof-upload] detached replication failed", err?.message || err)
        );
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

      /* Optional: backup proof to Supabase Storage (does not block; base64 remains in ticket_comments)
         Backward-compatible:
         - If attachments.images[] exists, use the first image_base64
         - Else fall back to attachments.image_base64
      */
      const imageBase64 =
        resolutionAttachments &&
        typeof resolutionAttachments === "object" &&
        (Array.isArray(resolutionAttachments.images) && resolutionAttachments.images[0]?.image_base64
          ? resolutionAttachments.images[0].image_base64
          : resolutionAttachments.image_base64);
      if (imageBase64 && typeof imageBase64 === "string") {
        try {
          if (areSharedSupabaseMutationsDisabled()) {
            console.warn(
              "[Proof Storage] Supabase upload skipped — SHARED_SUPABASE_MUTATIONS_DISABLED (proof remains in DB)"
            );
          } else {
            const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, "base64");
            const actionType = actionToken.action_type || "RESOLUTION";
            const filePath = `${ticketId}/${actionType}/${Date.now()}.jpg`;
            const { error: uploadError } = await supabaseAuth.storage
              .from("fe-proofs")
              .upload(filePath, buffer, {
                contentType: "image/jpeg",
                upsert: false,
              });
            if (uploadError) {
              console.error("[Proof Storage] Upload failed:", uploadError.message);
            } else {
              await updateAssignmentById(assignmentId, { proof_storage_path: filePath });
              console.log("📦 Proof uploaded to Supabase:", redactStoragePath(filePath));
            }
          }
        } catch (err) {
          console.error("[Proof Storage] Failed:", err?.message || err);
        }
      }

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
      console.error("[s3-proof-upload] schedule detached replication (on_site)", {
        ticketId,
        commentId: ticketComment.id,
        actionType: actionToken.action_type || "ON_SITE",
      });
      void replicateProofsToS3({
        ticketId,
        actionType: actionToken.action_type || "ON_SITE",
        commentId: ticketComment.id,
        attachments: onsiteAttachments,
        videoAttachmentMeta,
      }).catch((err) =>
        console.error("[s3-proof-upload] detached replication failed", err?.message || err)
      );
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
