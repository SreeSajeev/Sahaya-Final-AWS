import type { Page } from "@playwright/test";
import { API_URL, BASE_URL, hasCreds, roleCreds, type Role } from "./api";

const browserSessionCache = new Map<Role, string>();

/**
 * Browser login through the Playwright context request jar so refresh cookies
 * are available to hydrate(), with per-role caching to avoid login rate limits.
 */
export async function browserLogin(page: Page, role: Role) {
  if (!hasCreds(role)) throw new Error(`Missing browser creds for ${role}`);
  const { email, password } = roleCreds(role);

  let accessToken = browserSessionCache.get(role);

  if (!accessToken) {
    let lastStatus = 0;
    let lastError = "";
    for (let attempt = 1; attempt <= 8; attempt++) {
      const res = await page.context().request.post(`${API_URL}/auth/login`, {
        data: { email, password },
        headers: {
          Origin: BASE_URL,
          "Content-Type": "application/json",
        },
      });
      lastStatus = res.status();
      const body = await res.json().catch(() => ({}));
      lastError = String(body?.error || "");
      if (res.ok() && body.accessToken) {
        accessToken = String(body.accessToken);
        browserSessionCache.set(role, accessToken);
        break;
      }
      await page.waitForTimeout(Math.min(45_000, 2500 * attempt * attempt));
    }
    if (!accessToken) {
      throw new Error(`browserLogin failed for ${role}: status=${lastStatus} err=${lastError}`);
    }
  }

  await page.goto("/login");
  await page.evaluate((token) => {
    try {
      sessionStorage.setItem("sahaya_access_token", token);
    } catch {
      /* ignore */
    }
  }, accessToken);

  await page.goto("/app");
  // If hydrate via refresh cookie works, we leave /login. If not, retry once with UI.
  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 45_000 });
  } catch {
    await page.goto("/login");
    await page.locator("#signin-email").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#signin-email").fill(email!);
    await page.locator("#signin-password").fill(password!);
    await page.locator("form").getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });
  }
}

export async function browserLogout(page: Page) {
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
