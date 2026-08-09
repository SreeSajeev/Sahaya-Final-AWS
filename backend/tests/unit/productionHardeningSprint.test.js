/**
 * Role scope, proof presence, production config, CAS contract unit tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("ticketRoleScope", () => {
  it("forces CLIENT client_slug and ignores caller override", async () => {
    const { applyRoleTicketListScope } = await import("../../src/services/ticketRoleScope.js");
    const where = { organisationId: "org-1", clientSlug: "attacker-slug" };
    const req = {
      tenantRole: "CLIENT",
      appUser: { role: "CLIENT", client_slug: "acme-client" },
    };
    const result = await applyRoleTicketListScope(req, where);
    expect(result.ok).toBe(true);
    expect(where.clientSlug).toEqual({ equals: "acme-client", mode: "insensitive" });
  });

  it("rejects CLIENT without client_slug", async () => {
    const { applyRoleTicketListScope } = await import("../../src/services/ticketRoleScope.js");
    const where = {};
    const req = { tenantRole: "CLIENT", appUser: { role: "CLIENT" } };
    const result = await applyRoleTicketListScope(req, where);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it("assertRoleCanAccessTicket denies cross-client ticket", async () => {
    const { assertRoleCanAccessTicket } = await import("../../src/services/ticketRoleScope.js");
    const req = {
      tenantRole: "CLIENT",
      appUser: { role: "CLIENT", client_slug: "acme" },
    };
    const result = await assertRoleCanAccessTicket(req, {
      id: "t1",
      client_slug: "other-client",
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });
});

describe("proofPresenceService", () => {
  it("rejects body-only 'proof uploaded' comments", async () => {
    const { commentHasUsableProof } = await import("../../src/services/proofPresenceService.js");
    expect(
      commentHasUsableProof({
        source: "FE",
        body: "RESOLUTION proof uploaded",
        attachments: null,
      })
    ).toBe(false);
    expect(
      commentHasUsableProof({
        source: "CLIENT",
        body: "proof uploaded",
        attachments: { images: [{ url: "https://x" }] },
      })
    ).toBe(false);
  });

  it("accepts real FE/SM attachment metadata", async () => {
    const { commentHasUsableProof } = await import("../../src/services/proofPresenceService.js");
    expect(
      commentHasUsableProof({
        source: "FE",
        body: "ignored",
        attachments: { fe_proof: true, proof_storage_paths: ["test/a/b.jpg"] },
      })
    ).toBe(true);
    expect(
      commentHasUsableProof({
        source: "STAFF",
        attachments: { sm_resolution_proof: true },
      })
    ).toBe(true);
  });

  it("rejects soft-hidden proofs", async () => {
    const { commentHasUsableProof } = await import("../../src/services/proofPresenceService.js");
    expect(
      commentHasUsableProof({
        source: "FE",
        attachments: {
          images: [{ url: "x" }],
          image_visibility: { hidden_at: new Date().toISOString() },
        },
      })
    ).toBe(false);
  });
});

describe("assertProductionConfig", () => {
  afterEach(() => {
    process.env.NODE_ENV = "test";
    vi.resetModules();
  });

  it("no-ops outside production", async () => {
    process.env.NODE_ENV = "test";
    vi.resetModules();
    const { assertProductionConfig } = await import("../../src/config/productionConfig.js");
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("fails fast in production when secrets missing", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_ACCESS_SECRET = "";
    process.env.DATABASE_URL = "";
    process.env.POSTMARK_SERVER_TOKEN = "";
    process.env.FROM_EMAIL = "";
    process.env.MAIL_FROM_EMAIL = "";
    process.env.S3_FE_PROOFS_ENABLED = "false";
    process.env.PASSWORD_RESET_DRY_RUN = "false";
    process.env.ENFORCE_TENANT_GUARD = "true";
    vi.resetModules();
    const { assertProductionConfig } = await import("../../src/config/productionConfig.js");
    expect(() => assertProductionConfig()).toThrow(/Legacy production config invalid|Production config invalid/);
  });
});

describe("updateTicketById CAS contract", () => {
  it("returns conflict when expectedStatus does not match", async () => {
    const { prisma } = await import("../../src/db/prisma.js");
    const spy = vi.spyOn(prisma.ticket, "updateMany").mockResolvedValue({ count: 0 });
    const { updateTicketById } = await import("../../src/repositories/ticketQueryRepository.js");
    const result = await updateTicketById(
      "00000000-0000-0000-0000-000000000001",
      { status: "ASSIGNED" },
      { expectedStatus: "OPEN" }
    );
    expect(result.conflict).toBe(true);
    expect(result.data).toBeNull();
    spy.mockRestore();
  });
});
