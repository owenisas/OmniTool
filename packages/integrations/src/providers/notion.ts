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
export async function notionBlocksToMarkdown(
  client: Client,
  pageId: string
): Promise<string> {
  const n2m = new NotionToMarkdown({ notionClient: client });
  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdBlocks);
  return mdString.parent;
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
