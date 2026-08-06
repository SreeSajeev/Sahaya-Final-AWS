/**
 * Helpers for ticket rejection: FE proof evidence selection + key ownership checks.
 */

const IMAGE_KEY_RE = /\.(jpe?g|png|webp|gif)$/i;

/**
 * @param {unknown} attachments
 * @returns {string[]}
 */
export function extractProofStoragePaths(attachments) {
  const att =
    attachments && typeof attachments === "object" && !Array.isArray(attachments)
      ? attachments
      : {};
  return Array.isArray(att.proof_storage_paths)
    ? att.proof_storage_paths.filter((p) => typeof p === "string" && p.trim() !== "")
    : [];
}

/**
 * @param {string} key
 * @param {{ ticketId: string; organisationId?: string | null }} opts
 */
export function assertProofKeyBelongsToTicket(key, { ticketId, organisationId = null }) {
  const k = String(key || "").trim();
  if (!k || k.includes("..") || k.startsWith("/") || k.includes("\\")) {
    const err = new Error("Invalid proof object key");
    err.code = "INVALID_PROOF_KEY";
    throw err;
  }
  if (!k.startsWith("test/")) {
    const err = new Error("Proof object key must be under test/");
    err.code = "INVALID_PROOF_KEY";
    throw err;
  }
  const ticketSeg = `/tickets/${ticketId}/`;
  if (!k.includes(ticketSeg)) {
    const err = new Error("Proof does not belong to this ticket");
    err.code = "PROOF_TICKET_MISMATCH";
    throw err;
  }
  if (organisationId) {
    const tenantSeg = `test/${organisationId}/`;
    if (!k.startsWith(tenantSeg) && !k.includes(`/${organisationId}/tickets/`)) {
      // Soft check: keys are `test/{tenantId}/tickets/{ticketId}/...`
      if (!k.startsWith(`test/${String(organisationId).trim()}/`)) {
        const err = new Error("Proof does not belong to this tenant");
        err.code = "PROOF_TENANT_MISMATCH";
        throw err;
      }
    }
  }
  return k;
}

/**
 * Build selectable FE proof image options for rejection dialog.
 * @param {Array<{ id: string; attachments?: unknown; body?: string | null; created_at?: string | null; source?: string | null }>} comments
 * @param {{ ticketId: string; organisationId?: string | null; max?: number }} opts
 */
