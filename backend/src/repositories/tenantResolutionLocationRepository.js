import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

const fields = {
  organisation_id: "organisationId", name: "name", code: "code", description: "description",
  is_active: "isActive", created_at: "createdAt", updated_at: "updatedAt",
  created_by: "createdBy", updated_by: "updatedBy",
};
function toPrisma(row) {
  const data = {};
  for (const [snake, camel] of Object.entries(fields)) {
    if (!Object.hasOwn(row, snake)) continue;
    data[camel] = snake.endsWith("_at") && row[snake] ? new Date(row[snake]) : row[snake];
  }
  return data;
}
export async function listResolutionLocations({ organisationId, search, activeOnly = false } = {}) {
  try {
    const q = String(search || "").trim();
    const rows = await prisma.tenantResolutionLocation.findMany({
      where: { ...(organisationId ? { organisationId } : {}), ...(activeOnly ? { isActive: true } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}) },
      orderBy: [{ name: "asc" }],
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (error) { return { data: [], error: toSupabaseStyleError(error) }; }
}
export async function getResolutionLocationById(id) {
  try { return { data: mapPrismaRowToSnake(await prisma.tenantResolutionLocation.findUnique({ where: { id } })), error: null }; }
  catch (error) { return { data: null, error: toSupabaseStyleError(error) }; }
}
export async function insertResolutionLocation(row) {
  try { return { data: mapPrismaRowToSnake(await prisma.tenantResolutionLocation.create({ data: toPrisma(row) })), error: null }; }
  catch (error) { return { data: null, error: toSupabaseStyleError(error) }; }
}
export async function updateResolutionLocationById(id, patch) {
  try { return { data: mapPrismaRowToSnake(await prisma.tenantResolutionLocation.update({ where: { id }, data: toPrisma(patch) })), error: null }; }
  catch (error) { return { data: null, error: toSupabaseStyleError(error) }; }
}
