import { safeTrim } from "../utils/http.js";
import { insertAuditLog } from "./auditLogService.js";
import { getTenantClientById } from "./tenantClientService.js";
import {
  countClientVehicles,
  countTicketsUsingVehicle,
  deleteClientVehicleRow,
  findClientVehicleByNumber,
  getClientVehicleByIdRow,
  insertClientVehicleRow,
  listClientVehiclesQuery,
  updateClientVehicleRow,
} from "../repositories/clientVehicleRepository.js";

export function normalizeVehicleNumber(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function optionalField(raw, max = 200) {
  const t = safeTrim(raw);
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

async function assertClientAccess(req, clientId) {
  const outcome = await getTenantClientById(req, clientId);
  if (outcome.forbidden) return { error: { status: 403, message: "Forbidden" } };
  if (outcome.error) return { error: { status: 500, message: outcome.error.message } };
  if (!outcome.data) return { error: { status: 404, message: "Client not found" } };
  return { client: outcome.data };
}

function actorUserId(req) {
  return req.appUser?.id ? String(req.appUser.id) : null;
}

/**
 * @param {import('express').Request} req
 * @param {string} clientId
 * @param {{ activeOnly?: boolean, search?: string | null }} [opts]
 */
export async function listClientVehicles(req, clientId, opts = {}) {
  const access = await assertClientAccess(req, clientId);
  if (access.error) return access;

  const organisationId = access.client.organisation_id;
  const { data, error } = await listClientVehiclesQuery({
    clientId,
    organisationId,
    activeOnly: opts.activeOnly === true,
    search: opts.search ?? null,
  });
  if (error) return { error: { status: 500, message: error.message } };

  const counts = await countClientVehicles(clientId, organisationId);
  return {
    data,
    total: counts.total,
    active: counts.active,
    client: access.client,
  };
}

export async function createClientVehicle(req, clientId, body) {
  const access = await assertClientAccess(req, clientId);
  if (access.error) return access;

  const vehicleNumber = normalizeVehicleNumber(body?.vehicle_number ?? body?.vehicleNumber);
  if (!vehicleNumber) {
    return { error: { status: 400, message: "Vehicle Number is required" } };
  }
  if (vehicleNumber.length > 80) {
    return { error: { status: 400, message: "Vehicle Number must be 80 characters or fewer" } };
  }

  const existing = await findClientVehicleByNumber(clientId, vehicleNumber);
  if (existing.data) {
    return { error: { status: 400, message: `Vehicle "${vehicleNumber}" already exists for this client` } };
  }

  const nowIso = new Date().toISOString();
  const insert = {
    organisation_id: access.client.organisation_id,
    client_id: clientId,
    vehicle_number: vehicleNumber,
    vehicle_type: optionalField(body?.vehicle_type ?? body?.vehicleType, 120),
    vehicle_name: optionalField(body?.vehicle_name ?? body?.vehicleName, 200),
    registration_number: optionalField(body?.registration_number ?? body?.registrationNumber, 120),
    description: optionalField(body?.description, 2000),
    is_active: body?.is_active === false || body?.isActive === false ? false : true,
    created_by: actorUserId(req),
    updated_by: actorUserId(req),
    updated_at: nowIso,
  };

  const { data, error } = await insertClientVehicleRow(insert);
  if (error) {
    const msg = String(error.message || "");
    if (msg.includes("client_vehicles_client_vehicle_number_unique") || error.code === "23505") {
      return { error: { status: 400, message: `Vehicle "${vehicleNumber}" already exists for this client` } };
    }
    return { error: { status: 400, message: msg } };
  }

  void insertAuditLog({
    req,
    entity_type: "client_vehicle",
    entity_id: data.id,
    action: "vehicle_created",
    organisation_id: access.client.organisation_id,
    metadata: {
      client_id: clientId,
      vehicle_number: vehicleNumber,
    },
  });

  return { data };
}

export async function updateClientVehicle(req, clientId, vehicleId, body) {
  const access = await assertClientAccess(req, clientId);
  if (access.error) return access;

  const existing = await getClientVehicleByIdRow(vehicleId);
  if (existing.error) return { error: { status: 500, message: existing.error.message } };
  if (!existing.data) return { error: { status: 404, message: "Vehicle not found" } };
  if (existing.data.client_id !== clientId) {
    return { error: { status: 404, message: "Vehicle not found" } };
  }
  if (existing.data.organisation_id !== access.client.organisation_id) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  /** @type {Record<string, unknown>} */
  const patch = { updated_by: actorUserId(req), updated_at: new Date().toISOString() };
  let action = "vehicle_updated";

  if (body?.vehicle_number != null || body?.vehicleNumber != null) {
    const vehicleNumber = normalizeVehicleNumber(body.vehicle_number ?? body.vehicleNumber);
    if (!vehicleNumber) return { error: { status: 400, message: "Vehicle Number is required" } };
    if (vehicleNumber !== existing.data.vehicle_number) {
      const dup = await findClientVehicleByNumber(clientId, vehicleNumber);
      if (dup.data && dup.data.id !== vehicleId) {
        return { error: { status: 400, message: `Vehicle "${vehicleNumber}" already exists for this client` } };
      }
      patch.vehicle_number = vehicleNumber;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body ?? {}, "vehicle_type") || Object.prototype.hasOwnProperty.call(body ?? {}, "vehicleType")) {
    patch.vehicle_type = optionalField(body.vehicle_type ?? body.vehicleType, 120);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "vehicle_name") || Object.prototype.hasOwnProperty.call(body ?? {}, "vehicleName")) {
    patch.vehicle_name = optionalField(body.vehicle_name ?? body.vehicleName, 200);
  }
  if (
    Object.prototype.hasOwnProperty.call(body ?? {}, "registration_number") ||
    Object.prototype.hasOwnProperty.call(body ?? {}, "registrationNumber")
  ) {
    patch.registration_number = optionalField(body.registration_number ?? body.registrationNumber, 120);
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "description")) {
    patch.description = optionalField(body.description, 2000);
  }

  if (Object.prototype.hasOwnProperty.call(body ?? {}, "is_active") || Object.prototype.hasOwnProperty.call(body ?? {}, "isActive")) {
    const nextActive = body.is_active !== false && body.isActive !== false;
    patch.is_active = nextActive;
    if (Boolean(existing.data.is_active) !== nextActive) {
      action = nextActive ? "vehicle_reactivated" : "vehicle_deactivated";
    }
  }

  const { data, error } = await updateClientVehicleRow(vehicleId, patch);
  if (error) {
    const msg = String(error.message || "");
    if (msg.includes("client_vehicles_client_vehicle_number_unique") || error.code === "23505") {
      return { error: { status: 400, message: "Vehicle number already exists for this client" } };
    }
    return { error: { status: 400, message: msg } };
  }

  void insertAuditLog({
    req,
    entity_type: "client_vehicle",
    entity_id: vehicleId,
    action,
    organisation_id: access.client.organisation_id,
    metadata: {
      client_id: clientId,
      vehicle_number: data.vehicle_number,
      is_active: data.is_active,
    },
  });

  return { data };
}

