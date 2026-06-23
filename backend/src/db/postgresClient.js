import pg from "pg";

const { Pool } = pg;

let poolSingleton = null;

function buildPgConfigFromEnv() {
  // Prefer DATABASE_URL if provided (recommended for AWS/RDS).
  if (process.env.DATABASE_URL && String(process.env.DATABASE_URL).trim() !== "") {
    return {
      connectionString: process.env.DATABASE_URL,
      // If your AWS team requires SSL, set:
      // ssl: { rejectUnauthorized: false }
      ssl:
        String(process.env.PGSSL || "").toLowerCase() === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    };
  }

  // Fallback to discrete PG* env vars.
  // This matches what your team shared (host/user/port/password/database).
  const host = process.env.PGHOST || "localhost";
  const user = process.env.PGUSER || "";
  const password = process.env.PGPASSWORD || "";
  const database = process.env.PGDATABASE || "";
  const port = Number(process.env.PGPORT || "5432");

  return {
    host,
    user,
    password,
    database,
    port,
    ssl:
      String(process.env.PGSSL || "").toLowerCase() === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

export function getPgPool() {
  if (poolSingleton) return poolSingleton;
  const config = buildPgConfigFromEnv();
  poolSingleton = new Pool(config);
  return poolSingleton;
}

export async function pgQuery(text, params) {
  const pool = getPgPool();
  return await pool.query(text, params);
}

