import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests for the pure rule modules in `lib/` only — the ones the backend
 * has to reimplement (see the README). They have no I/O and no React, so the
 * default node environment is enough; nothing here needs a DOM.
 */
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
