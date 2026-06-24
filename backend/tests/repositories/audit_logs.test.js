import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb, tenantReq } from "../helpers/testContext.js";
import {
  cleanupTestData,
  createTestOrganisation,
  createTestTicket,
} from "../helpers/db.js";
import {
  insertAuditLogRow,
  listAuditLogsPaginated,
} from "../../src/repositories/auditLogRepository.js";

describeIfDb("auditLogRepository", () => {
  let org;
  let ticket;

  beforeEach(async () => {
    org = await createTestOrganisation();
    ticket = await createTestTicket(org.id);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("inserts and lists audit logs", async () => {
    const { error } = await insertAuditLogRow({
      entity_type: "ticket",
      entity_id: ticket.id,
      action: "ticket_created",
      organisation_id: org.id,
      summary: "Test audit entry",
      metadata: { ticket_id: ticket.id },
    });
    expect(error).toBeNull();

    const { data, error: listErr } = await listAuditLogsPaginated(
      tenantReq(org.id),
      { entityType: "ticket" },
      { limit: 10, offset: 0, sortColumn: "created_at", ascending: false }
    );
    expect(listErr).toBeNull();
    expect((data || []).some((r) => r.entity_id === ticket.id)).toBe(true);
  });
});
