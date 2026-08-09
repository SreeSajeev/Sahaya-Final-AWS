import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: "forks",
    reporters: ["verbose"],
    include: ["tests/integration/**/*.test.js"],
    exclude: ["**/node_modules/**"],
    setupFiles: ["tests/setup/integrationSetup.js"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage-integration",
      reporter: ["text", "json-summary"],
      include: ["src/services/**/*.js", "src/routes/**/*.js"],
      thresholds: {
        lines: 70,
        functions: 65,
        branches: 55,
        statements: 70,
      },
    },
  },
});
