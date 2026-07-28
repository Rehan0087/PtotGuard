import { defineConfig } from "vitest/config";

/**
 * The rules have no I/O and no React, so the default node environment is all
 * they need. The tests sit next to the modules they specify, and travel with
 * the package to whoever implements it.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
