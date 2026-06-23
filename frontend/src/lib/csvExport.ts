/**
 * Frontend-only CSV download utility.
 * Creates a blob and triggers browser download. No backend.
 */

/**
 * Escape a CSV cell (wrap in quotes if contains comma, quote, or newline).
 */
function escapeCsvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Convert rows (array of string arrays) to a CSV string (RFC 4180 style).
 */
export function rowsToCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

/**
 * Trigger browser download of CSV content.
 * @param data - CSV string or array of rows (will be converted to CSV)
 * @param filename - e.g. "ticket-summary-org-2025-02-19.csv"
 */
export function createCSVDownload(
  data: string | (string | number | null | undefined)[][],
  filename: string
): void {
  const csv = typeof data === "string" ? data : rowsToCsv(data);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
