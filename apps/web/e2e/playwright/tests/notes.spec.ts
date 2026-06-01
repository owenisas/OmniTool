import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import { login } from "./helpers/auth";

const IGNORED_ERROR_PATTERNS = [
  /parentNode/,
  /Hydration failed because/,
  /Minified React error #418/,
  /Minified React error #310/,
  /Minified React error #419/,
];

type TrpcBatchResponse = Array<{
  result?: { data?: { json?: unknown } | unknown };
  error?: unknown;
}>;

type NotePayload = {
  id: string;
  title: string;
  contentText?: string | null;
};

function paragraphBlocks(text = "") {
  return [
    {
      type: "paragraph",
      props: {
        textColor: "default",
        textAlignment: "left",
        backgroundColor: "default",
      },
      content: text ? [{ type: "text", text, styles: {} }] : [],
    },
  ];
}

function isIgnored(msg: string) {
  return IGNORED_ERROR_PATTERNS.some((re) => re.test(msg));
}

async function trpcCall<T>(
  page: Page,
  procedure: string,
  input: unknown,
): Promise<T> {
  const response = await page.request.post(`/api/trpc/${procedure}?batch=1`, {
    data: { "0": { json: input } },
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok()) {
    throw new Error(
      `${procedure} failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as TrpcBatchResponse;
  const first = body[0];
  if (!first || first.error) {
    throw new Error(`${procedure} returned error: ${JSON.stringify(body)}`);
  }

  const data = first.result?.data;
  if (data && typeof data === "object" && "json" in data) {
    return (data as { json: T }).json;
  }
  return data as T;
}

async function trpcQuery<T>(
  page: Page,
  procedure: string,
  input: unknown,
): Promise<T> {
  const encodedInput = encodeURIComponent(
    JSON.stringify({ "0": { json: input } }),
  );
  const response = await page.request.get(
    `/api/trpc/${procedure}?batch=1&input=${encodedInput}`,
  );
  if (!response.ok()) {
    throw new Error(
      `${procedure} failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as TrpcBatchResponse;
  const first = body[0];
  if (!first || first.error) {
    throw new Error(`${procedure} returned error: ${JSON.stringify(body)}`);
  }

  const data = first.result?.data;
  if (data && typeof data === "object" && "json" in data) {
    return (data as { json: T }).json;
  }
  return data as T;
}

async function createNote(page: Page, title: string, contentText: string) {
  return trpcCall<NotePayload>(page, "note.create", {
    title,
    blocks: paragraphBlocks(contentText),
    contentText,
  });
}

async function getNote(page: Page, id: string) {
  return trpcQuery<NotePayload>(page, "note.getById", { id });
}

async function getNoteOrNull(page: Page, id: string) {
  try {
    return await getNote(page, id);
  } catch (err) {
    if (err instanceof Error && /404|NOT_FOUND|Note not found/.test(err.message)) {
      return null;
    }
    throw err;
  }
}

async function cleanupNote(page: Page, id: string) {
  await trpcCall(page, "note.delete", { id }).catch(() => undefined);
  await trpcCall(page, "note.purgeFromTrash", { id }).catch(() => undefined);
}

test.describe("notes UX", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(2 * 60_000);

  test("create, search, autosave, trash, and restore stay smooth", async ({
    page,
  }) => {
    await login(page);

    const pageErrors: string[] = [];
    const apiServerErrors: Array<{ url: string; status: number }> = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("response", (response) => {
      if (response.status() >= 500 && response.url().includes("/api/")) {
        apiServerErrors.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });
    page.on("console", (msg: ConsoleMessage) => {
      // Keep this listener active so Playwright attaches console output to traces.
      void msg;
    });

    let createdId: string | null = null;
    try {
      const stamp = Date.now();
      const title = `E2E Notes Flow ${stamp}`;
      const body = `Body text for searchable E2E note ${stamp}`;
      const created = await createNote(page, title, body);
      createdId = created.id;

      await page.goto("/notes", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("notes-load-error")).toHaveCount(0);
      await page.getByTestId("notes-search-input").fill(title);
      await page.getByTestId("notes-apply-filter").click();

      const noteLink = page
        .locator(`a[href="/notes/${created.id}"]`)
        .filter({ hasText: title })
        .first();
      await expect(noteLink).toBeVisible();
      await noteLink.click();

      await expect(page).toHaveURL(new RegExp(`/notes/${created.id}$`));
      await expect(page.getByTestId("note-title-input")).toHaveValue(title);
      await expect(page.getByTestId("note-editor")).toBeVisible();

      const updatedTitle = `${title} updated`;
      await page.getByTestId("note-title-input").fill(updatedTitle);
      await expect
        .poll(async () => (await getNote(page, created.id)).title, {
          timeout: 15_000,
        })
        .toBe(updatedTitle);
      await expect(page.getByTestId("note-save-status")).toContainText("Saved", {
        timeout: 15_000,
      });

      await trpcCall<NotePayload>(page, "note.delete", { id: created.id });
      await page.goto("/notes/trash", { waitUntil: "domcontentloaded" });
      const trashRow = page
        .locator("li")
        .filter({ hasText: updatedTitle })
        .first();
      await expect(trashRow).toBeVisible();
      await trashRow.getByRole("button", { name: /restore/i }).click();
      await expect(trashRow).toHaveCount(0, { timeout: 15_000 });
      await expect
        .poll(async () => (await getNoteOrNull(page, created.id))?.title ?? null, {
          timeout: 15_000,
        })
        .toBe(updatedTitle);
    } finally {
      if (createdId) {
        await cleanupNote(page, createdId);
      }
    }

    const newErrors = pageErrors.filter((message) => !isIgnored(message));
    expect(newErrors, `pageerror: ${newErrors[0]}`).toEqual([]);
    expect(apiServerErrors, `5xx api response: ${apiServerErrors[0]?.url}`).toEqual(
      [],
    );
  });

  test("cards view keeps long note previews inside each card", async ({
    page,
  }) => {
    await login(page);

    let createdId: string | null = null;
    try {
      const stamp = Date.now();
      const title = `E2E long notes card title ${stamp} with frontend backend connections and GEO details`;
      const body =
        "website improvements: UI UX, Seo and Geo. Need better frontend backend connections. ".repeat(
          6,
        );
      const created = await createNote(page, title, body);
      createdId = created.id;

      await page.goto("/notes", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("notes-load-error")).toHaveCount(0);
      await page.getByTestId("notes-search-input").fill(title);
      await page.getByTestId("notes-apply-filter").click();
      await page.getByRole("button", { name: "Cards" }).click();

      const card = page.getByTestId("note-card").filter({ hasText: title });
      await expect(card).toHaveCount(1);
      await expect(card).toBeVisible();

      const metrics = await card.evaluate((node) => {
        const titleNode = node.querySelector('[data-testid="note-card-title"]');
        const timeNode = node.querySelector('[data-testid="note-card-time"]');
        const snippetNode = node.querySelector(
          '[data-testid="note-card-snippet"]',
        );

        if (!titleNode || !timeNode || !snippetNode) {
          return {
            missingPieces: true,
            pageOverflowsX: false,
            titleOverlapsTime: true,
            snippetInsideCard: false,
            snippetLineCount: Number.POSITIVE_INFINITY,
          };
        }

        const titleRect = titleNode.getBoundingClientRect();
        const timeRect = timeNode.getBoundingClientRect();
        const snippetRect = snippetNode.getBoundingClientRect();
        const cardRect = node.getBoundingClientRect();
        const snippetStyle = window.getComputedStyle(snippetNode);
        const lineHeight = Number.parseFloat(snippetStyle.lineHeight) || 1;

        return {
          missingPieces: false,
          pageOverflowsX:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth,
          titleOverlapsTime: !(
            titleRect.right <= timeRect.left ||
            timeRect.right <= titleRect.left ||
            titleRect.bottom <= timeRect.top ||
            timeRect.bottom <= titleRect.top
          ),
          snippetInsideCard:
            snippetRect.right <= cardRect.right + 1 &&
            snippetRect.bottom <= cardRect.bottom + 1,
          snippetLineCount: snippetRect.height / lineHeight,
        };
      });

      expect(metrics.missingPieces).toBe(false);
      expect(metrics.pageOverflowsX).toBe(false);
      expect(metrics.titleOverlapsTime).toBe(false);
      expect(metrics.snippetInsideCard).toBe(true);
      expect(metrics.snippetLineCount).toBeLessThanOrEqual(2.2);
    } finally {
      if (createdId) {
        await cleanupNote(page, createdId);
      }
    }
  });
});
