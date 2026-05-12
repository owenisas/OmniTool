import { describe, expect, it, vi } from "vitest";
import { detectAndConvertUrlBlocks } from "./url-detect";

function paragraph(id: string, text: string) {
  return {
    id,
    type: "paragraph",
    content: [{ type: "text", text, styles: {} }],
  };
}

describe("detectAndConvertUrlBlocks", () => {
  it("converts a Linear issue URL paragraph to a linearIssueEmbed block", () => {
    const replaceBlocks = vi.fn();
    const editor = {
      document: [paragraph("p1", "https://linear.app/acme/issue/ENG-42")],
      replaceBlocks,
    };
    detectAndConvertUrlBlocks(editor);
    expect(replaceBlocks).toHaveBeenCalledWith(
      ["p1"],
      [
        {
          type: "linearIssueEmbed",
          props: {
            url: "https://linear.app/acme/issue/ENG-42",
            identifier: "ENG-42",
          },
        },
      ],
    );
  });

  it("converts a GitHub PR URL paragraph to a githubPrEmbed block", () => {
    const replaceBlocks = vi.fn();
    const editor = {
      document: [paragraph("p1", "https://github.com/acme/web/pull/123")],
      replaceBlocks,
    };
    detectAndConvertUrlBlocks(editor);
    expect(replaceBlocks).toHaveBeenCalledWith(
      ["p1"],
      [
        {
          type: "githubPrEmbed",
          props: {
            url: "https://github.com/acme/web/pull/123",
            owner: "acme",
            repo: "web",
            number: 123,
          },
        },
      ],
    );
  });

  it("ignores paragraphs with mixed content", () => {
    const replaceBlocks = vi.fn();
    const editor = {
      document: [
        paragraph("p1", "see https://linear.app/acme/issue/ENG-42 for details"),
      ],
      replaceBlocks,
    };
    detectAndConvertUrlBlocks(editor);
    expect(replaceBlocks).not.toHaveBeenCalled();
  });

  it("skips already-converted embed blocks", () => {
    const replaceBlocks = vi.fn();
    const editor = {
      document: [
        {
          id: "p1",
          type: "linearIssueEmbed",
          content: undefined,
        },
      ],
      replaceBlocks,
    };
    detectAndConvertUrlBlocks(editor);
    expect(replaceBlocks).not.toHaveBeenCalled();
  });
});
