import { mergeConfig } from "vitest/config";
import base from "./vitest.config.js";

export default mergeConfig(base, {
  test: {
    name: "repository",
    include: ["tests/repositories/**/*.test.js"],
    setupFiles: ["tests/setup/repoSetup.js"],
    coverage: {
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
