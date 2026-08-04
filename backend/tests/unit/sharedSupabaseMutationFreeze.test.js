import { afterEach, describe, expect, it, vi } from "vitest";

describe("provisionAdminUser (PostgreSQL-only, Phase E)", () => {
  afterEach(() => {
    delete process.env.PROVISION_SERVER_SIDE_ENABLED;
    vi.resetModules();
  });

  it("creates local password hash without any Supabase client", async () => {
    process.env.PROVISION_SERVER_SIDE_ENABLED = "true";

    const insertUser = vi.fn(async () => ({
      data: {
        id: "33333333-3333-3333-3333-333333333333",
        email: "phase-e@example.com",
        role: "STAFF",
      },
      error: null,
    }));
    vi.doMock("../../src/repositories/userRepository.js", () => ({
      findUserByEmail: vi.fn(async () => ({ data: null, error: null })),
      insertUser,
      updateUserById: vi.fn(),
    }));
    vi.doMock("../../src/repositories/fieldExecutiveRepository.js", () => ({
      findFieldExecutiveByUserIdFull: vi.fn(),
      insertFieldExecutive: vi.fn(),
    }));
    vi.doMock("../../src/services/schemaCompatService.js", () => ({
      hasPublicColumn: vi.fn(async () => false),
    }));
    vi.doMock("../../src/services/auditLogService.js", () => ({
      insertAuditLog: vi.fn(),
    }));
    vi.doMock("../../src/services/passwordService.js", () => ({
      hashPassword: vi.fn(async () => "$argon2id$mock"),
      normalizeEmail: (e) => String(e).trim().toLowerCase(),
    }));
    vi.doMock("../../src/db/prisma.js", () => ({
      prisma: {
        user: {
          update: vi.fn(async () => ({})),
        },
      },
    }));

    const { provisionAdminUser } = await import("../../src/services/userProvisioningService.js");
    const result = await provisionAdminUser({
      req: { appUser: { role: "SUPER_ADMIN" } },
      body: {
        email: "phase-e@example.com",
        password: "Abcd1234!",
        name: "Phase E",
        role: "STAFF",
        organisationId: "00000000-0000-0000-0000-000000000001",
      },
    });

    expect(result.ok).toBe(true);
    expect(insertUser).toHaveBeenCalled();
    expect(insertUser.mock.calls[0][0].password_hash).toBe("$argon2id$mock");
  });
});
