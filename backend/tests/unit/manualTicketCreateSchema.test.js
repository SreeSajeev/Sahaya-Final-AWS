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
      incident_title: "Brake failure on highway",
      short_description: "  Brake failure reported  ",
      category: "MECHANICAL",
      location: "Mumbai",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.short_description).toBe("Brake failure reported");
    expect(parsed.data.incident_title).toBe("Brake failure on highway");
  });

  it("rejects sparse status-only payloads without location", () => {
    const parsed = createTicketBodySchema.safeParse({ status: "OPEN" });
    expect(parsed.success).toBe(false);
  });

  it("rejects manual create without incident_title", () => {
    const parsed = createTicketBodySchema.safeParse({
      description: "Detail only",
      location: "Pune",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts description + location + incident_title as substantive", () => {
    const parsed = createTicketBodySchema.safeParse({
      incident_title: "Engine overheating",
      description: "Detail only",
      location: "Pune",
    });
    expect(parsed.success).toBe(true);
    expect(hasSubstantive(parsed.data)).toBe(true);
  });

  it("rejects empty location", () => {
    const parsed = createTicketBodySchema.safeParse({
      incident_title: "Brake issue",
      short_description: "Brake issue",
      location: "   ",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires location for manual create", () => {
    const parsed = createTicketBodySchema.safeParse({
      incident_title: "Brake failure",
      short_description: "Brake failure reported",
      category: "MECHANICAL",
    });
    expect(parsed.success).toBe(false);
  });
});
