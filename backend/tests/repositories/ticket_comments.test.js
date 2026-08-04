import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb, tenantReq } from "../helpers/testContext.js";
import {
  cleanupTestData,
  createTestOrganisation,
  createTestTicket,
  createTestUser,
} from "../helpers/db.js";
import {
  insertComment,
  listCommentsForTicket,
  updateCommentById,
  getCommentById,
} from "../../src/repositories/commentRepository.js";

describeIfDb("ticketCommentRepository", () => {
  let org;
  let ticket;
  let author;

  beforeEach(async () => {
    org = await createTestOrganisation();
    ticket = await createTestTicket(org.id);
    author = await createTestUser(org.id, { role: "STAFF" });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and lists comments", async () => {
    const { data, error } = await insertComment({
      ticket_id: ticket.id,
      source: "STAFF",
      body: "Test comment body",
      author_id: author.id,
      organisation_id: org.id,
    });
    expect(error).toBeNull();

    const { data: rows } = await listCommentsForTicket(tenantReq(org.id), ticket.id, {
      limit: 10,
      offset: 0,
    });
    expect((rows || []).some((c) => c.id === data.id)).toBe(true);
  });

  it("updates a comment", async () => {
    const { data: created } = await insertComment({
      ticket_id: ticket.id,
      source: "STAFF",
      body: "Original",
      organisation_id: org.id,
    });
    const { data, error } = await updateCommentById(created.id, { body: "Updated body" });
    expect(error).toBeNull();
    expect(data).toBeUndefined();
    const { data: loaded } = await getCommentById(created.id);
    expect(loaded?.body).toBe("Updated body");
  });
});
