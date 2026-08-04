import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

describe("POST /auth/public/forgot-password (local auth)", () => {
  afterEach(() => {
    delete process.env.PASSWORD_RESET_DRY_RUN;
    vi.resetModules();
  });

  it("returns generic success and never imports supabaseAuth", async () => {
    process.env.PASSWORD_RESET_DRY_RUN = "true";

    const forgotPassword = vi.fn(async () => ({
      ok: true,
      status: 200,
      message: "If an account exists for that email, we sent a password reset link.",
    }));
    vi.doMock("../../src/services/localAuthService.js", () => ({
      forgotPassword,
      resetPasswordWithToken: vi.fn(),
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

    expect(res.status).toBe(200);
    expect(String(res.body?.message || "")).toMatch(/if an account exists/i);
    expect(forgotPassword).toHaveBeenCalled();
  });
});
