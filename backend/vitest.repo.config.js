import { defineConfig } from "vitest/config";

/**
 * Repository suite only — do not merge unit includes from vitest.config.js.
 * Unit tests that mock prisma.js must not share repoSetup teardown.
 */
export default defineConfig({
  test: {
    name: "repository",
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    reporters: ["verbose"],
    include: ["tests/repositories/**/*.test.js"],
    exclude: ["**/node_modules/**", "tests/unit/**", "tests/integration/**"],
    setupFiles: ["tests/setup/repoSetup.js"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage-repo",
      reporter: ["text", "json-summary"],
      include: ["src/repositories/**/*.js"],
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 70,
        statements: 80,
      },
    },
  },
});
