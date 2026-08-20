import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "platform-validation",
    environment: "node",
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    reporters: ["verbose"],
    include: ["tests/platform-validation/**/*.test.js"],
    exclude: ["**/node_modules/**"],
    setupFiles: ["tests/setup/platformValidationSetup.js"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage-platform-validation",
      reporter: ["text", "json-summary"],
      include: ["src/services/**/*.js", "src/routes/**/*.js"],
      // No coverage thresholds — suite must not fail on coverage alone.
    },
  },
});
