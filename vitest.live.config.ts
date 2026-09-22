import { defineConfig } from "vitest/config";

// Live upstream checks, run deliberately rather than on every commit.
export default defineConfig({
  test: { include: ["tests/live/**/*.test.ts"], testTimeout: 60_000 },
});
