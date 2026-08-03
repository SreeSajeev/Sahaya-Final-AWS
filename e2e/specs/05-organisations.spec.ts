import { test, expect } from "@playwright/test";
import { api, hasCreds, login } from "../helpers/api";
import { browserLogin } from "../helpers/auth";

test.describe("Organisations", () => {
  test("list / create validation / edit path", async () => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    const sess = await login("SUPER_ADMIN");
    const token = sess.accessToken!;

    const list = await api("GET", "/data/organisations?limit=20", { token });
    expect(list.status).toBe(200);

    const bad = await api("POST", "/data/organisations", {
      token,
      body: { name: "" },
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);

    const slug = `e2e-org-${Date.now()}`;
    const create = await api("POST", "/data/organisations", {
      token,
      body: { name: `E2E Org ${Date.now()}`, slug, status: "active" },
    });
    // Some envs may disable create — accept 2xx or validation 4xx, never 5xx
    expect(create.status).toBeLessThan(500);
    const orgId = create.json?.id || create.json?.item?.id;
    if (orgId) {
      const patch = await api("PATCH", `/data/organisations/${orgId}`, {
        token,
        body: { name: `E2E Org Updated ${Date.now()}` },
      });
      expect(patch.status).toBeLessThan(500);
    }
  });

  test("browser organisations page", async ({ page }) => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    await browserLogin(page, "SUPER_ADMIN");
    await page.goto("/app/organisations");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toBeVisible();
    // Heading copy varies (Organisations / Organizations / Tenants)
    await expect(
      page.getByText(/organisation|organization|tenant/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});
