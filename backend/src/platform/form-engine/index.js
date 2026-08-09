/**
 * Form Engine — METADATA only. No legacy Sahaya field names hardcoded.
 */
import { evaluateFormula, applyCalculatedFields, listSupportedFormulaFunctions } from "./formula.js";
import { validateLayout, layoutFromFields, collectFieldKeysFromLayout, LAYOUT_NODE_TYPES } from "./layout.js";
import { assertSafeRegex, safeRegexMatch } from "../security/SafeRegexService.js";

export { evaluateFormula, applyCalculatedFields, listSupportedFormulaFunctions };
export { validateLayout, layoutFromFields, collectFieldKeysFromLayout, LAYOUT_NODE_TYPES };

export const FORM_FIELD_TYPES = Object.freeze([
  "single_line_text",
  "paragraph",
  "rich_text",
  "markdown",
  "number",
  "integer",
  "decimal",
  "currency",
  "percentage",
  "date",
  "time",
  "datetime",
  "duration",
  "email",
  "phone",
  "url",
  "checkbox",
  "toggle",
  "radio",
  "dropdown",
  "multi_select",
  "tags",
  "rating",
  "people",
  "user",
  "team",
  "customer",
  "department",
  "company",
  "location",
  "country",
  "state",
  "city",
  "gps_coordinates",
  "vehicle",
  "asset",
  "equipment",
  "lookup_table",
  "dynamic_lookup",
  "api_lookup",
  "reference",
  "relation",
  "table",
  "repeater",
  "file_upload",
  "image_upload",
  "multi_file_upload",
  "pdf_upload",
  "document_upload",
  "video_upload",
  "signature",
  "barcode",
  "qr_code",
  "formula",
  "auto_number",
  "uuid",
  "ai_generated",
  "computed",
  "hidden",
  "section",
  "divider",
  "tab",
  "group",
  "accordion",
]);

export const FIELD_CAPABILITY_FLAGS = Object.freeze([
  "required",
  "optional",
  "readOnly",
  "hidden",
  "unique",
  "indexed",
  "encrypted",
  "searchable",
  "filterable",
  "sortable",
  "reportable",
  "exportable",
  "emailVisible",
  "mobileVisible",
  "portalVisible",
]);

/**
 * @param {unknown} schema
 * @returns {{ ok: true, fields: object[] } | { ok: false, error: string }}
 */
export function validateFormDefinition(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { ok: false, error: "schema must be an object" };
  }
  const fields = Array.isArray(schema.fields) ? schema.fields : null;
  if (!fields) return { ok: false, error: "schema.fields must be an array" };

  const names = new Set();
  for (const raw of fields) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "invalid field" };
    const internalName = String(raw.internalName || raw.internal_name || "").trim();
    if (!/^[a-z][a-z0-9_]*$/.test(internalName)) {
      return { ok: false, error: `invalid internalName: ${internalName || "(empty)"}` };
    }
    if (names.has(internalName)) return { ok: false, error: `duplicate field: ${internalName}` };
    names.add(internalName);
    const type = String(raw.fieldType || raw.field_type || "").trim();
    if (!FORM_FIELD_TYPES.includes(type)) {
      return { ok: false, error: `unsupported fieldType: ${type}` };
    }
    if (raw.regex) {
      const gate = assertSafeRegex(String(raw.regex), "");
      if (!gate.ok) return { ok: false, error: `unsafe field regex on ${internalName}: ${gate.error}`, code: gate.code };
    }
  }
  return { ok: true, fields };
}

/**
 * Evaluate conditional visibility against ticket data (simple equality rules).
 * Rule shape: { field, equals } or { and: [...] } / { or: [...] }
 */
export function evaluateCondition(condition, data) {
  if (condition == null) return true;
  if (typeof condition !== "object") return true;
  if (Array.isArray(condition.and)) return condition.and.every((c) => evaluateCondition(c, data));
  if (Array.isArray(condition.or)) return condition.or.some((c) => evaluateCondition(c, data));
  if (condition.field != null) {
    const actual = data?.[condition.field];
    if (Object.prototype.hasOwnProperty.call(condition, "equals")) {
      return String(actual ?? "") === String(condition.equals ?? "");
    }
    if (Object.prototype.hasOwnProperty.call(condition, "notEquals")) {
      return String(actual ?? "") !== String(condition.notEquals ?? "");
    }
    if (condition.exists === true) return actual != null && String(actual).trim() !== "";
  }
  return true;
}

/**
 * Validate submitted data against a published form schema.
 */
export function validateTicketDataAgainstSchema(schema, data) {
  const checked = validateFormDefinition(schema);
  if (!checked.ok) return checked;
  const payload = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const errors = [];

  for (const field of checked.fields) {
    const name = field.internalName || field.internal_name;
    const visible = evaluateCondition(field.visibility || field.conditionalVisibility, payload);
    if (!visible) continue;
    const required =
      field.required === true ||
      evaluateCondition(field.conditionalRequired, payload);
    const value = payload[name];
    const empty = value == null || (typeof value === "string" && value.trim() === "");
    if (required && empty) {
      errors.push({ field: name, error: "required" });
      continue;
    }
    if (empty) continue;
    const type = field.fieldType || field.field_type;
    if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      errors.push({ field: name, error: "invalid_email" });
    }
    if (type === "number" || type === "decimal" || type === "currency" || type === "percentage") {
      if (Number.isNaN(Number(value))) errors.push({ field: name, error: "invalid_number" });
    }
    if (field.regex) {
      const gate = assertSafeRegex(String(field.regex), "");
      if (!gate.ok) {
        errors.push({ field: name, error: "invalid_regex_config", code: gate.code });
      } else {
        const matched = safeRegexMatch(String(field.regex), "", String(value), { maxInput: 10_000, budgetMs: 20 });
        if (!matched.ok) {
          errors.push({ field: name, error: matched.code === "REGEX_TIMEOUT" ? "regex_timeout" : "regex_mismatch" });
        } else if (!matched.match) {
          errors.push({ field: name, error: "regex_mismatch" });
        }
      }
    }
    if (field.minLength != null && String(value).length < Number(field.minLength)) {
      errors.push({ field: name, error: "min_length" });
    }
    if (field.maxLength != null && String(value).length > Number(field.maxLength)) {
      errors.push({ field: name, error: "max_length" });
    }
    if (field.min != null && Number(value) < Number(field.min)) {
      errors.push({ field: name, error: "min" });
    }
    if (field.max != null && Number(value) > Number(field.max)) {
      errors.push({ field: name, error: "max" });
    }
  }

  for (const rule of schema.crossFieldValidations || []) {
    if (!rule?.expression) continue;
    if (rule.when && !evaluateCondition(rule.when, payload)) continue;
    const result = evaluateFormula(rule.expression, payload);
    if (!result.ok || result.value === false || result.value === 0 || result.value === "false") {
      errors.push({ field: rule.field || "_cross", error: rule.message || "cross_field" });
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, data: payload };
}

/**
 * Build searchable text blob from configured searchable fields.
 */
export function buildSearchText(schema, data) {
  const checked = validateFormDefinition(schema);
  if (!checked.ok) return "";
  const parts = [];
  for (const field of checked.fields) {
    if (field.searchable === false) continue;
    const name = field.internalName || field.internal_name;
    const v = data?.[name];
    if (v == null) continue;
    if (typeof v === "object") parts.push(JSON.stringify(v));
    else parts.push(String(v));
  }
  return parts.join(" ").slice(0, 20000);
}
