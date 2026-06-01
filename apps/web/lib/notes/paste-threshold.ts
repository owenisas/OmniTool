/**
 * Decide whether a pasted text chunk is "large" enough to offer auto-sort in
 * the editor.
 *
 * Deliberately conservative — short single-line pastes (a couple of words, a
 * single URL, formatting fragments) must NOT trigger the prompt; they belong
 * inline and the editor already handles URL→embed via `detectAndConvertUrlBlocks`.
 * Only genuinely note-sized content (multi-line, or a long paragraph) is a
 * candidate for filing into its own note.
 */

/** A multi-line paste this long (chars) is treated as note-sized regardless of the threshold. */
const MULTILINE_MIN = 120;

export function isLargePaste(text: string, threshold = 280): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // A single token with no internal whitespace (a lone URL or word), however
  // long, is handled inline — never auto-sorted.
  if (!/\s/.test(trimmed)) return false;

  const isMultiline = /\n/.test(trimmed);
  if (isMultiline && trimmed.length >= MULTILINE_MIN) return true;

  return trimmed.length >= threshold;
}
