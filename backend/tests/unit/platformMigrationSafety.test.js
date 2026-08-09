/**
 * Migration safety: platform migrations must be additive-only vs legacy tables.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../prisma/migrations");

const LEGACY_TABLES = [
  "tickets",
  "ticket_assignments",
  "ticket_comments",
  "organisations",
  "users",
  "field_executives",
  "sla_tracking",
  "raw_emails",
  "fe_action_tokens",
];

describe("platform migration safety", () => {
  it("platform migrations never ALTER/DROP legacy tables", () => {
    const dirs = fs
      .readdirSync(migrationsDir)
      .filter((d) => d.includes("platform"))
      .sort();
    expect(dirs.length).toBeGreaterThan(0);

    for (const dir of dirs) {
      const sqlPath = path.join(migrationsDir, dir, "migration.sql");
      const sql = fs.readFileSync(sqlPath, "utf8").toLowerCase();
      for (const table of LEGACY_TABLES) {
        expect(sql).not.toMatch(new RegExp(`alter\\s+table\\s+${table}\\b`));
        expect(sql).not.toMatch(new RegExp(`drop\\s+table\\s+${table}\\b`));
        expect(sql).not.toMatch(new RegExp(`truncate\\s+table\\s+${table}\\b`));
      }
      // Must be create-oriented
      expect(sql).toContain("create table");
    }
  });
});
