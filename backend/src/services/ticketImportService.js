import { supabase } from "../supabaseClient.js";
import { safeTrim } from "../utils/http.js";
import { BULK_IMPORT_MAX_ROWS, TENANT_CLIENTS_ENABLED } from "../config/appConfig.js";
import { createManualTicketFromBody } from "./manualTicketService.js";
import { loadAllowedClientSlugsForTenant, normalizeClientSlug } from "./tenantClientService.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { normalizeTicketState } from "../utils/normalizeTicketState.js";
import {
  normalizeTicketPriorityInput,
  normalizePriorityLevelString,
} from "../utils/normalizeTicketPriority.js";

function normalizeSlug(slug) {
  return String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function parsePriority(value) {
  const level = normalizePriorityLevelString(value);
  if (level) {
    return { priority_level: level, priority: level === "HIGH" };
  }
  if (value === true || value === false) {
    const normalized = normalizeTicketPriorityInput({ priority: value, defaultLevel: "LOW" });
    if (normalized.ok) return { priority_level: normalized.priority_level, priority: normalized.priority };
  }
  const s = safeTrim(value);
  if (s == null) {
    const normalized = normalizeTicketPriorityInput({ defaultLevel: "LOW" });
    return normalized.ok
      ? { priority_level: normalized.priority_level, priority: normalized.priority }
      : null;
  }
  const low = s.toLowerCase();
  if (["true", "1", "yes", "y", "high"].includes(low)) {
    return { priority_level: "HIGH", priority: true };
  }
  if (["false", "0", "no", "n", "", "low", "normal"].includes(low)) {
    return { priority_level: "LOW", priority: false };
  }
  if (low === "medium" || low === "med") {
    return { priority_level: "MEDIUM", priority: false };
  }
  return null;
}

function hasText(value) {
  return safeTrim(value) != null;
}

/** Hitachi / email-parser labels and CSV alias columns → tickets.complaint_id */
function resolveComplaintId(raw) {
  const keys = ["complaint_id", "record_id", "incident_number", "complaint_number"];
  for (const key of keys) {
    const value = safeTrim(raw?.[key]);
    if (value) return value;
  }
  return null;
}

/** Legacy validation source when TENANT_CLIENTS_ENABLED is false. */
async function loadAllowedClientSlugsFromOrganisations() {
  const { data, error } = await supabase.from("organisations").select("slug, status");
  if (error) throw new Error(error.message);
  const slugs = new Set();
  for (const row of data ?? []) {
    if (row?.status && row.status !== "active") continue;
    const key = normalizeSlug(row.slug);
    if (key) slugs.add(key);
  }
  return slugs;
}

async function resolveAllowedClientSlugs(req) {
  if (TENANT_CLIENTS_ENABLED) {
    return loadAllowedClientSlugsForTenant(req);
  }
  return loadAllowedClientSlugsFromOrganisations();
}

function normalizeImportRow(raw, rowNumber) {
  return {
    row: rowNumber,
    client_slug: safeTrim(raw?.client_slug),
    vehicle_number: safeTrim(raw?.vehicle_number),
    category: safeTrim(raw?.category),
    issue_type: safeTrim(raw?.issue_type),
    location: normalizeLocation(safeTrim(raw?.location)),
    state: normalizeTicketState(safeTrim(raw?.state)),
    priority: raw?.priority,
    complaint_id: resolveComplaintId(raw),
    description: safeTrim(raw?.description),
    organisation_id: safeTrim(raw?.organisation_id),
  };
}

/**
 * @returns {{ validRows: object[], invalidRows: object[], summary: object }}
 */
export function validateImportRows(req, rows, allowedSlugs) {
  const validRows = [];
  const invalidRows = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = Number(rows[i]?.row) > 0 ? Number(rows[i].row) : i + 1;
    const normalized = normalizeImportRow(rows[i] ?? {}, rowNumber);
    const errors = [];

    if (!req.isSuperAdmin && normalized.organisation_id) {
      errors.push("organisation_id is not allowed in CSV imports");
    }

    if (!normalized.client_slug) {
      errors.push("client_slug is required");
    } else {
      const key = TENANT_CLIENTS_ENABLED
        ? normalizeClientSlug(normalized.client_slug)
        : normalizeSlug(normalized.client_slug);
      if (!allowedSlugs.has(key)) {
        errors.push(
          TENANT_CLIENTS_ENABLED
            ? `Unknown client_slug "${normalized.client_slug}" (not found in tenant clients)`
            : `Unknown client_slug "${normalized.client_slug}"`
        );
      } else {
        normalized.client_slug = key;
      }
    }

    if (!hasText(normalized.category) && !hasText(normalized.issue_type)) {
      errors.push("At least one of category or issue_type is required");
    }

    const priorityParsed = parsePriority(normalized.priority);
    if (priorityParsed === null) {
      errors.push("priority must be LOW/MEDIUM/HIGH or true/false (or 1/0, yes/no)");
    } else {
      normalized.priority = priorityParsed.priority;
      normalized.priority_level = priorityParsed.priority_level;
    }

    if (errors.length > 0) {
      invalidRows.push({
        ...normalized,
        status: "invalid",
        errors,
        error: errors.join("; "),
      });
    } else {
      validRows.push({
        ...normalized,
        status: "valid",
        errors: [],
        error: null,
      });
    }
  }

  return {
    validRows,
    invalidRows,
    summary: {
      total: rows.length,
      valid: validRows.length,
      invalid: invalidRows.length,
    },
  };
}

