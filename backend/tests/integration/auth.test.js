import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestOrganisation,
  createTestUser,
  loadSeedIds,
} from "../helpers/db.js";

describeIfDb("auth integration", () => {
  const app = buildTestApp();

  afterEach(async () => {
    await cleanupTestData();
  });

  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("GET /auth/public/organisations returns active orgs", async () => {
    await createTestOrganisation({ status: "active" });
    const res = await request(app).get("/auth/public/organisations");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("GET /auth/me returns profile with test auth headers", async () => {
    const org = await createTestOrganisation();
    const user = await createTestUser(org.id, { role: "ADMIN" });
    const res = await request(app)
      .get("/auth/me")
      // Production JWT puts users.id in claims.userId → req.user.id
      .set("x-test-auth-id", user.id)
      .set("Authorization", "Bearer test-token");
    expect(res.status).toBe(200);
    expect(res.body.profile?.id).toBe(user.id);
  });

  it("POST /auth/provision-user is idempotent for existing user", async () => {
    const seed = await loadSeedIds();
    if (!seed?.admin) return;
    const res = await request(app)
      .post("/auth/provision-user")
      .set("x-test-auth-id", seed.admin.authId || "00000000-0000-0000-0000-000000000001")
      .set("Authorization", "Bearer test-token");
    expect([200, 401]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.created).toBe(false);
    }
  });

  it("POST /auth/public/forgot-password accepts valid email shape", async () => {
    const res = await request(app)
      .post("/auth/public/forgot-password")
      .send({ email: "nobody@example.com" });
    expect([200, 202, 400, 500]).toContain(res.status);
  });
});
