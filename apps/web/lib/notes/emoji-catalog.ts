/**
 * Curated emoji set for the note emoji-picker.
 *
 * Kept intentionally small (~80) so we avoid a heavy dependency. Eight
 * categories × ten emojis. Swap to `emoji-picker-react` if/when the user
 * needs full search + skin-tone variants — the schema is dependency-free.
 */

export interface EmojiCategory {
  /** Stable key for React keys + tab labels. */
  key: string;
  /** Human label shown above each grid section. */
  label: string;
  /** Emoji glyphs in display order. */
  emojis: string[];
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: "smileys",
    label: "Smileys",
    emojis: ["😀", "😃", "😄", "😉", "😊", "😎", "🤔", "🙂", "😴", "🤯"],
  },
  {
    key: "objects",
    label: "Objects",
    emojis: ["📝", "📒", "📚", "📌", "📎", "📁", "🗂️", "💡", "🔖", "🗒️"],
  },
  {
    key: "symbols",
    label: "Symbols",
    emojis: ["⭐", "✅", "❗", "❓", "🔥", "💯", "✨", "⚡", "🎯", "🏷️"],
  },
  {
    key: "nature",
    label: "Nature",
    emojis: ["🌱", "🌳", "🌲", "🌸", "🍀", "🌍", "🌊", "🌙", "☀️", "🌈"],
  },
  {
    key: "food",
    label: "Food",
    emojis: ["☕", "🍵", "🍎", "🍕", "🍔", "🍩", "🥗", "🍣", "🥑", "🍫"],
  },
  {
    key: "travel",
    label: "Travel",
    emojis: ["🚀", "✈️", "🚗", "🚲", "🏠", "🏢", "🗺️", "🏔️", "🏖️", "🚢"],
  },
  {
    key: "activities",
    label: "Activities",
    emojis: ["💻", "📱", "🎨", "🎵", "🎮", "📷", "✏️", "🖊️", "🧠", "🏆"],
  },
  {
    key: "flags",
    label: "Misc",
    emojis: ["🟢", "🟡", "🔴", "🔵", "🟣", "🟠", "⚪", "⚫", "🟤", "🏁"],
  },
];
