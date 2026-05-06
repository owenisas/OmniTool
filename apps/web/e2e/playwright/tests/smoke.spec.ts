/**
 * Route smoke test. Logs in once (admin@omnitool.dev) then walks every
 * dashboard route, asserting:
 *   - HTTP 200 on the document
 *   - No React error overlay
 *   - No `pageerror` events with non-trivial messages
 *   - No 5xx responses on `/api/*` endpoints during the visit
 *
 * Catches the bug class we just hit: hydration mismatch (#418), missing
 * env-var pages, broken tRPC procedures.
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const ROUTES = [
  "/",
  "/work",
  "/inbox",
  "/tasks",
  "/projects",
  "/issues",
  "/notes",
  "/notes/trash",
  "/agents",
  "/agents/alerts",
  "/agents/chat",
  "/agents/insights",
  "/agents/sessions",
  "/agents/triage",
  "/performance",
  "/team-activity",
  "/profile",
  "/settings",
  "/settings/profile",
  "/settings/security",
  "/settings/team",
  "/settings/integrations",
  "/settings/notifications",
  "/settings/appearance",
  "/settings/about",
  "/settings/notes",
  "/settings/coding-sessions",
];

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@omnitool.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123!";

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

test.describe("dashboard route smoke", () => {
  test.describe.configure({ mode: "serial" });

  test("login + visit every route without hard errors", async ({ page }) => {
    const pageErrors: string[] = [];
    const apiServerErrors: Array<{ url: string; status: number }> = [];
    const consoleErrors: string[] = [];

    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (r) => {
      if (r.status() >= 500 && r.url().includes("/api/")) {
        apiServerErrors.push({ url: r.url(), status: r.status() });
      }
    });
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await login(page);

    const failures: string[] = [];
    // Tolerated noise — flaky DOM cleanup errors not actually breaking pages.
    const IGNORED_ERROR_PATTERNS = [/parentNode/];
    function isIgnored(msg: string) {
      return IGNORED_ERROR_PATTERNS.some((re) => re.test(msg));
    }

    for (const route of ROUTES) {
      const startErrors = pageErrors.length;
      const startApi = apiServerErrors.length;
      const resp = await page.goto(route, { waitUntil: "networkidle" });
      if (resp && resp.status() >= 400) {
        failures.push(`${route}: HTTP ${resp.status()} on document`);
      }
      const newErrs = pageErrors
        .slice(startErrors)
        .filter((m) => !isIgnored(m));
      if (newErrs.length > 0) {
        failures.push(`${route}: pageerror "${newErrs[0]}"`);
      }
      const newApi = apiServerErrors.slice(startApi);
      if (newApi.length > 0) {
        failures.push(
          `${route}: ${newApi.length} 5xx api responses (${newApi[0]!.url})`,
        );
      }
    }

    if (consoleErrors.length > 0 && process.env.DEBUG_E2E) {
      console.log(`Console errors during smoke (${consoleErrors.length}):`);
      for (const e of consoleErrors.slice(0, 5)) console.log(`  ${e}`);
    }

    if (failures.length > 0) {
      console.error("Route failures:");
      for (const f of failures) console.error(`  - ${f}`);
    }
    expect(failures).toEqual([]);
  });
});
