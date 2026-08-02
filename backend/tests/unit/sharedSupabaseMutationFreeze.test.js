import { afterEach, describe, expect, it, vi } from "vitest";

describe("sharedSupabaseMutationFreeze", () => {
  afterEach(() => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    vi.resetModules();
  });

  it("defaults to mutations allowed (production-safe)", async () => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    const mod = await import("../../src/security/sharedSupabaseMutationFreeze.js");
    expect(mod.areSharedSupabaseMutationsDisabled()).toBe(false);
    expect(mod.sharedSupabaseMutationBlock()).toBeNull();
  });

  it("blocks when SHARED_SUPABASE_MUTATIONS_DISABLED=true", async () => {
    process.env.SHARED_SUPABASE_MUTATIONS_DISABLED = "true";
    const mod = await import("../../src/security/sharedSupabaseMutationFreeze.js");
    expect(mod.areSharedSupabaseMutationsDisabled()).toBe(true);
    const block = mod.sharedSupabaseMutationBlock();
    expect(block?.blocked).toBe(true);
    expect(block?.code).toBe("SHARED_SUPABASE_MUTATIONS_DISABLED");
    expect(block?.message).toMatch(/temporarily disabled/i);
  });

  it("does not treat other values as enabled", async () => {
    process.env.SHARED_SUPABASE_MUTATIONS_DISABLED = "yes";
    const mod = await import("../../src/security/sharedSupabaseMutationFreeze.js");
    expect(mod.areSharedSupabaseMutationsDisabled()).toBe(false);
  });
});

describe("provisionAdminUser (PostgreSQL-only)", () => {
  afterEach(() => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    delete process.env.PROVISION_SERVER_SIDE_ENABLED;
    vi.resetModules();
  });

  it("creates local password hash and never needs supabaseAuth even with freeze on", async () => {
    process.env.SHARED_SUPABASE_MUTATIONS_DISABLED = "true";
    process.env.PROVISION_SERVER_SIDE_ENABLED = "true";

    const insertUser = vi.fn(async () => ({
      data: {
        id: "33333333-3333-3333-3333-333333333333",
        email: "freeze-test@example.com",
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
        email: "freeze-test@example.com",
        password: "Abcd1234!",
        name: "Freeze Test",
        role: "STAFF",
        organisationId: "00000000-0000-0000-0000-000000000001",
      },
    });

    expect(result.ok).toBe(true);
    expect(insertUser).toHaveBeenCalled();
    const payload = insertUser.mock.calls[0][0];
    expect(payload.password_hash).toBe("$argon2id$mock");
  });
});
