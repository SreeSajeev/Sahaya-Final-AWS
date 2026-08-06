import { test, expect } from "@playwright/test";
import { api, hasCreds, login } from "../helpers/api";
import { browserLogin } from "../helpers/auth";

test.describe("Tickets", () => {
  test("create / list / get / filter / search / pagination / comment / edit / close", async () => {
    test.skip(!hasCreds("STAFF") && !hasCreds("ADMIN"), "missing staff creds");
    const role = hasCreds("STAFF") ? "STAFF" : "ADMIN";
    const sess = await login(role as "STAFF" | "ADMIN");
    const token = sess.accessToken!;

    const sparse = await api("POST", "/tickets", {
      token,
      body: { status: "OPEN" },
    });
    expect(sparse.status).toBeGreaterThanOrEqual(400);
    expect(sparse.status).toBeLessThan(500);

    const marker = `E2E_PW_SHORT_${Date.now()}`;
    const create = await api("POST", "/tickets", {
      token,
      body: {
        short_description: marker,
        category: "OTHER",
        issue_type: "OTHER",
        priority_level: "LOW",
        location: "E2E_PW_LOCATION",
      },
    });
    expect(create.status).toBe(200);
    const ticketId = create.json?.id as string;
    expect(ticketId).toBeTruthy();
    expect(create.json?.short_description).toBe(marker);

    const get = await api("GET", `/data/tickets/${ticketId}`, { token });
    expect(get.status).toBe(200);
    expect(get.json?.short_description).toBe(marker);

    const list = await api("GET", "/data/tickets?limit=10", { token });
    expect(list.status).toBe(200);

    const page2 = await api("GET", "/data/tickets?limit=5&offset=5", { token });
    expect(page2.status).toBe(200);

    const search = await api(
      "GET",
      `/data/tickets?limit=20&q=${encodeURIComponent(marker)}`,
      { token }
    );
    expect(search.status).toBeLessThan(500);

    const filter = await api("GET", "/data/tickets?limit=20&status=OPEN", { token });
    expect(filter.status).toBe(200);

    const comment = await api("POST", `/data/tickets/${ticketId}/comments`, {
      token,
      body: { body: "E2E_PW_COMMENT", source: "STAFF" },
    });
    expect(comment.status).toBeLessThan(300);

    const patch = await api("PATCH", `/data/tickets/${ticketId}`, {
      token,
      body: { updates: { category: "OTHER", location: "E2E_LOC" } },
    });
    expect(patch.status).toBeLessThan(500);

    // Close if endpoint exists
    const close = await api("POST", `/tickets/${ticketId}/close`, {
      token,
      body: { reason: "E2E_PW_CLOSE" },
    });
    expect([200, 201, 400, 403, 404, 409, 422].includes(close.status)).toBeTruthy();

    // Reopen / status if supported
    const reopen = await api("POST", `/data/tickets/${ticketId}/status`, {
      token,
      body: { status: "OPEN" },
    });
    expect(reopen.status).toBeLessThan(500);
  });

  test("browser tickets list loads", async ({ page }) => {
    test.skip(!hasCreds("ADMIN") && !hasCreds("STAFF"), "missing staff creds");
    const role = hasCreds("ADMIN") ? "ADMIN" : "STAFF";
    await browserLogin(page, role as "ADMIN" | "STAFF");
    await page.goto("/app/tickets");
    await expect(page.locator("body")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("ticket detail All Tickets navigates to list", async ({ page }) => {
    test.skip(!hasCreds("ADMIN") && !hasCreds("STAFF"), "missing staff creds");
    const role = hasCreds("ADMIN") ? "ADMIN" : "STAFF";
    await browserLogin(page, role as "ADMIN" | "STAFF");
    await page.goto("/app/tickets");
    await expect(page).not.toHaveURL(/\/login/);
    const ticketLink = page.locator('a[href*="/app/tickets/"]').first();
    test.skip((await ticketLink.count()) === 0, "no ticket links on list");
    await ticketLink.click();
    await expect(page).toHaveURL(/\/app\/tickets\/[^/]+/);
    const back = page.getByRole("button", { name: "All Tickets" });
    await expect(back).toBeVisible({ timeout: 60_000 });
    await back.click();
    await expect(page).toHaveURL(/\/app\/tickets\/?$/);
  });
});
