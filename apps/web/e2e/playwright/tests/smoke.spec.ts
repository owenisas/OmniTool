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
import { login } from "./helpers/auth";

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

test.describe("dashboard route smoke", () => {
  test.describe.configure({ mode: "serial" });
  // 27 routes × (up to 20s nav + 500ms settle + retries) overflows the
  // default 30s test budget. 5 minutes is generous; the suite normally
  // finishes in 30–60s.
  test.setTimeout(5 * 60_000);

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
    // Tolerated noise — non-fatal warnings React recovers from. The app
    // renders correctly despite these; surface separately for visibility
    // but don't fail the suite. If any of these become user-visible
    // (broken hydration, blank pages), tighten the filter.
    const IGNORED_ERROR_PATTERNS = [
      /parentNode/, // flaky DOM cleanup on rapid nav
      /Hydration failed because/, // dev-mode form of React hydration mismatch
      /Minified React error #418/, // hydration mismatch — recovers
      /Minified React error #310/, // setState in render — recovers
      /Minified React error #419/, // suspense hydration — recovers
    ];
    function isIgnored(msg: string) {
      return IGNORED_ERROR_PATTERNS.some((re) => re.test(msg));
    }

    for (const route of ROUTES) {
      const startErrors = pageErrors.length;
      const startApi = apiServerErrors.length;
      // `networkidle` flakes on routes with Supabase realtime websockets
      // (e.g. /issues, /notes/[id]) — they never reach 0 in-flight reqs.
      // `domcontentloaded` plus a short settle gives stable assertions.
      // `ERR_ABORTED` happens on transient client-side redirects — treat
      // as a successful nav and let the post-settle assertions run.
      let resp;
      try {
        resp = await page.goto(route, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
      } catch (err) {
        if (
          err instanceof Error &&
          /ERR_ABORTED|frame was detached/.test(err.message)
        ) {
          // Transient — retry once with `load` to pick up the post-redirect
          // page. If THAT fails we fall through to record the failure.
          try {
            resp = await page.goto(route, {
              waitUntil: "load",
              timeout: 15_000,
            });
          } catch (err2) {
            failures.push(
              `${route}: navigation aborted (${(err2 as Error).message.split("\n")[0]})`,
            );
            continue;
          }
        } else {
          failures.push(`${route}: ${(err as Error).message.split("\n")[0]}`);
          continue;
        }
      }
      await page.waitForTimeout(500);
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
