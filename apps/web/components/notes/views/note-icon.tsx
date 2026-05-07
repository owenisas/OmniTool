"use client";

import { cn } from "@/lib/utils";

interface NoteIconProps {
  emoji: string | null | undefined;
  /** Kept for API compatibility with prior letter-avatar fallback. */
  id?: string;
  title?: string;
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
 * Square icon for a note. Renders the emoji if present; otherwise renders
 * nothing so list/card layouts collapse the icon column for emoji-less notes.
 */
export function NoteIcon({ emoji, size = "md", className }: NoteIconProps) {
  if (!emoji) return null;
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
