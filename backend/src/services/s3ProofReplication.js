import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { redactStoragePath } from "../utils/redact.js";

function isS3ProofReplicationEnabled() {
  return String(process.env.S3_FE_PROOFS_ENABLED || "false").toLowerCase() === "true";
}

function getBucket() {
  return String(process.env.S3_FE_PROOFS_BUCKET || "").trim();
}

let s3Client = null;

function getS3Client() {
  if (!s3Client) {
    const region = String(process.env.AWS_REGION || "ap-south-1").trim();
    s3Client = new S3Client({ region });
  }
  return s3Client;
}

/**
 * Best-effort secondary replication to S3. Uses the same object key as Supabase Storage.
 * Never throws; failures are logged only.
 *
 * @param {{ storagePath: string, buffer: Buffer, contentType?: string }} params
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string }>}
 */
export async function replicateProofToS3({ storagePath, buffer, contentType = "image/jpeg" }) {
  if (!isS3ProofReplicationEnabled()) {
    console.error("[s3-proof-upload] PutObject skipped (S3_FE_PROOFS_ENABLED not true)", {
      storagePath: redactStoragePath(storagePath),
      enabledRaw: process.env.S3_FE_PROOFS_ENABLED ?? null,
    });
    return { ok: false, skipped: true };
  }

  const bucket = getBucket();
  if (!bucket) {
    console.error("[s3-proof-upload] skipped (S3_FE_PROOFS_BUCKET missing)", {
      storagePath: redactStoragePath(storagePath),
    });
    return { ok: false, skipped: true };
  }

  if (!storagePath || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    console.error("[s3-proof-upload] skipped (invalid path or buffer)", {
      storagePath: redactStoragePath(storagePath),
      bufferBytes: buffer?.length ?? 0,
    });
    return { ok: false, skipped: true };
  }

  try {
    console.error("[s3-proof-upload] PutObject start", {
      bucket,
      key: redactStoragePath(storagePath),
      contentType,
      bytes: buffer.length,
    });
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storagePath,
        Body: buffer,
        ContentType: contentType,
      })
    );
    console.error("[s3-proof-upload] success", {
      bucket,
      key: redactStoragePath(storagePath),
      bytes: buffer.length,
    });
    return { ok: true };
  } catch (err) {
    console.error("[s3-proof-upload] failure", {
      bucket,
      key: redactStoragePath(storagePath),
      errorMessage: err?.message,
      errorName: err?.name,
    });
    return { ok: false, error: err?.message };
  }
}

function decodeBase64Proof(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { buffer: null, contentType: null };

  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/is);
  if (dataUrlMatch) {
    return {
      contentType: dataUrlMatch[1],
      buffer: Buffer.from(dataUrlMatch[2], "base64"),
    };
  }

  const stripped = raw.replace(/^data:[^;]+;base64,/, "");
  return { buffer: Buffer.from(stripped, "base64"), contentType: null };
}

function extFromContentType(contentType, fallback = "bin") {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("quicktime")) return "mov";
  if (ct.includes("webm")) return "webm";
  return fallback;
}

function pushBase64Media(items, value, defaultType) {
  const { buffer, contentType } = decodeBase64Proof(value);
  if (!buffer?.length) return;
  items.push({
    buffer,
    contentType: contentType || defaultType,
    ext: extFromContentType(contentType, defaultType === "video/mp4" ? "mp4" : "jpg"),
  });
}

function collectProofMediaFromAttachments(attachments, videoAttachmentMeta) {
  const items = [];
  const att =
    attachments && typeof attachments === "object" && !Array.isArray(attachments) ? attachments : {};

  if (Array.isArray(att.images)) {
    for (const it of att.images) {
      if (it && typeof it === "object" && it.image_base64) {
        pushBase64Media(items, it.image_base64, "image/jpeg");
      }
    }
  }

  if (items.length === 0 && typeof att.image_base64 === "string" && att.image_base64.trim() !== "") {
    pushBase64Media(items, att.image_base64, "image/jpeg");
  }

  if (typeof att.video_base64 === "string" && att.video_base64.trim() !== "") {
    pushBase64Media(items, att.video_base64, "video/mp4");
  }

  if (Array.isArray(att.videos)) {
    for (const v of att.videos) {
      if (v && typeof v === "object" && v.video_base64) {
        pushBase64Media(items, v.video_base64, "video/mp4");
      }
    }
  }

  const meta =
    videoAttachmentMeta && typeof videoAttachmentMeta === "object" && !Array.isArray(videoAttachmentMeta)
      ? videoAttachmentMeta
      : null;
  if (meta?.video_base64) {
    pushBase64Media(items, meta.video_base64, meta.mime_type || "video/mp4");
  }

  return items;
}

