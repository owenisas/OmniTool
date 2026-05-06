import { describe, expect, it } from "vitest";
import { markdownToBlocksServer } from "@omnitool/ai/utils";

/**
 * Sanity tests for the server-safe markdown converter. The function must
 * never touch `document` and must produce BlockNote-compatible JSON that
 * round-trips through persistence.
 */

describe("markdownToBlocksServer", () => {
  it("returns empty paragraph for empty input", () => {
    const blocks = markdownToBlocksServer("");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("paragraph");
  });

  it("converts ATX headings", () => {
    const blocks = markdownToBlocksServer("# H1\n\n## H2\n\n### H3");
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.type).toBe("heading");
    expect((blocks[0]!.props as { level: number }).level).toBe(1);
    expect((blocks[1]!.props as { level: number }).level).toBe(2);
    expect((blocks[2]!.props as { level: number }).level).toBe(3);
  });

  it("converts paragraphs with bold + italic + code inline", () => {
    const blocks = markdownToBlocksServer(
      "This is **bold** and *italic* and `code`.",
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("paragraph");
    const inlines = blocks[0]!.content!;
    const hasBold = inlines.some(
      (n) => n.type === "text" && n.styles?.bold === true,
    );
    const hasItalic = inlines.some(
      (n) => n.type === "text" && n.styles?.italic === true,
    );
    const hasCode = inlines.some(
      (n) => n.type === "text" && n.styles?.code === true,
    );
    expect(hasBold).toBe(true);
    expect(hasItalic).toBe(true);
    expect(hasCode).toBe(true);
  });

  it("converts links to link inline content", () => {
    const blocks = markdownToBlocksServer("See [docs](https://example.com).");
    const link = blocks[0]!.content!.find((n) => n.type === "link");
    expect(link).toBeDefined();
    // @ts-expect-error narrowed at runtime
    expect(link.href).toBe("https://example.com");
  });

  it("converts bullet and numbered lists", () => {
    const blocks = markdownToBlocksServer("- one\n- two\n\n1. first\n2. second");
    const types = blocks.map((b) => b.type);
    expect(types).toContain("bulletListItem");
    expect(types).toContain("numberedListItem");
  });

  it("converts fenced code blocks with language", () => {
    const blocks = markdownToBlocksServer(
      "```ts\nconst x = 1;\nconst y = 2;\n```",
    );
    expect(blocks[0]!.type).toBe("codeBlock");
    expect((blocks[0]!.props as { language: string }).language).toBe("ts");
    expect(blocks[0]!.content![0]!.type).toBe("text");
    // @ts-expect-error narrowed at runtime
    expect(blocks[0]!.content![0]!.text).toContain("const x = 1;");
  });

  it("falls back to text language when fence has no lang", () => {
    const blocks = markdownToBlocksServer("```\nfoo\n```");
    expect((blocks[0]!.props as { language: string }).language).toBe("text");
  });

  it("escapes backslash sequences", () => {
    const blocks = markdownToBlocksServer("a \\*not bold\\* b");
    const text = blocks[0]!.content!.map((n) =>
      // @ts-expect-error inline shape
      n.type === "text" ? n.text : "",
    ).join("");
    expect(text).toBe("a *not bold* b");
  });

  it("does not throw on missing `document` global (server-safe)", () => {
    // The whole point — calling the function without a DOM must succeed.
    expect(() => markdownToBlocksServer("# Title\n\nBody.")).not.toThrow();
  });

  it("does not interpret snake_case as italic", () => {
    const blocks = markdownToBlocksServer("hello_world is fine");
    const text = blocks[0]!.content!.map((n) =>
      // @ts-expect-error inline shape
      n.type === "text" ? n.text : "",
    ).join("");
    expect(text).toBe("hello_world is fine");
  });

  it("strips <details>/<summary> tags but keeps text content", () => {
    const md = `<details>\n<summary>**Website:** [http://example.com/](http://example.com/)</summary>\n- nested item\n</details>`;
    const blocks = markdownToBlocksServer(md);
    const allText = JSON.stringify(blocks);
    expect(allText).not.toContain("<details>");
    expect(allText).not.toContain("<summary>");
    expect(allText).not.toContain("</details>");
    // Bullet item below the toggle survives
    expect(blocks.some((b) => b.type === "bulletListItem")).toBe(true);
  });

  it("converts standalone image lines to image blocks", () => {
    const blocks = markdownToBlocksServer(
      "![alt text](https://cdn.example.com/img.png)",
    );
    expect(blocks[0]!.type).toBe("image");
    expect((blocks[0]!.props as { url: string }).url).toBe(
      "https://cdn.example.com/img.png",
    );
    expect((blocks[0]!.props as { caption: string }).caption).toBe("alt text");
  });

  it("converts GFM tables to BlockNote table blocks", () => {
    const md = `| h1 | h2 |\n| --- | --- |\n| a | b |\n| c | d |`;
    const blocks = markdownToBlocksServer(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe("table");
    // @ts-expect-error tableContent shape
    expect(blocks[0]!.content!.type).toBe("tableContent");
    // @ts-expect-error tableContent shape
    expect(blocks[0]!.content!.headerRows).toBe(1);
    // @ts-expect-error tableContent shape
    expect(blocks[0]!.content!.rows).toHaveLength(3); // header + 2 body rows
    // @ts-expect-error tableContent shape
    const headerCells = blocks[0]!.content!.rows[0]!.cells;
    expect(headerCells).toHaveLength(2);
    // First header cell: "h1"
    // @ts-expect-error inline shape
    expect(headerCells[0]![0]!.text).toBe("h1");
  });

  it("preserves inline formatting inside table cells", () => {
    const md = `| name | url |\n| --- | --- |\n| **bold** | [link](https://x.io) |`;
    const blocks = markdownToBlocksServer(md);
    expect(blocks[0]!.type).toBe("table");
    // @ts-expect-error tableContent
    const dataRow = blocks[0]!.content!.rows[1]!.cells;
    // First cell has bold text
    const bold = dataRow[0]!.find(
      (n: { type?: string; styles?: { bold?: boolean } }) =>
        n.type === "text" && n.styles?.bold === true,
    );
    expect(bold).toBeDefined();
    // Second cell has a link
    const link = dataRow[1]!.find(
      (n: { type?: string }) => n.type === "link",
    );
    expect(link).toBeDefined();
  });

  it("handles strikethrough ~~text~~", () => {
    const blocks = markdownToBlocksServer("a ~~struck~~ b");
    const inline = blocks[0]!.content!;
    const struck = inline.find(
      (n) => n.type === "text" && n.styles?.strike === true,
    );
    expect(struck).toBeDefined();
  });
});
