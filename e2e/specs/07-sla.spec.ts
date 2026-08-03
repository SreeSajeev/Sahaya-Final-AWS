import { test, expect } from "@playwright/test";
import { api, hasCreds, login } from "../helpers/api";
import { browserLogin } from "../helpers/auth";

test.describe("SLA", () => {
  test("monitor + tracked-count reconciles with totalSlaRows", async () => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    await new Promise((r) => setTimeout(r, 1500));
    const sess = await login("SUPER_ADMIN");
    expect(sess.status).toBe(200);
    const token = sess.accessToken!;

    const monitor = await api("GET", "/data/sla/monitor?limit=10", { token });
    expect(monitor.status).toBe(200);

    const tracked = await api("GET", "/data/sla/tracked-count", { token });
    expect(tracked.status).toBe(200);
    expect(typeof tracked.json?.count).toBe("number");
    expect(typeof tracked.json?.totalSlaRows).toBe("number");
    expect(tracked.json.totalSlaRows).toBeGreaterThanOrEqual(tracked.json.count);
    expect(tracked.json.byStatus).toBeTruthy();
  });
  test("browser SLA page", async ({ page }) => {
    test.skip(!hasCreds("SUPER_ADMIN") && !hasCreds("ADMIN"), "missing creds");
    const role = hasCreds("SUPER_ADMIN") ? "SUPER_ADMIN" : "ADMIN";
    await browserLogin(page, role as "SUPER_ADMIN" | "ADMIN");
    await page.goto("/app/sla");
    await expect(page.locator("body")).toBeVisible();
  });
});
