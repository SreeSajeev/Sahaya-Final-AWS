/**
 * Form layout model — sections, columns, tabs, wizard, repeaters (METADATA).
 */

export const LAYOUT_NODE_TYPES = Object.freeze([
  "root",
  "section",
  "panel",
  "card",
  "columns",
  "column",
  "tabs",
  "tab",
  "accordion",
  "accordion_item",
  "wizard",
  "wizard_step",
  "repeater",
  "field",
  "divider",
]);

/**
 * @param {unknown} layout
 */
export function validateLayout(layout) {
  if (layout == null) return { ok: true, layout: { type: "root", children: [] } };
  if (typeof layout !== "object") return { ok: false, error: "layout must be object" };
  const walk = (node, depth = 0) => {
    if (depth > 20) return "layout nesting too deep";
    if (!node || typeof node !== "object") return "invalid layout node";
    const type = String(node.type || "");
    if (!LAYOUT_NODE_TYPES.includes(type)) return `unsupported layout type: ${type}`;
    if (type === "columns") {
      const cols = Number(node.columns || (node.children || []).length || 1);
      if (cols < 1 || cols > 4) return "columns must be 1–4";
    }
    if (type === "field" && !node.fieldKey && !node.internalName) {
      return "field layout node requires fieldKey";
    }
    for (const child of node.children || []) {
      const err = walk(child, depth + 1);
      if (err) return err;
    }
    return null;
  };
  const err = walk({ type: "root", children: layout.children || layout.sections || [] });
  if (err) return { ok: false, error: err };
  return { ok: true, layout };
}

/**
 * Flatten layout to ordered field keys (for wizard/step navigation).
 */
export function collectFieldKeysFromLayout(layout) {
  const keys = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === "field") {
      keys.push(node.fieldKey || node.internalName);
      return;
    }
    for (const c of node.children || []) walk(c);
    for (const s of node.sections || []) walk(s);
  };
  walk(layout);
  return keys.filter(Boolean);
}

/**
 * Build a default single-column layout from schema fields.
 */
export function layoutFromFields(fields) {
  return {
    type: "root",
    columns: 1,
    responsive: true,
    children: [
      {
        type: "section",
        key: "main",
        title: "Details",
        collapsible: false,
        children: (fields || [])
          .filter((f) => !["section", "divider", "tab", "group", "accordion"].includes(f.fieldType))
          .map((f) => ({
            type: "field",
            fieldKey: f.internalName,
            span: 12,
          })),
      },
    ],
  };
}
