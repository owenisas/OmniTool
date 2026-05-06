/**
 * Deterministic letter-avatar color used as a fallback when a note has no
 * emoji. The color is derived from a stable hash of the note id so the same
 * note always renders the same color across sessions.
 *
 * Palette uses Tailwind classes with light + dark mode variants so cards stay
 * readable in either theme.
 */

const PALETTE = [
  // bg / fg pairs — soft tints that work on light & dark surfaces
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
] as const;

function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  // Force unsigned 32-bit
  return h >>> 0;
}

/** Returns Tailwind classes for a colored avatar tile. */
export function avatarColorClass(seed: string): string {
  const idx = hashString(seed) % PALETTE.length;
  return PALETTE[idx]!;
}

/** First non-whitespace character of `title`, uppercased. Falls back to "?". */
export function avatarLetter(title: string | null | undefined): string {
  if (!title) return "?";
  const trimmed = title.trim();
  if (!trimmed) return "?";
  const ch = trimmed[0];
  return ch ? ch.toUpperCase() : "?";
}
