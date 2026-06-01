import { generateObject, generateText } from "ai";
import { z } from "zod";
import { getOmniLanguageModel } from "./language-model";
import { findSimilarTitle, isGenericTitle } from "@/lib/notes/fuzzy-title";

/**
 * AI "auto-sort" classification.
 *
 * `classifyForAutoFile` makes the single LLM call that decides where a capture
 * is filed. It is robust across providers:
 *   - Anthropic / capable models → `generateObject` (strict structured output).
 *   - NVIDIA NIM (e.g. gemma) → `generateText` + tolerant JSON parsing, because
 *     these OpenAI-compatible endpoints often DON'T support the json_schema
 *     structured-output mode `generateObject` relies on (it would throw, and we
 *     used to silently fall back to Inbox for every capture).
 * It degrades gracefully — `{ ok: false }` when no model is configured or the
 * call/parse fails — so a capture is never lost.
 *
 * `decideAutoFilePlacement` is the PURE post-processor that turns the raw
 * classification into a concrete placement, applying guards the model can't be
 * trusted with: reject hallucinated section ids, collapse near-duplicate new
 * sections (anti-sprawl), drop generic titles. A VALID existing-section match is
 * always honored (low confidence only flags it for review, never discards it);
 * confidence gating applies only to *creating new* sections.
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
            `${i + 1}. id="${s.id}" — ${s.emoji ?? ""} ${s.title}${
              s.digest ? ` — ${s.digest}` : ""
            }`,
        )
        .join("\n")
    : "(the notebook has no sections yet)";
  const tags =
    args.topTags && args.topTags.length ? args.topTags.join(", ") : "(none yet)";
  const content = args.content.slice(0, MAX_CONTENT_CHARS);

  return `You are filing a captured note into the user's existing notebook. Your PRIMARY job is to place it under the SINGLE most relevant EXISTING section. Read each candidate section and its digest carefully before deciding — do not skim.

## Existing sections (pick ONE of these by its id)
${candidates}

## Existing tags (reuse these when relevant)
${tags}

## The captured note to file
${content}

## Rules, in priority order
1. If ANY existing section is topically related — even loosely — return its exact id in "matchedSectionId" and set "newSection" to null. STRONGLY prefer reusing a section. (e.g. a note about website SEO / UI / frontend belongs under an existing "Website"/"Official-Website" section; a note about a product belongs under that product's section.)
2. ONLY if NO existing section is even loosely related, set "matchedSectionId" to null and propose a concise "newSection" (1-3 words, Title Case). Never propose generic names like "Misc", "Notes", "Inbox", "General", or "Ideas".
3. "noteTitle": a short, specific title (max ~8 words) — not a copy of the whole text.
4. "tags": 2-5 lowercase-hyphenated topic tags; reuse a tag listed above when it fits.
5. "summary": one sentence describing the note.
6. "confidence": 0-1. Use >= 0.6 when a section clearly fits; reserve < 0.4 for notes genuinely unrelated to everything.

Set EXACTLY one of "matchedSectionId" or "newSection"; the other MUST be null.
Respond with a SINGLE JSON object with exactly these keys: matchedSectionId, newSection, noteTitle, emoji, tags, summary, confidence.`;
}

/** Extract the first JSON object from a model's text response (tolerant of code fences / prose). */
function extractJsonObject(text: string): unknown {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]! : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Coerce a loosely-shaped object (from a weaker model) into a valid classification, or null. */
export function coerceClassification(raw: unknown): AutoFileClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const noteTitle = typeof r.noteTitle === "string" ? r.noteTitle.trim() : "";
  if (!noteTitle) return null;

  const ns = r.newSection;
  const newSection =
    ns && typeof ns === "object" && typeof (ns as Record<string, unknown>).title === "string"
      ? {
          title: String((ns as Record<string, unknown>).title),
          emoji:
            typeof (ns as Record<string, unknown>).emoji === "string"
              ? String((ns as Record<string, unknown>).emoji)
              : null,
        }
      : null;

  let confidence = 0.5;
  if (typeof r.confidence === "number") confidence = r.confidence;
  else if (typeof r.confidence === "string") {
    const n = parseFloat(r.confidence);
    if (!Number.isNaN(n)) confidence = n;
  }
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    matchedSectionId:
      typeof r.matchedSectionId === "string" && r.matchedSectionId.trim()
        ? r.matchedSectionId.trim()
        : null,
    newSection,
    noteTitle: noteTitle.slice(0, 120),
    emoji: typeof r.emoji === "string" ? r.emoji : null,
    tags: Array.isArray(r.tags)
      ? r.tags.filter((t): t is string => typeof t === "string").slice(0, 6)
      : [],
    summary: typeof r.summary === "string" ? r.summary : "",
    confidence,
  };
}

export async function classifyForAutoFile(args: {
  content: string;
  candidateSections: CandidateSection[];
  topTags?: string[];
}): Promise<ClassifyResult> {
  const lm = getOmniLanguageModel();
  if (!lm) return { ok: false, reason: "unconfigured" };

  const prompt = buildAutoFilePrompt(args);

  try {
    // Strict structured output works on Anthropic; many NIM/OpenAI-compatible
    // models (gemma, etc.) reject the json_schema mode, so use plain text + parse.
    if (lm.provider === "nvidia-nim") {
      const { text } = await generateText({
        model: lm.model,
        temperature: 0.2,
        prompt: `${prompt}\n\nReturn ONLY the JSON object — no prose, no code fences.`,
      });
      const coerced = coerceClassification(extractJsonObject(text));
      if (!coerced) {
        console.error(
          "[auto-file] NIM classification unparseable:",
          text?.slice(0, 300),
        );
        return { ok: false, reason: "error" };
      }
      return { ok: true, classification: coerced };
    }

    const result = await generateObject({
      model: lm.model,
      schema: autoFileSchema,
      prompt,
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
  | ({ kind: "existing"; sectionId: string; lowConfidence: boolean } & AutoFilePlacementBase)
  | ({
      kind: "create";
      newSectionTitle: string;
      newSectionEmoji: string | null;
      lowConfidence: false;
    } & AutoFilePlacementBase)
  | ({ kind: "inbox"; lowConfidence: true } & AutoFilePlacementBase);

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

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
  const lowConf = c.confidence < threshold;

  // 1. A VALID existing match is always honored — the match itself is the
  //    signal. A weak confidence only flags it for review (never discards it).
  if (c.matchedSectionId && candidateIds.has(c.matchedSectionId)) {
    return { kind: "existing", sectionId: c.matchedSectionId, lowConfidence: lowConf, ...base };
  }

  // 2. A proposed new section — but collapse near-duplicates onto the existing
  //    section, drop generic titles, and only CREATE when reasonably confident
  //    (creating speculative sections is what causes sprawl + the Inbox dumps).
  const proposedTitle = c.newSection?.title?.trim();
  if (proposedTitle && !isGenericTitle(proposedTitle)) {
    const dup = findSimilarTitle(proposedTitle, existingTopLevel);
    if (dup) {
      return { kind: "existing", sectionId: dup.id, lowConfidence: lowConf, ...base };
    }
    if (!lowConf) {
      return {
        kind: "create",
        newSectionTitle: proposedTitle.slice(0, 60),
        newSectionEmoji: c.newSection?.emoji ?? null,
        lowConfidence: false,
        ...base,
      };
    }
  }

  // 3. No usable match and not confident enough to create → Inbox for review.
  return { kind: "inbox", lowConfidence: true, ...base };
}
