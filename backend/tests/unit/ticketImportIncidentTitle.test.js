import { describe, expect, it } from "vitest";
import { resolveIncidentTitle } from "../../src/utils/resolveIncidentTitle.js";
import { validateImportRows } from "../../src/services/ticketImportService.js";

describe("resolveIncidentTitle", () => {
  it("prefers explicit incident_title", () => {
    expect(
      resolveIncidentTitle({
        incident_title: " Brake failure ",
        issue_type: "Mechanical",
      })
    ).toBe("Brake failure");
  });

  it("derives from description first line", () => {
    expect(
      resolveIncidentTitle({
        description: "Engine overheating\nDetail line two",
        issue_type: "Mechanical",
      })
    ).toBe("Engine overheating");
  });

  it("falls back to issue_type then category", () => {
    expect(resolveIncidentTitle({ issue_type: "GPS failure" })).toBe("GPS failure");
    expect(resolveIncidentTitle({ category: "Telematics" })).toBe("Telematics");
  });

  it("returns null when no source fields", () => {
    expect(resolveIncidentTitle({})).toBeNull();
  });
});

describe("ticketImportService incident_title", () => {
  const req = { isSuperAdmin: false, tenantId: "org-1" };
  const allowed = new Set(["demo-client"]);

  it("accepts explicit incident_title column", () => {
    const result = validateImportRows(
      req,
      [
        {
          client_slug: "demo-client",
          category: "Telematics",
          issue_type: "GPS",
          incident_title: "Unit offline",
          location: "Mumbai",
          priority: "LOW",
        },
      ],
      allowed
    );
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].incident_title).toBe("Unit offline");
  });

  it("derives incident_title from issue_type when column omitted", () => {
    const result = validateImportRows(
      req,
      [
        {
          client_slug: "demo-client",
          category: "Telematics",
          issue_type: "GPS NOT WORKING",
          location: "Mumbai",
          priority: "LOW",
        },
      ],
      allowed
    );
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].incident_title).toBe("GPS NOT WORKING");
  });

  it("rejects row when incident_title cannot be derived", () => {
    const result = validateImportRows(
      req,
      [
        {
          client_slug: "demo-client",
          location: "Mumbai",
          priority: "LOW",
        },
      ],
      allowed
    );
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0].errors.some((e) => e.includes("incident_title"))).toBe(true);
  });
});
