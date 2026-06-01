import { generateObject } from "ai";
import { z } from "zod";
import { getOmniLanguageModel } from "./language-model";
import { findSimilarTitle, isGenericTitle } from "@/lib/notes/fuzzy-title";

/**
 * AI "auto-sort" classification.
 *
 * `classifyForAutoFile` makes the single structured LLM call (mirrors
 * `lib/ai/topic-extraction.ts`): given the pasted content + a shortlist of
 * candidate sections, it returns where the note should be filed. It degrades
 * gracefully — `{ ok: false }` when no model is configured or the call throws —
 * so the caller can fall back to the Inbox without ever blocking a capture.
 *
 * `decideAutoFilePlacement` is the PURE post-processor that turns the model's
 * raw classification into a concrete placement, applying the guards the model
 * itself can't be trusted to honor: reject hallucinated section ids, collapse
 * near-duplicate new sections (anti-sprawl), drop generic titles, and route
 * low-confidence captures to the Inbox. Kept pure (no DB) so it's unit-testable.
 */

export const autoFileSchema = z.object({
  matchedSectionId: z
    .string()
    .nullable()
    .describe("Verbatim id of the best existing section, or null to propose a new one"),
  newSection: z
    .object({
      title: z.string().max(60),
      emoji: z.string().max(8).nullable(),
    })
    .nullable()
    .describe("A NEW section to create — only when matchedSectionId is null"),
  noteTitle: z.string().min(1).max(120).describe("Short, specific title for this note"),
  emoji: z.string().max(8).nullable(),
  tags: z
    .array(z.string().min(1).max(30))
    .max(6)
    .describe("2-5 lowercase-hyphenated topical tags"),
  summary: z.string().max(280).describe("One-sentence gist"),
  confidence: z.number().min(0).max(1).describe("0-1 certainty the destination is right"),
});

export type AutoFileClassification = z.infer<typeof autoFileSchema>;

export interface CandidateSection {
  id: string;
  title: string;
  emoji?: string | null;
  /** Cheap digest: section body excerpt + child titles. */
  digest?: string;
}

export type ClassifyResult =
  | { ok: true; classification: AutoFileClassification }
  | { ok: false; reason: "unconfigured" | "error" };

const MAX_CONTENT_CHARS = 8000;

export function buildAutoFilePrompt(args: {
  content: string;
  candidateSections: CandidateSection[];
  topTags?: string[];
}): string {
  const candidates = args.candidateSections.length
    ? args.candidateSections
        .map(
          (s, i) =>
            `${i + 1}. [${s.id}] ${s.emoji ?? ""} ${s.title}${
              s.digest ? ` — ${s.digest}` : ""
            }`,
        )
        .join("\n")
    : "(no existing sections yet)";
  const tags =
    args.topTags && args.topTags.length ? args.topTags.join(", ") : "(none yet)";
  const content = args.content.slice(0, MAX_CONTENT_CHARS);

  return `You file pasted content into the single best "section" (a folder-like note) in the user's notebook.

## Existing sections (candidates)
${candidates}

## Existing tags (reuse these when relevant)
${tags}

## Pasted content
${content}

## Instructions
- Pick the ONE existing section that best fits and return its id verbatim in "matchedSectionId". STRONGLY prefer reusing an existing section, even a loosely related one.
- Only when no candidate is even loosely related, set "matchedSectionId" to null and propose a concise "newSection" (1-3 words, Title Case). Never invent generic sections like "Misc", "Notes", or "General".
- "noteTitle": a short, specific title for THIS captured note.
- "tags": 2-5 lowercase-hyphenated topical tags; reuse an existing tag above when it fits.
- "summary": one sentence describing the content.
- "confidence": 0-1, your certainty the destination is correct. Use a low value when the content is ambiguous or fits nothing well.
- Set EXACTLY one of "matchedSectionId" or "newSection"; leave the other null.`;
}

export async function classifyForAutoFile(args: {
  content: string;
  candidateSections: CandidateSection[];
  topTags?: string[];
}): Promise<ClassifyResult> {
  const lm = getOmniLanguageModel();
  if (!lm) return { ok: false, reason: "unconfigured" };

  try {
    const result = await generateObject({
      model: lm.model,
      schema: autoFileSchema,
      prompt: buildAutoFilePrompt(args),
      temperature: 0.25,
    });
    return { ok: true, classification: result.object };
  } catch (err) {
    console.error("[auto-file] classification failed:", err);
    return { ok: false, reason: "error" };
  }
}

// ─── Pure placement decision ────────────────────────────────────────────────

export interface AutoFilePlacementBase {
  noteTitle: string;
  emoji: string | null;
  tags: string[];
  summary: string;
  confidence: number;
}

export type AutoFileDecision =
  | ({ kind: "existing"; sectionId: string; lowConfidence: false } & AutoFilePlacementBase)
  | ({
      kind: "create";
      newSectionTitle: string;
      newSectionEmoji: string | null;
      lowConfidence: false;
    } & AutoFilePlacementBase)
  | ({ kind: "inbox"; lowConfidence: true } & AutoFilePlacementBase);

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.55;

/** Normalize, dedupe and cap tags to a clean lowercase-hyphenated set. */
export function normalizeTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const norm = raw
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out.slice(0, 6);
}

export function decideAutoFilePlacement(
  c: AutoFileClassification,
  candidateIds: Set<string>,
  existingTopLevel: { id: string; title: string }[],
  opts?: { confidenceThreshold?: number },
): AutoFileDecision {
  const threshold = opts?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const base: AutoFilePlacementBase = {
    noteTitle: (c.noteTitle || "Untitled note").trim().slice(0, 120) || "Untitled note",
    emoji: c.emoji ?? null,
    tags: normalizeTags(c.tags),
    summary: (c.summary ?? "").slice(0, 280),
    confidence: c.confidence,
  };

  // Low confidence → Inbox regardless of what the model proposed.
  if (c.confidence < threshold) {
    return { kind: "inbox", lowConfidence: true, ...base };
  }

  // Existing match — only if it's actually in the shortlist (anti-hallucination).
  if (c.matchedSectionId && candidateIds.has(c.matchedSectionId)) {
    return { kind: "existing", sectionId: c.matchedSectionId, lowConfidence: false, ...base };
  }

  // Propose new — unless generic or a near-duplicate of an existing section.
  const proposedTitle = c.newSection?.title?.trim();
  if (proposedTitle && !isGenericTitle(proposedTitle)) {
    const dup = findSimilarTitle(proposedTitle, existingTopLevel);
    if (dup) {
      return { kind: "existing", sectionId: dup.id, lowConfidence: false, ...base };
    }
    return {
      kind: "create",
      newSectionTitle: proposedTitle.slice(0, 60),
      newSectionEmoji: c.newSection?.emoji ?? null,
      lowConfidence: false,
      ...base,
    };
  }

  // Neither a valid match nor a usable new section → Inbox.
  return { kind: "inbox", lowConfidence: true, ...base };
}
