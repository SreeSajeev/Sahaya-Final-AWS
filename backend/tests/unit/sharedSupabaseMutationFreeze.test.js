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

describe("provisionAdminUser freeze", () => {
  afterEach(() => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    delete process.env.PROVISION_SERVER_SIDE_ENABLED;
    vi.resetModules();
    vi.doUnmock("../../src/supabaseClient.js");
  });

  it("returns 403 and never calls auth.admin.createUser when freeze is on", async () => {
    process.env.SHARED_SUPABASE_MUTATIONS_DISABLED = "true";
    process.env.PROVISION_SERVER_SIDE_ENABLED = "true";

    const createUser = vi.fn();
    const listUsers = vi.fn();
    const deleteUser = vi.fn();
    vi.doMock("../../src/supabaseClient.js", () => ({
      supabase: {
        auth: {
          admin: { createUser, listUsers, deleteUser },
        },
        from: vi.fn(),
      },
    }));

    // Avoid pulling real Prisma/repos for this guard test
    vi.doMock("../../src/repositories/userRepository.js", () => ({
      findUserByEmail: vi.fn(),
      insertUser: vi.fn(),
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

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(result.message).toMatch(/temporarily disabled/i);
    expect(createUser).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
