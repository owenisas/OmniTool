"use client";

import { avatarColorClass, avatarLetter } from "@/lib/notes/avatar-color";
import { cn } from "@/lib/utils";

interface NoteIconProps {
  emoji: string | null | undefined;
  /** Used for the deterministic letter-avatar fallback. */
  id: string;
  title: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<NoteIconProps["size"]>, string> = {
  xs: "h-4 w-4 text-[10px]",
  sm: "h-5 w-5 text-xs",
  md: "h-7 w-7 text-base",
  lg: "h-10 w-10 text-2xl",
  xl: "h-16 w-16 text-4xl",
};

/**
 * Square icon for a note. Renders the emoji if present, otherwise a colored
 * letter-avatar derived deterministically from the note id.
 */
export function NoteIcon({
  emoji,
  id,
  title,
  size = "md",
  className,
}: NoteIconProps) {
  if (emoji) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md leading-none",
          SIZE_CLASSES[size],
          className,
        )}
        aria-hidden
      >
        {emoji}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold",
        SIZE_CLASSES[size],
        avatarColorClass(id),
        className,
      )}
      aria-hidden
    >
      {avatarLetter(title)}
    </span>
  );
}
