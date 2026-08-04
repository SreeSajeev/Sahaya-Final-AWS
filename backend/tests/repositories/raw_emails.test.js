import { afterEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { cleanupTestData } from "../helpers/db.js";
import {
  insertInboundRawEmail,
  findRawEmailByMessageId,
  updateRawEmailStatus,
} from "../../src/repositories/rawEmailsRepo.js";

describeIfDb("rawEmailsRepository", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("inserts and finds raw email by message id", async () => {
    const messageId = `test-msg-${Date.now()}`;
    const { data, error } = await insertInboundRawEmail({
      message_id: messageId,
      from_email: "sender@example.com",
      to_email: "inbound@test.sahaya.local",
      subject: "Test Subject",
      received_at: new Date().toISOString(),
      payload: { test: true },
      processing_status: "pending",
    });
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();

    const { data: found } = await findRawEmailByMessageId(messageId);
    expect(found?.id).toBe(data.id);
  });

  it("updates processing status", async () => {
    const messageId = `test-msg-upd-${Date.now()}`;
    const { data: created } = await insertInboundRawEmail({
      message_id: messageId,
      from_email: "sender@example.com",
      to_email: "inbound@test.sahaya.local",
      received_at: new Date().toISOString(),
      payload: {},
      processing_status: "pending",
    });
    const { error } = await updateRawEmailStatus(created.id, "processed");
    expect(error).toBeNull();
  });
});
