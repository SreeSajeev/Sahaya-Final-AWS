import {
  getResolutionLocationById, insertResolutionLocation, listResolutionLocations as listResolutionLocationsRepo,
  updateResolutionLocationById,
} from "../repositories/tenantResolutionLocationRepository.js";

const csvEscape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;

/** Coerce query/body flags like "true" / "1" from Express query strings. */
export function coerceActiveOnly(value) {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  return false;
}

export function parseResolutionLocationCsvRows(rows) {
  if (!Array.isArray(rows)) return { rows: [], errors: [{ row: 0, message: "rows must be an array" }] };
  const errors = [];
  const parsed = rows.map((row, i) => {
    const name = String(row?.name ?? "").trim();
    if (!name) errors.push({ row: i + 1, message: "name is required" });
    const rawActive = String(row?.is_active ?? "true").trim().toLowerCase();
    if (!["true", "false", "1", "0", "yes", "no", ""].includes(rawActive)) errors.push({ row: i + 1, message: "is_active must be true or false" });
    return { name, code: String(row?.code ?? "").trim() || null, description: String(row?.description ?? "").trim() || null,
      is_active: !["false", "0", "no"].includes(rawActive) };
  });
  return { rows: parsed, errors };
}
function org(req, body) { return req.isSuperAdmin ? body?.organisation_id || req.tenantId : req.tenantId; }
export async function listResolutionLocations(req, opts = {}) {
  const organisationId = req.isSuperAdmin ? opts.organisation_id || undefined : req.tenantId;
  if (!organisationId && !req.isSuperAdmin) return { error: { status: 403, message: "Tenant context missing" } };
  return listResolutionLocationsRepo({
    organisationId,
    search: opts.search,
    activeOnly: coerceActiveOnly(opts.active_only),
  });
}
export async function getResolutionLocation(req, id) {
  const result = await getResolutionLocationById(id);
  if (result.error || !result.data) return result;
  if (!req.isSuperAdmin && result.data.organisation_id !== req.tenantId) return { data: null, forbidden: true };
  return result;
}
export async function createResolutionLocation(req, body) {
  const organisationId = org(req, body);
  if (!organisationId) return { error: { status: 400, message: "organisation_id is required" } };
  if (!String(body.name || "").trim()) return { error: { status: 400, message: "name is required" } };
  const now = new Date().toISOString();
  const result = await insertResolutionLocation({ organisation_id: organisationId, name: body.name.trim(), code: body.code?.trim() || null,
    description: body.description?.trim() || null, is_active: body.is_active !== false, created_at: now, updated_at: now, created_by: req.appUser?.id ?? null });
  return result.error ? { error: { status: 400, message: result.error.message } } : result;
}
export async function updateResolutionLocation(req, id, body) {
  const current = await getResolutionLocation(req, id);
  if (current.forbidden) return { error: { status: 403, message: "Forbidden" } };
  if (!current.data) return { error: { status: 404, message: "Resolution location not found" } };
  const patch = { updated_at: new Date().toISOString(), updated_by: req.appUser?.id ?? null };
  for (const key of ["name", "code", "description", "is_active"]) if (body[key] !== undefined) patch[key] = typeof body[key] === "string" ? body[key].trim() || null : body[key];
  const result = await updateResolutionLocationById(id, patch);
  return result.error ? { error: { status: 400, message: result.error.message } } : result;
}
export async function importResolutionLocations(req, rows) {
  const parsed = parseResolutionLocationCsvRows(rows);
  if (parsed.errors.length) return { error: { status: 400, message: "Invalid CSV rows", details: parsed.errors } };
  const created = []; const errors = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const result = await createResolutionLocation(req, parsed.rows[i]);
    if (result.error) errors.push({ row: i + 1, message: result.error.message }); else created.push(result.data);
  }
  return { data: { created: created.length, errors } };
}
export function buildResolutionLocationsCsv(rows) {
  return ["name,code,description,is_active", ...rows.map((r) => [r.name, r.code, r.description, r.is_active].map(csvEscape).join(","))].join("\n");
}
export function validateResolutionLocationForClose(location, organisationId) {
  if (!location || location.organisation_id !== organisationId || !location.is_active) {
    return { error: { status: 400, message: "Resolution location is invalid or inactive for this ticket" } };
  }
  return { data: { id: location.id, name: location.name } };
}

/**
 * Resolve location for close.
 * When the tenant has zero active master rows, allow close without a location
 * (back-compat / empty catalog) so ops are not blocked.
 * When active rows exist, a valid UUID is mandatory.
 */
export async function resolveResolutionLocationForClose(id, organisationId) {
  const trimmed = id != null ? String(id).trim() : "";
  if (!trimmed) {
    const active = await listResolutionLocationsRepo({ organisationId, activeOnly: true });
    if (active.error) return { error: { status: 500, message: active.error.message } };
    if (!active.data?.length) {
      return { data: { id: null, name: null }, skipped: true };
    }
    return { error: { status: 400, message: "Resolution location is required." } };
  }
  const result = await getResolutionLocationById(trimmed);
  if (result.error) return { error: { status: 500, message: result.error.message } };
  return validateResolutionLocationForClose(result.data, organisationId);
}
