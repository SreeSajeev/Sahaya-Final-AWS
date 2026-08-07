import { describe, expect, it } from "vitest";
import { buildClosureTimelineSummary } from "../../src/services/closureTimelineSummary.js";
import { coerceActiveOnly, validateResolutionLocationForClose } from "../../src/services/resolutionLocationService.js";
import { priorityDisplayLabel } from "../../src/utils/normalizeTicketPriority.js";
import { validateCloseFormSnapshot } from "../../src/services/closeFormService.js";

describe("coerceActiveOnly", () => {
  it("treats Express query string true as active", () => {
    expect(coerceActiveOnly("true")).toBe(true);
    expect(coerceActiveOnly("1")).toBe(true);
    expect(coerceActiveOnly("yes")).toBe(true);
    expect(coerceActiveOnly(true)).toBe(true);
  });
  it("treats other values as inactive filter off", () => {
    expect(coerceActiveOnly("false")).toBe(false);
    expect(coerceActiveOnly(undefined)).toBe(false);
    expect(coerceActiveOnly("")).toBe(false);
  });
});

describe("buildClosureTimelineSummary", () => {
  it("includes comments, location, close form, and closer", () => {
    const summary = buildClosureTimelineSummary({
      comments: [
        { created_at: "2026-01-01T10:00:00Z", source: "FE", body: "On site" },
        { created_at: "2026-01-01T11:00:00Z", source: "STAFF", body: "Closing" },
      ],
      closedByName: "Manager A",
      resolutionLocationName: "Bay 2",
      closeFormSnapshot: {
        fields: [{ id: "work", label: "Work done" }],
        values: { work: "Replaced belt" },
      },
    });
    expect(summary).toContain("FE: On site");
    expect(summary).toContain("Resolution location selected: Bay 2");
    expect(summary).toContain("Work done: Replaced belt");
    expect(summary).toContain("Closed by Manager A");
  });
});

describe("priorityDisplayLabel for resolution emails", () => {
  it("uses priority_level over boolean", () => {
    expect(priorityDisplayLabel("MEDIUM", true)).toBe("Medium");
    expect(priorityDisplayLabel(null, true)).toBe("High");
    expect(priorityDisplayLabel(null, false)).toBe("Low");
  });
});

describe("close form date validation", () => {
  it("rejects invalid date strings", () => {
    const fields = [
      { id: "done_on", label: "Done on", required: true, displayOrder: 0, fieldType: "date" },
    ];
    expect(validateCloseFormSnapshot(fields, { done_on: "not-a-date" }).ok).toBe(false);
    expect(validateCloseFormSnapshot(fields, { done_on: "2026-08-07" }).ok).toBe(true);
  });
});

describe("resolution location close validation", () => {
  it("rejects cross-tenant or inactive rows", () => {
    expect(
      validateResolutionLocationForClose(
        { id: "id", name: "Bay A", organisation_id: "org", is_active: true },
        "org"
      )
    ).toEqual({ data: { id: "id", name: "Bay A" } });
    expect(
      validateResolutionLocationForClose(
        { organisation_id: "other", is_active: true },
        "org"
      ).error.status
    ).toBe(400);
  });
});
