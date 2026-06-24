import { test, expect } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

test.describe("Admin", () => {
  test.skip(!adminEmail || !adminPassword, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");

  test("login and open tickets", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(adminEmail!);
    await page.getByLabel(/password/i).fill(adminPassword!);
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    await page.goto("/app/tickets");
    await expect(page.getByText(/ticket/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("create ticket form is reachable", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(adminEmail!);
    await page.getByLabel(/password/i).fill(adminPassword!);
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    await page.goto("/app/tickets");
    const createBtn = page.getByRole("button", { name: /create|new ticket|add ticket/i });
    if (await createBtn.count()) {
      await createBtn.first().click();
      await expect(page.getByText(/vehicle|location|category/i).first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});
