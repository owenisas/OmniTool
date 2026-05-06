import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { refreshTokenIfNeeded } from "../lib/token-refresh";

export async function createNotionClient(userId: string): Promise<Client> {
  const token = await refreshTokenIfNeeded(userId, "NOTION");
  return new Client({ auth: token });
}

export async function searchNotionPages(client: Client, query: string) {
  const response = await client.search({
    query,
    filter: { value: "page", property: "object" },
    page_size: 20,
  });
  return response.results;
}

export async function getNotionDatabases(client: Client) {
  const response = await client.search({
    filter: { value: "database", property: "object" },
    page_size: 50,
  });
  return response.results;
}

// Get all blocks (content) for a page, handling pagination
export async function getNotionPageBlocks(client: Client, pageId: string) {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const response = await client.blocks.children.list({
      block_id: pageId,
      page_size: 100,
      start_cursor: cursor,
    });
    blocks.push(...response.results);
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);
  return blocks;
}

// Get page metadata (title, icon, cover, last edited)
export async function getNotionPageMeta(client: Client, pageId: string) {
  const page = await client.pages.retrieve({ page_id: pageId }) as any;
  // Extract title from properties
  let title = "Untitled";
  if (page.properties) {
    const titleProp = Object.values(page.properties).find(
      (p: any) => p.type === "title"
    ) as any;
    if (titleProp?.title?.[0]?.plain_text) {
      title = titleProp.title.map((t: any) => t.plain_text).join("");
    }
  }
  return {
    id: page.id,
    title,
    icon: page.icon?.emoji || page.icon?.external?.url || null,
    cover: page.cover?.external?.url || page.cover?.file?.url || null,
    lastEditedTime: page.last_edited_time,
    createdTime: page.created_time,
    url: page.url,
    parentType: page.parent?.type || null,
  };
}