export function buildRejectionEvidenceOptions(comments, { ticketId, organisationId = null, max = 40 }) {
  /** @type {{ id: string; commentId: string; proofIndex: number; label: string; key: string; createdAt: string | null }[]} */
  const out = [];
  for (const c of comments ?? []) {
    if (!c?.id) continue;
    // Prefer FE proofs; allow STAFF only if they somehow have proof paths (unlikely).
    const source = c.source != null ? String(c.source) : "";
    if (source && source !== "FE") continue;
    const paths = extractProofStoragePaths(c.attachments);
    paths.forEach((key, proofIndex) => {
      if (out.length >= max) return;
      try {
        assertProofKeyBelongsToTicket(key, { ticketId, organisationId });
      } catch {
        return;
      }
      // Images only for rejection photo (videos excluded).
      if (!IMAGE_KEY_RE.test(key) && !/\/proofs\//.test(key)) return;
      // If extension missing, still allow image-like keys under proofs/; videos typically .mp4/.mov/.webm
      if (/\.(mp4|mov|webm|quicktime)$/i.test(key)) return;
      const label = `FE proof #${out.length + 1}${c.created_at ? ` (${String(c.created_at).slice(0, 16)})` : ""}`;
      out.push({
        id: `${c.id}:${proofIndex}`,
        commentId: String(c.id),
        proofIndex,
        label,
        key,
        createdAt: c.created_at != null ? String(c.created_at) : null,
      });
    });
  }
  return out;
}

/**
 * Resolve and validate a selected evidence reference against ticket comments.
 * @param {{ commentId: string; proofIndex: number }} evidence
 * @param {{ ticketId: string; organisationId?: string | null; comments: Array<{ id: string; ticket_id?: string; attachments?: unknown }> }} opts
 */
export function resolveRejectionEvidence(evidence, { ticketId, organisationId = null, comments }) {
  if (!evidence || typeof evidence !== "object") {
    return { ok: true, evidence: null };
  }
  const commentId = evidence.commentId != null ? String(evidence.commentId).trim() : "";
  const proofIndex = Number(evidence.proofIndex);
  if (!commentId || !Number.isInteger(proofIndex) || proofIndex < 0) {
    return { ok: false, error: "Invalid rejection evidence reference", status: 400 };
  }

  const comment = (comments ?? []).find((c) => String(c.id) === commentId);
  if (!comment) {
    return { ok: false, error: "Rejection evidence comment not found on ticket", status: 400 };
  }
  if (comment.ticket_id != null && String(comment.ticket_id) !== String(ticketId)) {
    return { ok: false, error: "Rejection evidence does not belong to this ticket", status: 400 };
  }

  const paths = extractProofStoragePaths(comment.attachments);
  const key = paths[proofIndex];
  if (!key || typeof key !== "string") {
    return { ok: false, error: "Rejection evidence proof not found", status: 400 };
  }

  try {
    assertProofKeyBelongsToTicket(key, { ticketId, organisationId });
  } catch (err) {
    return { ok: false, error: err.message || "Invalid rejection evidence", status: 400 };
  }

  if (/\.(mp4|mov|webm)$/i.test(key)) {
    return { ok: false, error: "Rejection evidence must be an image", status: 400 };
  }

  return {
    ok: true,
    evidence: {
      comment_id: commentId,
      proof_index: proofIndex,
      storage_key: key,
      category: "REJECTION_EVIDENCE",
    },
  };
}

/** Max bytes to attach to rejection email (Postmark-friendly). */
export const REJECTION_EMAIL_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;

/** Manager upload uses the same size cap as email attachment. */
export const REJECTION_UPLOAD_MAX_BYTES = REJECTION_EMAIL_ATTACHMENT_MAX_BYTES;

export const REJECTION_UPLOAD_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * Validate optional manager-uploaded rejection image (base64 from frontend).
 * Never trusts client-declared size alone — decodes and re-checks.
 *
 * @param {unknown} upload
 * @returns {{ ok: true; upload: null | { buffer: Buffer; contentType: string; filename: string } } | { ok: false; error: string; status: number }}
 */
export function parseRejectionUploadImage(upload) {
  if (upload == null) return { ok: true, upload: null };
  if (typeof upload !== "object" || Array.isArray(upload)) {
    return { ok: false, error: "Invalid rejection photo payload", status: 400 };
  }
  const contentTypeRaw = upload.contentType != null ? String(upload.contentType).trim().toLowerCase() : "";
  const filename = upload.filename != null ? String(upload.filename).trim().slice(0, 120) : "rejection-photo.jpg";
  let data = upload.dataBase64 != null ? String(upload.dataBase64) : upload.data_base64 != null ? String(upload.data_base64) : "";
  data = data.trim();
  if (!data) {
    return { ok: false, error: "Rejection photo data is empty", status: 400 };
  }

  let contentType = contentTypeRaw;
  const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/is);
  if (dataUrlMatch) {
    contentType = String(dataUrlMatch[1] || contentType).trim().toLowerCase();
    data = dataUrlMatch[2];
  }

  if (!REJECTION_UPLOAD_ALLOWED_MIME.has(contentType)) {
    return {
      ok: false,
      error: "Rejection photo must be JPEG, PNG, or WebP",
      status: 400,
    };
  }

  let buffer;
  try {
    buffer = Buffer.from(data, "base64");
  } catch {
    return { ok: false, error: "Rejection photo could not be decoded", status: 400 };
  }
  if (!buffer.length) {
    return { ok: false, error: "Rejection photo is empty", status: 400 };
  }
  if (buffer.length > REJECTION_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: `Rejection photo exceeds maximum size (${REJECTION_UPLOAD_MAX_BYTES} bytes)`,
      status: 400,
    };
  }

  // Lightweight magic-byte checks (do not trust extension alone).
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    if (!isJpeg) return { ok: false, error: "Rejection photo content is not a valid JPEG", status: 400 };
  } else if (contentType.includes("png")) {
    if (!isPng) return { ok: false, error: "Rejection photo content is not a valid PNG", status: 400 };
  } else if (contentType.includes("webp")) {
    if (!isWebp) return { ok: false, error: "Rejection photo content is not a valid WebP", status: 400 };
  }

  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  return {
    ok: true,
    upload: {
      buffer,
      contentType: contentType === "image/jpg" ? "image/jpeg" : contentType,
      filename: filename.includes(".") ? filename : `rejection-photo.${ext}`,
    },
  };
}
