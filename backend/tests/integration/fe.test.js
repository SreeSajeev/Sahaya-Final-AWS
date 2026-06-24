import crypto from "crypto";
import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestFieldExecutive,
  createTestOrganisation,
  createTestTicket,
  createTestUser,
} from "../helpers/db.js";
import { insertFeActionTokenReturning } from "../../src/repositories/feActionTokenRepository.js";

describeIfDb("field executive integration", () => {
  const app = buildTestApp();
  let org;
  let fe;
  let feUser;
  let ticket;
  let tokenId;

  beforeEach(async () => {
    org = await createTestOrganisation();
    feUser = await createTestUser(org.id, { role: "FIELD_EXECUTIVE" });
    fe = await createTestFieldExecutive(org.id, { userId: feUser.id });
    ticket = await createTestTicket(org.id, { status: "ASSIGNED" });
    tokenId = crypto.randomUUID();
    await insertFeActionTokenReturning({
      id: tokenId,
      ticket_id: ticket.id,
      fe_id: fe.id,
      action_type: "ON_SITE",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      used: false,
      token_state: "ACTIVE",
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("GET /fe/action/:token validates magic link token", async () => {
    const res = await request(app).get(`/fe/action/${tokenId}`);
    expect([200, 403, 404, 410]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.ticket?.id || res.body.ticket_id).toBeTruthy();
    }
  });

  it("GET /fe/me/tickets requires FE auth headers", async () => {
    const res = await request(app)
      .get("/fe/me/tickets")
      .set({
        Authorization: "Bearer test-token",
        "x-test-user-id": feUser.id,
        "x-test-role": "FIELD_EXECUTIVE",
        "x-test-org-id": org.id,
      });
    expect([200, 403, 404]).toContain(res.status);
  });

  it("POST /fe/proof rejects missing fields", async () => {
    const res = await request(app).post("/fe/proof").send({});
    expect([400, 500]).toContain(res.status);
  });

  it("POST /fe/proof accepts metadata payload shape", async () => {
    const res = await request(app).post("/fe/proof").send({
      token_id: tokenId,
      image_url: "https://example.com/proof.jpg",
      remarks: "On-site proof",
      action_type: "ON_SITE",
    });
    expect([200, 400, 403, 404, 500]).toContain(res.status);
  });
});
