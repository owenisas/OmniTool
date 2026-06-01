/**
 * Read-only planning stage for AI auto-sort (no writes — the router applies the
 * decision in a short transaction afterward).
 *
 * Pipeline: derive keywords from the paste → FTS shortlist (`searchNotesCore`)
 * → roll hits up to their top-level section and pick the top-K → build cheap
 * digests (section body excerpt + child titles) → one structured LLM call
 * (`classifyForAutoFile`) → deterministic placement (`decideAutoFilePlacement`).
 *
 * Context stays bounded (~K sections + capped paste) regardless of how many
 * notes the user has. When the model is unavailable or errors, we fall back to
 * an Inbox placement so a capture is never lost.
 */
import { prisma as prismaClient } from "@omnitool/database";
import { searchNotesCore } from "@/lib/notes/search";
import {
  classifyForAutoFile,
  decideAutoFilePlacement,
  type AutoFileDecision,
  type CandidateSection,
} from "@/lib/ai/auto-file";

type Db = typeof prismaClient;

const TOP_LEVEL_CAP = 200;
const SHORTLIST_K = 8;
const FTS_HITS = 24;
const CHILD_TITLES_PER_SECTION = 12;
const DIGEST_BODY_CHARS = 200;
const DIGEST_CHILDREN_CHARS = 200;

const STOPWORDS = new Set([
  "the", "and", "for", "are", "was", "were", "this", "that", "with", "from",
  "have", "has", "had", "you", "your", "but", "not", "all", "can", "will",
  "what", "when", "where", "which", "who", "how", "why", "into", "out", "about",
  "they", "them", "their", "there", "then", "than", "some", "any", "our", "his",
  "her", "its", "it's", "i'm", "i've", "just", "like", "get", "got",
]);

/** Cheap keyword extraction from the start of the paste for FTS shortlisting. */
export function extractKeywords(content: string, max = 12): string {
  const head = content.slice(0, 400);
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of head.split(/[^a-zA-Z0-9]+/)) {
    const w = raw.toLowerCase();
    if (w.length < 3 || STOPWORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    terms.push(raw);
    if (terms.length >= max) break;
  }
  return terms.join(" ");
}

/** First meaningful line of the paste, used as a fallback note title. */
export function deriveTitle(content: string): string {
  for (const line of content.split("\n")) {
    const t = line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim();
    if (t) return t.slice(0, 120);
  }
  return "Untitled note";
}

export interface AutoFilePlan {
  decision: AutoFileDecision;
  usedFallback: boolean;
}

export async function planAutoFile(
  db: Db,
  args: { userId: string; teamId: string; content: string },
): Promise<AutoFilePlan> {
  const { teamId, content } = args;

  // All top-level notes in the teamspace (sections + anti-sprawl comparison set).
  const topLevel = await db.note.findMany({
    where: { teamId, parentId: null, deletedAt: null },
    select: { id: true, title: true, emoji: true, contentText: true },
    orderBy: { updatedAt: "desc" },
    take: TOP_LEVEL_CAP,
  });
  const topLevelById = new Map(topLevel.map((s) => [s.id, s]));

  // FTS shortlist, rolled up to the section (the hit itself if top-level, else
  // its parent when that parent is a top-level section).
  const keywords = extractKeywords(content);
  const hits = keywords
    ? await searchNotesCore(db, [teamId], keywords, FTS_HITS, 0)
    : [];

  const scoreBySection = new Map<string, number>();
  for (const h of hits) {
    let secId: string | null = null;
    if (topLevelById.has(h.id)) secId = h.id;
    else if (h.parentId && topLevelById.has(h.parentId)) secId = h.parentId;
    if (secId) scoreBySection.set(secId, (scoreBySection.get(secId) ?? 0) + (h.rank || 0.01));
  }

  const ranked = [...topLevel].sort(
    (a, b) => (scoreBySection.get(b.id) ?? 0) - (scoreBySection.get(a.id) ?? 0),
  );
  const chosen = ranked.slice(0, SHORTLIST_K);

  // Child titles for the chosen sections (one query) → digests.
  const childTitlesBySection = new Map<string, string[]>();
  if (chosen.length) {
    const children = await db.note.findMany({
      where: { parentId: { in: chosen.map((s) => s.id) }, deletedAt: null },
      select: { parentId: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: chosen.length * CHILD_TITLES_PER_SECTION,
    });
    for (const c of children) {
      if (!c.parentId) continue;
      const list = childTitlesBySection.get(c.parentId) ?? [];
      if (list.length < CHILD_TITLES_PER_SECTION) list.push(c.title);
      childTitlesBySection.set(c.parentId, list);
    }
  }

  const candidateSections: CandidateSection[] = chosen.map((s) => {
    const body = (s.contentText || "").slice(0, DIGEST_BODY_CHARS);
    const childBit = (childTitlesBySection.get(s.id) ?? [])
      .join(", ")
      .slice(0, DIGEST_CHILDREN_CHARS);
    const digest = [body, childBit].filter(Boolean).join(" · ") || undefined;
    return { id: s.id, title: s.title, emoji: s.emoji, digest };
  });

  // Existing tags in the teamspace (reuse hints for the model).
  const tagRows = await db.tag.findMany({
    where: { notes: { some: { teamId, deletedAt: null } } },
    select: { name: true },
    take: 40,
  });
  const topTags = tagRows.map((t) => t.name);

  const res = await classifyForAutoFile({ content, candidateSections, topTags });

  if (!res.ok) {
    // Model unavailable or errored → Inbox, untagged.
    return {
      usedFallback: true,
      decision: {
        kind: "inbox",
        lowConfidence: true,
        noteTitle: deriveTitle(content),
        emoji: null,
        tags: [],
        summary: "",
        confidence: 0,
      },
    };
  }

  const candidateIds = new Set(candidateSections.map((s) => s.id));
  const existingTitles = topLevel.map((s) => ({ id: s.id, title: s.title }));
  const decision = decideAutoFilePlacement(res.classification, candidateIds, existingTitles);

  return { decision, usedFallback: false };
}
