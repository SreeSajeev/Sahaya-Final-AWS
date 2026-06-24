import { listFeCommentsForTicketProofCheck } from "../repositories/commentRepository.js";

/** Matches CloseTicketDialog CLOSEABLE_STATUSES in field-ops-assist. */
export const CLOSEABLE_PRE_CLOSE_STATUSES = ["ON_SITE", "RESOLVED_PENDING_VERIFICATION"];

/**
 * When "true", skip FE proof presence check (rollback / legacy grace).
 * Status and closure-remarks checks still apply.
 */
function isProofCheckSkipped() {
  return String(process.env.CLOSE_SKIP_PROOF_VALIDATION || "false").toLowerCase() === "true";
}

function hasClosureRemarks({ verification_remarks, review_notes, resolution_category }) {
  const parts = [verification_remarks, review_notes, resolution_category];
  return parts.some((p) => p != null && String(p).trim() !== "");
}

function countProofImages(attachments) {
  if (!attachments || typeof attachments !== "object") return 0;
  if (Array.isArray(attachments.images)) return attachments.images.length;
  if (Array.isArray(attachments)) return attachments.length;
  let n = 0;
  for (const v of Object.values(attachments)) {
    if (v && typeof v === "object" && (v.url || v.public_url || v.path || v.data)) n += 1;
  }
  return n;
}

/**
 * Returns true when at least one FE-sourced comment carries proof attachments.
 */
async function ticketHasFeProof(ticketId) {
  const { data: comments, error } = await listFeCommentsForTicketProofCheck(ticketId, { limit: 50 });

  if (error) {
    console.error("[CLOSE_VALIDATION] proof lookup failed", ticketId, error.message);
    return false;
  }

  for (const row of comments || []) {
    const imgs = countProofImages(row.attachments);
    if (imgs > 0) return true;
    const body = row.body != null ? String(row.body).toLowerCase() : "";
    if (body.includes("proof uploaded")) return true;
  }
  return false;
}

/**
 * Minimal close preconditions (additive guard on POST /tickets/:id/close).
 *
 * @param {object} params
 * @param {string} params.ticketId
 * @param {{ status?: string, current_assignment_id?: string | null }} params.ticket
 * @param {{ verification_remarks?: string | null, review_notes?: string | null, resolution_category?: string | null }} params.body
 * @returns {Promise<{ ok: true, idempotent?: boolean } | { ok: false, statusCode: number, error: string }>}
 */
export async function validateTicketClosePreconditions({ ticketId, ticket, body }) {
  const status = ticket?.status != null ? String(ticket.status) : "";

  if (status === "RESOLVED") {
    return { ok: true, idempotent: true };
  }

  if (!CLOSEABLE_PRE_CLOSE_STATUSES.includes(status)) {
    return {
      ok: false,
      statusCode: 400,
      error: `Cannot close ticket in status ${status || "unknown"}. Ticket must be ON_SITE or RESOLVED_PENDING_VERIFICATION.`,
    };
  }

  if (!hasClosureRemarks(body)) {
    return {
      ok: false,
      statusCode: 400,
      error:
        "Closure remarks required: provide resolution category, verification remarks, or review notes.",
    };
  }

  const wasAssigned = Boolean(ticket?.current_assignment_id);
  const needsProof =
    status === "RESOLVED_PENDING_VERIFICATION" ||
    (status === "ON_SITE" && wasAssigned);

  if (needsProof && !isProofCheckSkipped()) {
    const hasProof = await ticketHasFeProof(ticketId);
    if (!hasProof) {
      return {
        ok: false,
        statusCode: 400,
        error:
          "FE proof is required before closing this ticket. Upload proof via the field workflow, or set CLOSE_SKIP_PROOF_VALIDATION=true for legacy exceptions.",
      };
    }
  }

  return { ok: true };
}
