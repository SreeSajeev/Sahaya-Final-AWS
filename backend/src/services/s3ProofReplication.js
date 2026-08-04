/**
 * Compatibility wrapper: FE proof objects go to dedicated TEST S3 via proofStorageService.
 * Never uses Supabase Storage. Refuses crm-pariskq.
 */
import { redactStoragePath } from "../utils/redact.js";
import {
  collectProofMediaFromAttachments,
  isProofS3Enabled,
  getProofS3Bucket,
  uploadProof,
  uploadProofsFromAttachments,
} from "./proofStorageService.js";

/**
 * @deprecated Prefer uploadProof / uploadProofsFromAttachments.
 * Kept for callers that pass a pre-built storagePath (legacy queue keys).
 * Legacy keys outside test/ are rewritten when tenant/ticket/comment context is available
 * via replicateProofsToS3; this low-level helper only uploads when path starts with test/.
 */
export async function replicateProofToS3({ storagePath, buffer, contentType = "image/jpeg" }) {
  if (!isProofS3Enabled()) {
    console.error("[s3-proof-upload] PutObject skipped (S3_FE_PROOFS_ENABLED not true)", {
      storagePath: redactStoragePath(storagePath),
    });
    return { ok: false, skipped: true };
  }

  let bucket;
  try {
    bucket = getProofS3Bucket();
  } catch (err) {
    console.error("[s3-proof-upload] refused bucket", { error: err?.message });
    return { ok: false, error: err?.message };
  }
  if (!bucket) {
    return { ok: false, skipped: true };
  }

  const key = String(storagePath || "").trim();
  if (!key.startsWith("test/")) {
    console.error("[s3-proof-upload] skipped (legacy key not under test/ — use uploadProofsFromAttachments)", {
      storagePath: redactStoragePath(key),
    });
    return { ok: false, skipped: true, error: "legacy_key_rejected" };
  }

  try {
    // Parse test/{tenant}/tickets/{ticket}/proofs/{comment}/{file}
    const parts = key.split("/");
    const tenantId = parts[1];
    const ticketId = parts[3];
    const commentId = parts[5];
    const filename = parts.slice(6).join("/") || "0.bin";
    const uploaded = await uploadProof({
      tenantId,
      ticketId,
      commentId,
      index: 0,
      buffer,
      contentType,
      filename,
    });
    return { ok: true, key: uploaded.key, bucket: uploaded.bucket };
  } catch (err) {
    console.error("[s3-proof-upload] failure", {
      key: redactStoragePath(key),
      errorMessage: err?.message,
    });
    return { ok: false, error: err?.message };
  }
}

/**
 * Upload all proof images/videos from attachments to TEST S3.
 * Throws when S3 is enabled and upload fails (caller must not claim success).
 */
export async function replicateProofsToS3({
  ticketId,
  actionType,
  commentId,
  attachments,
  videoAttachmentMeta = null,
  organisationId = null,
}) {
  console.error("[s3-proof-upload] replicateProofsToS3 invoked", {
    ticketId: ticketId ?? null,
    actionType: actionType ?? null,
    commentId: commentId ?? null,
    organisationId: organisationId ?? null,
    s3Enabled: isProofS3Enabled(),
  });

  if (!ticketId || !commentId) {
    console.error("[s3-proof-upload] skipped (missing ticketId or commentId)");
    return { keys: [], skipped: true };
  }

  if (!isProofS3Enabled()) {
    console.error("[s3-proof-upload] skipped (S3 disabled)");
    return { keys: [], skipped: true };
  }

  const media = collectProofMediaFromAttachments(attachments, videoAttachmentMeta);
  if (media.length === 0) {
    console.error("[s3-proof-upload] skipped (no media)");
    return { keys: [], skipped: true };
  }

  const tenantId = organisationId || "unknown";
  const result = await uploadProofsFromAttachments({
    tenantId,
    ticketId,
    commentId,
    attachments,
    videoAttachmentMeta,
  });

  console.error("[s3-proof-upload] batch complete", {
    ticketId,
    commentId,
    total: media.length,
    ok: result.keys.length,
    keys: result.keys.map((k) => redactStoragePath(k)),
  });

  return result;
}

export { collectProofMediaFromAttachments, isProofS3Enabled, getProofS3Bucket };
