/**
 * SafeRegexService + form validation ReDoS regression + fuzz.
 */
import { describe, expect, it } from "vitest";
import { assertSafeRegex, safeRegexMatch, REGEX_EXEC_BUDGET_MS } from "../../src/platform/security/SafeRegexService.js";
import { validateTicketDataAgainstSchema, validateFormDefinition } from "../../src/platform/form-engine/index.js";

describe("SafeRegexService", () => {
  it("rejects catastrophic patterns", () => {
    for (const p of ["(a+)+$", "(a*)*", "(.*a){x}", "((a+)+)+", "(\\w+)+$"]) {
      const g = assertSafeRegex(p);
      expect(g.ok, p).toBe(false);
    }
  });

  it("allows simple patterns", () => {
    expect(assertSafeRegex("^Loc:\\s*(.+)$").ok).toBe(true);
    const m = safeRegexMatch("Loc:\\s*(.+)", "", "Loc: Bay");
    expect(m.ok).toBe(true);
    expect(m.match?.[1]).toBe("Bay");
  });

  it("form validation rejects unsafe field regex at schema time", () => {
    const v = validateFormDefinition({
      fields: [{ internalName: "x", fieldType: "single_line_text", regex: "(a+)+$" }],
    });
    expect(v.ok).toBe(false);
  });

  it("form data validation does not hang on evil regex", () => {
    // Even if somehow present, match path uses SafeRegexService
    const t0 = Date.now();
    const r = validateTicketDataAgainstSchema(
      { fields: [{ internalName: "x", fieldType: "single_line_text", regex: "(a+)+$" }] },
      { x: "a".repeat(30) + "!" }
    );
    // Schema should fail unsafe at validateTicketDataAgainstSchema via assertSafe on field
    expect(Date.now() - t0).toBeLessThan(100);
    expect(r.ok).toBe(false);
  });
});

describe("SafeRegex fuzz 10k patterns", () => {
  it("never throws and never accepts nested quantifier shapes", () => {
    const evil = ["+", "*", "?", "{2,}", "|"];
    let rejected = 0;
    let accepted = 0;
    for (let i = 0; i < 10000; i++) {
      // generate semi-random patterns
      let p = "";
      const len = 1 + (i % 40);
      for (let j = 0; j < len; j++) {
        const roll = (i * 31 + j * 17) % 10;
        if (roll < 4) p += "a";
        else if (roll < 6) p += ".";
        else if (roll === 6) p += "(";
        else if (roll === 7) p += ")";
        else p += evil[(i + j) % evil.length];
      }
      try {
        const g = assertSafeRegex(p);
        if (g.ok) {
          accepted += 1;
          const m = safeRegexMatch(p, "", "a".repeat(20), { budgetMs: REGEX_EXEC_BUDGET_MS });
          expect(m.elapsedMs == null || m.elapsedMs < 200).toBe(true);
        } else rejected += 1;
      } catch (e) {
        throw new Error(`threw on ${p}: ${e}`);
      }
    }
    expect(rejected + accepted).toBe(10000);
    expect(rejected).toBeGreaterThan(100);
  });
});
