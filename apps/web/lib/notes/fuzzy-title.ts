/**
 * Section-title normalization + similarity for the auto-sort anti-sprawl guard.
 *
 * The classifier is instructed to prefer reusing an existing section, but a
 * weaker model can still propose "Recipes" when "Recipe" already exists, or
 * "Project Ideas " with stray whitespace. These pure helpers let the server
 * collapse a proposed new-section title onto an existing one before creating a
 * duplicate, and reject useless generic titles.
 */

/** Titles too generic to be a meaningful section — route to Inbox instead. */
const GENERIC_TITLES = new Set([
  "",
  "misc",
  "miscellaneous",
  "notes",
  "note",
  "untitled",
  "general",
  "stuff",
  "other",
  "uncategorized",
  "random",
]);

/**
 * Lowercase, strip diacritics, drop punctuation/emoji, collapse whitespace.
 * The canonical key used for both dedup comparison and generic-title checks.
 */
export function normalizeSectionTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // drop punctuation / emoji / symbols
    .replace(/\s+/g, " ")
    .trim();
}

export function isGenericTitle(title: string): boolean {
  return GENERIC_TITLES.has(normalizeSectionTitle(title));
}

/** Iterative Levenshtein edit distance. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/**
 * Normalized similarity in [0,1]. 1 = identical after normalization. Robust to
 * case, punctuation, trailing 's' (singular/plural), and small typos.
 */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeSectionTitle(a);
  const nb = normalizeSectionTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 0 : 1 - dist / maxLen;
}

/**
 * Find an existing section whose title is a near-duplicate of `candidate`.
 * Returns the best match at/above `threshold`, else null.
 */
export function findSimilarTitle<T extends { id: string; title: string }>(
  candidate: string,
  existing: T[],
  threshold = 0.85,
): T | null {
  let best: T | null = null;
  let bestScore = threshold;
  for (const e of existing) {
    const score = titleSimilarity(candidate, e.title);
    if (score >= bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}
