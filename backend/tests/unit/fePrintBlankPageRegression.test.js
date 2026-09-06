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
});
