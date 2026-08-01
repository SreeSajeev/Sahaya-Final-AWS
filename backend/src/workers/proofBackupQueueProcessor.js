/**
 * Processes fe_proof_backup_queue: uploads proof images to Supabase Storage and updates proof_storage_path.
 * Called periodically from the worker loop. Additive only; does not change proof submission flow.
 */

import { supabase } from "../supabaseClient.js";
import { areSharedSupabaseMutationsDisabled } from "../security/sharedSupabaseMutationFreeze.js";
import { hasPublicColumn } from "../services/schemaCompatService.js";
import { replicateProofToS3 } from "../services/s3ProofReplication.js";
import { WORKER_TENANT_ISOLATION_ENABLED } from "../config/appConfig.js";
import { logEvent } from "../utils/structuredLog.js";
import { redactStoragePath } from "../utils/redact.js";

const BATCH_SIZE = 20;

async function getWorkerTenantScopes() {
  if (!WORKER_TENANT_ISOLATION_ENABLED) return [null];
  const hasOrgOnQueue = await hasPublicColumn("fe_proof_backup_queue", "organisation_id");
  if (!hasOrgOnQueue) return [null];
  const { data: orgRows } = await supabase.from("organisations").select("id");
  const tenantIds = Array.isArray(orgRows) ? orgRows.map((r) => r.id).filter(Boolean) : [];
  return [null, ...tenantIds];
}

async function processProofBackupQueueForScope(tenantId = null) {
  const hasOrgOnQueue = await hasPublicColumn("fe_proof_backup_queue", "organisation_id");
  let queueQuery = supabase
    .from("fe_proof_backup_queue")
    .select("id, ticket_comment_id, ticket_id, action_type")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (hasOrgOnQueue && tenantId) queueQuery = queueQuery.eq("organisation_id", tenantId);
  if (hasOrgOnQueue && !tenantId) queueQuery = queueQuery.is("organisation_id", null);
  const { data: rows, error: fetchError } = await queueQuery;

  if (fetchError) {
    console.error("[Proof Backup Queue] Fetch failed:", fetchError.message);
    return;
  }
  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    try {
      console.log(JSON.stringify({
        worker: "proofBackupQueueProcessor",
        tenantId,
        jobId: row.id,
        ticketId: row.ticket_id,
        event: "processing_backup_job",
      }));
      const { data: comment, error: commentError } = await supabase
        .from("ticket_comments")
        .select("attachments")
        .eq("id", row.ticket_comment_id)
        .single();

      if (commentError || !comment?.attachments) {
        console.warn("[Proof Backup Queue] Comment not found or no attachments:", row.ticket_comment_id);
        let deleteQuery = supabase.from("fe_proof_backup_queue").delete().eq("id", row.id);
        if (hasOrgOnQueue && tenantId) deleteQuery = deleteQuery.eq("organisation_id", tenantId);
        await deleteQuery;
        continue;
      }

      const att = comment.attachments || {};
      const images =
        Array.isArray(att?.images)
          ? att.images
              .map((it) => it?.image_base64)
              .filter((v) => typeof v === "string" && v.trim() !== "")
          : [];
      const legacy = typeof att?.image_base64 === "string" && att.image_base64.trim() !== "" ? [att.image_base64] : [];
      const base64List = images.length > 0 ? images : legacy;

      if (!base64List || base64List.length === 0) {
        let deleteQuery = supabase.from("fe_proof_backup_queue").delete().eq("id", row.id);
        if (hasOrgOnQueue && tenantId) deleteQuery = deleteQuery.eq("organisation_id", tenantId);
        await deleteQuery;
        continue;
      }

      const actionType = row.action_type || "ON_SITE";
      const basePath = `${row.ticket_id}/${actionType}/${row.ticket_comment_id}`;
      const firstFilePath = `${basePath}/0.jpg`;

      let allOk = true;
      for (let idx = 0; idx < base64List.length; idx++) {
        const imageBase64 = base64List[idx];
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const filePath = `${basePath}/${idx}.jpg`;

        if (areSharedSupabaseMutationsDisabled()) {
          console.warn(
            "[Proof Backup Queue] Supabase upload skipped — SHARED_SUPABASE_MUTATIONS_DISABLED",
            "path:",
            redactStoragePath(filePath)
          );
        } else {
          const { error: uploadError } = await supabase.storage
            .from("fe-proofs")
            .upload(filePath, buffer, {
              contentType: "image/jpeg",
              upsert: false,
            });

          if (uploadError) {
            // Idempotency: if the object already exists, treat as success.
            const statusCode = uploadError?.statusCode ?? uploadError?.status;
            const msg = String(uploadError?.message ?? "");
            const isConflict = statusCode === 409 || /already exists/i.test(msg);
            if (!isConflict) {
              console.warn("[Proof Backup Queue] Upload failed:", msg, "path:", redactStoragePath(filePath));
              allOk = false;
              break;
            }
          }
        }

        await replicateProofToS3({
          storagePath: filePath,
          buffer,
          contentType: "image/jpeg",
        });
      }

      if (!allOk) continue;

      const storagePaths = base64List.map((_, idx) => `${basePath}/${idx}.jpg`);

      const { data: commentRow, error: commentAttachErr } = await supabase
        .from("ticket_comments")
        .select("attachments")
        .eq("id", row.ticket_comment_id)
        .maybeSingle();
      if (!commentAttachErr && commentRow) {
        const prev =
          commentRow.attachments && typeof commentRow.attachments === "object" && !Array.isArray(commentRow.attachments)
            ? commentRow.attachments
            : {};
        const merged = { ...prev, proof_storage_paths: storagePaths };
        const { error: attUpdErr } = await supabase
          .from("ticket_comments")
          .update({ attachments: merged })
          .eq("id", row.ticket_comment_id);
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

      const { data: ticketRow } = await supabase
        .from("tickets")
        .select("current_assignment_id")
        .eq("id", row.ticket_id)
        .single();

      const assignmentId = ticketRow?.current_assignment_id;
      if (assignmentId) {
        await supabase
          .from("ticket_assignments")
          .update({ proof_storage_path: firstFilePath })
          .eq("id", assignmentId);
      }

      let deleteQuery = supabase.from("fe_proof_backup_queue").delete().eq("id", row.id);
      if (hasOrgOnQueue && tenantId) deleteQuery = deleteQuery.eq("organisation_id", tenantId);
      await deleteQuery;
      console.log(
        "📦 Proof uploaded to Supabase:",
        redactStoragePath(firstFilePath),
        base64List.length > 1 ? `(and ${base64List.length - 1} more)` : ""
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
