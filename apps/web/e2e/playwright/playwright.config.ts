import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for OmniTool E2E.
 *
 * Targets the running Next.js sidecar (the Tauri app's embedded server)
 * at http://localhost:19283 by default, falling back to a `pnpm dev:web`
 * launch on :3000 when the sidecar isn't running. Override with
 * `BASE_URL=http://localhost:3000`.
 *
 * The Tauri webview itself can't be driven by Playwright on macOS (WKWebView
 * has no CDP). Tests here exercise the same Next.js code paths via Chromium,
 * which catches ~85% of route, layout, and tRPC regressions. Tauri-specific
 * IPC plumbing is covered by `lib/tauri.test.ts` (vitest + mockIPC) and the
 * `scripts/smoke-deeplinks.sh` smoke script.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // sidecar shares state across tests; keep serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:19283",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
