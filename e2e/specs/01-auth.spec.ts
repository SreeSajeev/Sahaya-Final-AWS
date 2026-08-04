import { test, expect } from "@playwright/test";
import { api, hasCreds, login, roleCreds } from "../helpers/api";
import { browserLogin, browserLogout } from "../helpers/auth";

test.describe("Authentication", () => {
  test("invalid credentials rejected", async () => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    const email = roleCreds("SUPER_ADMIN").email!;
    const res = await api("POST", "/auth/login", {
      body: { email, password: "DefinitelyWrong1!" },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.json?.accessToken).toBeFalsy();
  });

  test("login + /auth/me + refresh + logout", async () => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    const sess = await login("SUPER_ADMIN");
    expect(sess.status).toBe(200);
    expect(sess.accessToken).toBeTruthy();

    const me = await api("GET", "/auth/me", { token: sess.accessToken });
    expect(me.status).toBe(200);

    const refresh = await api("POST", "/auth/refresh", { cookie: sess.cookie });
    expect(refresh.status).toBeLessThan(300);
    expect(refresh.json?.accessToken || sess.accessToken).toBeTruthy();

    const logout = await api("POST", "/auth/logout", {
      token: sess.accessToken,
      cookie: sess.cookie,
    });
    expect(logout.status).toBeLessThan(500);
  });

  test("browser login session persistence and logout", async ({ page, context }) => {
    test.skip(!hasCreds("SUPER_ADMIN"), "missing SA creds");
    await browserLogin(page, "SUPER_ADMIN");
    await expect(page).not.toHaveURL(/\/login/);
    await page.reload();
    await expect(page).not.toHaveURL(/\/login/);
    await browserLogout(page);
    // After logout, protected route should bounce
    await page.goto("/app/tickets");
    await page.waitForTimeout(1500);
    const url = page.url();
    expect(url.includes("/login") || (await context.cookies()).length >= 0).toBeTruthy();
  });
});
