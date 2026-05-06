/**
 * Server-safe markdown → BlockNote block JSON converter.
 *
 * BlockNote v0.49's `BlockNoteEditor.create()` + `tryParseMarkdownToBlocks`
 * relies on ProseMirror, which requires a DOM (`document`) to instantiate.
 * That's fine in the browser but throws "document is not defined" on
 * Node.js (Next.js server actions, API routes, AI tool calls).
 *
 * This converter is intentionally lightweight — it covers the markdown
 * shapes our AI tools and Notion importer realistically produce:
 *
 *  - ATX headings (#, ##, ###) → `heading` block at level 1/2/3
 *  - Paragraphs → `paragraph` block with `text` inline content
 *  - Bullet lists (- / *) → `bulletListItem`
 *  - Numbered lists (1.) → `numberedListItem`
 *  - Block quotes (> ...) → `paragraph` with italic styled text (BlockNote
 *    has no first-class quote spec out of the box)
 *  - Fenced code blocks (```lang) → `codeBlock` with `language` prop
 *  - Inline `**bold**`, `*italic*`, `_italic_`, `` `code` `` → styled text
 *  - Plain links `[label](url)` → `link` inline content
 *  - Horizontal rule `---` → empty paragraph (no native rule block)
 *  - Blank line → paragraph break
 *
 * NOT handled (gracefully degraded to plain text):
 *  - Tables, images, footnotes, task list checkboxes, raw HTML, nested
 *    children, autolinks, deeply-nested formatting (no AST tree).
 *
 * Output shape matches what BlockNote stores in the editor's `document`
 * field, so it round-trips cleanly through `editor.replaceBlocks` and
 * persistence.
 */

type InlineStyle = "bold" | "italic" | "code" | "strike";

interface InlineText {
  type: "text";
  text: string;
  styles: Partial<Record<InlineStyle, true>>;
}

interface InlineLink {
  type: "link";
  href: string;
  content: InlineText[];
}

type Inline = InlineText | InlineLink;

interface TableContent {
  type: "tableContent";
  columnWidths: (number | undefined)[];
  headerRows?: number;
  rows: { cells: Inline[][] }[];
}

interface Block {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props?: Record<string, any>;
  content?: Inline[] | TableContent;
  children?: Block[];
}

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const BULLET_RE = /^\s*[-*+]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d+\.\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^```([\w-]*)\s*$/;
const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const IMAGE_LINE_RE = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
// Block-level HTML the Notion exporter emits (toggles, raw passthroughs).
// We strip the tags and unwrap the contents back into the markdown stream.
const HTML_TAG_RE = /<\/?(details|summary|div|span|figure|figcaption|br|hr|p)[^>]*>/gi;

const DEFAULT_PROPS = {
  textColor: "default" as const,
  textAlignment: "left" as const,
  backgroundColor: "default" as const,
};

function makeText(text: string, styles: InlineText["styles"] = {}): InlineText {
  return { type: "text", text, styles };
}

/**
 * Parse inline markdown formatting in a single string. Order of operations:
 *  - escape sequences (\*, \_, \`)
 *  - inline code (`...`)
 *  - links [label](url)
 *  - bold (**...**)
 *  - italic (*...* or _..._)
 *
 * Implementation walks the string left-to-right and never recurses, so it's
 * O(n) and safe on attacker input. Emits a flat InlineContent array.
 */
function parseInline(input: string): Inline[] {
  if (!input) return [];

  const out: Inline[] = [];
  let buf = "";
  const flush = (styles: InlineText["styles"] = {}) => {
    if (buf.length > 0) {
      out.push(makeText(buf, styles));
      buf = "";
    }
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;

    // Escape: \* \_ \` \\
    if (ch === "\\" && i + 1 < input.length) {
      buf += input[i + 1];
      i += 2;
      continue;
    }

    // Strikethrough ~~...~~
    if (ch === "~" && input[i + 1] === "~") {
      const end = input.indexOf("~~", i + 2);
      if (end > i + 1) {
        flush();
        out.push(makeText(input.slice(i + 2, end), { strike: true }));
        i = end + 2;
        continue;
      }
    }

    // Inline code
    if (ch === "`") {
      const end = input.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push(makeText(input.slice(i + 1, end), { code: true }));
        i = end + 1;
        continue;
      }
    }

    // Link: [label](url)
    if (ch === "[") {
      const labelEnd = input.indexOf("]", i + 1);
      if (labelEnd > i && input[labelEnd + 1] === "(") {
        const urlEnd = input.indexOf(")", labelEnd + 2);
        if (urlEnd > labelEnd) {
          flush();
          const label = input.slice(i + 1, labelEnd);
          const url = input.slice(labelEnd + 2, urlEnd).trim();
          out.push({
            type: "link",
            href: url,
            content: [makeText(label)],
          });
          i = urlEnd + 1;
          continue;
        }
      }
    }

    // Bold **...**
    if (ch === "*" && input[i + 1] === "*") {
      const end = input.indexOf("**", i + 2);
      if (end > i + 1) {
        flush();
        out.push(makeText(input.slice(i + 2, end), { bold: true }));
        i = end + 2;
        continue;
      }
    }

    // Italic *...*
    if (ch === "*") {
      const end = input.indexOf("*", i + 1);
      if (end > i) {
        flush();
        out.push(makeText(input.slice(i + 1, end), { italic: true }));
        i = end + 1;
        continue;
      }
    }

    // Italic _..._ (only when surrounded by non-word boundaries to avoid
    // breaking snake_case identifiers).
    if (ch === "_") {
      const prev = input[i - 1] ?? " ";
      if (!/\w/.test(prev)) {
        const end = input.indexOf("_", i + 1);
        if (end > i) {
          const next = input[end + 1] ?? " ";
          if (!/\w/.test(next)) {
            flush();
            out.push(makeText(input.slice(i + 1, end), { italic: true }));
            i = end + 1;
            continue;
          }
        }
      }
    }

    buf += ch;
    i += 1;
  }

  flush();
  return out;
}

