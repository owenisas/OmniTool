import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for @omnitool/web.
 *
 * Test layout:
 *   lib/**, trpc/**          — pure-Node units (helpers, validators, parsers)
 *   e2e/tests/**             — Node-level E2E suites that spin up the OAuth
 *                              mock + diagnostic checks against a running
 *                              sidecar. Excludes `e2e/playwright/` which is
 *                              driven by `pnpm playwright test` (separate runner).
 *
 * Per-file environment is opted in with `// @vitest-environment happy-dom`
 * (see lib/tauri.test.ts) so we keep the default Node env fast for the
 * rest of the suite.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "trpc/**/*.test.ts",
      "e2e/**/*.test.ts",
    ],
    exclude: ["node_modules", ".next", "dist", "e2e/playwright/**"],
    reporters: ["default"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