export async function deleteClientVehicle(req, clientId, vehicleId) {
  const access = await assertClientAccess(req, clientId);
  if (access.error) return access;

  const existing = await getClientVehicleByIdRow(vehicleId);
  if (existing.error) return { error: { status: 500, message: existing.error.message } };
  if (!existing.data) return { error: { status: 404, message: "Vehicle not found" } };
  if (existing.data.client_id !== clientId) {
    return { error: { status: 404, message: "Vehicle not found" } };
  }
  if (existing.data.organisation_id !== access.client.organisation_id) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  const usage = await countTicketsUsingVehicle(vehicleId);
  if (usage.error) return { error: { status: 500, message: usage.error.message } };
  if (usage.count > 0) {
    return {
      error: {
        status: 400,
        message: "Vehicle cannot be deleted because it is used on one or more tickets. Deactivate it instead.",
      },
    };
  }

  const { error } = await deleteClientVehicleRow(vehicleId);
  if (error) return { error: { status: 400, message: error.message } };

  void insertAuditLog({
    req,
    entity_type: "client_vehicle",
    entity_id: vehicleId,
    action: "vehicle_deleted",
    organisation_id: access.client.organisation_id,
    metadata: {
      client_id: clientId,
      vehicle_number: existing.data.vehicle_number,
    },
  });

  return { ok: true };
}

/**
 * Bulk import rows (already parsed by client). Returns summary + error rows.
 * @param {Array<Record<string, unknown>>} rows
 */
