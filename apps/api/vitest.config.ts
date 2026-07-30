import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

/**
 * Vitest's default transformer (esbuild) supports `experimentalDecorators` but
 * not `emitDecoratorMetadata`, which is what Nest reads to resolve constructor
 * dependencies. Without SWC here, every injected provider arrives `undefined`
 * and the failure looks like a DI bug rather than a build one.
 */
export default defineConfig({
  // Vitest 4 transforms with Oxc by default; turn it off so SWC below is what
  // actually runs, rather than the two quietly disagreeing about decorators.
  oxc: false,
  test: {
    // .test.ts, not Nest's default .spec.ts — matches packages/rules, the
    // only other test suite in this monorepo, so there is one convention to
    // remember rather than one per workspace.
    include: ["src/**/*.test.ts"],
    // Contract tests boot a real Nest app; give them room over the 5s default.
    testTimeout: 15_000,
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
