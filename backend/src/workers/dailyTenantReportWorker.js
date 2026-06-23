import { logEvent } from "../utils/structuredLog.js";
import { shouldRunDailyReportNow } from "../utils/reportDateWindow.js";
import { runDailyReportsForAllTenants } from "../services/dailyTenantReportService.js";

function isEnabled() {
  return String(process.env.DAILY_TENANT_REPORT_ENABLED || "false").toLowerCase() === "true";
}

function isDryRun() {
  return String(process.env.DAILY_REPORT_DRY_RUN || "false").toLowerCase() === "true";
}

function getRunHourIst() {
  const n = Number(process.env.DAILY_REPORT_HOUR_IST);
  if (Number.isFinite(n) && n >= 0 && n <= 23) return n;
  return 7;
}

let running = false;

/**
 * Sends one daily operations report per active organisation (previous IST calendar day).
 */
export async function runDailyTenantReportWorker() {
  if (!isEnabled()) return;
  if (!shouldRunDailyReportNow(new Date(), getRunHourIst())) return;
  if (running) return;

  running = true;
  const dryRun = isDryRun();
  const startedAt = Date.now();

  try {
    logEvent("dailyTenantReport.worker.start", { dryRun });
    const outcome = await runDailyReportsForAllTenants({ dryRun });
    logEvent("dailyTenantReport.worker.done", {
      dryRun,
      ms: Date.now() - startedAt,
      orgCount: outcome.results.length,
    });
  } catch (err) {
    console.error("[DAILY_REPORT] worker failed", err.message);
    logEvent("dailyTenantReport.worker.error", { message: err.message });
  } finally {
    running = false;
  }
}