export async function importClientVehicles(req, clientId, rows) {
  const access = await assertClientAccess(req, clientId);
  if (access.error) return access;

  if (!Array.isArray(rows)) {
    return { error: { status: 400, message: "rows must be an array" } };
  }
  if (rows.length > 5000) {
    return { error: { status: 400, message: "Import is limited to 5000 rows per request" } };
  }

  let imported = 0;
  let skippedDuplicates = 0;
  let invalid = 0;
  /** @type {Array<{ row: number, vehicle_number: string, error: string }>} */
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? {};
    const vehicleNumber = normalizeVehicleNumber(
      row.vehicle_number ?? row.vehicleNumber ?? row["Vehicle Number"]
    );
    const vehicleType = optionalField(row.vehicle_type ?? row.vehicleType ?? row["Vehicle Type"], 120);
    const vehicleName = optionalField(row.vehicle_name ?? row.vehicleName ?? row["Vehicle Name"], 200);
    const registrationNumber = optionalField(
      row.registration_number ?? row.registrationNumber ?? row["Registration Number"],
      120
    );
    const description = optionalField(row.description ?? row.Description, 2000);

    const blank =
      !vehicleNumber && !vehicleType && !vehicleName && !registrationNumber && !description;
    if (blank) continue;

    if (!vehicleNumber) {
      invalid += 1;
      errors.push({ row: i + 1, vehicle_number: "", error: "Vehicle Number is required" });
      continue;
    }
    if (vehicleNumber.length > 80) {
      invalid += 1;
      errors.push({ row: i + 1, vehicle_number: vehicleNumber, error: "Vehicle Number too long" });
      continue;
    }

    const existing = await findClientVehicleByNumber(clientId, vehicleNumber);
    if (existing.data) {
      skippedDuplicates += 1;
      continue;
    }

    const { error } = await insertClientVehicleRow({
      organisation_id: access.client.organisation_id,
      client_id: clientId,
      vehicle_number: vehicleNumber,
      vehicle_type: vehicleType,
      vehicle_name: vehicleName,
      registration_number: registrationNumber,
      description,
      is_active: true,
      created_by: actorUserId(req),
      updated_by: actorUserId(req),
      updated_at: new Date().toISOString(),
    });
    if (error) {
      const msg = String(error.message || "");
      if (msg.includes("client_vehicles_client_vehicle_number_unique") || error.code === "23505") {
        skippedDuplicates += 1;
        continue;
      }
      invalid += 1;
      errors.push({ row: i + 1, vehicle_number: vehicleNumber, error: msg });
      continue;
    }
    imported += 1;
  }

  void insertAuditLog({
    req,
    entity_type: "tenant_client",
    entity_id: clientId,
    action: "vehicle_imported",
    organisation_id: access.client.organisation_id,
    metadata: {
      imported,
      skipped_duplicates: skippedDuplicates,
      invalid,
      total_rows: rows.length,
    },
  });

  return {
    summary: {
      imported,
      skipped_duplicates: skippedDuplicates,
      invalid,
      total_rows: rows.length,
    },
    errors,
  };
}

/**
 * Resolve vehicle snapshots for ticket create from vehicle_id and/or free-text number.
 */
export async function resolveTicketVehicleFields(req, { clientSlug, organisationId, vehicleId, vehicleNumber }) {
  const trimmedId = safeTrim(vehicleId);
  const freeText = normalizeVehicleNumber(vehicleNumber);

  if (trimmedId) {
    const { data, error } = await getClientVehicleByIdRow(trimmedId);
    if (error) return { error: { status: 500, message: error.message } };
    if (!data || data.is_active === false) {
      return { error: { status: 400, message: "Selected vehicle is not available" } };
    }
    if (organisationId && data.organisation_id !== organisationId) {
      return { error: { status: 403, message: "Forbidden" } };
    }
    if (!req.isSuperAdmin && req.tenantId && data.organisation_id !== req.tenantId) {
      return { error: { status: 403, message: "Forbidden" } };
    }
    if (clientSlug) {
      const access = await assertClientAccess(req, data.client_id);
      if (access.error) return access;
      if (String(access.client.slug).toLowerCase() !== String(clientSlug).toLowerCase()) {
        return { error: { status: 400, message: "Vehicle does not belong to the selected client" } };
      }
    }
    return {
      vehicle_id: data.id,
      vehicle_number: data.vehicle_number,
      vehicle_name: data.vehicle_name ?? null,
      vehicle_type: data.vehicle_type ?? null,
      registration_number: data.registration_number ?? null,
    };
  }

  if (freeText) {
    return {
      vehicle_id: null,
      vehicle_number: freeText,
      vehicle_name: null,
      vehicle_type: null,
      registration_number: null,
    };
  }

  return {
    vehicle_id: null,
    vehicle_number: null,
    vehicle_name: null,
    vehicle_type: null,
    registration_number: null,
  };
}

export function buildVehicleExportCsv(vehicles) {
  const header = [
    "Vehicle Number",
    "Vehicle Type",
    "Vehicle Name",
    "Registration Number",
    "Description",
    "Status",
  ];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const v of vehicles) {
    lines.push(
      [
        escape(v.vehicle_number),
        escape(v.vehicle_type),
        escape(v.vehicle_name),
        escape(v.registration_number),
        escape(v.description),
        escape(v.is_active === false ? "Inactive" : "Active"),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildVehicleImportErrorsCsv(errors) {
  const header = ["Row", "Vehicle Number", "Error"];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const e of errors) {
    lines.push([escape(e.row), escape(e.vehicle_number), escape(e.error)].join(","));
  }
  return `${lines.join("\n")}\n`;
}
