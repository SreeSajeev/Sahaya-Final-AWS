import { mergeConfig } from "vitest/config";
import base from "./vitest.config.js";

export default mergeConfig(base, {
  test: {
    name: "integration",
    include: ["tests/integration/**/*.test.js"],
    setupFiles: ["tests/setup/integrationSetup.js"],
    coverage: {
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