// Convert Notion blocks to plain text for contentText field
export function notionBlocksToPlainText(blocks: any[]): string {
  return blocks
    .map((block) => {
      const type = block.type;
      const content = block[type];
      if (!content) return "";
      // Handle to-do items
      if (type === "to_do") {
        const checked = content.checked ? "☑" : "☐";
        const text = content.rich_text?.map((t: any) => t.plain_text).join("") || "";
        return `${checked} ${text}`;
      }
      // Handle rich text types
      if (content.rich_text) {
        return content.rich_text.map((t: any) => t.plain_text).join("");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

// Convert a Notion page to GFM markdown (handles nested blocks, formatting, etc.)
//
// Custom transformers tighten the output so the imported note doesn't end
// up with stub HTML or empty link placeholders:
//
//  - `child_page` → `[Title](notion://page/{id})` — keeps the title text and
//    embeds the source page id so we can rewrite to internal `/notes/{id}`
//    links during import.
//  - `link_to_page` → same as above (title resolved via API on demand).
//  - `child_database` → just the title in italics (we don't sync DBs yet).
//
// Toggle (`<details>`) emission is left to notion-to-md's default; the
// downstream markdown→blocks converter strips the surrounding HTML tags.
export async function notionBlocksToMarkdown(
  client: Client,
  pageId: string,
): Promise<string> {
  const n2m = new NotionToMarkdown({ notionClient: client });

  n2m.setCustomTransformer("child_page", async (block: any) => {
    const title = block?.child_page?.title || "Untitled";
    const id = block?.id || "";
    return `- [${title}](notion://page/${id})`;
  });

  n2m.setCustomTransformer("link_to_page", async (block: any) => {
    const linkType = block?.link_to_page?.type;
    const id =
      linkType === "page_id"
        ? block?.link_to_page?.page_id
        : block?.link_to_page?.database_id;
    if (!id) return "";
    let title = "Linked page";
    try {
      const meta = await getNotionPageMeta(client, id);
      title = meta.title || "Linked page";
    } catch {
      // Fall back to placeholder if the link target is private / deleted.
    }
    return `- [${title}](notion://page/${id})`;
  });

  n2m.setCustomTransformer("child_database", async (block: any) => {
    const title = block?.child_database?.title || "Database";
    const dbId = block?.id || "";
    if (!dbId) return `_(database: ${title})_`;
    try {
      return await renderNotionDatabaseAsMarkdownTable(client, dbId, title);
    } catch (err) {
      console.error("[notion] child_database render failed", { dbId, err });
      return `_(database: ${title} — content unavailable)_`;
    }
  });

  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdBlocks);
  return mdString.parent;
}

/**
 * Convert a Notion database (any view: table, calendar, gallery, board,
 * timeline, list) into a GFM markdown table, with a header bearing each
 * property name and one row per database entry.
 *
 * Caps at 100 rows + 12 columns to keep the resulting note legible. Cell
 * values are flattened to plain text; rich text styling, embedded files,
 * and nested relations degrade to label-only strings (best-effort).
 *
 * Notes:
 *  - Notion calendars / boards / galleries are presentation-only views over
 *    the same underlying database, so they all funnel through this function
 *    via the `child_database` block transformer.
 *  - The table title is emitted as an H3 above the table for context.
 *  - If the database is empty or the API rejects access (private DB), we
 *    return a short italic placeholder so the parent page import still
 *    succeeds.
 */
async function renderNotionDatabaseAsMarkdownTable(
  client: Client,
  databaseId: string,
  title: string,
): Promise<string> {
  const MAX_ROWS = 100;
  const MAX_COLS = 12;

  // Fetch up to MAX_ROWS rows. Notion paginates at 100/request, which is the
  // ceiling we want anyway.
  const queryRes = (await client.databases.query({
    database_id: databaseId,
    page_size: MAX_ROWS,
  })) as any;

  const rows: any[] = queryRes?.results ?? [];
  if (rows.length === 0) {
    return `\n### ${title}\n\n_(empty database)_\n`;
  }

  // Derive column order from the first row's properties — Notion API doesn't
  // guarantee insertion order across rows, but per-row keys are stable.
  const firstProps = rows[0].properties || {};
  const columnNames = Object.keys(firstProps).slice(0, MAX_COLS);
  if (columnNames.length === 0) return `\n### ${title}\n\n_(no columns)_\n`;

  const headerRow = `| ${columnNames.map(escapeCell).join(" | ")} |`;
  const sepRow = `| ${columnNames.map(() => "---").join(" | ")} |`;

  const bodyRows: string[] = [];
  for (const row of rows) {
    const cells = columnNames.map((name) =>
      escapeCell(stringifyNotionPropertyValue(row.properties?.[name])),
    );
    bodyRows.push(`| ${cells.join(" | ")} |`);
  }

  const header = `\n### ${title}\n\n`;
  const truncatedNote =
    queryRes?.has_more
      ? `\n_(showing first ${MAX_ROWS} rows; database has more)_\n`
      : "";

  return `${header}${headerRow}\n${sepRow}\n${bodyRows.join("\n")}\n${truncatedNote}`;
}

function escapeCell(value: string): string {
  // Pipes inside a cell would split the column; backslash-escape per GFM.
  // Newlines collapse to a single space (markdown tables disallow newlines
  // in cells; we trade fidelity for a parseable output).
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ")
    .trim();
}

/**
 * Best-effort flattening of a Notion property value to a single string.
 * Covers the property kinds people actually see in calendars/galleries/etc:
 *   title, rich_text, number, select, multi_select, status, date, people,
 *   files, checkbox, url, email, phone_number, formula, relation,
 *   rollup, created_time, last_edited_time.
 */
function stringifyNotionPropertyValue(prop: any): string {
  if (!prop) return "";
  switch (prop.type) {
    case "title":
    case "rich_text":
      return (prop[prop.type] || [])
        .map((t: any) => t.plain_text ?? "")
        .join("");
    case "number":
      return prop.number == null ? "" : String(prop.number);
    case "select":
      return prop.select?.name ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "multi_select":
      return (prop.multi_select || []).map((s: any) => s.name).join(", ");
    case "date": {
      const d = prop.date;
      if (!d) return "";
      if (d.end) return `${d.start} → ${d.end}`;
      return d.start ?? "";
    }
    case "people":
      return (prop.people || [])
        .map((p: any) => p?.name || p?.id || "")
        .filter(Boolean)
        .join(", ");
    case "files":
      return (prop.files || [])
        .map((f: any) => f?.name || f?.external?.url || f?.file?.url || "")
        .filter(Boolean)
        .join(", ");
    case "checkbox":
      return prop.checkbox ? "✅" : "☐";
    case "url":
      return prop.url ?? "";
    case "email":
      return prop.email ?? "";
    case "phone_number":
      return prop.phone_number ?? "";
    case "formula": {
      const f = prop.formula;
      if (!f) return "";
      switch (f.type) {
        case "string":
          return f.string ?? "";
        case "number":
          return f.number == null ? "" : String(f.number);
        case "boolean":
          return f.boolean ? "true" : "false";
        case "date":
          return f.date?.start ?? "";
        default:
          return "";
      }
    }
    case "relation":
      return (prop.relation || []).map((r: any) => r.id).join(", ");
    case "rollup": {
      const r = prop.rollup;
      if (!r) return "";
      if (r.type === "array") {
        return (r.array || [])
          .map((item: any) => stringifyNotionPropertyValue(item))
          .filter(Boolean)
          .join(", ");
      }
      if (r.type === "number") return String(r.number ?? "");
      if (r.type === "date") return r.date?.start ?? "";
      return "";
    }
    case "created_time":
      return prop.created_time ?? "";
    case "last_edited_time":
      return prop.last_edited_time ?? "";
    case "created_by":
      return prop.created_by?.name || prop.created_by?.id || "";
    case "last_edited_by":
      return prop.last_edited_by?.name || prop.last_edited_by?.id || "";
    default:
      return "";
  }
}

/**
 * Return the parent page id for a given Notion page (if its parent is a
 * page — `null` for workspace-root or database-parented pages).
 */
export async function getNotionParentPageId(
  client: Client,
  pageId: string,
): Promise<string | null> {
  const page = (await client.pages.retrieve({ page_id: pageId })) as any;
  if (page?.parent?.type === "page_id") {
    return (page.parent.page_id as string) || null;
  }
  return null;
}

// List all accessible pages (for browsing/import UI)
export async function listNotionPages(client: Client, cursor?: string) {
  const response = await client.search({
    filter: { value: "page", property: "object" },
    page_size: 30,
    start_cursor: cursor,
  });

  const pages = response.results.map((page: any) => {
    let title = "Untitled";
    if (page.properties) {
      const titleProp = Object.values(page.properties).find(
        (p: any) => p.type === "title"
      ) as any;
      if (titleProp?.title?.[0]?.plain_text) {
        title = titleProp.title.map((t: any) => t.plain_text).join("");
      }
    }
    return {
      id: page.id,
      title,
      icon: page.icon?.emoji || page.icon?.external?.url || null,
      lastEditedTime: page.last_edited_time,
      url: page.url,
      parentType: page.parent?.type || null,
    };
  });

  return {
    pages,
    hasMore: response.has_more,
    nextCursor: response.next_cursor,
  };
}
