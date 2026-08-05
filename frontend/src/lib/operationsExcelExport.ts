/**
 * Excel (.xlsx) exports for Analytics — composes existing CSV report builders into workbooks.
 * Additive only; does not alter ticket lifecycle or API behavior.
 */

import ExcelJS from "exceljs";
import type {
  FeScorecard,
  OperationalHealth,
  ExecutiveSummary,
  TeamOperationsSummary,
  ServiceManagerScorecard,
  ManagementHighlights,
} from "@/lib/analyticsMetrics";
import { feScorecardsToCsvRows, smScorecardsToCsvRows } from "@/lib/analyticsMetrics";
import {
  buildEnrichmentMapsFromContext,
  buildOperationsReportRows,
  buildSlaReportRows,
  buildResolutionReportRows,
  buildVerificationReportRows,
} from "@/lib/operationsReportExport";
import { todayIST } from "@/lib/dateUtils";

const HEADER_FILL = "FF1E3A5F";
const HEADER_FONT = "FFFFFFFF";
const SECTION_FILLS = {
  ticket: "FF4472C4",
  assignment: "FF808080",
  timeline: "FF5B9BD5",
  resolution: "FFFFC000",
  verification: "FF70AD47",
  sla: "FF2E5090",
} as const;

export type CompleteOperationsReportInput = {
  tickets: Record<string, unknown>[];
  ctx: {
    sla?: Record<string, unknown>[];
    ticket_assignments?: Record<string, unknown>[];
    field_executives?: Record<string, unknown>[];
  };
  feScorecards: FeScorecard[];
  opsHealth?: OperationalHealth;
  executiveSummary?: ExecutiveSummary;
  teamOps?: TeamOperationsSummary;
  smScorecards?: ServiceManagerScorecard[];
  managementHighlights?: ManagementHighlights;
};

function autoSizeColumns(sheet: ExcelJS.Worksheet, maxWidth = 48): void {
  sheet.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value != null ? String(cell.value).length : 0;
      max = Math.max(max, Math.min(len + 2, maxWidth));
    });
    col.width = max;
  });
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: HEADER_FONT } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: "middle", wrapText: true };
}

function addDataSheet(wb: ExcelJS.Workbook, name: string, rows: string[][]): ExcelJS.Worksheet {
  const sheet = wb.addWorksheet(name.slice(0, 31));
  if (rows.length === 0) {
    sheet.addRow(["No data in selected range"]);
    return sheet;
  }
  rows.forEach((r, i) => {
    const row = sheet.addRow(r);
    if (i === 0) styleHeaderRow(row);
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length), column: rows[0]?.length ?? 1 },
  };
  autoSizeColumns(sheet);
  return sheet;
}

/** Operations register with grouped section band (management workbook style). */
function addOperationsReportSheet(wb: ExcelJS.Workbook, rows: string[][]): void {
  const sheet = wb.addWorksheet("Operations Report");
  if (rows.length === 0) {
    sheet.addRow(["No tickets in selected range"]);
    return;
  }

  const [headers, ...dataRows] = rows;
  const colCount = headers.length;

  const sectionRow = new Array(colCount).fill("");
  const bands: { label: string; start: number; end: number; fill: string }[] = [
    { label: "Ticket", start: 1, end: 8, fill: SECTION_FILLS.ticket },
    { label: "Assignment", start: 9, end: 12, fill: SECTION_FILLS.assignment },
    { label: "Timeline", start: 13, end: 14, fill: SECTION_FILLS.timeline },
    { label: "Resolution", start: 15, end: 20, fill: SECTION_FILLS.resolution },
    { label: "Verification", start: 21, end: 21, fill: SECTION_FILLS.verification },
    { label: "SLA", start: 22, end: colCount, fill: SECTION_FILLS.sla },
  ];
  for (const band of bands) {
    sectionRow[band.start - 1] = band.label;
  }

  const r1 = sheet.addRow(sectionRow);
  r1.font = { bold: true, color: { argb: HEADER_FONT } };
  r1.alignment = { horizontal: "center", vertical: "middle" };
  for (const band of bands) {
    for (let c = band.start; c <= Math.min(band.end, colCount); c++) {
      r1.getCell(c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: band.fill },
      };
    }
  }

  const r2 = sheet.addRow(headers);
  styleHeaderRow(r2);
  for (const row of dataRows) sheet.addRow(row);

  sheet.mergeCells(1, 1, 1, 8);
  sheet.mergeCells(1, 9, 1, 12);
  sheet.mergeCells(1, 13, 1, 14);
  sheet.mergeCells(1, 15, 1, 20);
  sheet.mergeCells(1, 22, 1, colCount);

  sheet.views = [{ state: "frozen", ySplit: 2 }];
  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: Math.max(2, dataRows.length + 1), column: colCount },
  };
  autoSizeColumns(sheet);
}

