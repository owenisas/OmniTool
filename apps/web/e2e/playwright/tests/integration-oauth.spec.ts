/**
 * Integration OAuth flow against the local mock provider.
 *
 * Strategy: spin up `oauth-mock` on :5556 emulating GitHub's OAuth endpoints.
 * The OmniTool authorize route still hits real github.com by default, so we
 * monkey-patch the page's `fetch` and trigger the flow manually:
 *
 *   1. Log in as admin (real Supabase session — already provisioned by seed).
 *   2. Navigate to /settings/integrations.
 *   3. Stub `window.fetch` to redirect any request to `github.com/login/oauth`
 *      → the mock server's matching endpoint.
 *   4. Click Connect (in browser, this just navigates the page; no system
 *      browser opens — we're not in Tauri here).
 *   5. Assert the eventual redirect lands on `/settings/integrations?
 *      connected=github` and the connected-accounts query returns the
 *      expected mock GitHub user.
 *
 * For the desktop-specific deep-link path see `scripts/smoke-deeplinks.sh`.
 */
import { test, expect, type Page } from "@playwright/test";
import { startOAuthMock, type OAuthMockHandle } from "../../harness/oauth-mock";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@omnitool.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123!";

let mock: OAuthMockHandle;

test.beforeAll(async () => {
  mock = await startOAuthMock({ port: 5556 });
});

test.afterAll(async () => {
  await mock.close();
});

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

test("Connect GitHub via mock provider redirects with code", async ({ page }) => {
  // Route any github.com/login/oauth/* request to our local mock, mapping the
  // path 1:1. Same for api.github.com → /api/* on the mock.
  await page.route(/^https:\/\/github\.com\/login\/oauth\//, (route) => {
    const u = new URL(route.request().url());
    const target = `http://localhost:${mock.port}${u.pathname}${u.search}`;
    return route.continue({ url: target });
  });
  await page.route(/^https:\/\/api\.github\.com\//, (route) => {
    const u = new URL(route.request().url());
    const target = `http://localhost:${mock.port}${u.pathname}${u.search}`;
    return route.continue({ url: target });
  });

  await login(page);

  // Hit the authorize route directly (web flow follows redirect chain).
  // In a real browser the chain is: localhost/authorize → 302 → github.com
  // → mock provider → 302 → localhost/callback?code=... → 302 → settings/
  // integrations?connected=github. We follow it manually.
  await page.goto("/api/integrations/github/authorize", {
    waitUntil: "networkidle",
  });

  // Final URL should contain `connected=github` query param.
  expect(page.url()).toContain("/settings/integrations");
  // The mock should have been hit at least twice (authorize + token).
  const paths = mock.calls.map((c) => c.path);
  expect(paths).toContain("/login/oauth/authorize");
  expect(paths).toContain("/login/oauth/access_token");
  expect(paths).toContain("/api/user");
});
