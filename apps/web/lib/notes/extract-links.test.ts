import { describe, expect, it } from "vitest";
import { extractNoteLinks } from "./extract-links";

describe("extractNoteLinks", () => {
  it("returns empty array for non-array input", () => {
    expect(extractNoteLinks(null, "self")).toEqual([]);
    expect(extractNoteLinks(undefined, "self")).toEqual([]);
    expect(extractNoteLinks({}, "self")).toEqual([]);
    expect(extractNoteLinks("string", "self")).toEqual([]);
  });

  it("extracts a top-level noteEmbed block", () => {
    const blocks = [
      {
        id: "b1",
        type: "noteEmbed",
        props: { noteId: "target1" },
      },
    ];
    const links = extractNoteLinks(blocks, "self");
    expect(links).toEqual([
      { targetNoteId: "target1", kind: "embed", blockId: "b1" },
    ]);
  });

  it("extracts inline noteMention chips", () => {
    const blocks = [
      {
        id: "b1",
        type: "paragraph",
        content: [
          { type: "text", text: "see " },
          { type: "noteMention", props: { noteId: "tgt", title: "T" } },
        ],
      },
    ];
    const links = extractNoteLinks(blocks, "self");
    expect(links).toEqual([
      { targetNoteId: "tgt", kind: "mention", blockId: "b1" },
    ]);
  });

  it("recurses into block children", () => {
    const blocks = [
      {
        id: "outer",
        type: "bulletListItem",
        children: [
          {
            id: "inner",
            type: "noteEmbed",
            props: { noteId: "deep" },
          },
        ],
      },
    ];
    const links = extractNoteLinks(blocks, "self");
    expect(links).toEqual([
      { targetNoteId: "deep", kind: "embed", blockId: "inner" },
    ]);
  });

  it("excludes self-links", () => {
    const blocks = [
      {
        id: "b1",
        type: "noteEmbed",
        props: { noteId: "self" },
      },
      {
        id: "b2",
        type: "paragraph",
        content: [
          { type: "noteMention", props: { noteId: "self", title: "S" } },
        ],
      },
    ];
    expect(extractNoteLinks(blocks, "self")).toEqual([]);
  });

  it("dedupes by (target, kind, blockId)", () => {
    const blocks = [
      {
        id: "b1",
        type: "paragraph",
        content: [
          { type: "noteMention", props: { noteId: "x", title: "X" } },
          { type: "noteMention", props: { noteId: "x", title: "X" } },
        ],
      },
    ];
    const links = extractNoteLinks(blocks, "self");
    expect(links).toHaveLength(1);
  });

  it("ignores invalid / empty noteId props", () => {
    const blocks = [
      { id: "b1", type: "noteEmbed", props: { noteId: "" } },
      { id: "b2", type: "noteEmbed", props: {} },
      {
        id: "b3",
        type: "paragraph",
        content: [
          { type: "noteMention", props: { noteId: "" } },
        ],
      },
    ];
    expect(extractNoteLinks(blocks, "self")).toEqual([]);
  });

  it("handles mixed mention + embed in one document", () => {
    const blocks = [
      {
        id: "b1",
        type: "paragraph",
        content: [
          { type: "noteMention", props: { noteId: "a", title: "A" } },
        ],
      },
      { id: "b2", type: "noteEmbed", props: { noteId: "b" } },
    ];
    const links = extractNoteLinks(blocks, "self");
    // Walker order: blocks in document order; within a paragraph, mentions
    // are emitted as the inline content is traversed. Result shape is what
    // matters; assert by sort to make ordering robust.
    const sorted = [...links].sort((x, y) =>
      x.targetNoteId.localeCompare(y.targetNoteId),
    );
    expect(sorted).toEqual([
      { targetNoteId: "a", kind: "mention", blockId: "b1" },
      { targetNoteId: "b", kind: "embed", blockId: "b2" },
    ]);
  });
});
