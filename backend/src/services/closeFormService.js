import { getConfigurationByKey } from "../repositories/configurationRepository.js";

const FIELD_TYPES = new Set(["text", "textarea", "dropdown", "date", "number"]);

function cleanDefinition(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const label = typeof raw.label === "string" ? raw.label.trim() : "";
  const fieldType = typeof raw.fieldType === "string" ? raw.fieldType : "text";
  if (!id || !label || !FIELD_TYPES.has(fieldType)) return null;
  return {
    id,
    label,
    ...(typeof raw.placeholder === "string" && raw.placeholder.trim()
      ? { placeholder: raw.placeholder.trim() }
      : {}),
    required: raw.required === true,
    displayOrder: Number.isFinite(Number(raw.displayOrder)) ? Number(raw.displayOrder) : 0,
    fieldType,
    ...(Array.isArray(raw.options)
      ? { options: raw.options.map(String).map((v) => v.trim()).filter(Boolean) }
      : {}),
  };
}

/** Minimum configurable Verify & Close fields when a tenant defines any custom close fields.
 * Audit wording: "3 or 4 more configurable fields" — product uses 3 as the minimum
 * (issue type + resolution category + at least one tenant-defined field). */
export const MIN_CLOSE_FORM_FIELDS = 3;

export function validateCloseFormFieldsCount(rawFields) {
  if (!Array.isArray(rawFields)) return { ok: true };
  const valid = rawFields.map(cleanDefinition).filter(Boolean);
  if (valid.length > 0 && valid.length < MIN_CLOSE_FORM_FIELDS) {
    return {
      ok: false,
      error: `At least ${MIN_CLOSE_FORM_FIELDS} Verify & Close fields are required when configuring custom fields.`,
    };
  }
  return { ok: true, count: valid.length };
}

export function validateOrgTicketConfigValue(value) {
  if (!value || typeof value !== "object") return { ok: true };
  return validateCloseFormFieldsCount(value.closeFormFields);
}

export async function getCloseFormFields(organisationId) {
  if (!organisationId) return [];
  const { data, error } = await getConfigurationByKey(`org_${organisationId}_ticket_config`);
  if (error) throw error;
  const rawFields = data?.value && typeof data.value === "object" ? data.value.closeFormFields : [];
  if (!Array.isArray(rawFields)) return [];
  return rawFields.map(cleanDefinition).filter(Boolean).sort((a, b) => a.displayOrder - b.displayOrder);
}

export function validateCloseFormSnapshot(fields, rawValues) {
  const values = rawValues && typeof rawValues === "object" && !Array.isArray(rawValues) ? rawValues : {};
  const normalized = {};
  for (const field of fields) {
    const value = values[field.id] ?? null;
    if (value != null && typeof value !== "string" && typeof value !== "number") {
      return { ok: false, error: `Invalid value for ${field.label}` };
    }
    const trimmed = typeof value === "string" ? value.trim() : value;
    if (field.required && (trimmed == null || trimmed === "")) {
      return { ok: false, error: `${field.label} is required` };
    }
    if (field.fieldType === "dropdown" && trimmed != null && trimmed !== "" && !field.options?.includes(String(trimmed))) {
      return { ok: false, error: `Invalid option for ${field.label}` };
    }
    if (field.fieldType === "number" && trimmed != null && trimmed !== "" && !Number.isFinite(Number(trimmed))) {
      return { ok: false, error: `${field.label} must be a number` };
    }
    if (field.fieldType === "date" && trimmed != null && trimmed !== "") {
      const dateStr = String(trimmed);
      // Accept YYYY-MM-DD from <input type="date"> or ISO datetime.
      const okDate =
        /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
        !Number.isNaN(Date.parse(dateStr));
      if (!okDate || (/^\d{4}-\d{2}-\d{2}$/.test(dateStr) && Number.isNaN(Date.parse(`${dateStr}T00:00:00Z`)))) {
        return { ok: false, error: `${field.label} must be a valid date` };
      }
    }
    normalized[field.id] = trimmed;
  }
  return { ok: true, snapshot: { fields, values: normalized, submitted_at: new Date().toISOString() } };
}
