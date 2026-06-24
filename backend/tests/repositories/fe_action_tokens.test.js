import crypto from "crypto";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import {
  cleanupTestData,
  createTestFieldExecutive,
  createTestOrganisation,
  createTestTicket,
} from "../helpers/db.js";
import {
  insertFeActionTokenReturning,
  getFeActionTokenById,
  markFeActionTokenUsedSimple,
} from "../../src/repositories/feActionTokenRepository.js";

describeIfDb("feActionTokenRepository", () => {
  let org;
  let ticket;
  let fe;

  beforeEach(async () => {
    org = await createTestOrganisation();
    ticket = await createTestTicket(org.id);
    fe = await createTestFieldExecutive(org.id);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and reads FE action token", async () => {
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    const { data, error } = await insertFeActionTokenReturning(
      {
        id: tokenId,
        ticket_id: ticket.id,
        fe_id: fe.id,
        action_type: "ON_SITE",
        expires_at: expiresAt,
        used: false,
        token_state: "ACTIVE",
      },
      "id"
    );
    expect(error).toBeNull();
    expect(data?.id).toBe(tokenId);

    const { data: loaded } = await getFeActionTokenById(tokenId);
    expect(loaded?.action_type).toBe("ON_SITE");
  });

  it("marks token as used", async () => {
    const tokenId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();
    await insertFeActionTokenReturning({
      id: tokenId,
      ticket_id: ticket.id,
      fe_id: fe.id,
      action_type: "ON_SITE",
      expires_at: expiresAt,
      used: false,
      token_state: "ACTIVE",
    });
    await markFeActionTokenUsedSimple(tokenId);
    const { data: loaded } = await getFeActionTokenById(tokenId);
    expect(loaded?.used).toBe(true);
  });
});
