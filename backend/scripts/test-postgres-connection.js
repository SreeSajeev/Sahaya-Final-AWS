import dotenv from "dotenv";
dotenv.config();

import { pgQuery } from "../src/db/postgresClient.js";

async function main() {
  const startedAt = Date.now();
  try {
    const res = await pgQuery("select now() as now, current_database() as db, current_user as usr");
    console.log("[pg] ok", res.rows?.[0] || null, "ms=", Date.now() - startedAt);
    process.exit(0);
  } catch (err) {
    console.error("[pg] failed", err?.message || err);
    process.exit(1);
  }
}

main();