/**
 * Replicate all proof images/videos from attachments to S3 (detached-friendly). Never throws.
 */
export async function replicateProofsToS3({
  ticketId,
  actionType,
  commentId,
  attachments,
  videoAttachmentMeta = null,
}) {
  console.error("[s3-proof-upload] replicateProofsToS3 invoked", {
    ticketId: ticketId ?? null,
    actionType: actionType ?? null,
    commentId: commentId ?? null,
    s3Enabled: isS3ProofReplicationEnabled(),
    bucket: getBucket() || null,
    region: process.env.AWS_REGION ?? null,
  });

  const att =
    attachments && typeof attachments === "object" && !Array.isArray(attachments) ? attachments : {};
  const attachmentKeys =
    att && typeof att === "object" ? Object.keys(att).filter((k) => k !== "image_base64" && k !== "video_base64") : [];
  const hasLegacyImage = typeof att.image_base64 === "string" && att.image_base64.trim() !== "";
  const imagesArrayLen = Array.isArray(att.images) ? att.images.length : 0;
  const videoMetaKeys =
    videoAttachmentMeta && typeof videoAttachmentMeta === "object" && !Array.isArray(videoAttachmentMeta)
      ? Object.keys(videoAttachmentMeta)
      : [];

  console.error("[s3-proof-upload] attachments snapshot", {
    attachmentKeys,
    hasLegacyImage,
    imagesArrayLen,
    videoMetaKeys,
    hasVideoMetaBase64: Boolean(
      videoAttachmentMeta &&
        typeof videoAttachmentMeta === "object" &&
        videoAttachmentMeta.video_base64
    ),
  });

  if (!ticketId || !commentId || !actionType) {
    console.error("[s3-proof-upload] skipped (missing ticketId, actionType, or commentId)", {
      ticketId: ticketId ?? null,
      commentId: commentId ?? null,
      actionType: actionType ?? null,
    });
    return;
  }

  const media = collectProofMediaFromAttachments(attachments, videoAttachmentMeta);
  console.error("[s3-proof-upload] extracted media count", { count: media.length });

  if (media.length === 0) {
    console.error("[s3-proof-upload] skipped (zero uploads — no decodable media buffers)", {
      ticketId,
      commentId,
      actionType,
    });
    return;
  }

  const safeAction = String(actionType).trim() || "PROOF";
  const uploadKeys = media.map(
    (_item, index) => `proofs/${ticketId}/${safeAction}/${commentId}/${index}.${media[index].ext}`
  );
  console.error("[s3-proof-upload] upload keys generated", {
    uploadKeys: uploadKeys.map((k) => redactStoragePath(k)),
  });

  const results = await Promise.allSettled(
    media.map((item, index) => {
      const key = uploadKeys[index];
      return replicateProofToS3({
        storagePath: key,
        buffer: item.buffer,
        contentType: item.contentType,
      });
    })
  );

  const rejected = results.filter((r) => r.status === "rejected").length;
  const skipped = results.filter((r) => r.status === "fulfilled" && r.value?.skipped).length;
  const ok = results.filter((r) => r.status === "fulfilled" && r.value?.ok).length;
  const failed = results.filter(
    (r) => r.status === "fulfilled" && r.value && !r.value.ok && !r.value.skipped
  ).length;

  console.error("[s3-proof-upload] batch complete", {
    ticketId,
    commentId,
    actionType: safeAction,
    total: media.length,
    ok,
    skipped,
    failed,
    rejected,
  });
}
