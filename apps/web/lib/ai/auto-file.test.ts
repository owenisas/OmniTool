import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("./language-model", () => ({ getOmniLanguageModel: vi.fn() }));

import { generateObject } from "ai";
import { getOmniLanguageModel } from "./language-model";
import {
  classifyForAutoFile,
  decideAutoFilePlacement,
  normalizeTags,
  type AutoFileClassification,
} from "./auto-file";

const mockGenerateObject = vi.mocked(generateObject);
const mockGetModel = vi.mocked(getOmniLanguageModel);

const base: AutoFileClassification = {
  matchedSectionId: null,
  newSection: null,
  noteTitle: "Captured note",
  emoji: null,
  tags: ["recipes"],
  summary: "a gist",
  confidence: 0.9,
};

describe("normalizeTags", () => {
  it("lowercases, hyphenates, dedupes and caps", () => {
    expect(normalizeTags(["Next JS", "next js", "  AI  ", "a/b"])).toEqual([
      "next-js",
      "ai",
      "ab",
    ]);
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags(["1", "2", "3", "4", "5", "6", "7"]).length).toBe(6);
  });
});

describe("decideAutoFilePlacement", () => {
  const candidateIds = new Set(["sec-1", "sec-2"]);
  const existing = [
    { id: "sec-1", title: "Recipes" },
    { id: "sec-2", title: "Travel" },
  ];

  it("uses a matched section that is in the shortlist", () => {
    const d = decideAutoFilePlacement(
      { ...base, matchedSectionId: "sec-1" },
      candidateIds,
      existing,
    );
    expect(d).toMatchObject({ kind: "existing", sectionId: "sec-1", lowConfidence: false });
  });

  it("falls back to Inbox when matchedSectionId is hallucinated and no newSection", () => {
    const d = decideAutoFilePlacement(
      { ...base, matchedSectionId: "ghost-id" },
      candidateIds,
      existing,
    );
    expect(d.kind).toBe("inbox");
  });

  it("routes low-confidence captures to Inbox even with a valid match", () => {
    const d = decideAutoFilePlacement(
      { ...base, matchedSectionId: "sec-1", confidence: 0.3 },
      candidateIds,
      existing,
    );
    expect(d).toMatchObject({ kind: "inbox", lowConfidence: true });
  });

  it("creates a new section when nothing matches", () => {
    const d = decideAutoFilePlacement(
      { ...base, newSection: { title: "Woodworking", emoji: "🪚" } },
      candidateIds,
      existing,
    );
    expect(d).toMatchObject({ kind: "create", newSectionTitle: "Woodworking" });
  });

  it("collapses a near-duplicate new section onto the existing one (anti-sprawl)", () => {
    const d = decideAutoFilePlacement(
      { ...base, newSection: { title: "recipe", emoji: null } },
      candidateIds,
      existing,
    );
    expect(d).toMatchObject({ kind: "existing", sectionId: "sec-1" });
  });

  it("routes a generic new-section title to Inbox", () => {
    const d = decideAutoFilePlacement(
      { ...base, newSection: { title: "Misc", emoji: null } },
      candidateIds,
      existing,
    );
    expect(d.kind).toBe("inbox");
  });
});

describe("classifyForAutoFile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns unconfigured when no model is available (no LLM spend)", async () => {
    mockGetModel.mockReturnValue(null);
    const r = await classifyForAutoFile({ content: "hello", candidateSections: [] });
    expect(r).toEqual({ ok: false, reason: "unconfigured" });
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it("returns the classification when the model succeeds", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetModel.mockReturnValue({ provider: "anthropic", model: {} as any } as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGenerateObject.mockResolvedValue({ object: { ...base, matchedSectionId: "sec-1" } } as any);
    const r = await classifyForAutoFile({
      content: "x",
      candidateSections: [{ id: "sec-1", title: "Recipes" }],
    });
    expect(r).toEqual({
      ok: true,
      classification: expect.objectContaining({ matchedSectionId: "sec-1" }),
    });
  });

  it("returns error when the model throws", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetModel.mockReturnValue({ provider: "anthropic", model: {} as any } as any);
    mockGenerateObject.mockRejectedValue(new Error("boom"));
    const r = await classifyForAutoFile({ content: "x", candidateSections: [] });
    expect(r).toEqual({ ok: false, reason: "error" });
  });
});
