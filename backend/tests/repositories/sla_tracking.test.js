import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import {
  cleanupTestData,
  createTestOrganisation,
  createTestTicket,
} from "../helpers/db.js";
import {
  insertSlaRow,
  findSlaRowByTicketId,
  updateSlaByTicketId,
  listSlaRowsByTicketIds,
} from "../../src/repositories/slaRepository.js";

describeIfDb("slaTrackingRepository", () => {
  let org;
  let ticket;

  beforeEach(async () => {
    org = await createTestOrganisation();
    ticket = await createTestTicket(org.id);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and reads SLA row", async () => {
    const deadline = new Date(Date.now() + 3600_000).toISOString();
    const { error } = await insertSlaRow({
      ticket_id: ticket.id,
      organisation_id: org.id,
      assignment_deadline: deadline,
      onsite_deadline: deadline,
      resolution_deadline: deadline,
    });
    expect(error).toBeNull();

    const { data } = await findSlaRowByTicketId(ticket.id);
    expect(data?.id).toBeTruthy();
  });

  it("updates SLA breaches", async () => {
    const deadline = new Date(Date.now() + 3600_000).toISOString();
    await insertSlaRow({
      ticket_id: ticket.id,
      organisation_id: org.id,
      assignment_deadline: deadline,
      onsite_deadline: deadline,
      resolution_deadline: deadline,
    });
    const { error } = await updateSlaByTicketId(ticket.id, { assignment_breached: true });
    expect(error).toBeNull();

    const { data: rows } = await listSlaRowsByTicketIds([ticket.id]);
    expect(rows?.[0]?.assignment_breached).toBe(true);
  });
});
