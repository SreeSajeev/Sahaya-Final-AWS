/**
 * Exercises production ticketClientDisplay helpers + CloseTicketDialog contracts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCompanyShortNameBySlug,
  companyShortNameLookupKey,
  normalizeClientSlugKey,
  ticketCategoryCloseDisplay,
  ticketClientTableLabel,
} from "../../../frontend/src/lib/ticketClientDisplay.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("ticketClientDisplay (production)", () => {
  it("normalizes slug keys", () => {
    expect(normalizeClientSlugKey("Acme Logistics")).toBe("acme-logistics");
  });

  it("builds org+slug lookup keys", () => {
    expect(companyShortNameLookupKey("org-a", "Acme Logistics")).toBe(
      "org-a::acme-logistics"
    );
    expect(companyShortNameLookupKey("", "acme")).toBe("");
    expect(companyShortNameLookupKey("org-a", "")).toBe("");
  });

  it("resolves short name for a normal tenant/client", () => {
    const map = buildCompanyShortNameBySlug([
      {
        organisation_id: "tenant-1",
        slug: "acme-logistics",
        company_short_name: "Acme",
      },
    ]);
    expect(
      ticketClientTableLabel(
        { organisation_id: "tenant-1", client_slug: "acme-logistics" },
        map
      )
    ).toBe("Acme");
  });

  it("falls back to client_slug when short name unavailable", () => {
    const map = buildCompanyShortNameBySlug([
      { organisation_id: "tenant-1", slug: "other", company_short_name: "X" },
    ]);
    expect(
      ticketClientTableLabel(
        { organisation_id: "tenant-1", client_slug: "orphan-client" },
        map
      )
    ).toBe("orphan-client");
  });

  it("falls back to em dash when slug absent", () => {
    expect(ticketClientTableLabel({ client_slug: null }, {})).toBe("—");
    expect(ticketClientTableLabel({ client_slug: "   " }, {})).toBe("—");
  });

  it("prefers ticket.company_short_name when present", () => {
    const map = buildCompanyShortNameBySlug([
      { organisation_id: "tenant-1", slug: "acme", company_short_name: "FromMap" },
    ]);
    expect(
      ticketClientTableLabel(
        {
          organisation_id: "tenant-1",
          client_slug: "acme",
          company_short_name: "DirectShort",
        },
        map
      )
    ).toBe("DirectShort");
  });

  it("SUPER_ADMIN: same client_slug in two orgs resolves to each org's short name", () => {
    const map = buildCompanyShortNameBySlug([
      {
        organisation_id: "org-alpha",
        slug: "shared-client",
        company_short_name: "Alpha Short",
      },
      {
        organisation_id: "org-beta",
        slug: "shared-client",
        company_short_name: "Beta Short",
      },
    ]);

    expect(
      ticketClientTableLabel(
        { organisation_id: "org-alpha", client_slug: "shared-client" },
        map
      )
    ).toBe("Alpha Short");
    expect(
      ticketClientTableLabel(
        { organisation_id: "org-beta", client_slug: "shared-client" },
        map
      )
    ).toBe("Beta Short");
  });

  it("does not use a cross-org short name when organisation_id mismatches", () => {
    const map = buildCompanyShortNameBySlug([
      {
        organisation_id: "org-alpha",
        slug: "shared-client",
        company_short_name: "Alpha Short",
      },
    ]);
    expect(
      ticketClientTableLabel(
        { organisation_id: "org-beta", client_slug: "shared-client" },
        map
      )
    ).toBe("shared-client");
  });

  it("preserves client_slug as display fallback (identity unchanged)", () => {
    const slug = "keep-me-slug";
    expect(
      ticketClientTableLabel({ organisation_id: "org-1", client_slug: slug }, {})
    ).toBe(slug);
  });
});

describe("ticketCategoryCloseDisplay (production)", () => {
  it("renders from ticket.category and falls back for null/empty", () => {
    expect(ticketCategoryCloseDisplay("Hardware")).toBe("Hardware");
    expect(ticketCategoryCloseDisplay("  Soft  ")).toBe("Soft");
    expect(ticketCategoryCloseDisplay(null)).toBe("—");
    expect(ticketCategoryCloseDisplay(undefined)).toBe("—");
    expect(ticketCategoryCloseDisplay("")).toBe("—");
    expect(ticketCategoryCloseDisplay("   ")).toBe("—");
  });
});

describe("CloseTicketDialog Category contracts", () => {
  const src = readFileSync(
    join(here, "../../../frontend/src/components/tickets/CloseTicketDialog.tsx"),
    "utf8"
  );

  it("renders Category via ticketCategoryCloseDisplay(ticket.category)", () => {
    expect(src).toMatch(/data-testid="close-ticket-category"/);
    expect(src).toMatch(/ticketCategoryCloseDisplay\(ticket\.category\)/);
    expect(src).toMatch(/Separate from Issue Type below/);
    expect(src).toMatch(/Label htmlFor="close-resolution-category">Issue Type/);
  });

  it("submit payload still uses resolutionCategory, not ticket.category", () => {
    expect(src).toMatch(/onConfirm\(\s*remarks,\s*reviewNotes,\s*resolutionCategory\.trim\(\)/);
    expect(src).not.toMatch(/onConfirm\([^)]*ticket\.category/);
  });
});

describe("TicketsTable short-name wiring + client_slug gating", () => {
  const src = readFileSync(
    join(here, "../../../frontend/src/components/tickets/TicketsTable.tsx"),
    "utf8"
  );

  it("uses production short-name helpers for display", () => {
    expect(src).toMatch(/ticketClientTableLabel/);
    expect(src).toMatch(/buildCompanyShortNameBySlug/);
  });

  it("keeps client_slug for open-detail gating (identity unaffected)", () => {
    expect(src).toMatch(/canOpenTicketDetail\(ticket\.client_slug/);
  });
});
