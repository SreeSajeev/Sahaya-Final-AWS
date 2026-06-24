/**
 * Map Prisma rows (camelCase) to Supabase/PostgREST snake_case shapes for API parity.
 */

/** @param {string} key */
function camelToSnake(key) {
  return key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function serializeValue(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && typeof value.toNumber === "function") {
    return Number(value.toNumber());
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === "object") return mapPrismaRowToSnake(value);
  return value;
}

/**
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {Record<string, unknown> | null}
 */
export function mapPrismaRowToSnake(row) {
  if (!row || typeof row !== "object") return null;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[camelToSnake(key)] = serializeValue(value);
  }
  return out;
}

/**
 * @param {unknown[]} rows
 * @returns {Record<string, unknown>[]}
 */
export function mapPrismaRowsToSnake(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => mapPrismaRowToSnake(/** @type {Record<string, unknown>} */ (r))).filter(Boolean);
}

/**
 * Map parsed_email row including nested raw_emails relation (Supabase join shape).
 * @param {Record<string, unknown> | null | undefined} row
 */
export function mapParsedEmailWithRawEmail(row) {
  if (!row) return null;
  const mapped = mapPrismaRowToSnake(row);
  if (!mapped) return null;
  const nested = row.rawEmail ?? row.raw_emails;
  if (nested && typeof nested === "object") {
    mapped.raw_emails = mapPrismaRowToSnake(/** @type {Record<string, unknown>} */ (nested));
  }
  delete mapped.raw_email;
  return mapped;
}
