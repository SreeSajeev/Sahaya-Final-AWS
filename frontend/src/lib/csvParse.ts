/**
 * Lightweight RFC 4180-style CSV parser for client-side bulk import (no dependency).
 */

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/** Parse CSV text into rows of string cells (includes header row if present). */
export function parseCsvText(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/).filter((l) => l.trim() !== "");
  return lines.map(parseCsvLine);
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function headerSatisfiesColumn(
  headerRow: string[],
  key: string,
  aliases?: readonly string[]
): boolean {
  if (aliases?.length) {
    return aliases.some((alias) => headerRow.includes(normalizeHeader(alias)));
  }
  return headerRow.includes(key);
}

function readColumnCell(
  headerRow: string[],
  cells: string[],
  key: string,
  aliases?: readonly string[]
): string {
  const lookupKeys = aliases?.length ? aliases.map(normalizeHeader) : [key];
  for (const lookupKey of lookupKeys) {
    const idx = headerRow.indexOf(lookupKey);
    if (idx >= 0) {
      const value = String(cells[idx] ?? "").trim();
      if (value) return value;
    }
  }
  const idx = headerRow.indexOf(key);
  return idx >= 0 ? String(cells[idx] ?? "").trim() : "";
}

export type CsvRowsToObjectsOptions = {
  /** When the canonical header is absent, accept any alias header (e.g. record_id → complaint_id). */
  columnAliases?: Partial<Record<string, readonly string[]>>;
};

/** Map CSV rows to objects using first row as headers. */
export function csvRowsToObjects(
  matrix: string[][],
  expectedHeaders: readonly string[],
  options?: CsvRowsToObjectsOptions
): { rows: Record<string, string>[]; error?: string } {
  if (matrix.length < 2) {
    return { rows: [], error: "CSV must include a header row and at least one data row" };
  }

  const headerRow = matrix[0].map(normalizeHeader);
  const expected = expectedHeaders.map(normalizeHeader);
  const columnAliases = options?.columnAliases ?? {};
  const missing = expected.filter((h) => {
    const canonical = expectedHeaders[expected.indexOf(h)] ?? h;
    const aliases = columnAliases[canonical as keyof typeof columnAliases];
    return !headerSatisfiesColumn(headerRow, h, aliases);
  });
  if (missing.length > 0) {
    return {
      rows: [],
      error: `Missing required column(s): ${missing.join(", ")}`,
    };
  }

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i];
    const allEmpty = cells.every((c) => !String(c).trim());
    if (allEmpty) continue;

    const obj: Record<string, string> = { row: String(i + 1) };
    for (let j = 0; j < expected.length; j++) {
      const key = expected[j];
      const canonical = expectedHeaders[j];
      const aliases = columnAliases[canonical as keyof typeof columnAliases];
      obj[key] = readColumnCell(headerRow, cells, key, aliases);
    }
    rows.push(obj);
  }

  if (rows.length === 0) {
    return { rows: [], error: "No data rows found in CSV" };
  }

  return { rows };
}
