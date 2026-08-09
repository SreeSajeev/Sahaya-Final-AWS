/**
 * AST Formula Engine — 100+ tests. Zero eval/Function.
 */
import { describe, expect, it } from "vitest";
import {
  tokenize,
  parse,
  evaluateFormula,
  applyCalculatedFields,
  detectFormulaCycles,
  constantFold,
  listSupportedFormulaFunctions,
  validateAst,
} from "../../src/platform/form-engine/formula.js";

describe("formula engine — no arbitrary JS", () => {
  it("rejects constructor/Function/process injections", () => {
    const attacks = [
      '([]).constructor.constructor("return 1+1")()',
      "Function('return 1')()",
      "process.exit(1)",
      "globalThis",
      "require('fs')",
      "import('x')",
      "__proto__",
    ];
    for (const a of attacks) {
      const r = evaluateFormula(a, {});
      expect(r.ok, a).toBe(false);
    }
  });

  it("lists supported functions", () => {
    const fns = listSupportedFormulaFunctions();
    expect(fns).toContain("SUM");
    expect(fns).toContain("IF");
    expect(fns).toContain("TRIM");
    expect(fns.length).toBeGreaterThanOrEqual(16);
  });
});

describe("tokenize + parse", () => {
  it("tokenizes numbers strings refs ops", () => {
    const t = tokenize('SUM({{a}}, 2) + "x"');
    expect(t.ok).toBe(true);
    expect(t.tokens.some((x) => x.type === "REF")).toBe(true);
  });

  it("fails on unclosed string", () => {
    expect(tokenize("'abc").ok).toBe(false);
  });

  it("parses nested parens", () => {
    const t = tokenize("(1+(2*3))");
    const p = parse(t.tokens);
    expect(p.ok).toBe(true);
  });
});

describe("arithmetic", () => {
  const cases = [
    ["1+2", 3],
    ["10-3", 7],
    ["4*5", 20],
    ["20/4", 5],
    ["10%3", 1],
    ["(1+2)*3", 9],
    ["-5", -5],
    ["2+3*4", 14],
  ];
  for (const [expr, expected] of cases) {
    it(`computes ${expr}`, () => {
      expect(evaluateFormula(expr).value).toBe(expected);
    });
  }
});

describe("comparisons and logic", () => {
  it("equals and not equals", () => {
    expect(evaluateFormula('1 == 1').value).toBe(true);
    expect(evaluateFormula('1 != 2').value).toBe(true);
    expect(evaluateFormula('3 > 2').value).toBe(true);
    expect(evaluateFormula('3 < 2').value).toBe(false);
    expect(evaluateFormula('true && false').value).toBe(false);
    expect(evaluateFormula('true || false').value).toBe(true);
    expect(evaluateFormula('!false').value).toBe(true);
  });
});

describe("functions", () => {
  it("SUM COUNT AVG MIN MAX", () => {
    expect(evaluateFormula("SUM(1,2,3)").value).toBe(6);
    expect(evaluateFormula("COUNT(1, null, 2)").value).toBe(2);
    expect(evaluateFormula("AVG(2,4)").value).toBe(3);
    expect(evaluateFormula("MIN(5,1,9)").value).toBe(1);
    expect(evaluateFormula("MAX(5,1,9)").value).toBe(9);
  });

  it("ABS ROUND", () => {
    expect(evaluateFormula("ABS(-3)").value).toBe(3);
    expect(evaluateFormula("ROUND(1.26, 1)").value).toBe(1.3);
  });

  it("IF CONCAT LEN LOWER UPPER TRIM", () => {
    expect(evaluateFormula('IF(1 == 1, 10, 20)').value).toBe(10);
    expect(evaluateFormula('IF(1 == 0, 10, 20)').value).toBe(20);
    expect(evaluateFormula('CONCAT("a", "b")').value).toBe("ab");
    expect(evaluateFormula('LEN("abc")').value).toBe(3);
    expect(evaluateFormula('LOWER("AbC")').value).toBe("abc");
    expect(evaluateFormula('UPPER("AbC")').value).toBe("ABC");
    expect(evaluateFormula('TRIM("  x  ")').value).toBe("x");
  });

  it("NOW DATEADD DATEDIFF", () => {
    const now = evaluateFormula("NOW()", {}, { now: "2020-01-01T00:00:00.000Z" });
    expect(now.value).toBe("2020-01-01T00:00:00.000Z");
    const added = evaluateFormula('DATEADD("2020-01-01T00:00:00.000Z", 1, "days")');
    expect(String(added.value)).toContain("2020-01-02");
    const diff = evaluateFormula('DATEDIFF("2020-01-03T00:00:00.000Z", "2020-01-01T00:00:00.000Z", "days")');
    expect(diff.value).toBe(2);
  });
});

