import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("localAuthService login/refresh/logout (mocked prisma)", () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = "unit-test-jwt-access-secret-32chars-min!!";
    process.env.JWT_ACCESS_TTL_SEC = "900";
    process.env.JWT_REFRESH_TTL_SEC = "604800";
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("rejects wrong password and never returns password_hash", async () => {
    const hashPassword = (await import("../../src/services/passwordService.js")).hashPassword;
    const passwordHash = await hashPassword("GoodPass1!");

    vi.doMock("../../src/db/prisma.js", () => ({
      prisma: {
        user: {
          findFirst: vi.fn(async () => ({
            id: "11111111-1111-1111-1111-111111111111",
            email: "u@example.com",
            name: "U",
            role: "ADMIN",
            organisationId: "22222222-2222-2222-2222-222222222222",
            active: true,
            isActive: true,
            approvalStatus: "approved",
            clientSlug: null,
            passwordHash,
            createdAt: new Date(),
          })),
          update: vi.fn(async () => ({})),
          findUnique: vi.fn(),
        },
        authSession: {
          create: vi.fn(),
          findUnique: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    }));

    const { loginWithPassword } = await import("../../src/services/localAuthService.js");
    const bad = await loginWithPassword({
      email: "u@example.com",
      password: "WrongPass1!",
      req: { headers: {}, ip: "127.0.0.1" },
    });
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(401);
    expect(JSON.stringify(bad)).not.toMatch(/passwordHash|password_hash|\$argon2/);
  });

  it("issues session on correct password", async () => {
    const hashPassword = (await import("../../src/services/passwordService.js")).hashPassword;
    const passwordHash = await hashPassword("GoodPass1!");
    const userId = "11111111-1111-1111-1111-111111111111";

    vi.doMock("../../src/db/prisma.js", () => ({
      prisma: {
        user: {
          findFirst: vi.fn(async () => ({
            id: userId,
            email: "u@example.com",
            name: "U",
            role: "STAFF",
            organisationId: "22222222-2222-2222-2222-222222222222",
            active: true,
            isActive: true,
            approvalStatus: "approved",
            clientSlug: null,
            passwordHash,
            createdAt: new Date(),
          })),
          update: vi.fn(async () => ({})),
          findUnique: vi.fn(),
        },
        authSession: {
          create: vi.fn(async ({ data }) => ({
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            ...data,
            revokedAt: null,
            replacedById: null,
            createdAt: new Date(),
            lastUsedAt: null,
          })),
          findUnique: vi.fn(),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      },
    }));

    const { loginWithPassword } = await import("../../src/services/localAuthService.js");
    const ok = await loginWithPassword({
      email: "u@example.com",
      password: "GoodPass1!",
      req: { headers: { "user-agent": "vitest" }, ip: "127.0.0.1" },
    });
    expect(ok.ok).toBe(true);
    expect(ok.accessToken).toBeTruthy();
    expect(ok.refreshToken).toBeTruthy();
    expect(ok.profile?.email).toBe("u@example.com");
    expect(JSON.stringify(ok.profile)).not.toMatch(/password/i);
  });
});
