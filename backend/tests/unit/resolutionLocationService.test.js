import { describe, expect, it } from "vitest";
import { parseResolutionLocationCsvRows, validateResolutionLocationForClose } from "../../src/services/resolutionLocationService.js";

describe("resolution location CSV parsing", () => {
  it("normalizes valid rows and active values", () => {
    expect(parseResolutionLocationCsvRows([{ name: "  Bay A ", code: " B1 ", is_active: "no" }])).toEqual({
      rows: [{ name: "Bay A", code: "B1", description: null, is_active: false }],
      errors: [],
    });
  });
  it("rejects missing names and invalid booleans", () => {
    const result = parseResolutionLocationCsvRows([{ name: "", is_active: "maybe" }]);
    expect(result.errors).toHaveLength(2);
  });
});

describe("resolution location close validation", () => {
  it("returns a name snapshot only for an active location in the ticket tenant", () => {
    expect(validateResolutionLocationForClose({ id: "id", name: "Bay A", organisation_id: "org", is_active: true }, "org"))
      .toEqual({ data: { id: "id", name: "Bay A" } });
    expect(validateResolutionLocationForClose({ organisation_id: "other", is_active: true }, "org").error.status).toBe(400);
  });
});
