import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("ai", () => ({ generateObject: vi.fn(), generateText: vi.fn() }));
vi.mock("./language-model", () => ({ getOmniLanguageModel: vi.fn() }));

import { generateObject, generateText } from "ai";
import { getOmniLanguageModel } from "./language-model";
import {
  classifyForAutoFile,
  coerceClassification,
  decideAutoFilePlacement,
  normalizeTags,
  type AutoFileClassification,
} from "./auto-file";

const mockGenerateObject = vi.mocked(generateObject);
const mockGenerateText = vi.mocked(generateText);
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

  it("honors a valid match even at low confidence (flags it for review, not Inbox)", () => {
    const d = decideAutoFilePlacement(
      { ...base, matchedSectionId: "sec-1", confidence: 0.3 },
      candidateIds,
      existing,
    );
    expect(d).toMatchObject({ kind: "existing", sectionId: "sec-1", lowConfidence: true });
  });

  it("routes a LOW-confidence NEW-section proposal to Inbox (avoids speculative sections)", () => {
    const d = decideAutoFilePlacement(
      { ...base, newSection: { title: "Woodworking", emoji: null }, confidence: 0.3 },
      candidateIds,
      existing,
    );
    expect(d.kind).toBe("inbox");
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

  it("uses generateText + JSON parse for NIM/gemma (not generateObject)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetModel.mockReturnValue({ provider: "nvidia-nim", model: {} as any } as any);
    mockGenerateText.mockResolvedValue({
      text:
        'Here you go:\n```json\n{"matchedSectionId":"sec-1","newSection":null,"noteTitle":"Site SEO","emoji":null,"tags":["seo"],"summary":"s","confidence":0.8}\n```',
    } as any);
    const r = await classifyForAutoFile({
      content: "website seo improvements",
      candidateSections: [{ id: "sec-1", title: "Official-Website" }],
    });
    expect(mockGenerateObject).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: true,
      classification: expect.objectContaining({ matchedSectionId: "sec-1", confidence: 0.8 }),
    });
  });

  it("returns error when NIM output has no parseable JSON", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetModel.mockReturnValue({ provider: "nvidia-nim", model: {} as any } as any);
    mockGenerateText.mockResolvedValue({ text: "I cannot help with that." } as any);
    const r = await classifyForAutoFile({ content: "x", candidateSections: [] });
    expect(r).toEqual({ ok: false, reason: "error" });
  });
});

describe("coerceClassification", () => {
  it("fills defaults and clamps loose model output", () => {
    const c = coerceClassification({
      matchedSectionId: "  sec-9  ",
      noteTitle: "  Hello  ",
      confidence: "1.4",
      tags: ["a", 3, "b"],
    });
    expect(c).toMatchObject({ matchedSectionId: "sec-9", noteTitle: "Hello", confidence: 1, tags: ["a", "b"] });
  });
  it("rejects objects without a title", () => {
    expect(coerceClassification({ confidence: 0.9 })).toBeNull();
    expect(coerceClassification(null)).toBeNull();
  });
});
