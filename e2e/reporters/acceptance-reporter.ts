import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Row = {
  title: string;
  file: string;
  status: string;
  error?: string;
};

class AcceptanceReporter implements Reporter {
  private rows: Row[] = [];
  private started = Date.now();

  onBegin(_config: FullConfig, _suite: Suite) {
    this.started = Date.now();
  }

  onTestEnd(test: TestCase, result: TestResult) {
    this.rows.push({
      title: test.titlePath().slice(1).join(" › "),
      file: test.location.file,
      status: result.status,
      error: result.error?.message?.slice(0, 240),
    });
  }

  onEnd(result: FullResult) {
    const passed = this.rows.filter((r) => r.status === "passed").length;
    const failed = this.rows.filter((r) => r.status === "failed" || r.status === "timedOut").length;
    const skipped = this.rows.filter((r) => r.status === "skipped").length;
    const verdict =
      result.status === "passed" && failed === 0
        ? "PASS — FULL PLATFORM ACCEPTED END TO END"
        : "FAIL — Remaining blockers listed";

    const md = [
      "# Sahaya TEST — Playwright Full Platform Acceptance Report",
      "",
      `**Generated (UTC):** ${new Date().toISOString()}`,
      `**Duration ms:** ${Date.now() - this.started}`,
      `**Playwright status:** ${result.status}`,
      `**Passed:** ${passed}  **Failed:** ${failed}  **Skipped:** ${skipped}`,
      "",
      `## Verdict`,
      "",
      `**${verdict}**`,
      "",
      "## Results",
      "",
      "| Status | Spec |",
      "|--------|------|",
      ...this.rows.map(
        (r) =>
          `| ${r.status} | ${r.title.replace(/\|/g, "/")} |${
            r.error ? ` ${r.error.replace(/\|/g, "/").replace(/\n/g, " ")}` : ""
          }`
      ),
      "",
      "## Failures",
      "",
      ...(failed
        ? this.rows
            .filter((r) => r.status === "failed" || r.status === "timedOut")
            .map((r) => `- **${r.title}**: ${r.error || "unknown"}`)
        : ["_None_"]),
      "",
    ].join("\n");

    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(here, "../../docs/migration/playwright-acceptance-report.md");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, md, "utf8");
    writeFileSync(resolve(here, "../acceptance-summary.json"), JSON.stringify({ verdict, passed, failed, skipped, rows: this.rows }, null, 2));
    // eslint-disable-next-line no-console
    console.log(`\n[acceptance-reporter] wrote ${out}\nVerdict: ${verdict}\n`);
  }
}

export default AcceptanceReporter;