function addKvSheet(
  wb: ExcelJS.Workbook,
  name: string,
  pairs: [string, string | number][]
): void {
  const sheet = wb.addWorksheet(name.slice(0, 31));
  const title = sheet.addRow([name]);
  title.font = { bold: true, size: 14 };
  sheet.addRow([]);
  const hdr = sheet.addRow(["Metric", "Value"]);
  styleHeaderRow(hdr);
  for (const [k, v] of pairs) sheet.addRow([k, v]);
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  autoSizeColumns(sheet);
}

function buildManagementSummaryPairs(input: CompleteOperationsReportInput): [string, string | number][] {
  const { executiveSummary, opsHealth, feScorecards, teamOps, managementHighlights, tickets } =
    input;
  const pairs: [string, string | number][] = [
    ["Report Generated (IST)", todayIST()],
    ["Ticket Count (filtered)", tickets.length],
    [
      "Operational Health Score",
      executiveSummary?.operationalHealthScore ?? opsHealth?.operationalHealthScore ?? "",
    ],
    ["Open Tickets", executiveSummary?.openTickets ?? ""],
    ["Closed Tickets", executiveSummary?.closedTickets ?? ""],
    ["SLA Compliance %", executiveSummary?.slaCompliancePct ?? ""],
    ["Avg Resolution Hours", executiveSummary?.avgResolutionHours ?? ""],
    ["Pending Verification", executiveSummary?.pendingVerification ?? ""],
    [
      "Tickets Requiring Attention",
      executiveSummary?.ticketsRequiringAttention ?? opsHealth?.attentionTickets.length ?? 0,
    ],
    [
      "Active Field Executives",
      feScorecards.filter((f) => f.currentWorkload > 0 || f.closedThisMonth > 0).length,
    ],
  ];

  if (managementHighlights) {
    pairs.push(
      ["Top Performing Executive", managementHighlights.topPerformingExecutive],
      ["Most Active Executive", managementHighlights.mostActiveExecutive],
      ["Highest Workload Executive", managementHighlights.highestWorkload],
      ["Highest Aging Category", managementHighlights.highestAgingCategory],
      ["Most Common Complaint Category", managementHighlights.mostCommonComplaintCategory],
      ["Most Common Resolution Category", managementHighlights.mostCommonResolutionCategory],
      ["Repeat Complaint Count", managementHighlights.repeatComplaintCount],
      ["Unassigned Tickets", managementHighlights.unassignedTickets],
      ["High Aging Tickets", managementHighlights.highAgingTickets],
      ["SLA Breach Tickets", managementHighlights.slaBreachTickets]
    );
  }

  if (teamOps) {
    pairs.push(
      ["Team Productivity %", teamOps.teamProductivityPct],
      ["Team Workload", teamOps.teamWorkload],
      ["Team SLA Compliance %", teamOps.teamSlaCompliancePct],
      ["Assigned-By Coverage %", teamOps.assignedByCoveragePct],
      ["Manager Attribution Note", teamOps.attributionNote]
    );
  }

  return pairs;
}

function buildTeamAnalyticsRows(input: CompleteOperationsReportInput): string[][] {
  const { teamOps, smScorecards } = input;
  if (teamOps?.managerAttributionAvailable && smScorecards?.length) {
    return smScorecardsToCsvRows(smScorecards);
  }

  if (!teamOps) {
    return [["Metric", "Value"], ["Note", "Team analytics unavailable for this export context"]];
  }

  return [
    ["Metric", "Value"],
    ["Pending Approvals", String(teamOps.pendingApproval)],
    ["Pending Verification", String(teamOps.pendingVerification)],
    ["Team Workload", String(teamOps.teamWorkload)],
    ["Team Productivity %", String(teamOps.teamProductivityPct)],
    ["Avg Assignment Hours", teamOps.avgAssignmentHours != null ? String(teamOps.avgAssignmentHours) : ""],
    ["Avg Closure Hours", teamOps.avgClosureHours != null ? String(teamOps.avgClosureHours) : ""],
    ["Team SLA Compliance %", String(teamOps.teamSlaCompliancePct)],
    ["Open Pipeline", String(teamOps.openPipeline)],
    ["Closed Tickets", String(teamOps.closedTickets)],
    ["Failed Attempts", String(teamOps.failedAttempts)],
    ["Assigned-By Coverage %", String(teamOps.assignedByCoveragePct)],
    ["Attribution Note", teamOps.attributionNote],
  ];
}

