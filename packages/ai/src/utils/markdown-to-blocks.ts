import { BlockNoteEditor } from "@blocknote/core";

/**
 * Convert a markdown string to BlockNote block JSON.
 * Uses BlockNoteEditor.create() which works headlessly (no DOM) in v0.49+.
 */
export async function markdownToNoteBlocks(
  markdown: string
): Promise<unknown[]> {
  const editor = BlockNoteEditor.create();
  const blocks = await editor.tryParseMarkdownToBlocks(markdown);
  return blocks as unknown[];
}

/**
 * Recursively extract plain text from an array of BlockNote blocks.
 * Joins block text with newlines and recurses into children.
 */
export function blocksToPlainText(blocks: unknown[]): string {
  if (!Array.isArray(blocks)) {
    return "";
  }

  const lines: string[] = [];

  for (const block of blocks) {
    const b = block as {
      content?: unknown[];
      children?: unknown[];
    };

    const text = extractInlineContent(b.content);
    if (text) {
      lines.push(text);
    }

    if (Array.isArray(b.children) && b.children.length > 0) {
      const childText = blocksToPlainText(b.children);
      if (childText) {
        lines.push(childText);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Extract text from a BlockNote inline content array.
 * Handles "text" and "link" content types.
 */
function extractInlineContent(content: unknown[] | undefined): string {
  if (!Array.isArray(content)) {
    return "";
  }

  const parts: string[] = [];

  for (const item of content) {
    const node = item as {
      type?: string;
      text?: string;
      content?: unknown[];
    };

    if (node.type === "text" && typeof node.text === "string") {
      parts.push(node.text);
    } else if (node.type === "link" && Array.isArray(node.content)) {
      parts.push(extractInlineContent(node.content));
    }
  }

  return parts.join("");
}
