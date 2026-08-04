import { test, expect } from "@playwright/test";
import { api, hasCreds, login } from "../helpers/api";
import { browserLogin } from "../helpers/auth";

test.describe("Field Executive", () => {
  test("FE login + assigned tickets + me", async () => {
    test.skip(!hasCreds("FIELD_EXECUTIVE"), "missing FE creds");
    const sess = await login("FIELD_EXECUTIVE");
    expect(sess.status).toBe(200);
    expect(sess.accessToken).toBeTruthy();

    const me = await api("GET", "/auth/me", { token: sess.accessToken });
    expect(me.status).toBe(200);

    const feMe = await api("GET", "/fe/me", { token: sess.accessToken });
    expect([200, 403, 404].includes(feMe.status)).toBeTruthy();

    const tickets = await api("GET", "/data/tickets?limit=20", { token: sess.accessToken });
    expect([200, 403].includes(tickets.status)).toBeTruthy();
  });

  test("FE proof upload path when token provided", async () => {
    test.skip(!hasCreds("FIELD_EXECUTIVE"), "missing FE creds");
    const tokenId = process.env.E2E_FE_ACTION_TOKEN_ID;
    test.skip(!tokenId, "set E2E_FE_ACTION_TOKEN_ID for live proof upload");

    const pngB64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const proof = await api("POST", "/fe/proof", {
      body: {
        token: tokenId,
        attachments: {
          image_base64: `data:image/png;base64,${pngB64}`,
          images: [{ image_base64: `data:image/png;base64,${pngB64}`, filename: "e2e.png" }],
        },
      },
    });
    expect(proof.status).toBeLessThan(300);
    expect(proof.json?.success).toBeTruthy();
  });

  test("browser FE area loads", async ({ page }) => {
    test.skip(!hasCreds("FIELD_EXECUTIVE"), "missing FE creds");
    await browserLogin(page, "FIELD_EXECUTIVE");
    await page.goto("/fe/tickets");
    await expect(page.locator("body")).toBeVisible();
  });
});
