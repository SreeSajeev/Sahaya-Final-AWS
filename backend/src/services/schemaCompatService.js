import { supabase } from "../supabaseClient.js";

const columnCache = new Map();

/**
 * Returns true when public.<tableName> has <columnName>.
 * Cached for process lifetime to avoid repeated metadata lookups.
 */
export async function hasPublicColumn(tableName, columnName) {
  const cacheKey = `${tableName}:${columnName}`;
  if (columnCache.has(cacheKey)) return columnCache.get(cacheKey);

  try {
    /**
     * Important:
     * Supabase JS uses PostgREST; `information_schema` is not an exposed schema by default.
     * So we probe column existence by issuing a minimal select against the target table.
     */
    const { error } = await supabase.from(tableName).select(columnName).limit(1);
    if (error) {
      const msg = String(error.message || "");
      // Postgres: undefined_column
      if (error.code === "42703" || /column .* does not exist/i.test(msg)) {
        columnCache.set(cacheKey, false);
        return false;
      }
      console.warn("[schema-compat] column probe failed:", tableName, columnName, msg);
      columnCache.set(cacheKey, false);
      return false;
    }

    const exists = true;
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

