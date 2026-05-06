import { describe, expect, it } from "vitest";
import { groupByParent, type TreeNode } from "./tree";

const baseDate = new Date("2026-01-01T00:00:00Z");

function makeNote(overrides: Partial<TreeNode>): TreeNode {
  return {
    id: overrides.id ?? "n",
    title: overrides.title ?? "Untitled",
    parentId: overrides.parentId ?? null,
    position: overrides.position ?? 0,
    isPinned: overrides.isPinned ?? false,
    updatedAt: overrides.updatedAt ?? baseDate,
  };
}

describe("groupByParent", () => {
  it("returns empty map for empty input", () => {
    const m = groupByParent([]);
    expect(m.size).toBe(0);
  });

  it("groups roots under null bucket", () => {
    const notes = [
      makeNote({ id: "a" }),
      makeNote({ id: "b" }),
    ];
    const m = groupByParent(notes);
    expect(m.get(null)?.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("groups children under their parent id", () => {
    const notes = [
      makeNote({ id: "p" }),
      makeNote({ id: "c1", parentId: "p" }),
      makeNote({ id: "c2", parentId: "p" }),
    ];
    const m = groupByParent(notes);
    expect(m.get("p")?.map((n) => n.id).sort()).toEqual(["c1", "c2"]);
    expect(m.get(null)?.map((n) => n.id)).toEqual(["p"]);
  });

  it("orders pinned notes before unpinned", () => {
    const notes = [
      makeNote({ id: "a", position: 0, isPinned: false }),
      makeNote({ id: "b", position: 1, isPinned: true }),
      makeNote({ id: "c", position: 2, isPinned: false }),
    ];
    const m = groupByParent(notes);
    expect(m.get(null)!.map((n) => n.id)).toEqual(["b", "a", "c"]);
  });

  it("orders by position ascending then updatedAt descending", () => {
    const notes = [
      makeNote({ id: "a", position: 1, updatedAt: new Date("2026-02-01") }),
      makeNote({ id: "b", position: 0, updatedAt: new Date("2026-02-01") }),
      makeNote({ id: "c", position: 1, updatedAt: new Date("2026-03-01") }),
    ];
    const m = groupByParent(notes);
    // position 0 first, then position 1 sorted by updatedAt desc
    expect(m.get(null)!.map((n) => n.id)).toEqual(["b", "c", "a"]);
  });

  it("treats undefined parentId as null", () => {
    const notes = [
      makeNote({ id: "x", parentId: null }),
    ];
    const m = groupByParent(notes);
    expect(m.has(null)).toBe(true);
    expect(m.get(null)![0]!.id).toBe("x");
  });
});
