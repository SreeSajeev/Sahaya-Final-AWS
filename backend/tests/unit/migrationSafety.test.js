/**
 * Migration / schema safety checks that do not require a live database.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../../prisma/migrations");

function listSqlFiles() {
  const dirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  return dirs
    .map((name) => {
      const sqlPath = path.join(migrationsDir, name, "migration.sql");
      if (!fs.existsSync(sqlPath)) return null;
      return { name, sql: fs.readFileSync(sqlPath, "utf8") };
    })
    .filter(Boolean);
}

describe("21. Database migration safety", () => {
  it("includes service manager assignment migration", () => {
    const names = listSqlFiles().map((m) => m.name);
    expect(names.some((n) => n.includes("service_manager_assignment"))).toBe(true);
  });

  it("does not ship DROP TABLE / TRUNCATE in additive feature migrations", () => {
    const risky = [];
    for (const m of listSqlFiles()) {
      // Allow documented cleanup only if explicitly named destructive (none expected).
      if (/\bDROP\s+TABLE\b/i.test(m.sql) || /\bTRUNCATE\b/i.test(m.sql)) {
        risky.push(m.name);
      }
    }
    expect(risky).toEqual([]);
  });

  it("service manager migration is additive and keeps historical FE rows valid", () => {
    const sm = listSqlFiles().find((m) => m.name.includes("service_manager_assignment"));
    expect(sm).toBeTruthy();
    expect(sm.sql).toMatch(/ADD COLUMN IF NOT EXISTS "assignment_type"/i);
    expect(sm.sql).toMatch(/DEFAULT 'FIELD_EXECUTIVE'/i);
    expect(sm.sql).toMatch(/ALTER COLUMN "fe_id" DROP NOT NULL/i);
    expect(sm.sql).not.toMatch(/\bDROP COLUMN\b/i);
  });
});
