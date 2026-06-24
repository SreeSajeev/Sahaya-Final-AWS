import { test, expect } from "@playwright/test";

const feTokenId = process.env.E2E_FE_ACTION_TOKEN_ID;

test.describe("Field Executive", () => {
  test.skip(!feTokenId, "Set E2E_FE_ACTION_TOKEN_ID to a valid fe_action_tokens.id");

  test("open magic link context page", async ({ page }) => {
    await page.goto(`/fe/action/${feTokenId}`);
    await expect(page.getByText(/ticket|assignment|accept|reject|on.?site/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

const feEmail = process.env.E2E_FE_EMAIL;
const fePassword = process.env.E2E_FE_PASSWORD;

test.describe("Field Executive authenticated", () => {
  test.skip(!feEmail || !fePassword, "Set E2E_FE_EMAIL and E2E_FE_PASSWORD");

  test("login and open FE ticket list", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(feEmail!);
    await page.getByLabel(/password/i).fill(fePassword!);
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    await page.waitForURL(/\/(fe|app)/, { timeout: 30_000 });
    await page.goto("/fe");
    await expect(page.getByText(/ticket/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
