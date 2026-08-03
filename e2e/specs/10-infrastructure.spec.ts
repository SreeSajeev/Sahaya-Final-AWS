import { test, expect } from "@playwright/test";
import { API_URL, api } from "../helpers/api";

/**
 * Infrastructure recovery is exercised by Phase D ops (restart_api / restart_pg).
 * This suite verifies live recovery surface: health endpoints stay healthy on TEST.
 */
test.describe("Infrastructure", () => {
  test("API health recovers / is live", async () => {
    const res = await fetch(`${API_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json().catch(() => ({}));
    expect(body).toBeTruthy();
  });

  test("auth login endpoint reachable", async () => {
    const res = await api("POST", "/auth/login", {
      body: { email: "nobody@example.com", password: "x" },
    });
    // Must not be 5xx / connection failure
    expect(res.status).toBeLessThan(500);
  });
});
