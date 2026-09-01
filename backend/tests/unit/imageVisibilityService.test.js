/**
 * Image hide + S3 deletion honesty tests (Req 17).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/repositories/commentRepository.js", () => ({
  getCommentById: vi.fn(),
  insertComment: vi.fn(),
  updateCommentById: vi.fn(),
}));
vi.mock("../../src/repositories/ticketQueryRepository.js", () => ({
  getTicketByIdUnscopedSingle: vi.fn(),
}));
vi.mock("../../src/services/auditLogService.js", () => ({
  insertAuditLog: vi.fn(),
}));
vi.mock("../../src/repositories/userRepository.js", () => ({
  findUserNameById: vi.fn().mockResolvedValue({ data: { name: "Admin" } }),
}));
vi.mock("../../src/services/proofStorageService.js", () => ({
  isProofS3Enabled: vi.fn(),
  deleteProof: vi.fn(),
}));

import { getCommentById, insertComment, updateCommentById } from "../../src/repositories/commentRepository.js";
import { isProofS3Enabled, deleteProof } from "../../src/services/proofStorageService.js";
import {
  collectAttachmentStorageKeys,
  deleteAttachmentStorageKeys,
  hideCommentImages,
} from "../../src/services/imageVisibilityService.js";

const req = {
  tenantRole: "ADMIN",
  tenantId: "org-1",
  appUser: { id: "user-1" },
};

describe("imageVisibilityService S3 deletion", () => {
  beforeEach(() => {
    vi.mocked(isProofS3Enabled).mockReturnValue(true);
    vi.mocked(deleteProof).mockReset();
    vi.mocked(getCommentById).mockReset();
    vi.mocked(updateCommentById).mockReset();
    vi.mocked(insertComment).mockResolvedValue({ data: { id: "evt-1" }, error: null });
  });

  it("collects exact keys only", () => {
    const keys = collectAttachmentStorageKeys({
      proof_storage_paths: ["test/ticket/a.jpg"],
      assignment_context: { storage_key: "test/ticket/b.jpg" },
    });
    expect(keys.sort()).toEqual(["test/ticket/a.jpg", "test/ticket/b.jpg"]);
  });

  it("marks storage fully deleted when all keys succeed", async () => {
    vi.mocked(deleteProof).mockResolvedValue({ ok: true });
    const result = await deleteAttachmentStorageKeys(["test/a.jpg", "test/b.jpg"]);
    expect(result.deleted).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
  });

  it("records failed keys without claiming full deletion", async () => {
    vi.mocked(deleteProof)
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("AccessDenied"));
    const result = await deleteAttachmentStorageKeys(["test/a.jpg", "test/b.jpg"]);
    expect(result.deleted).toEqual(["test/a.jpg"]);
    expect(result.failed).toHaveLength(1);
  });

  it("hideCommentImages sets deleted_at only when all S3 deletes succeed", async () => {
    vi.mocked(getCommentById).mockResolvedValue({
      data: {
        id: "c1",
        ticket_id: "t1",
        organisation_id: "org-1",
        attachments: { proof_storage_paths: ["test/proof.jpg"] },
      },
      error: null,
    });
    vi.mocked(deleteProof).mockResolvedValue({ ok: true });
    let savedAttachments = null;
    vi.mocked(updateCommentById).mockImplementation(async (_id, patch) => {
      savedAttachments = patch.attachments;
      return { data: {}, error: null };
    });

    const out = await hideCommentImages({ req, ticketId: "t1", commentId: "c1", reason: "dup" });
    expect(out.ok).toBe(true);
    expect(out.storage_fully_deleted).toBe(true);
    expect(savedAttachments.image_visibility.deleted_at).toBeTruthy();
    expect(savedAttachments.image_visibility.storage_delete_failed).toBe(false);
  });

  it("hideCommentImages does not set deleted_at when S3 delete fails", async () => {
    vi.mocked(getCommentById).mockResolvedValue({
      data: {
        id: "c1",
        ticket_id: "t1",
        organisation_id: "org-1",
        attachments: { proof_storage_paths: ["test/proof.jpg"] },
      },
      error: null,
    });
    vi.mocked(deleteProof).mockRejectedValue(new Error("NoSuchKey"));
    let savedAttachments = null;
    vi.mocked(updateCommentById).mockImplementation(async (_id, patch) => {
      savedAttachments = patch.attachments;
      return { data: {}, error: null };
    });

    const out = await hideCommentImages({ req, ticketId: "t1", commentId: "c1", reason: "dup" });
    expect(out.ok).toBe(true);
    expect(out.hidden).toBe(true);
    expect(out.storage_delete_failed).toBe(true);
    expect(out.partial_failure).toBe(true);
    expect(savedAttachments.image_visibility.hidden_at).toBeTruthy();
    expect(savedAttachments.image_visibility.deleted_at).toBeUndefined();
    expect(savedAttachments.image_visibility.storage_delete_failed).toBe(true);
  });

  it("is idempotent when already hidden", async () => {
    vi.mocked(getCommentById).mockResolvedValue({
      data: {
        id: "c1",
        ticket_id: "t1",
        organisation_id: "org-1",
        attachments: { image_visibility: { hidden_at: "2026-01-01T00:00:00Z" } },
      },
      error: null,
    });

    const out = await hideCommentImages({ req, ticketId: "t1", commentId: "c1" });
    expect(out.idempotent).toBe(true);
    expect(updateCommentById).not.toHaveBeenCalled();
  });
});
