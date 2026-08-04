import { test, expect } from "@playwright/test";
import { api, hasCreds, login } from "../helpers/api";
import { browserLogin } from "../helpers/auth";

test.describe("Dashboard", () => {
  test("API dashboard stats load for SUPER_ADMIN", async () => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    const sess = await login("SUPER_ADMIN");
    const res = await api("GET", "/data/dashboard/stats", { token: sess.accessToken });
    expect(res.status).toBe(200);
    expect(res.json).toBeTruthy();
  });

  test("tenant dashboard shell loads for ADMIN", async ({ page }) => {
    test.skip(!hasCreds("ADMIN"), "missing ADMIN creds");
    await browserLogin(page, "ADMIN");
    await page.goto("/app");
    await expect(page.locator("body")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("metrics / organisations stats for SUPER_ADMIN", async () => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    const sess = await login("SUPER_ADMIN");
    const stats = await api("GET", "/data/organisations/stats", { token: sess.accessToken });
    expect([200, 404].includes(stats.status)).toBeTruthy();
  });
});
