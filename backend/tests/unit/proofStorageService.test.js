import { afterEach, describe, expect, it, vi } from "vitest";

describe("proofStorageService", () => {
  afterEach(() => {
    delete process.env.S3_FE_PROOFS_ENABLED;
    delete process.env.S3_FE_PROOFS_BUCKET;
    delete process.env.AWS_REGION;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("refuses crm-pariskq bucket", async () => {
    process.env.S3_FE_PROOFS_ENABLED = "true";
    process.env.S3_FE_PROOFS_BUCKET = "crm-pariskq";
    const mod = await import("../../src/services/proofStorageService.js");
    expect(() => mod.getProofS3Bucket()).toThrow(/crm-pariskq/);
  });

  it("accepts sahaya-test-fe-proofs", async () => {
    process.env.S3_FE_PROOFS_ENABLED = "true";
    process.env.S3_FE_PROOFS_BUCKET = "sahaya-test-fe-proofs";
    const mod = await import("../../src/services/proofStorageService.js");
    expect(mod.getProofS3Bucket()).toBe("sahaya-test-fe-proofs");
  });

  it("builds tenant-aware object keys", async () => {
    const mod = await import("../../src/services/proofStorageService.js");
    const key = mod.buildProofObjectKey({
      tenantId: "org-1",
      ticketId: "tkt-1",
      commentId: "cmt-1",
      index: 0,
      filename: "0.jpg",
    });
    expect(key).toBe("test/org-1/tickets/tkt-1/proofs/cmt-1/0.jpg");
  });

  it("sanitizes filenames and rejects path traversal in keys", async () => {
    const mod = await import("../../src/services/proofStorageService.js");
    expect(mod.sanitizeProofFilename("../../etc/passwd")).toBe("passwd");
    expect(() => mod.assertOwnedKey("../secret")).toThrow();
    expect(() => mod.assertOwnedKey("proofs/legacy.jpg")).toThrow(/test\//);
  });

  it("rejects oversized and empty buffers on upload", async () => {
    process.env.S3_FE_PROOFS_ENABLED = "true";
    process.env.S3_FE_PROOFS_BUCKET = "sahaya-test-fe-proofs";
    process.env.S3_FE_PROOFS_MAX_BYTES = "10";
    const mod = await import("../../src/services/proofStorageService.js");
    await expect(
      mod.uploadProof({
        tenantId: "org",
        ticketId: "t",
        commentId: "c",
        buffer: Buffer.alloc(0),
        contentType: "image/jpeg",
      })
    ).rejects.toThrow(/Empty/);
    await expect(
      mod.uploadProof({
        tenantId: "org",
        ticketId: "t",
        commentId: "c",
        buffer: Buffer.alloc(20),
        contentType: "image/jpeg",
      })
    ).rejects.toThrow(/max size/);
  });

  it("rejects invalid MIME types", async () => {
    process.env.S3_FE_PROOFS_ENABLED = "true";
    process.env.S3_FE_PROOFS_BUCKET = "sahaya-test-fe-proofs";
    const mod = await import("../../src/services/proofStorageService.js");
    await expect(
      mod.uploadProof({
        tenantId: "org",
        ticketId: "t",
        commentId: "c",
        buffer: Buffer.from("x"),
        contentType: "application/x-msdownload",
      })
    ).rejects.toThrow(/Unsupported proof MIME/);
  });

  it("does not call S3 when disabled", async () => {
    process.env.S3_FE_PROOFS_ENABLED = "false";
    process.env.S3_FE_PROOFS_BUCKET = "sahaya-test-fe-proofs";
    const mod = await import("../../src/services/proofStorageService.js");
    await expect(
      mod.uploadProof({
        tenantId: "org",
        ticketId: "t",
        commentId: "c",
        buffer: Buffer.from("abc"),
        contentType: "image/jpeg",
      })
    ).rejects.toThrow(/disabled/);
  });

  it("collects base64 images from attachments", async () => {
    const mod = await import("../../src/services/proofStorageService.js");
    const tiny = Buffer.from([0xff, 0xd8, 0xff]).toString("base64");
    const media = mod.collectProofMediaFromAttachments({
      images: [{ image_base64: `data:image/jpeg;base64,${tiny}` }],
    });
    expect(media).toHaveLength(1);
    expect(media[0].contentType).toBe("image/jpeg");
  });
});

describe("proofBackupQueueProcessor has no supabase.storage", () => {
  it("source does not reference supabase storage", async () => {
    const fs = await import("node:fs/promises");
    const path = new URL("../../src/workers/proofBackupQueueProcessor.js", import.meta.url);
    const src = await fs.readFile(path, "utf8");
    expect(src).not.toMatch(/supabaseAuth\.storage|\.storage\.from\(/);
    expect(src).not.toMatch(/fe-proofs/);
  });
});

describe("proofController has no supabase.storage", () => {
  it("source does not reference supabase storage", async () => {
    const fs = await import("node:fs/promises");
    const path = new URL("../../src/controllers/proofController.js", import.meta.url);
    const src = await fs.readFile(path, "utf8");
    expect(src).not.toMatch(/supabaseAuth\.storage|\.storage\.from\(/);
    expect(src).not.toMatch(/fe-proofs/);
  });
});
