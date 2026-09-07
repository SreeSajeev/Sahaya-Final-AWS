/**
 * Unit checks for FE printable ticket HTML (blank-print regression).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const printSrc = readFileSync(
  join(here, "../../../frontend/src/lib/feTicketPrint.ts"),
  "utf8"
);
const visitSrc = readFileSync(
  join(here, "../../../frontend/src/lib/feFieldVisitExport.ts"),
  "utf8"
);

describe("FE print window open (blank page regression)", () => {
  it("does not pass noopener/noreferrer in window.open features with document.write", () => {
    expect(printSrc).toMatch(/function openPrintHtmlDocument/);
    expect(printSrc).toMatch(/window\.open\('', '_blank', 'width=900,height=700'\)/);
    expect(printSrc).not.toMatch(/window\.open\([^)]*noopener/);
    expect(visitSrc).toMatch(/openPrintHtmlDocument\(html\)/);
    expect(visitSrc).not.toMatch(/window\.open\('', '_blank', 'noopener/);
  });

  it("individual print HTML includes remarks and incident title fields", () => {
    expect(printSrc).toMatch(/Incident Title/);
    expect(printSrc).toMatch(/Initial Remarks/);
    expect(printSrc).toMatch(/Assignment Remarks/);
    expect(printSrc).toMatch(/Additional Remarks/);
  });

  it("bulk field visit print includes remarks timeline", () => {
    expect(visitSrc).toMatch(/Remarks \/ Timeline/);
    expect(visitSrc).toMatch(/combineTicketRemarks/);
  });

  it("bulk export supports CSV and Excel and empty date-range message", () => {
    expect(visitSrc).toMatch(/downloadFieldVisitCsv/);
    expect(visitSrc).toMatch(/downloadFieldVisitExcel/);
    expect(visitSrc).toMatch(/No assigned tickets found for this date range/);
  });

  it("FE My Tickets wires date-range generate + print/csv/excel for assigned tickets only", () => {
    const myTicketsSrc = readFileSync(
      join(here, "../../../frontend/src/pages/FEMyTickets.tsx"),
      "utf8"
    );
    expect(myTicketsSrc).toMatch(/filterFETicketsByDateRange\(displayedTickets/);
    expect(myTicketsSrc).toMatch(/openFieldVisitPrintWindow/);
    expect(myTicketsSrc).toMatch(/downloadFieldVisitCsv/);
    expect(myTicketsSrc).toMatch(/downloadFieldVisitExcel/);
    expect(myTicketsSrc).toMatch(/loadRemarksForTickets/);
  });

  it("FE individual ticket view uses openPrintHtmlDocument path via print helper", () => {
    const viewSrc = readFileSync(
      join(here, "../../../frontend/src/pages/FETicketView.tsx"),
      "utf8"
    );
    expect(viewSrc).toMatch(/printFETicket|feTicketPrint|openPrintHtmlDocument|buildFeTicketPrintHtml/);
    expect(viewSrc).toMatch(/comments-batch/);
  });
});
