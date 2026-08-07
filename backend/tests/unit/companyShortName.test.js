import { describe, expect, it } from "vitest";
import {
  COMPANY_SHORT_NAME_MAX_LEN,
  normalizeCompanyShortName,
  suggestCompanyShortName,
} from "../../src/utils/companyShortName.js";

describe("company short name utilities", () => {
  it("normalizes nullable and trimmed values", () => {
    expect(normalizeCompanyShortName(null)).toEqual({ ok: true, value: null });
    expect(normalizeCompanyShortName("  Hitachi  ")).toEqual({ ok: true, value: "Hitachi" });
    expect(normalizeCompanyShortName("   ")).toEqual({ ok: true, value: null });
  });

  it("rejects values longer than 80 characters", () => {
    expect(normalizeCompanyShortName("x".repeat(COMPANY_SHORT_NAME_MAX_LEN + 1))).toEqual({
      ok: false,
      error: "company_short_name must be at most 80 characters",
    });
  });

  it("suggests an acronym for long multi-word company names", () => {
    expect(suggestCompanyShortName("Tata Consultancy Services")).toBe("TCS");
  });

  it("removes generic trailing terms before using the first significant word", () => {
    expect(suggestCompanyShortName("Hitachi Energy India Private Limited")).toBe("Hitachi");
  });

  it("returns null for a blank official name", () => {
    expect(suggestCompanyShortName("   ")).toBeNull();
  });
});