function buildAttentionCenterRows(opsHealth?: OperationalHealth): string[][] {
  const headers = ["Ticket Number", "Status", "Age (Hours)", "Location", "Reason"];
  const tickets = opsHealth?.attentionTickets ?? [];
  if (tickets.length === 0) {
    return [headers, ["—", "—", "—", "—", "No tickets requiring attention in selected range"]];
  }
  return [
    headers,
    ...tickets.map((t) => [t.ticketNumber, t.status, String(t.ageHours), t.location, t.reason]),
  ];
}

/** Populate a workbook with all management report sheets (reuses CSV report builders). */
export async function populateCompleteOperationsWorkbook(
  wb: ExcelJS.Workbook,
  input: CompleteOperationsReportInput
): Promise<void> {
  const maps = buildEnrichmentMapsFromContext(input.ctx);

  addKvSheet(wb, "Management Summary", buildManagementSummaryPairs(input));
  addOperationsReportSheet(wb, buildOperationsReportRows(input.tickets, maps));
  addDataSheet(wb, "Field Executive Performance", feScorecardsToCsvRows(input.feScorecards));
  addDataSheet(wb, "Team Analytics", buildTeamAnalyticsRows(input));
  addDataSheet(wb, "SLA Report", buildSlaReportRows(input.tickets, maps));
  addDataSheet(wb, "Resolution Report", buildResolutionReportRows(input.tickets, maps));
  addDataSheet(wb, "Verification Report", buildVerificationReportRows(input.tickets, maps));
  addDataSheet(wb, "Attention Center", buildAttentionCenterRows(input.opsHealth));
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** One-click comprehensive management workbook (primary export). */
export async function downloadCompleteOperationsReportExcel(
  input: CompleteOperationsReportInput
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sahaya";
  wb.created = new Date();
  await populateCompleteOperationsWorkbook(wb, input);
  await downloadWorkbook(wb, `sahaya-complete-operations-report-${todayIST()}.xlsx`);
}

/** Backward-compatible alias used by Operations Reports dropdown. */
export async function downloadOperationsWorkbookExcel(
  input: CompleteOperationsReportInput
): Promise<void> {
  await downloadCompleteOperationsReportExcel(input);
}

export async function downloadExecutivePerformanceExcel(feScorecards: FeScorecard[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  addDataSheet(wb, "Field Executive Performance", feScorecardsToCsvRows(feScorecards));
  await downloadWorkbook(wb, `sahaya-fe-performance-${todayIST()}.xlsx`);
}

export async function downloadSlaReportExcel(
  tickets: Record<string, unknown>[],
  ctx: CompleteOperationsReportInput["ctx"]
): Promise<void> {
  const maps = buildEnrichmentMapsFromContext(ctx);
  const wb = new ExcelJS.Workbook();
  addDataSheet(wb, "SLA Report", buildSlaReportRows(tickets, maps));
  await downloadWorkbook(wb, `sahaya-sla-report-${todayIST()}.xlsx`);
}

export async function downloadResolutionReportExcel(
  tickets: Record<string, unknown>[],
  ctx?: CompleteOperationsReportInput["ctx"]
): Promise<void> {
  const maps = ctx ? buildEnrichmentMapsFromContext(ctx) : undefined;
  const wb = new ExcelJS.Workbook();
  addDataSheet(wb, "Resolution Report", buildResolutionReportRows(tickets, maps));
  await downloadWorkbook(wb, `sahaya-resolution-report-${todayIST()}.xlsx`);
}

export async function downloadVerificationReportExcel(
  tickets: Record<string, unknown>[],
  ctx: CompleteOperationsReportInput["ctx"]
): Promise<void> {
  const maps = buildEnrichmentMapsFromContext(ctx);
  const wb = new ExcelJS.Workbook();
  addDataSheet(wb, "Verification Report", buildVerificationReportRows(tickets, maps));
  await downloadWorkbook(wb, `sahaya-verification-report-${todayIST()}.xlsx`);
}

/** @deprecated Use CompleteOperationsReportInput */
export type ExcelOpsExportInput = CompleteOperationsReportInput;
