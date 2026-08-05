import { describe, it, expect } from "vitest";
import { createTicketBodySchema } from "../../src/services/manualTicketService.js";

const SUBSTANTIVE_KEYS = [
  "short_description",
  "description",
  "category",
  "issue_type",
  "vehicle_number",
  "location",
  "complaint_id",
  "client_slug",
];

function hasSubstantive(data) {
  return SUBSTANTIVE_KEYS.some((k) => {
    const v = data[k];
    return v != null && String(v).trim() !== "";
  });
}

describe("createTicketBodySchema — short_description + validation", () => {
  it("keeps short_description through parse", () => {
    const parsed = createTicketBodySchema.safeParse({
      short_description: "  Brake failure reported  ",
      category: "MECHANICAL",
      location: "Mumbai",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.short_description).toBe("Brake failure reported");
  });

  it("rejects sparse status-only payloads without location", () => {
    const parsed = createTicketBodySchema.safeParse({ status: "OPEN" });
    expect(parsed.success).toBe(false);
  });

  it("accepts description + location as substantive", () => {
    const parsed = createTicketBodySchema.safeParse({
      description: "Detail only",
      location: "Pune",
    });
    expect(parsed.success).toBe(true);
    expect(hasSubstantive(parsed.data)).toBe(true);
  });

  it("rejects empty location", () => {
    const parsed = createTicketBodySchema.safeParse({
      short_description: "Brake issue",
      location: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires location for manual create", () => {
    const parsed = createTicketBodySchema.safeParse({
      short_description: "Brake failure reported",
      category: "MECHANICAL",
    });
    expect(parsed.success).toBe(false);
  });
});
