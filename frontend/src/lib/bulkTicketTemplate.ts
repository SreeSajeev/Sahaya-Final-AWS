import { rowsToCsv } from "@/lib/csvExport";
import { BULK_TICKET_TEMPLATE_HEADERS } from "@/lib/bulkTicketImportFeature";

const EXAMPLE_ROW = [
  "hitachi",
  "KA51AF2857",
  "Telematics",
  "GPS NOT WORKING",
  "Bangalore",
  "Karnataka",
  "false",
  "",
  "Optional notes",
];

export function downloadBulkTicketTemplate(): void {
  const header = [...BULK_TICKET_TEMPLATE_HEADERS];
  const csv = rowsToCsv([header, EXAMPLE_ROW]);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bulk-ticket-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
