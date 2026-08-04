import { test, expect } from "@playwright/test";
import { api, hasCreds, login } from "../helpers/api";
import { browserLogin } from "../helpers/auth";

test.describe("Users roles permissions", () => {
  test("SA lists users; FE cannot manage orgs", async () => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    const sa = await login("SUPER_ADMIN");
    const users = await api("GET", "/data/users?limit=50", { token: sa.accessToken });
    expect(users.status).toBe(200);
    const items = users.json?.items || users.json?.data || [];
    expect(Array.isArray(items)).toBeTruthy();

    if (hasCreds("FIELD_EXECUTIVE")) {
      const fe = await login("FIELD_EXECUTIVE");
      const feOrgs = await api("POST", "/data/organisations", {
        token: fe.accessToken,
        body: { name: "x", slug: `fe-deny-${Date.now()}`, status: "active" },
      });
      expect([401, 403].includes(feOrgs.status)).toBeTruthy();
    }
  });

  test("browser users page for SA", async ({ page }) => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    await browserLogin(page, "SUPER_ADMIN");
    await page.goto("/app/users");
    await expect(page.locator("body")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });
});
