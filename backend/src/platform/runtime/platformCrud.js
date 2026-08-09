/**
 * Generic JSON-config CRUD against platform_* tables (raw SQL, tenant-scoped).
 * Table/column names come ONLY from static allowlists — never from request input.
 */
import { prisma } from "../../db/prisma.js";
import crypto from "crypto";
import { assertPlatformTable, assertPlatformColumn, assertPlatformColumns } from "./platformSqlAllowlist.js";

function isMissingTable(err) {
  return err?.code === "42P01" || String(err?.message || "").includes("does not exist");
}

function denyResult(err) {
  return { data: null, error: err };
}

export async function listByOrg(table, organisationId, { limit = 100, offset = 0 } = {}) {
  let safeTable;
  try {
    safeTable = assertPlatformTable(table);
  } catch (err) {
    return denyResult(err);
  }
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM ${safeTable}
       WHERE organisation_id = $1::uuid
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT $2 OFFSET $3`,
      String(organisationId),
      Number(limit),
      Number(offset)
    );
    return { data: rows || [], error: null };
  } catch (err) {
    if (isMissingTable(err)) return { data: [], error: null };
    return { data: null, error: err };
  }
}

export async function getByOrgAndKey(table, organisationId, key) {
  let safeTable;
  try {
    safeTable = assertPlatformTable(table);
  } catch (err) {
    return denyResult(err);
  }
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM ${safeTable}
       WHERE organisation_id = $1::uuid AND key = $2
       LIMIT 1`,
      String(organisationId),
      String(key)
    );
    return { data: rows?.[0] || null, error: null };
  } catch (err) {
    if (isMissingTable(err)) return { data: null, error: null };
    return { data: null, error: err };
  }
}

export async function getById(table, organisationId, id) {
  let safeTable;
  try {
    safeTable = assertPlatformTable(table);
  } catch (err) {
    return denyResult(err);
  }
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT * FROM ${safeTable}
       WHERE organisation_id = $1::uuid AND id = $2::uuid
       LIMIT 1`,
      String(organisationId),
      String(id)
    );
    return { data: rows?.[0] || null, error: null };
  } catch (err) {
    if (isMissingTable(err)) return { data: null, error: null };
    return { data: null, error: err };
  }
}

/**
 * Upsert a keyed config entity. `jsonColumns` maps column → object.
 */
export async function upsertKeyedEntity(table, organisationId, { key, name, status = "draft", jsonColumns = {}, extra = {} }) {
  let safeTable;
  try {
    safeTable = assertPlatformTable(table);
    assertPlatformColumns([
      "id",
      "organisation_id",
      "key",
      "name",
      "status",
      "created_at",
      "updated_at",
      ...Object.keys(jsonColumns),
      ...Object.keys(extra),
    ]);
  } catch (err) {
    return denyResult(err);
  }

  const id = crypto.randomUUID();
  const cols = ["id", "organisation_id", "key", "name", "status", "created_at", "updated_at"];
  const vals = ["$1::uuid", "$2::uuid", "$3", "$4", "$5", "NOW()", "NOW()"];
  const params = [id, String(organisationId), String(key), String(name || key), String(status)];
  let i = 6;
  const updateSets = ["name = EXCLUDED.name", "status = EXCLUDED.status", "updated_at = NOW()"];

  for (const [col, value] of Object.entries(jsonColumns)) {
    const safeCol = assertPlatformColumn(col);
    cols.push(safeCol);
    vals.push(`$${i}::jsonb`);
    params.push(JSON.stringify(value ?? {}));
    updateSets.push(`${safeCol} = EXCLUDED.${safeCol}`);
    i += 1;
  }
  for (const [col, value] of Object.entries(extra)) {
    const safeCol = assertPlatformColumn(col);
    cols.push(safeCol);
    vals.push(`$${i}`);
    params.push(value);
    updateSets.push(`${safeCol} = EXCLUDED.${safeCol}`);
    i += 1;
  }

  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO ${safeTable} (${cols.join(", ")})
       VALUES (${vals.join(", ")})
       ON CONFLICT (organisation_id, key) DO UPDATE SET ${updateSets.join(", ")}`,
      ...params
    );
    return getByOrgAndKey(safeTable, organisationId, key);
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function softArchive(table, organisationId, id) {
  let safeTable;
  try {
    safeTable = assertPlatformTable(table);
  } catch (err) {
    return { ok: false, error: err };
  }
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE ${safeTable}
       SET status = 'archived', updated_at = NOW()
       WHERE organisation_id = $1::uuid AND id = $2::uuid`,
      String(organisationId),
      String(id)
    );
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err };
  }
}
