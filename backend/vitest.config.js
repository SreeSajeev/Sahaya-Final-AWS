import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    reporters: ["verbose"],
    include: ["tests/unit/**/*.test.js", "tests/repositories/**/*.test.js"],
    exclude: ["tests/integration/**", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text", "json-summary", "html"],
      include: ["src/repositories/**/*.js", "src/services/**/*.js", "src/routes/**/*.js"],
      exclude: ["**/*.test.js", "**/node_modules/**"],
      thresholds: {
        lines: 60,
        functions: 55,
        branches: 50,
        statements: 60,
      },
    },
  },
});
