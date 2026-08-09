/**
 * Shared proof-presence detection — never trusts comment body text.
 */

export function countProofMedia(attachments) {
  if (!attachments || typeof attachments !== "object") return 0;
  if (Array.isArray(attachments.images)) return attachments.images.length;
  if (Array.isArray(attachments.proof_storage_paths)) {
    return attachments.proof_storage_paths.filter((p) => typeof p === "string" && p.trim() !== "").length;
  }
  if (Array.isArray(attachments)) return attachments.length;
  let n = 0;
  for (const v of Object.values(attachments)) {
    if (v && typeof v === "object" && (v.url || v.public_url || v.path || v.data || v.storage_key)) n += 1;
  }
  return n;
}

/**
 * True when attachments carry real proof metadata (FE or SM).
 * @param {unknown} attachments
 */
export function attachmentsHaveResolutionProof(attachments) {
  if (!attachments || typeof attachments !== "object" || Array.isArray(attachments)) return false;
  const a = /** @type {Record<string, unknown>} */ (attachments);
  if (a.sm_resolution_proof) return true;
  if (a.fe_proof || a.resolution_proof) return true;
  if (countProofMedia(a) > 0) return true;
  return false;
}

/**
 * Soft-hidden / deleted images must not count as proof.
 */
export function isProofHidden(attachments) {
  if (!attachments || typeof attachments !== "object" || Array.isArray(attachments)) return false;
  const a = /** @type {Record<string, unknown>} */ (attachments);
  const vis = a.image_visibility;
  if (vis && typeof vis === "object" && !Array.isArray(vis)) {
    const hiddenAt = /** @type {{ hidden_at?: unknown, deleted_at?: unknown }} */ (vis).hidden_at;
    const deletedAt = /** @type {{ deleted_at?: unknown }} */ (vis).deleted_at;
    if ((hiddenAt != null && String(hiddenAt).trim() !== "") || (deletedAt != null && String(deletedAt).trim() !== "")) {
      return true;
    }
  }
  const ctx = a.assignment_context;
  if (ctx && typeof ctx === "object" && !Array.isArray(ctx)) {
    const deletedAt = /** @type {{ deleted_at?: unknown }} */ (ctx).deleted_at;
    if (deletedAt != null && String(deletedAt).trim() !== "") return true;
  }
  return false;
}

/** Sources allowed to contribute resolution/assignment proof. */
const PROOF_ALLOWED_SOURCES = new Set(["FE", "STAFF", "SERVICE_MANAGER", "SM"]);

/**
 * Real uploaded attachment / proof metadata only — never comment body text.
 * EMAIL/CLIENT/system noise cannot satisfy proof validation.
 */
export function commentHasUsableProof(comment) {
  if (!comment) return false;
  const source = String(comment.source || "").trim().toUpperCase();
  if (source && !PROOF_ALLOWED_SOURCES.has(source)) return false;
  if (isProofHidden(comment.attachments)) return false;
  return attachmentsHaveResolutionProof(comment.attachments);
}
