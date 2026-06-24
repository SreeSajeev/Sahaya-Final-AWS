import request from "supertest";
import { afterEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import { cleanupTestData } from "../helpers/db.js";
import { findRawEmailByMessageId } from "../../src/repositories/rawEmailsRepo.js";

describeIfDb("email ingestion integration", () => {
  const app = buildTestApp();

  afterEach(async () => {
    await cleanupTestData();
  });

  it("POST /postmark-webhook stores inbound raw email", async () => {
    const messageId = `postmark-int-${Date.now()}`;
    const res = await request(app)
      .post("/postmark-webhook")
      .send({
        MessageID: messageId,
        From: "fleet@client.com",
        To: "inbound@test.sahaya.local",
        Subject: "Breakdown KA01AB1234",
        TextBody: "Vehicle KA01AB1234 stranded at NH48",
      });
    expect(res.status).toBe(200);

    const { data } = await findRawEmailByMessageId(messageId);
    expect(data?.message_id).toBe(messageId);
  });

  it("POST /postmark-webhook is idempotent for duplicate MessageID", async () => {
    const messageId = `postmark-dup-${Date.now()}`;
    const payload = {
      MessageID: messageId,
      From: "fleet@client.com",
      To: "inbound@test.sahaya.local",
      TextBody: "Duplicate test",
    };
    const first = await request(app).post("/postmark-webhook").send(payload);
    const second = await request(app).post("/postmark-webhook").send(payload);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
