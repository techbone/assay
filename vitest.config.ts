import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Live-API tests are opt-in: they assert schema drift, not logic,
    // so they must never gate the regression suite.
    exclude: ["tests/live/**", "node_modules/**", "web/**"],
  },
});