export async function previewTicketImport(req, rows) {
  if (!Array.isArray(rows)) {
    return { error: { status: 400, message: "rows must be an array" } };
  }
  if (rows.length > BULK_IMPORT_MAX_ROWS) {
    return {
      error: {
        status: 400,
        message: `CSV exceeds maximum of ${BULK_IMPORT_MAX_ROWS} data rows. Split the file and try again.`,
      },
    };
  }
  if (rows.length === 0) {
    return { error: { status: 400, message: "No data rows to import" } };
  }

  const allowedSlugs = await resolveAllowedClientSlugs(req);
  const result = validateImportRows(req, rows, allowedSlugs);
  return { data: result };
}

export async function confirmTicketImport(req, validRows) {
  if (!Array.isArray(validRows)) {
    return { error: { status: 400, message: "rows must be an array" } };
  }
  if (validRows.length > BULK_IMPORT_MAX_ROWS) {
    return {
      error: {
        status: 400,
        message: `Import exceeds maximum of ${BULK_IMPORT_MAX_ROWS} rows`,
      },
    };
  }
  if (validRows.length === 0) {
    return { error: { status: 400, message: "No valid rows to import" } };
  }

  const allowedSlugs = await resolveAllowedClientSlugs(req);
  const revalidated = validateImportRows(req, validRows, allowedSlugs);
  if (revalidated.invalidRows.length > 0) {
    return {
      error: {
        status: 400,
        message: "One or more rows failed validation. Re-run preview before confirming.",
      },
    };
  }

  const results = [];
  let created = 0;
  let failed = 0;

  for (const row of revalidated.validRows) {
    const rowNum = row.row;
    const body = {
      vehicle_number: row.vehicle_number,
      category: row.category,
      issue_type: row.issue_type,
      location: row.location,
      state: row.state,
      complaint_id: row.complaint_id,
      priority: row.priority,
      priority_level: row.priority_level,
      client_slug: row.client_slug,
      description: row.description,
    };

    const outcome = await createManualTicketFromBody(req, body);
    if (outcome.ok) {
      created += 1;
      results.push({
        row: rowNum,
        ticket_number: outcome.ticket.ticket_number ?? null,
        status: "created",
        error: null,
      });
    } else {
      failed += 1;
      results.push({
        row: rowNum,
        ticket_number: null,
        status: "failed",
        error: outcome.error ?? "Unable to create ticket",
      });
    }
  }

  return {
    data: {
      summary: {
        total: results.length,
        created,
        failed,
      },
      results,
    },
  };
}
