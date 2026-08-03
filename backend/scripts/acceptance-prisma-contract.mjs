#!/usr/bin/env node
/**
 * TEST-only: Compare every Prisma model field against live PostgreSQL information_schema.
 * No secrets. No Supabase. No writes.
 */
import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/db/prisma.js";

function mapPrismaScalarToPgHints(field) {
  const t = field.type;
  const native = field.nativeType?.[0];
  if (native === "Uuid") return ["uuid"];
  if (native === "Json" || t === "Json") return ["json", "jsonb"];
  if (native === "Timestamptz") return ["timestamp with time zone"];
  if (native === "Timestamp") return ["timestamp without time zone", "timestamp with time zone"];
  if (native === "Date") return ["date"];
  if (native === "Decimal" || t === "Decimal") return ["numeric", "decimal"];
  if (native === "Char") return ["character", "char", "character varying", "text"];
  if (t === "String") return ["text", "character varying", "uuid", "character", "char"];
  if (t === "Boolean") return ["boolean"];
  if (t === "Int") return ["integer", "smallint", "bigint"];
  if (t === "Float") return ["double precision", "real", "numeric"];
  if (t === "DateTime") return ["timestamp without time zone", "timestamp with time zone", "date"];
  if (t === "BigInt") return ["bigint"];
  return null;
}

const models = Prisma.dmmf.datamodel.models;
const pgCols = await prisma.$queryRawUnsafe(`
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`);
const byTable = new Map();
for (const c of pgCols) {
  if (!byTable.has(c.table_name)) byTable.set(c.table_name, new Map());
  byTable.get(c.table_name).set(c.column_name, c);
}

const pgTables = await prisma.$queryRawUnsafe(`
  SELECT tablename FROM pg_tables where schemaname='public' order by 1
`);
const pgTableSet = new Set(pgTables.map((t) => t.tablename));

let missingCol = 0;
let typeMismatch = 0;
let nullMismatch = 0;
let okModels = 0;

console.log("=== PRISMA ↔ PG CONTRACT ===");
for (const model of models) {
  const table = model.dbName || model.name;
  const cols = byTable.get(table);
  if (!cols) {
    console.log(`FAIL\t${model.name}\t${table}\tTABLE_MISSING`);
    missingCol++;
    continue;
  }
  let modelOk = true;
  const scalarFields = model.fields.filter((f) => f.kind === "scalar");
  for (const f of scalarFields) {
    const col = f.dbName || f.name;
    const pg = cols.get(col);
    if (!pg) {
      console.log(`FAIL\t${model.name}\t${table}.${col}\tPRISMA_COL_MISSING_IN_PG`);
      missingCol++;
      modelOk = false;
      continue;
    }
    const hints = mapPrismaScalarToPgHints(f);
    if (hints && !hints.includes(pg.data_type)) {
      console.log(
        `WARN\t${model.name}\t${table}.${col}\tTYPE prisma=${f.type}/${f.nativeType?.[0] || "-"} pg=${pg.data_type}`
      );
      typeMismatch++;
      // soft: don't fail model for timestamp(tz) variance alone
      if (!(f.type === "DateTime" && String(pg.data_type).includes("timestamp"))) {
        modelOk = false;
      }
    }
    const prismaOptional = f.isRequired === false;
    const pgNullable = pg.is_nullable === "YES";
    // Prisma optional often maps to nullable; required may still be nullable in PG with default — soft warn
    if (!prismaOptional && pgNullable && !pg.column_default) {
      console.log(`WARN\t${model.name}\t${table}.${col}\tNULLABILITY prisma=required pg=nullable_no_default`);
      nullMismatch++;
    }
  }
  // Extra PG columns not in Prisma
  const prismaCols = new Set(scalarFields.map((f) => f.dbName || f.name));
  for (const colName of cols.keys()) {
    if (!prismaCols.has(colName)) {
      console.log(`INFO\t${model.name}\t${table}.${colName}\tPG_COL_NOT_IN_PRISMA`);
    }
  }
  if (modelOk) {
    okModels++;
    console.log(`OK\t${model.name}\t${table}\tCONTRACT`);
  } else {
    console.log(`DRIFT\t${model.name}\t${table}\tSEE_FAILS`);
  }
}

const prismaTables = new Set(models.map((m) => m.dbName || m.name));
console.log("=== PG TABLES NOT IN PRISMA ===");
for (const t of [...pgTableSet].sort()) {
  if (!prismaTables.has(t) && t !== "_prisma_migrations") {
    console.log(`EXTRA_TABLE\t${t}`);
  }
}

console.log("=== SUMMARY ===");
console.log(
  JSON.stringify({
    models: models.length,
    okModels,
    missingCol,
    typeMismatchWarns: typeMismatch,
    nullMismatchWarns: nullMismatch,
    contractPass: missingCol === 0,
  })
);

await prisma.$disconnect();
process.exit(missingCol === 0 ? 0 : 2);
