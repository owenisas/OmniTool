/**
 * Paste-detect: scan a BlockNote document for paragraph blocks whose
 * entire content is a Linear issue URL or a GitHub PR URL, and replace
 * the paragraph with the corresponding embed block.
 *
 * This is invoked from the editor's `onChange` so it fires every keystroke
 * — but the detection is idempotent: once a paragraph has been replaced
 * with `linearIssueEmbed` or `githubPrEmbed`, subsequent passes skip it
 * (the paragraph type is gone).
 */

const LINEAR_ISSUE_RE =
  /^https:\/\/linear\.app\/[^/\s]+\/issue\/([A-Z][A-Z0-9]+-\d+)(?:\/[^\s]*)?$/i;
const GITHUB_PR_RE =
  /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:[/?#][^\s]*)?$/i;

interface MinimalEditor {
  document: Array<{
    id: string;
    type: string;
    content?: unknown;
  }>;
  replaceBlocks: (blockIds: string[], blocks: unknown[]) => void;
}

/**
 * Extract the plain-text content of a BlockNote paragraph block. Returns
 * the joined text of all `text` inline content nodes, or empty string if
 * the block has no useful text.
 */
function paragraphPlainText(block: { content?: unknown }): string {
  const content = block.content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (
      item &&
      typeof item === "object" &&
      "type" in item &&
      (item as { type: string }).type === "text" &&
      "text" in item &&
      typeof (item as { text: unknown }).text === "string"
    ) {
      parts.push((item as { text: string }).text);
    } else if (
      item &&
      typeof item === "object" &&
      "type" in item &&
      (item as { type: string }).type === "link"
    ) {
      // Link inline content has nested rich text
      const nested = (item as { content?: unknown }).content;
      if (Array.isArray(nested)) {
        for (const subItem of nested) {
          if (
            subItem &&
            typeof subItem === "object" &&
            "text" in subItem &&
            typeof (subItem as { text: unknown }).text === "string"
          ) {
            parts.push((subItem as { text: string }).text);
          }
        }
      }
    }
  }
  return parts.join("").trim();
}

export function detectAndConvertUrlBlocks(editor: MinimalEditor): void {
  for (const block of editor.document) {
    if (block.type !== "paragraph") continue;
    const text = paragraphPlainText(block);
    if (!text) continue;

    const linearMatch = text.match(LINEAR_ISSUE_RE);
    if (linearMatch) {
      editor.replaceBlocks(
        [block.id],
        [
          {
            type: "linearIssueEmbed",
            props: {
              url: text,
              identifier: (linearMatch[1] ?? "").toUpperCase(),
            },
          },
        ],
      );
      // Continue — there may be multiple URL paragraphs in a multi-line
      // paste, though in practice each line lands as its own paragraph.
      continue;
    }

    const githubMatch = text.match(GITHUB_PR_RE);
    if (githubMatch) {
      editor.replaceBlocks(
        [block.id],
        [
          {
            type: "githubPrEmbed",
            props: {
              url: text,
              owner: githubMatch[1] ?? "",
              repo: githubMatch[2] ?? "",
              number: Number(githubMatch[3] ?? 0),
            },
          },
        ],
      );
      continue;
    }
  }
}