/**
 * Strip block-level HTML tags that Notion exporters emit (toggle blocks,
 * `<details>`, `<summary>`, raw `<div>`s). We unwrap their text content so
 * the inline parser can still pick up bold/links inside. Lossy by design —
 * our note model has no native toggle/details, so flattening to indented
 * markdown is the least-bad option.
 */
function stripBlockHtml(input: string): string {
  return input
    // Re-emit toggle summary as a bold-line so it stands out; contents are
    // already on the next lines.
    .replace(
      /<summary>([\s\S]*?)<\/summary>/gi,
      (_m, inner: string) => `**${inner.trim()}**`,
    )
    .replace(HTML_TAG_RE, "")
    // Collapse the artifact whitespace from stripped tags.
    .replace(/[ \t]+\n/g, "\n");
}

/**
 * Convert a markdown string to a BlockNote-compatible block array.
 * Pure function, server-safe (no DOM access).
 */
export function markdownToBlocksServer(markdown: string): Block[] {
  if (!markdown || typeof markdown !== "string") {
    return [emptyParagraph()];
  }

  const cleaned = stripBlockHtml(markdown);
  const lines = cleaned.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];

  let i = 0;
  let pendingParagraph: string[] = [];

  const flushParagraph = () => {
    if (pendingParagraph.length === 0) return;
    const text = pendingParagraph.join(" ").trim();
    pendingParagraph = [];
    if (!text) return;
    blocks.push({
      type: "paragraph",
      props: DEFAULT_PROPS,
      content: parseInline(text),
    });
  };

  while (i < lines.length) {
    const line = lines[i]!;

    // Blank line: paragraph break
    if (/^\s*$/.test(line)) {
      flushParagraph();
      i += 1;
      continue;
    }

    // Fenced code block
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      flushParagraph();
      const language = fenceMatch[1] || "";
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i += 1;
      }
      // Skip closing fence
      if (i < lines.length) i += 1;
      blocks.push({
        type: "codeBlock",
        props: { language: language || "text" },
        content: [makeText(codeLines.join("\n"))],
      });
      continue;
    }

    // Image line: ![alt](url) on its own line → image block
    const imgMatch = line.match(IMAGE_LINE_RE);
    if (imgMatch) {
      flushParagraph();
      blocks.push({
        type: "image",
        props: {
          ...DEFAULT_PROPS,
          url: imgMatch[2]!.trim(),
          caption: imgMatch[1] ?? "",
          previewWidth: 512,
        },
      });
      i += 1;
      continue;
    }

    // Markdown table: convert to a BlockNote `table` block.
    // Format expected (GFM):
    //   | h1 | h2 |
    //   | --- | --- |
    //   | a | b |
    // The separator row defines header presence; we always emit the first
    // row as the header (`headerRows: 1`).
    if (
      TABLE_ROW_RE.test(line) &&
      i + 1 < lines.length &&
      /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1]!)
    ) {
      flushParagraph();
      const tableLines: string[] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i]!)) {
        tableLines.push(lines[i]!);
        i += 1;
      }
      const tableBlock = parseMarkdownTable(tableLines);
      if (tableBlock) {
        blocks.push(tableBlock);
      } else {
        // Falsy fallback — keep raw rows visible rather than swallow content.
        blocks.push({
          type: "paragraph",
          props: DEFAULT_PROPS,
          content: parseInline(tableLines.join("\n")),
        });
      }
      continue;
    }

    // Heading
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1]!.length;
      blocks.push({
        type: "heading",
        props: { ...DEFAULT_PROPS, level },
        content: parseInline(headingMatch[2]!),
      });
      i += 1;
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      flushParagraph();
      blocks.push({
        type: "paragraph",
        props: DEFAULT_PROPS,
        content: parseInline("---"),
      });
      i += 1;
      continue;
    }

    // Bullet list
    const bulletMatch = line.match(BULLET_RE);
    if (bulletMatch) {
      flushParagraph();
      blocks.push({
        type: "bulletListItem",
        props: DEFAULT_PROPS,
        content: parseInline(bulletMatch[1]!),
      });
      i += 1;
      continue;
    }

    // Numbered list
    const numberedMatch = line.match(NUMBERED_RE);
    if (numberedMatch) {
      flushParagraph();
      blocks.push({
        type: "numberedListItem",
        props: DEFAULT_PROPS,
        content: parseInline(numberedMatch[1]!),
      });
      i += 1;
      continue;
    }

    // Quote
    const quoteMatch = line.match(QUOTE_RE);
    if (quoteMatch) {
      flushParagraph();
      blocks.push({
        type: "paragraph",
        props: DEFAULT_PROPS,
        content: parseInline(quoteMatch[1]!).map((node) => {
          if (node.type === "text") {
            return { ...node, styles: { ...node.styles, italic: true } };
          }
          return node;
        }),
      });
      i += 1;
      continue;
    }

    // Default: accumulate into a paragraph
    pendingParagraph.push(line.trim());
    i += 1;
  }

  flushParagraph();

  if (blocks.length === 0) blocks.push(emptyParagraph());
  return blocks;
}

