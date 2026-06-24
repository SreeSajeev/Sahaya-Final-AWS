import { test, expect } from "@playwright/test";

const superEmail = process.env.E2E_SUPER_ADMIN_EMAIL;
const superPassword = process.env.E2E_SUPER_ADMIN_PASSWORD;

test.describe("Super Admin", () => {
  test.skip(!superEmail || !superPassword, "Set E2E_SUPER_ADMIN_EMAIL and E2E_SUPER_ADMIN_PASSWORD");

  test("login and reach super admin area", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(superEmail!);
    await page.getByLabel(/password/i).fill(superPassword!);
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    await page.waitForURL(/\/(app|super-admin)/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("navigate to organisations list", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(superEmail!);
    await page.getByLabel(/password/i).fill(superPassword!);
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    await page.waitForURL(/\/(app|super-admin)/, { timeout: 30_000 });
    await page.goto("/app/organisations");
    await expect(page.getByText(/organisation/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
