/**
 * Dynamic-route smoke. The Layer 3 `smoke.spec.ts` only walks STATIC dashboard
 * routes. The highest bug density (cuid-keyed pages: notes, issues, projects,
 * tasks, agent sessions, workflows) had zero coverage.
 *
 * Strategy:
 *   1. Log in as admin.
 *   2. Create a note via tRPC HTTP (deterministic, no UI dependency).
 *   3. Navigate to `/notes/<id>` and assert: HTTP 200, no `pageerror`, no
 *      5xx tRPC responses.
 *   4. For every list page that exposes dynamic-id child routes (issues,
 *      projects, tasks, agent sessions, workflows), find the first link in
 *      the rendered DOM that matches the route shape and visit it. If the
 *      list is empty, the test reports it but does NOT fail — surfaces the
 *      coverage gap without false negatives.
 *
 * Why HTTP for note creation:
 *   The "+ New note" button does the right thing in a real session but
 *   navigates immediately, making it racy to capture the new id. tRPC's
 *   `note.create` accepts a clean JSON payload with cookie auth — same
 *   trust boundary as the UI button.
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@omnitool.dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin123!";

const IGNORED_ERROR_PATTERNS = [
  /parentNode/,
  /Minified React error #418/,
  /Minified React error #310/,
  /Minified React error #419/,
];
function isIgnored(msg: string) {
  return IGNORED_ERROR_PATTERNS.some((re) => re.test(msg));
}

async function login(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
}

interface VisitProbes {
  pageErrors: string[];
  apiServerErrors: Array<{ url: string; status: number }>;
}
function attachProbes(page: Page): VisitProbes {
  const pageErrors: string[] = [];
  const apiServerErrors: Array<{ url: string; status: number }> = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().includes("/api/")) {
      apiServerErrors.push({ url: r.url(), status: r.status() });
    }
  });
  page.on("console", (msg: ConsoleMessage) => {
    // Side-effect: nothing — `pageerror` already captures hard failures.
    void msg;
  });
  return { pageErrors, apiServerErrors };
}

async function visitAndAssert(page: Page, route: string, probes: VisitProbes) {
  const startErrors = probes.pageErrors.length;
  const startApi = probes.apiServerErrors.length;
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
      resp = await page.goto(route, {
        waitUntil: "load",
        timeout: 15_000,
      });
    } else {
      throw err;
    }
  }
  await page.waitForTimeout(500);
  expect(resp?.status()).toBeLessThan(400);
  const newErrs = probes.pageErrors
    .slice(startErrors)
    .filter((m) => !isIgnored(m));
  expect(newErrs, `pageerror on ${route}: ${newErrs[0]}`).toEqual([]);
  const newApi = probes.apiServerErrors.slice(startApi);
  expect(newApi, `5xx on ${route}: ${newApi[0]?.url}`).toEqual([]);
}

test.describe("dynamic-route smoke", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(5 * 60_000);

  test("note detail (created via tRPC)", async ({ page, request }) => {
    await login(page);
    const probes = attachProbes(page);

    // Forward cookies set by login to the tRPC request via the same context.
    const createPayload = {
      json: {
        title: `E2E note ${Date.now()}`,
        blocks: [
          {
            type: "paragraph",
            props: {
              textColor: "default",
              textAlignment: "left",
              backgroundColor: "default",
            },
            content: [],
          },
        ],
        contentText: "",
      },
    };
    const createResp = await request.post(
      "/api/trpc/note.create?batch=1",
      {
        data: { "0": createPayload },
        headers: { "Content-Type": "application/json" },
      },
    );
    expect(
      createResp.ok(),
      `note.create failed: ${createResp.status()} ${await createResp.text()}`,
    ).toBe(true);
    const body = await createResp.json();
    // tRPC v11 batch response: array of { result: { data: { json: {...} } } }
    const noteId =
      body?.[0]?.result?.data?.json?.id ?? body?.[0]?.result?.data?.id;
    expect(noteId, `note id missing in response: ${JSON.stringify(body)}`).toBeTruthy();

    await visitAndAssert(page, `/notes/${noteId}`, probes);
  });

  test("first existing entity in each dynamic list (best-effort)", async ({
    page,
  }) => {
    await login(page);
    const probes = attachProbes(page);

    // (list page, link selector that exposes a dynamic-id href)
    const lists: Array<{ list: string; linkSelector: string }> = [
      { list: "/issues", linkSelector: 'a[href^="/issues/"]' },
      { list: "/projects", linkSelector: 'a[href^="/projects/"]' },
      { list: "/tasks", linkSelector: 'a[href^="/tasks/"]' },
      { list: "/agents/sessions", linkSelector: 'a[href^="/agents/sessions/"]' },
      { list: "/workflows", linkSelector: 'a[href^="/workflows/"]' },
    ];

    for (const { list, linkSelector } of lists) {
      await visitAndAssert(page, list, probes);
      const link = page.locator(linkSelector).first();
      const count = await link.count();
      if (count === 0) {
        console.warn(`[dynamic-routes] no entities on ${list} — skipping detail visit`);
        continue;
      }
      const href = await link.getAttribute("href");
      if (!href || href === list) continue;
      await visitAndAssert(page, href, probes);
    }
  });
});
