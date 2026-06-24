import { test, expect } from "@playwright/test";

const publicToken = process.env.E2E_PUBLIC_COMPLAINT_TOKEN;

test.describe("Public complaint intake", () => {
  test.skip(!publicToken, "Set E2E_PUBLIC_COMPLAINT_TOKEN to an active complaint point public_token");

  test("open public report page", async ({ page }) => {
    await page.goto(`/public/report/${publicToken}`);
    await expect(page.getByText(/complaint|report|mobile|otp|submit/i).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("OTP send form accepts mobile number", async ({ page }) => {
    await page.goto(`/public/report/${publicToken}`);
    const mobile = page.getByLabel(/mobile|phone/i);
    if (await mobile.count()) {
      await mobile.first().fill("9876543210");
      const sendBtn = page.getByRole("button", { name: /send|otp|verify/i });
      if (await sendBtn.count()) {
        await sendBtn.first().click();
        await expect(page.getByText(/otp|sent|verify/i).first()).toBeVisible({ timeout: 15_000 });
      }
    }
  });
});
