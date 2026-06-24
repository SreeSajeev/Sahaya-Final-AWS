import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { cleanupTestData, createTestOrganisation } from "../helpers/db.js";
import {
  insertInboundRawEmail,
} from "../../src/repositories/rawEmailsRepo.js";
import {
  insertParsedEmail,
  listParsedEmailsByRawEmailIds,
  markParsedAsTicketed,
} from "../../src/repositories/parsedEmailsRepo.js";

describeIfDb("parsedEmailsRepository", () => {
  let org;
  let rawEmailId;

  beforeEach(async () => {
    org = await createTestOrganisation();
    const messageId = `parsed-parent-${Date.now()}`;
    const { data } = await insertInboundRawEmail({
      message_id: messageId,
      from_email: "sender@example.com",
      to_email: "inbound@test.sahaya.local",
      received_at: new Date().toISOString(),
      payload: {},
      organisation_id: org.id,
      processing_status: "pending",
    });
    rawEmailId = data.id;
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("inserts and lists parsed emails by raw email id", async () => {
    const { data, error } = await insertParsedEmail(
      {
        raw_email_id: rawEmailId,
        complaint_id: `CMP-${Date.now()}`,
        vehicle_number: "KA01XX9999",
        category: "Breakdown",
        needs_review: false,
      },
      org.id
    );
    expect(error).toBeNull();

    const { data: rows } = await listParsedEmailsByRawEmailIds([rawEmailId], org.id);
    expect((rows || []).some((r) => r.id === data.id)).toBe(true);
  });

  it("marks parsed email as ticketed", async () => {
    const { data: created } = await insertParsedEmail(
      {
        raw_email_id: rawEmailId,
        complaint_id: `CMP-T-${Date.now()}`,
        vehicle_number: "KA01XX8888",
      },
      org.id
    );
    const { error } = await markParsedAsTicketed(created.id, org.id);
    expect(error).toBeNull();
  });
});
