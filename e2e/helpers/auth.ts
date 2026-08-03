import type { Page } from "@playwright/test";
import { hasCreds, roleCreds, type Role } from "./api";

export async function browserLogin(page: Page, role: Role) {
  if (!hasCreds(role)) throw new Error(`Missing browser creds for ${role}`);
  const { email, password } = roleCreds(role);
  await page.goto("/login");
  await page.locator("#signin-email").fill(email!);
  await page.locator("#signin-password").fill(password!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 45_000 });
}

export async function browserLogout(page: Page) {
  // Prefer common logout control; fall back to clearing storage.
  const logout = page.getByRole("button", { name: /log ?out|sign ?out/i }).first();
  if (await logout.isVisible().catch(() => false)) {
    await logout.click();
    await page.waitForURL(/login/, { timeout: 20_000 }).catch(() => undefined);
    return;
  }
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto("/login");
}
