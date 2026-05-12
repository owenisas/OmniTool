/**
 * Integration OAuth flow against the local mock provider.
 *
 * Mechanism: the sidecar reads `GITHUB_OAUTH_BASE_URL` and
 * `GITHUB_API_BASE_URL` (via `providerRegistry.get("GITHUB").tokenUrl` and
 * the explicit `apiBase` lookup in the callback route). When CI launches
 * the sidecar with those env vars pointed at this mock, the SERVER-SIDE
 * fetches issued during the callback handler hit the mock directly — no
 * browser-level interception needed.
 *
 * Two response shapes for the authorize route:
 *
 *   - **Web-mode sidecar** (AUTH_URL=http://localhost:3000): authorize
 *     returns 302 → mock provider → 302 → callback. Browser follows.
 *
 *   - **Desktop-mode sidecar** (AUTH_URL=http://localhost:19283): authorize
 *     returns `{ url }` JSON for the client to open via the OS browser.
 *     Playwright is not Tauri, so we navigate to the URL manually
 *     (mirroring what `lib/tauri.ts#startOAuthFlow` does on desktop).
 */
import { test, expect, type Page } from "@playwright/test";
import { startOAuthMock, type OAuthMockHandle } from "../../harness/oauth-mock";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@omnitool.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123!";
const MOCK_PORT = Number(process.env.OAUTH_MOCK_PORT ?? "5556");

let mock: OAuthMockHandle;

test.beforeAll(async () => {
  mock = await startOAuthMock({ port: MOCK_PORT });
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

test("Connect GitHub via mock provider redirects with code", async ({ page }) => {
  await login(page);

  // Hit the authorize route. Sidecar may respond with 302 (web mode) OR
  // JSON `{ url }` (desktop mode).
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

  // Sanity-check: `chainStartUrl` should be pointing at the local mock,
  // not real GitHub. If it's https://github.com/... the sidecar wasn't
  // launched with `GITHUB_OAUTH_BASE_URL` set — fail fast with a clear
  // message instead of silently hitting real GitHub.
  expect(
    chainStartUrl.startsWith(`http://localhost:${MOCK_PORT}/`) ||
      chainStartUrl.startsWith(`http://127.0.0.1:${MOCK_PORT}/`),
  ).toBe(true);

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

  // Allow up to 5s for the sidecar to fully process the callback.
  for (let i = 0; i < 50; i++) {
    if (mock.calls.some((c) => c.path === "/api/user")) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  const paths = mock.calls.map((c) => c.path);
  expect(paths).toContain("/login/oauth/authorize");
  expect(paths).toContain("/login/oauth/access_token");
  expect(paths).toContain("/api/user");
});