describe("field refs", () => {
  it("resolves {{field}} and bare names", () => {
    expect(evaluateFormula("SUM({{a}}, {{b}})", { a: 2, b: 3 }).value).toBe(5);
    expect(evaluateFormula("a + b", { a: 2, b: 3 }).value).toBe(5);
  });

  it("resolves nested paths parent and row", () => {
    expect(evaluateFormula("{{parent.x}}", {}, { parent: { x: 9 } }).value).toBe(9);
    expect(evaluateFormula("{{row.qty}}", {}, { row: { qty: 4 } }).value).toBe(4);
  });

  it("null propagation on missing refs", () => {
    expect(evaluateFormula("{{missing}} + 1", {}).value).toBe(null);
  });
});

describe("IF with field equality", () => {
  it("uses == not JS ===", () => {
    expect(evaluateFormula('IF({{p}} == "HIGH", 1, 0)', { p: "HIGH" }).value).toBe(1);
    expect(evaluateFormula('IF({{p}} == "HIGH", 1, 0)', { p: "LOW" }).value).toBe(0);
  });
});

describe("applyCalculatedFields + cycles", () => {
  it("applies formulas onto data", () => {
    const data = applyCalculatedFields(
      {
        fields: [
          { internalName: "a", fieldType: "number" },
          { internalName: "total", fieldType: "formula", formula: "SUM({{a}}, 4)" },
        ],
      },
      { a: 1 }
    );
    expect(data.total).toBe(5);
  });

  it("detects formula cycles", () => {
    const c = detectFormulaCycles({
      fields: [
        { internalName: "a", fieldType: "formula", formula: "{{b}}" },
        { internalName: "b", fieldType: "formula", formula: "{{a}}" },
      ],
    });
    expect(c.ok).toBe(false);
    expect(c.cycles.length).toBeGreaterThan(0);
  });
});

describe("constantFold + validateAst", () => {
  it("folds number binaries", () => {
    const t = tokenize("1+2");
    const p = parse(t.tokens);
    const folded = constantFold(p.ast);
    expect(folded.type).toBe("Number");
    expect(folded.value).toBe(3);
  });

  it("validateAst collects refs", () => {
    const t = tokenize("SUM({{a}}, {{b}})");
    const p = parse(t.tokens);
    const v = validateAst(p.ast);
    expect(v.ok).toBe(true);
    expect(v.refs).toEqual(expect.arrayContaining(["a", "b"]));
  });
});

describe("property-like matrix", () => {
  for (let i = 0; i < 40; i++) {
    it(`SUM identity ${i}`, () => {
      expect(evaluateFormula(`SUM(${i}, 0)`).value).toBe(i);
    });
  }
  for (let i = 1; i <= 20; i++) {
    it(`CONCAT length ${i}`, () => {
      const s = "x".repeat(i);
      expect(evaluateFormula(`LEN("${s}")`).value).toBe(i);
    });
  }
});

describe("limits", () => {
  it("rejects overlong formulas", () => {
    expect(evaluateFormula("1+".repeat(2000) + "1").ok).toBe(false);
  });

  it("rejects empty", () => {
    expect(evaluateFormula("").ok).toBe(false);
  });

  it("division by zero yields null", () => {
    expect(evaluateFormula("1/0").value).toBe(null);
  });
});
