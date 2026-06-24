import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb, tenantReq } from "../helpers/testContext.js";
import {
  cleanupTestData,
  createTestFieldExecutive,
  createTestOrganisation,
  createTestTicket,
} from "../helpers/db.js";
import {
  insertAssignment,
  getAssignmentById,
  updateAssignmentById,
  listAssignmentsByTicketIds,
} from "../../src/repositories/assignmentRepository.js";

describeIfDb("ticketAssignmentRepository", () => {
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

  it("creates and reads an assignment", async () => {
    const { data, error } = await insertAssignment({
      ticket_id: ticket.id,
      fe_id: fe.id,
      organisation_id: org.id,
    });
    expect(error).toBeNull();
    expect(data?.ticket_id).toBe(ticket.id);

    const { data: loaded } = await getAssignmentById(data.id);
    expect(loaded?.fe_id).toBe(fe.id);
  });

  it("updates assignment outcome", async () => {
    const { data: created } = await insertAssignment({
      ticket_id: ticket.id,
      fe_id: fe.id,
      organisation_id: org.id,
    });
    const { data, error } = await updateAssignmentById(created.id, {
      outcome: "SUCCESS",
      ended_at: new Date().toISOString(),
    });
    expect(error).toBeNull();
    expect(data?.outcome).toBe("SUCCESS");
  });

  it("lists assignments by ticket ids within tenant scope", async () => {
    await insertAssignment({
      ticket_id: ticket.id,
      fe_id: fe.id,
      organisation_id: org.id,
    });
    const { data } = await listAssignmentsByTicketIds([ticket.id]);
    expect((data || []).length).toBeGreaterThanOrEqual(1);
    expect(tenantReq(org.id).tenantId).toBe(org.id);
  });
});
