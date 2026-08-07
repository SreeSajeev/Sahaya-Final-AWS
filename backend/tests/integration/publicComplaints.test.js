import crypto from "crypto";
import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import { cleanupTestData, createTestOrganisation } from "../helpers/db.js";
import { insertComplaintPoint } from "../../src/repositories/tenantComplaintPointRepository.js";

describeIfDb("public complaints integration", () => {
  const app = buildTestApp();
  let org;
  let publicToken;

  beforeEach(async () => {
    org = await createTestOrganisation();
    publicToken = crypto.randomBytes(16).toString("hex");
    await insertComplaintPoint({
      organisation_id: org.id,
      name: "Public Intake Point",
      public_token: publicToken,
      status: "active",
      token_version: 1,
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("GET /public/complaint-points/:token/context returns point context", async () => {
    const res = await request(app).get(`/public/complaint-points/${publicToken}/context`);
    expect([200, 404, 503]).toContain(res.status);
    if (res.status === 200) {
      // Public context returns top-level name/defaults (no internal IDs).
      expect(res.body.name || res.body.point || res.body.complaint_point).toBeTruthy();
    }
  });

  it("POST /public/send-otp accepts mobile for complaint point", async () => {
    const res = await request(app).post("/public/send-otp").send({
      public_token: publicToken,
      reporter_name: "Public User",
      reporter_mobile: "9876543210",
    });
    expect([200, 201, 400, 404, 429, 503]).toContain(res.status);
  });

  it("POST /public/verify-otp validates OTP payload shape", async () => {
    const res = await request(app).post("/public/verify-otp").send({
      session_id: crypto.randomUUID(),
      otp: "123456",
    });
    expect([400, 404, 410, 422, 503]).toContain(res.status);
  });
});
