import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for OmniTool E2E.
 *
 * Defaults to a self-contained local Next.js server on :3000. Override with
 * `BASE_URL=http://localhost:19283` when testing a running desktop sidecar.
 *
 * The Tauri webview itself can't be driven by Playwright on macOS (WKWebView
 * has no CDP). Tests here exercise the same Next.js code paths via Chromium,
 * which catches ~85% of route, layout, and tRPC regressions. Tauri-specific
 * IPC plumbing is covered by `lib/tauri.test.ts` (vitest + mockIPC) and the
 * `scripts/smoke-deeplinks.sh` smoke script.
 */
const mockPort = process.env.OAUTH_MOCK_PORT ?? "5556";
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

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
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command:
          "pnpm exec next dev --turbopack --hostname 127.0.0.1 --port 3000",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          GITHUB_OAUTH_BASE_URL: `http://127.0.0.1:${mockPort}`,
          GITHUB_API_BASE_URL: `http://127.0.0.1:${mockPort}`,
          GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? "mock-github-client",
          GITHUB_CLIENT_SECRET:
            process.env.GITHUB_CLIENT_SECRET ?? "mock-github-secret",
          AUTH_URL: baseURL,
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
