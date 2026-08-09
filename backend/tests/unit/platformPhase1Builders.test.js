/**
 * Phase 1 enterprise builder — registry, formulas, layout, workflow analysis.
 */
import { describe, expect, it } from "vitest";
import { evaluateFormula, applyCalculatedFields } from "../../src/platform/form-engine/formula.js";
import { validateLayout, layoutFromFields } from "../../src/platform/form-engine/layout.js";
import { validateFormDefinition, FORM_FIELD_TYPES } from "../../src/platform/form-engine/index.js";
import { detectWorkflowCycles, detectWorkflowDeadlocks } from "../../src/platform/workflow-engine/index.js";
import { buildFormCatalogEntry, diffRegistrySnapshots } from "../../src/platform/metadata-registry/index.js";
import { FORM_TEMPLATES, getFormTemplate } from "../../src/platform/forms/templates.js";
import { compareSnapshots } from "../../src/platform/builders/versioning.js";

describe("form formulas", () => {
  it("evaluates SUM IF CONCAT DATEADD", () => {
    expect(evaluateFormula("SUM({{a}}, {{b}})", { a: 2, b: 3 }).value).toBe(5);
    expect(evaluateFormula('IF({{p}} == "HIGH", 1, 0)', { p: "HIGH" }).value).toBe(1);
    expect(evaluateFormula('CONCAT({{a}}, "-", {{b}})', { a: "x", b: "y" }).value).toBe("x-y");
    expect(evaluateFormula("ROUND(AVG(1,2,3), 1)").value).toBe(2);
  });

  it("rejects unsafe formulas", () => {
    expect(evaluateFormula("process.exit(1)").ok).toBe(false);
  });

  it("applies calculated fields", () => {
    const data = applyCalculatedFields(
      { fields: [{ internalName: "total", fieldType: "formula", formula: "SUM({{a}},{{b}})" }] },
      { a: 1, b: 4 }
    );
    expect(data.total).toBe(5);
  });
});

describe("form layout", () => {
  it("validates column layouts", () => {
    expect(validateLayout({ type: "root", children: [{ type: "columns", columns: 3, children: [] }] }).ok).toBe(true);
    expect(validateLayout({ type: "root", children: [{ type: "columns", columns: 9, children: [] }] }).ok).toBe(false);
  });

  it("builds layout from fields", () => {
    const layout = layoutFromFields([{ internalName: "title", fieldType: "single_line_text" }]);
    expect(layout.children[0].children[0].fieldKey).toBe("title");
  });
});

describe("expanded field catalog", () => {
  it("includes markdown rating user multi_file", () => {
    for (const t of ["markdown", "rating", "user", "multi_file_upload", "integer"]) {
      expect(FORM_FIELD_TYPES).toContain(t);
    }
    expect(validateFormDefinition({ fields: [{ internalName: "r", fieldType: "rating" }] }).ok).toBe(true);
  });
});

describe("workflow analysis", () => {
  it("detects cycles and deadlocks", () => {
    const cyclic = {
      initialState: "A",
      states: [{ key: "A" }, { key: "B" }],
      transitions: [
        { key: "ab", from: "A", to: "B" },
        { key: "ba", from: "B", to: "A" },
      ],
    };
    expect(detectWorkflowCycles(cyclic).hasCycle).toBe(true);

    const deadlock = {
      initialState: "OPEN",
      states: [{ key: "OPEN" }, { key: "STUCK" }, { key: "CLOSED", terminal: true }],
      transitions: [{ key: "x", from: "OPEN", to: "STUCK" }],
    };
    expect(detectWorkflowDeadlocks(deadlock).deadlocks).toContain("STUCK");
  });
});

describe("metadata registry", () => {
  it("builds catalog and diffs", () => {
    const entry = buildFormCatalogEntry(
      "incident",
      1,
      { fields: [{ internalName: "title", displayLabel: "Title", fieldType: "single_line_text" }] },
      null
    );
    expect(entry.fields).toHaveLength(1);
    const diff = diffRegistrySnapshots({ fields: [] }, { fields: entry.fields });
    expect(diff.added).toHaveLength(1);
  });
});

describe("templates + version compare", () => {
  it("ships enterprise templates", () => {
    expect(FORM_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(getFormTemplate("incident")?.schema.fields.length).toBeGreaterThan(0);
  });

  it("compares snapshots", () => {
    const c = compareSnapshots({ a: 1 }, { a: 2 });
    expect(c.changed).toBeGreaterThan(0);
  });
});