/**
 * Split a single markdown table row into cells. Handles escaped pipes (`\|`)
 * and trims surrounding pipes + whitespace. Empty cells are preserved.
 */
function splitTableRow(row: string): string[] {
  const trimmed = row.trim().replace(/^\||\|$/g, "");
  const cells: string[] = [];
  let buf = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!;
    if (ch === "\\" && trimmed[i + 1] === "|") {
      buf += "|";
      i += 1;
      continue;
    }
    if (ch === "|") {
      cells.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

/**
 * Convert GFM table markdown lines (header, separator, body rows) into a
 * BlockNote `table` block. Returns `null` when the input doesn't look like
 * a valid table so the caller can fall back gracefully.
 */
function parseMarkdownTable(lines: string[]): Block | null {
  if (lines.length < 2) return null;
  const headerCells = splitTableRow(lines[0]!);
  if (headerCells.length === 0) return null;

  const bodyLines = lines.slice(2); // skip header + separator
  const colCount = headerCells.length;

  const rows: { cells: Inline[][] }[] = [];

  // Header row first (BlockNote uses `headerRows: 1` to mark it visually)
  rows.push({
    cells: headerCells.map((c) => parseInline(c)),
  });

  for (const bodyLine of bodyLines) {
    const cells = splitTableRow(bodyLine);
    // Pad/truncate to header column count for consistent table shape.
    const normalised: Inline[][] = [];
    for (let i = 0; i < colCount; i += 1) {
      normalised.push(parseInline(cells[i] ?? ""));
    }
    rows.push({ cells: normalised });
  }

  return {
    type: "table",
    props: { textColor: "default" },
    // BlockNote's table content shape — see @blocknote/core
    // schema/blocks/types.d.ts → TableContent<I, S>.
    content: {
      type: "tableContent",
      columnWidths: new Array(colCount).fill(undefined),
      headerRows: 1,
      rows,
    },
  };
}

function emptyParagraph(): Block {
  return {
    type: "paragraph",
    props: DEFAULT_PROPS,
    content: [],
  };
}
