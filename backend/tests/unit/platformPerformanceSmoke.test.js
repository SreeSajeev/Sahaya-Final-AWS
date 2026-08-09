/**
 * Performance smoke — bounded; not a full 100k soak (documented as remaining risk).
 */
import { describe, expect, it } from "vitest";
import { previewEmailParse } from "../../src/platform/parser-engine/index.js";
import { projectTickets } from "../../src/platform/report-engine/index.js";
import { assertSafeRegex } from "../../src/platform/parser-engine/safeRegex.js";

describe("platform performance smoke", () => {
  it("parser preview stays fast on large body with safe regex", () => {
    const body = ("line\n".repeat(2000)) + "Loc: Zone-9";
    const t0 = Date.now();
    const result = previewEmailParse(
      { regexRules: [{ pattern: "Loc:\\s*(.+)", targetField: "location" }] },
      { body }
    );
    expect(result.fields.location?.value).toContain("Zone-9");
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("rejecting unsafe regex is near-instant", () => {
    const t0 = Date.now();
    for (let i = 0; i < 100; i++) assertSafeRegex("(a+)+$");
    expect(Date.now() - t0).toBeLessThan(200);
  });

  it("report projection over 2k tickets completes quickly", () => {
    const tickets = Array.from({ length: 2000 }, (_, i) => ({
      ticket_number: `MD-${i}`,
      status_key: i % 2 ? "OPEN" : "CLOSED",
      data_json: { city: i % 3 ? "BLR" : "MUM" },
    }));
    const t0 = Date.now();
    const report = projectTickets({ columns: [{ field_key: "city", label: "City" }] }, tickets);
    expect(report.rows).toHaveLength(2000);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
