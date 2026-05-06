import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for @omnitool/web. Targets pure-Node utilities under
 * `lib/notes/` and `trpc/routers/` (helper functions). Avoids JSX/Next
 * specific code so we don't need a JSDOM/React testing harness yet.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "trpc/**/*.test.ts"],
    exclude: ["node_modules", ".next", "dist"],
    reporters: ["default"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
