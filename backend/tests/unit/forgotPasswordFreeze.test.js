import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

describe("POST /auth/public/forgot-password freeze", () => {
  afterEach(() => {
    delete process.env.SHARED_SUPABASE_MUTATIONS_DISABLED;
    vi.resetModules();
    vi.doUnmock("../../src/supabaseAuthClient.js");
  });

  it("returns 403 and never calls generateLink when freeze is on", async () => {
    process.env.SHARED_SUPABASE_MUTATIONS_DISABLED = "true";

    const generateLink = vi.fn();
    vi.doMock("../../src/supabaseAuthClient.js", () => ({
      supabaseAuth: {
        auth: { admin: { generateLink } },
      },
    }));
    vi.doMock("../../src/services/emailService.js", () => ({
      sendPasswordResetEmail: vi.fn(),
    }));
    vi.doMock("../../src/repositories/organisationRepository.js", () => ({
      listActiveOrganisationsPublic: vi.fn(async () => ({ data: [], error: null })),
    }));
    vi.doMock("../../src/repositories/accessTokenRepository.js", () => ({
      findAccessTokenByHash: vi.fn(),
    }));

    const publicAuth = (await import("../../src/routes/publicAuth.js")).default;
    const app = express();
    app.use(express.json());
    app.use("/auth/public", publicAuth);

    const res = await request(app)
      .post("/auth/public/forgot-password")
      .send({ email: "someone@example.com" });

    expect(res.status).toBe(403);
    expect(String(res.body?.error || "")).toMatch(/temporarily disabled/i);
    expect(res.body?.code).toBe("SHARED_SUPABASE_MUTATIONS_DISABLED");
    expect(generateLink).not.toHaveBeenCalled();
  });
});
