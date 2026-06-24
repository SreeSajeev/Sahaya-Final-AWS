import { afterEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { cleanupTestData, loadSeedIds } from "../helpers/db.js";
import { runDailyReportsForAllTenants } from "../../src/services/dailyTenantReportService.js";

describeIfDb("daily report integration", () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  it("runDailyReportsForAllTenants dry-run completes without throw", async () => {
    const seed = await loadSeedIds();
    if (!seed?.org) {
      console.warn("[reports] seed data missing — run npm run seed:test first");
    }
    const outcome = await runDailyReportsForAllTenants({ dryRun: true });
    expect(outcome).toBeTruthy();
    expect(Array.isArray(outcome.results)).toBe(true);
  });
});
