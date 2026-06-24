import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://localhost:5173";
const apiURL = process.env.E2E_API_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./specs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_SKIP_WEB_SERVER
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
