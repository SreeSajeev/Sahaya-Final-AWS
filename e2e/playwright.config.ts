import { defineConfig, devices } from "@playwright/test";

/**
 * Full-platform Playwright acceptance against TEST by default.
 * Local stack: unset E2E_SKIP_WEB_SERVER and point URLs to localhost.
 */
const baseURL = process.env.E2E_BASE_URL || "https://test-sahaya.pariskq.in";
const apiURL = process.env.E2E_API_URL || "https://api.test-sahaya.pariskq.in";
const skipWebServer = process.env.E2E_SKIP_WEB_SERVER !== "0";

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["./reporters/acceptance-reporter.ts"],
  ],
  use: {
    baseURL,
    extraHTTPHeaders: {
      Origin: baseURL,
    },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  metadata: {
    apiURL,
    baseURL,
    environment: "TEST",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: skipWebServer
    ? undefined
    : [
        {
          command: "npm run dev",
          cwd: "../frontend",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command: "PROCESS_ROLE=api npm run dev",
          cwd: "../backend",
          url: `${apiURL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            NODE_ENV: "test",
            PROCESS_ROLE: "api",
          },
        },
      ],
});
