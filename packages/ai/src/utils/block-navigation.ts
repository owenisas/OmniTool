/**
 * Recursively extract all text content from a block's `content` array and `children`.
 */
export function extractBlockText(block: any): string {
  const parts: string[] = [];

  if (Array.isArray(block?.content)) {
    for (const item of block.content) {
      if (item.type === "text" && typeof item.text === "string") {
        parts.push(item.text);
      } else if (item.type === "link" && Array.isArray(item.content)) {
        for (const linkChild of item.content) {
          if (linkChild.type === "text" && typeof linkChild.text === "string") {
            parts.push(linkChild.text);
          }
        }
      }
    }
  }

  if (Array.isArray(block?.children)) {
    for (const child of block.children) {
      const childText = extractBlockText(child);
      if (childText) {
        parts.push(childText);
      }
    }
  }

  return parts.join("");
}

/**
 * Find the index of a heading block whose text matches the given string (case-insensitive).
 * Returns -1 if not found.
 */
export function findHeadingIndex(blocks: any[], headingText: string): number {
  if (!Array.isArray(blocks)) {
    return -1;
  }

  const target = headingText.toLowerCase().trim();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block?.type === "heading") {
      const text = extractBlockText(block).toLowerCase().trim();
      if (text === target) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * Given a heading at `headingIndex`, return the range of blocks belonging to that section.
 * The range starts at headingIndex + 1 and extends to the next heading of the same or
 * higher level (lower or equal `props.level` number), or end of array.
 *
 * Returns `{ start, end }` where `start` is inclusive and `end` is exclusive.
 */
export function getSectionRange(
  blocks: any[],
  headingIndex: number
): { start: number; end: number } {
  if (!Array.isArray(blocks) || headingIndex < 0 || headingIndex >= blocks.length) {
    return { start: 0, end: 0 };
  }

  const headingBlock = blocks[headingIndex];
  const headingLevel: number = headingBlock?.props?.level ?? 1;
  const start = headingIndex + 1;

  let end = blocks.length;

  for (let i = start; i < blocks.length; i++) {
    const block = blocks[i];
    if (block?.type === "heading") {
      const level: number = block.props?.level ?? 1;
      // Same or higher level (lower number = higher level) ends the section
      if (level <= headingLevel) {
        end = i;
        break;
      }
    }
  }

  return { start, end };
}

/**
 * List all headings in the document with their text, level, and index.
 */
export function getAvailableHeadings(
  blocks: any[]
): Array<{ text: string; level: number; index: number }> {
  if (!Array.isArray(blocks)) {
    return [];
  }

  const headings: Array<{ text: string; level: number; index: number }> = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block?.type === "heading") {
      headings.push({
        text: extractBlockText(block),
        level: block.props?.level ?? 1,
        index: i,
      });
    }
  }

  return headings;
}
