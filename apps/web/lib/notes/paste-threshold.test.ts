import { describe, it, expect } from "vitest";
import { isLargePaste } from "./paste-threshold";

describe("isLargePaste", () => {
  it("returns false for empty / whitespace-only", () => {
    expect(isLargePaste("")).toBe(false);
    expect(isLargePaste("   \n  ")).toBe(false);
  });

  it("returns false for a couple of words", () => {
    expect(isLargePaste("quick note")).toBe(false);
    expect(isLargePaste("buy milk and eggs")).toBe(false);
  });

  it("returns false for a single URL/token however long", () => {
    expect(
      isLargePaste("https://example.com/a/very/long/path?with=query&and=more"),
    ).toBe(false);
    expect(isLargePaste("supercalifragilisticexpialidocious".repeat(20))).toBe(
      false,
    );
  });

  it("returns true for a long single-line paragraph (>= threshold)", () => {
    const para = "word ".repeat(80).trim(); // ~400 chars, has spaces, single line
    expect(para.length).toBeGreaterThanOrEqual(280);
    expect(isLargePaste(para)).toBe(true);
  });

  it("returns true for multi-line content over the multiline floor", () => {
    const multi =
      "First line of a captured idea that is worth keeping around for later.\n" +
      "Second line with quite a bit more supporting detail to read here too.";
    expect(multi.length).toBeGreaterThanOrEqual(120);
    expect(multi.length).toBeLessThan(280); // proves the multiline floor (not threshold) is what triggers
    expect(isLargePaste(multi)).toBe(true);
  });

  it("returns false for short multi-line snippets", () => {
    expect(isLargePaste("a\nb\nc")).toBe(false);
  });

  it("respects a custom threshold", () => {
    const text = "one two three four five"; // 23 chars, single line
    expect(isLargePaste(text, 10)).toBe(true);
    expect(isLargePaste(text, 1000)).toBe(false);
  });
});
