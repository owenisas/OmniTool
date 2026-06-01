import { describe, it, expect } from "vitest";
import {
  normalizeSectionTitle,
  isGenericTitle,
  titleSimilarity,
  findSimilarTitle,
} from "./fuzzy-title";

describe("normalizeSectionTitle", () => {
  it("lowercases, strips punctuation/emoji, collapses whitespace", () => {
    expect(normalizeSectionTitle("  Project   Ideas!! ")).toBe("project ideas");
    expect(normalizeSectionTitle("📚 Recipes")).toBe("recipes");
    expect(normalizeSectionTitle("Café Notes")).toBe("cafe notes");
  });
});

describe("isGenericTitle", () => {
  it("flags generic titles", () => {
    expect(isGenericTitle("Misc")).toBe(true);
    expect(isGenericTitle("untitled")).toBe(true);
    expect(isGenericTitle("  Notes ")).toBe(true);
    expect(isGenericTitle("")).toBe(true);
  });
  it("does not flag real topics", () => {
    expect(isGenericTitle("Recipes")).toBe(false);
    expect(isGenericTitle("Tax 2026")).toBe(false);
  });
});

describe("titleSimilarity", () => {
  it("matches singular/plural and case/whitespace variants", () => {
    expect(titleSimilarity("Project Ideas", "project idea")).toBeGreaterThanOrEqual(0.85);
    expect(titleSimilarity("Recipes", "Recipe")).toBeGreaterThanOrEqual(0.85);
    expect(titleSimilarity("Recipes", "recipes ")).toBe(1);
  });
  it("separates genuinely different titles", () => {
    expect(titleSimilarity("Recipes", "Receipts")).toBeLessThan(0.85);
    expect(titleSimilarity("Travel", "Finance")).toBeLessThan(0.85);
  });
});

describe("findSimilarTitle", () => {
  const existing = [
    { id: "a", title: "Project Ideas" },
    { id: "b", title: "Receipts" },
    { id: "c", title: "Reading List" },
  ];

  it("collapses a near-duplicate proposal onto the existing section", () => {
    expect(findSimilarTitle("project idea", existing)?.id).toBe("a");
  });

  it("returns null when nothing is close enough", () => {
    expect(findSimilarTitle("Recipes", existing)).toBeNull();
    expect(findSimilarTitle("Woodworking", existing)).toBeNull();
  });
});
