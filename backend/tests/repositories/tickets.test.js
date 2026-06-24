import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb, tenantReq, uniqueTicketNumber } from "../helpers/testContext.js";
import {
  cleanupTestData,
  createTestOrganisation,
  createTestTicket,
} from "../helpers/db.js";
import {
  insertTicket,
  getTicketByIdScoped,
  updateTicketById,
  listTicketsScoped,
} from "../../src/repositories/ticketQueryRepository.js";

describeIfDb("ticketRepository", () => {
  let orgA;
  let orgB;

  beforeEach(async () => {
    orgA = await createTestOrganisation();
    orgB = await createTestOrganisation();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("creates and reads a ticket", async () => {
    const ticketNumber = uniqueTicketNumber();
    const row = await insertTicket({
      ticket_number: ticketNumber,
      status: "OPEN",
      organisation_id: orgA.id,
      vehicle_number: "KA01AA1111",
      location: "Bangalore",
      source: "MANUAL",
    });
    expect(row.id).toBeTruthy();

    const { data } = await getTicketByIdScoped(tenantReq(orgA.id), row.id);
    expect(data?.ticket_number).toBe(ticketNumber);
  });

  it("updates ticket fields", async () => {
    const ticket = await createTestTicket(orgA.id);
    const { data, error } = await updateTicketById(ticket.id, { status: "ASSIGNED" });
    expect(error).toBeNull();
    expect(data?.status).toBe("ASSIGNED");
  });

  it("enforces tenant isolation", async () => {
    const ticketA = await createTestTicket(orgA.id);
    await createTestTicket(orgB.id);

    const { data: visible } = await getTicketByIdScoped(tenantReq(orgB.id), ticketA.id);
    expect(visible).toBeNull();

    const { data: listB } = await listTicketsScoped(tenantReq(orgB.id), {
      limit: 20,
      offset: 0,
      filters: {},
    });
    expect((listB || []).every((t) => t.organisation_id === orgB.id)).toBe(true);
  });
});
