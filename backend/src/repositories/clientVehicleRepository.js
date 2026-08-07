import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

function vehicleInsertToPrisma(insert) {
  return {
    organisationId: insert.organisation_id,
    clientId: insert.client_id,
    vehicleNumber: insert.vehicle_number,
    vehicleType: insert.vehicle_type ?? null,
    vehicleName: insert.vehicle_name ?? null,
    registrationNumber: insert.registration_number ?? null,
    description: insert.description ?? null,
    isActive: insert.is_active !== false,
    createdBy: insert.created_by ?? null,
    updatedBy: insert.updated_by ?? null,
    updatedAt: insert.updated_at ? new Date(insert.updated_at) : new Date(),
  };
}

function vehiclePatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  if (Object.prototype.hasOwnProperty.call(patch, "vehicle_number")) data.vehicleNumber = patch.vehicle_number;
  if (Object.prototype.hasOwnProperty.call(patch, "vehicle_type")) data.vehicleType = patch.vehicle_type;
  if (Object.prototype.hasOwnProperty.call(patch, "vehicle_name")) data.vehicleName = patch.vehicle_name;
  if (Object.prototype.hasOwnProperty.call(patch, "registration_number")) {
    data.registrationNumber = patch.registration_number;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "description")) data.description = patch.description;
  if (Object.prototype.hasOwnProperty.call(patch, "is_active")) data.isActive = Boolean(patch.is_active);
  if (Object.prototype.hasOwnProperty.call(patch, "updated_by")) data.updatedBy = patch.updated_by;
  data.updatedAt = patch.updated_at ? new Date(String(patch.updated_at)) : new Date();
  return data;
}

/**
 * @param {{ clientId: string, organisationId?: string | null, activeOnly?: boolean, search?: string | null }} opts
 */
export async function listClientVehiclesQuery({ clientId, organisationId = null, activeOnly = false, search = null }) {
  try {
    /** @type {import('@prisma/client').Prisma.ClientVehicleWhereInput} */
    const where = { clientId };
    if (organisationId) where.organisationId = organisationId;
    if (activeOnly) where.isActive = true;
    const q = search != null ? String(search).trim() : "";
    if (q) {
      where.OR = [
        { vehicleNumber: { contains: q, mode: "insensitive" } },
        { vehicleName: { contains: q, mode: "insensitive" } },
        { vehicleType: { contains: q, mode: "insensitive" } },
        { registrationNumber: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }
    const rows = await prisma.clientVehicle.findMany({
      where,
      orderBy: [{ vehicleNumber: "asc" }, { createdAt: "asc" }],
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: [], error: toSupabaseStyleError(err) };
  }
}

export async function getClientVehicleByIdRow(id) {
  try {
    const row = await prisma.clientVehicle.findUnique({ where: { id } });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findClientVehicleByNumber(clientId, vehicleNumber) {
  try {
    const row = await prisma.clientVehicle.findFirst({
      where: {
        clientId,
        vehicleNumber: String(vehicleNumber).trim().toUpperCase(),
      },
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function insertClientVehicleRow(insert) {
  try {
    const row = await prisma.clientVehicle.create({
      data: vehicleInsertToPrisma(insert),
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function updateClientVehicleRow(id, patch) {
  try {
    const row = await prisma.clientVehicle.update({
      where: { id },
      data: vehiclePatchToPrisma(patch),
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function deleteClientVehicleRow(id) {
  try {
    await prisma.clientVehicle.delete({ where: { id } });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function countTicketsUsingVehicle(vehicleId) {
  try {
    const count = await prisma.ticket.count({ where: { vehicleId } });
    return { count, error: null };
  } catch (err) {
    return { count: 0, error: toSupabaseStyleError(err) };
  }
}

export async function countClientVehicles(clientId, organisationId = null) {
  try {
    const where = { clientId };
    if (organisationId) where.organisationId = organisationId;
    const total = await prisma.clientVehicle.count({ where });
    const active = await prisma.clientVehicle.count({ where: { ...where, isActive: true } });
    return { total, active, error: null };
  } catch (err) {
    return { total: 0, active: 0, error: toSupabaseStyleError(err) };
  }
}
