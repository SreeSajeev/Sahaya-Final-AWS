import { prisma } from "../db/prisma.js";

const columnCache = new Map();

async function hasPublicColumnPrisma(tableName, columnName) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
       LIMIT 1`,
      tableName,
      columnName
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.warn("[schema-compat] prisma column lookup failed:", tableName, columnName, err?.message || err);
    return false;
  }
}

/**
 * Returns true when public.<tableName> has <columnName>.
 * Cached for process lifetime to avoid repeated metadata lookups.
 */
export async function hasPublicColumn(tableName, columnName) {
  const cacheKey = `${tableName}:${columnName}`;
  if (columnCache.has(cacheKey)) return columnCache.get(cacheKey);

  try {
    const exists = await hasPublicColumnPrisma(tableName, columnName);
    columnCache.set(cacheKey, exists);
    return exists;
  } catch (err) {
    console.warn(
      "[schema-compat] column lookup exception:",
      tableName,
      columnName,
      err?.message || err
    );
    columnCache.set(cacheKey, false);
    return false;
  }
}
