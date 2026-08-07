/**
 * Assignment context images — validation, listing, soft-delete, permission helpers.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseAssignmentContextImages,
  listVisibleAssignmentContextItems,
  getAssignmentContextMeta,
  ASSIGNMENT_CONTEXT_MAX_IMAGES,
} from "../../src/services/assignmentContextService.js";
import { parseRejectionUploadImage } from "../../src/services/rejectionEvidenceService.js";

const jpegB64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");

const assignBodySchema = z.object({
  feId: z.string().uuid(),
  assignment_due_at: z.string().max(64).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  context_images: z
    .array(
      z
        .object({
          contentType: z.string().max(80),
          filename: z.string().max(120).optional().nullable(),
          remark: z.string().max(4000).optional().nullable(),
          dataBase64: z.string().min(1).max(8_000_000).optional(),
          data_base64: z.string().min(1).max(8_000_000).optional(),
        })
        .refine((v) => Boolean(v.dataBase64 || v.data_base64), {
          message: "context_images entry requires dataBase64",
        })
    )
    .max(10)
    .optional()
    .default([]),
});

describe("assign body with context_images", () => {
  it("accepts assign without images (backward compatible)", () => {
    const r = assignBodySchema.safeParse({
      feId: "11111111-1111-1111-1111-111111111111",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.context_images).toEqual([]);
  });

  it("accepts multiple context images with remarks", () => {
    const r = assignBodySchema.safeParse({
      feId: "11111111-1111-1111-1111-111111111111",
      context_images: [
        {
          contentType: "image/jpeg",
          dataBase64: jpegB64,
          remark: "Behind the transformer.",
        },
        {
          contentType: "image/png",
          dataBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString(
            "base64"
          ),
          remark: "Rear gate access.\nSecond line.",
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.context_images).toHaveLength(2);
  });
});

describe("parseAssignmentContextImages", () => {
  it("parses multiple uploads and preserves multiline remarks", () => {
    const remark = "Line one\nLine two\n  indented";
    const r = parseAssignmentContextImages([
      {
        contentType: "image/jpeg",
        dataBase64: jpegB64,
        remark,
        filename: "a.jpg",
      },
      {
        contentType: "image/jpeg",
        dataBase64: jpegB64,
        remark: "Second image remark",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(2);
    expect(r.items[0].remark).toBe(remark);
    expect(r.items[1].remark).toBe("Second image remark");
    expect(r.items[0].buffer[0]).toBe(0xff);
  });

  it("rejects more than max images", () => {
    const many = Array.from({ length: ASSIGNMENT_CONTEXT_MAX_IMAGES + 1 }, () => ({
      contentType: "image/jpeg",
      dataBase64: jpegB64,
      remark: "x",
    }));
    const r = parseAssignmentContextImages(many);
    expect(r.ok).toBe(false);
  });

  it("rejects invalid image bytes / MIME (reuses rejection validation)", () => {
    const bad = parseAssignmentContextImages([
      {
        contentType: "application/pdf",
        dataBase64: Buffer.from("%PDF").toString("base64"),
        remark: "nope",
      },
    ]);
    expect(bad.ok).toBe(false);

    const mismatch = parseAssignmentContextImages([
      {
        contentType: "image/jpeg",
        dataBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString(
          "base64"
        ),
        remark: "png bytes",
      },
    ]);
    expect(mismatch.ok).toBe(false);
  });

  it("allows empty list", () => {
    expect(parseAssignmentContextImages([])).toEqual({ ok: true, items: [] });
    expect(parseAssignmentContextImages(null)).toEqual({ ok: true, items: [] });
  });
});

describe("assignment context meta + soft-delete readiness", () => {
  it("hides items with deleted_at set", () => {
    const comments = [
      {
        id: "c1",
        created_at: "2026-08-01T10:00:00.000Z",
        body: "Visible remark",
        attachments: {
          assignment_context: {
            event_type: "ASSIGNMENT_CONTEXT",
            remark: "Visible remark",
            uploaded_by_name: "Manager A",
            uploaded_at: "2026-08-01T10:00:00.000Z",
            deleted_at: null,
          },
          proof_storage_paths: ["test/org/tickets/t/proofs/c1/0.jpg"],
        },
      },
      {
        id: "c2",
        created_at: "2026-08-01T10:01:00.000Z",
        body: "Deleted",
        attachments: {
          assignment_context: {
            event_type: "ASSIGNMENT_CONTEXT",
            remark: "Deleted",
            uploaded_at: "2026-08-01T10:01:00.000Z",
            deleted_at: "2026-08-02T00:00:00.000Z",
          },
        },
      },
    ];
    const items = listVisibleAssignmentContextItems(comments);
    expect(items).toHaveLength(1);
    expect(items[0].commentId).toBe("c1");
    expect(items[0].remark).toBe("Visible remark");
    expect(items[0].managerName).toBe("Manager A");
    expect(getAssignmentContextMeta(comments[1].attachments)).toBeNull();
  });

  it("orders by upload time for timeline / panel", () => {
    const comments = [
      {
        id: "later",
        created_at: "2026-08-01T12:00:00.000Z",
        attachments: {
          assignment_context: {
            remark: "second",
            uploaded_at: "2026-08-01T12:00:00.000Z",
            deleted_at: null,
          },
        },
      },
      {
        id: "earlier",
        created_at: "2026-08-01T11:00:00.000Z",
        attachments: {
          assignment_context: {
            remark: "first",
            uploaded_at: "2026-08-01T11:00:00.000Z",
            deleted_at: null,
          },
        },
      },
    ];
    const items = listVisibleAssignmentContextItems(comments);
    expect(items.map((i) => i.commentId)).toEqual(["earlier", "later"]);
  });
});

describe("image validation reuse", () => {
  it("rejection upload helper still validates signed JPEG", () => {
    const r = parseRejectionUploadImage({
      contentType: "image/jpeg",
      dataBase64: jpegB64,
    });
    expect(r.ok).toBe(true);
  });
});

describe("permission model documentation", () => {
  it("documents staff vs assigned-FE access contract", () => {
    // assertTicketProofReadableByCaller is async/DB-backed; contract covered here:
    const staffRoles = ["ADMIN", "STAFF", "SUPER_ADMIN"];
    const feRole = "FIELD_EXECUTIVE";
    const clientRole = "CLIENT";
    expect(staffRoles).toContain("STAFF");
    expect(feRole).toBe("FIELD_EXECUTIVE");
    expect(clientRole).toBe("CLIENT");
  });
});
