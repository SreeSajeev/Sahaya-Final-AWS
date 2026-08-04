/**
 * Processes fe_proof_backup_queue: retries TEST S3 uploads and updates proof_storage_path.
 * Supabase Storage is no longer used.
 */

import { hasPublicColumn } from "../services/schemaCompatService.js";
import { replicateProofsToS3, isProofS3Enabled } from "../services/s3ProofReplication.js";
import { WORKER_TENANT_ISOLATION_ENABLED } from "../config/appConfig.js";
import { logEvent } from "../utils/structuredLog.js";
import { redactStoragePath } from "../utils/redact.js";
import { listOrganisationIds } from "../repositories/organisationRepository.js";
import {
  listProofBackupQueueBatch,
  deleteProofBackupQueueRow,
} from "../repositories/feProofBackupQueueRepository.js";
import { getCommentById, updateCommentById } from "../repositories/commentRepository.js";
import { getTicketByIdUnscoped } from "../repositories/ticketQueryRepository.js";
import { updateAssignmentById } from "../repositories/assignmentRepository.js";

const BATCH_SIZE = 20;

async function getWorkerTenantScopes() {
  if (!WORKER_TENANT_ISOLATION_ENABLED) return [null];
  const hasOrgOnQueue = await hasPublicColumn("fe_proof_backup_queue", "organisation_id");
  if (!hasOrgOnQueue) return [null];
  const { data: orgRows } = await listOrganisationIds();
  const tenantIds = Array.isArray(orgRows) ? orgRows.map((r) => r.id).filter(Boolean) : [];
  return [null, ...tenantIds];
}

async function processProofBackupQueueForScope(tenantId = null) {
  const hasOrgOnQueue = await hasPublicColumn("fe_proof_backup_queue", "organisation_id");
  const { data: rows, error: fetchError } = await listProofBackupQueueBatch({
    limit: BATCH_SIZE,
    tenantId,
    hasOrgOnQueue,
  });

  if (fetchError) {
    console.error("[Proof Backup Queue] Fetch failed:", fetchError.message);
    return;
  }
  if (!rows || rows.length === 0) return;

  if (!isProofS3Enabled()) {
    console.warn("[Proof Backup Queue] S3 disabled — leaving queue rows for later retry");
    return;
  }

  for (const row of rows) {
    try {
      console.log(
        JSON.stringify({
          worker: "proofBackupQueueProcessor",
          tenantId,
          jobId: row.id,
          ticketId: row.ticket_id,
          event: "processing_backup_job",
        })
      );
      const { data: comment, error: commentError } = await getCommentById(
        row.ticket_comment_id,
        "attachments"
      );

      if (commentError || !comment?.attachments) {
        console.warn("[Proof Backup Queue] Comment not found or no attachments:", row.ticket_comment_id);
        await deleteProofBackupQueueRow(row.id, { tenantId, hasOrgOnQueue });
        continue;
      }

      const att = comment.attachments || {};
      const images = Array.isArray(att?.images)
        ? att.images.map((it) => it?.image_base64).filter((v) => typeof v === "string" && v.trim() !== "")
        : [];
      const legacy =
        typeof att?.image_base64 === "string" && att.image_base64.trim() !== "" ? [att.image_base64] : [];
      const base64List = images.length > 0 ? images : legacy;

      if (!base64List || base64List.length === 0) {
        await deleteProofBackupQueueRow(row.id, { tenantId, hasOrgOnQueue });
        continue;
      }

      const { data: ticketRow } = await getTicketByIdUnscoped(
        row.ticket_id,
        "current_assignment_id, organisation_id"
      );
      const organisationId =
        row.organisation_id || ticketRow?.organisation_id || tenantId || "unknown";

      let uploadResult;
      try {
        uploadResult = await replicateProofsToS3({
          ticketId: row.ticket_id,
          actionType: row.action_type || "ON_SITE",
          commentId: row.ticket_comment_id,
          attachments: att,
          organisationId,
        });
      } catch (err) {
        console.warn("[Proof Backup Queue] S3 upload failed:", err?.message || err);
        continue;
      }

      const storagePaths = uploadResult?.keys || [];
      if (storagePaths.length === 0) {
        console.warn("[Proof Backup Queue] No S3 keys produced; will retry");
        continue;
      }

      const { data: commentRow, error: commentAttachErr } = await getCommentById(
        row.ticket_comment_id,
        "attachments"
      );
      if (!commentAttachErr && commentRow) {
        const prev =
          commentRow.attachments &&
          typeof commentRow.attachments === "object" &&
          !Array.isArray(commentRow.attachments)
            ? commentRow.attachments
            : {};
        const merged = { ...prev, proof_storage_paths: storagePaths };
        const { error: attUpdErr } = await updateCommentById(row.ticket_comment_id, {
          attachments: merged,
        });
        if (attUpdErr) {
          console.warn("[Proof Backup Queue] attachments merge failed:", attUpdErr.message);
        } else {
          logEvent("proof_backup_storage_paths_saved", {
            ticket_comment_id: row.ticket_comment_id,
            ticket_id: row.ticket_id,
            path_count: storagePaths.length,
          });
        }
      }

      const assignmentId = ticketRow?.current_assignment_id;
      if (assignmentId) {
        await updateAssignmentById(assignmentId, { proof_storage_path: storagePaths[0] });
      }

      await deleteProofBackupQueueRow(row.id, { tenantId, hasOrgOnQueue });
      console.log(
        "📦 Proof uploaded to TEST S3:",
        redactStoragePath(storagePaths[0]),
        storagePaths.length > 1 ? `(and ${storagePaths.length - 1} more)` : ""
      );
    } catch (err) {
      console.warn("[Proof Backup Queue] Failed row", row.id, err?.message || err);
    }
  }
}

export async function processProofBackupQueue() {
  const scopes = await getWorkerTenantScopes();
  for (const tenantId of scopes) {
    await processProofBackupQueueForScope(tenantId);
  }
}
