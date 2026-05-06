/**
 * Integration OAuth flow against the local mock provider.
 *
 * Two flows depending on the sidecar's `AUTH_URL` env:
 *
 *   - **Web-mode sidecar** (AUTH_URL=http://localhost:3000): authorize
 *     route returns 302 → mock provider → 302 → callback. Browser follows
 *     the chain naturally. Final URL is `/settings/integrations?connected=github`.
 *
 *   - **Desktop-mode sidecar** (AUTH_URL=http://localhost:19283): authorize
 *     route returns `{ url }` JSON for the client to open via
 *     `tauri-plugin-shell`. Playwright is not Tauri, so we follow the URL
 *     manually here (mirroring what `lib/tauri.ts#startOAuthFlow` does
 *     in the desktop client).
 *
 * Either way we route github.com / api.github.com requests to the local
 * mock so PR runs are deterministic.
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
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

// Skipped by default. The integration callback handler issues a SERVER-SIDE
// fetch to `https://github.com/login/oauth/access_token` — that traffic
// originates from the Node sidecar, not the browser, so Playwright's
// `page.route` can't intercept it. To run this test for real:
//   1. Refactor `apps/web/app/api/integrations/github/callback/route.ts`
//      to read the GitHub URL from `process.env.GITHUB_OAUTH_BASE_URL`
//      (default to https://github.com).
//   2. Spawn the sidecar with `GITHUB_OAUTH_BASE_URL=http://localhost:5556`
//      pointed at this test's mock server.
//   3. Remove the `.skip` here.
// Until then, the Layer-1 vitest test in `e2e/tests/oauth-mock.test.ts`
// proves the mock harness contract; end-to-end coverage is provided by the
// AppleScript deep-link smoke (`e2e/scripts/smoke-deeplinks.sh`) plus
// manual real-provider testing pre-release.
test.skip("Connect GitHub via mock provider redirects with code", async ({ page, request }) => {
  // Forward github.com/login/oauth/* and api.github.com/* → local mock.
  // `route.continue({ url })` rejects protocol changes (https→http), so we
  // use `route.fulfill` with the response we fetch from the mock ourselves.
  async function forward(url: string, method: string, headers: Record<string, string>, body: string | null) {
    const u = new URL(url);
    const target = `http://localhost:${mock.port}${u.pathname}${u.search}`;
    const res = await request.fetch(target, {
      method,
      headers,
      data: body ?? undefined,
      maxRedirects: 0,
    });
    return res;
  }
  await page.route(
    /^https:\/\/(github\.com\/login\/oauth\/|api\.github\.com\/)/,
    async (route) => {
      const req = route.request();
      const headers = { ...req.headers() };
      const res = await forward(
        req.url(),
        req.method(),
        headers,
        req.postData() ?? null,
      );
      const respHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(res.headers())) {
        respHeaders[k] = v;
      }
      const buf = await res.body();
      await route.fulfill({
        status: res.status(),
        headers: respHeaders,
        body: buf,
      });
    },
  );

  await login(page);

  // Hit the authorize route. Sidecar may respond with 302 (web mode) OR
  // JSON `{ url }` (desktop mode). Handle both.
  const authorizeResp = await page.request.get(
    "/api/integrations/github/authorize",
    { maxRedirects: 0 },
  );

  let chainStartUrl: string;
  if (authorizeResp.status() === 200) {
    const body = await authorizeResp.json();
    expect(body.url).toBeTruthy();
    chainStartUrl = body.url;
  } else if (
    authorizeResp.status() >= 300 &&
    authorizeResp.status() < 400
  ) {
    chainStartUrl = authorizeResp.headers()["location"]!;
    expect(chainStartUrl).toBeTruthy();
  } else {
    throw new Error(
      `unexpected authorize response: ${authorizeResp.status()}`,
    );
  }

  // Follow the OAuth chain. The final hop in desktop mode redirects to
  // `omnitool://oauth-complete?...` which Chromium can't navigate to —
  // Playwright surfaces that as `ERR_ABORTED` or `ERR_UNKNOWN_URL_SCHEME`.
  // We don't care about the final URL; we assert on the mock's call
  // record instead. So swallow scheme errors here.
  try {
    await page.goto(chainStartUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (
      !/ERR_ABORTED|ERR_UNKNOWN_URL_SCHEME|net::ERR/.test(msg) &&
      !/frame was detached/.test(msg)
    ) {
      throw err;
    }
  }

  const paths = mock.calls.map((c) => c.path);
  expect(paths).toContain("/login/oauth/authorize");
  expect(paths).toContain("/login/oauth/access_token");
  expect(paths).toContain("/api/user");
});
