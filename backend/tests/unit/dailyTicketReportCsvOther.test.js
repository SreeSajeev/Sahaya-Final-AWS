import { describe, it, expect } from "vitest";
import { buildDailyTicketReportCsv } from "../../src/services/dailyTicketReportCsvService.js";

describe("dailyTicketReportCsvService — OTHER resolution columns", () => {
  it("includes Resolution Other Details and Display columns for OTHER category", () => {
    const csv = buildDailyTicketReportCsv({
      orgName: "Acme",
      tickets: [
        {
          id: "t1",
          ticket_number: "PKQS-20260714-0001",
          resolution_category: "OTHER",
          verification_remarks: "Replaced fuse\n\nInternal note",
          status: "RESOLVED",
        },
      ],
      feById: new Map(),
      currentAssignmentByTicketId: new Map(),
      publicSubmissionByTicketId: new Map(),
      tenantClientBySlug: new Map(),
      slaByTicketId: new Map(),
      activityTypesByTicketId: new Map(),
      assignmentStatsByTicketId: new Map(),
      proofStatsByTicketId: new Map(),
    });

    expect(csv).toContain("Resolution Other Details");
    expect(csv).toContain("Resolution Category Display");
    expect(csv).toContain("Replaced fuse");
    expect(csv).toContain("Other: Replaced fuse");
  });
});
