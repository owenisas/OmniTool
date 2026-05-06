"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { Button } from "@omnitool/ui/components/button";
import { Smile, X } from "lucide-react";
import { EMOJI_CATEGORIES } from "@/lib/notes/emoji-catalog";
import { cn } from "@/lib/utils";

interface NoteEmojiPickerProps {
  /** Current emoji or null. */
  value: string | null | undefined;
  /** Called with the new emoji or null when cleared. */
  onChange: (next: string | null) => void;
  /** Visual size of the trigger button. Defaults to "lg" (detail page). */
  size?: "sm" | "md" | "lg";
  /** Disable interaction during a parent mutation. */
  disabled?: boolean;
  /** Optional accessible label override. */
  ariaLabel?: string;
}

const SIZE_CLASSES: Record<NonNullable<NoteEmojiPickerProps["size"]>, string> = {
  sm: "h-7 w-7 text-base",
  md: "h-9 w-9 text-xl",
  lg: "h-12 w-12 text-3xl",
};

export function NoteEmojiPicker({
  value,
  onChange,
  size = "lg",
  disabled,
  ariaLabel,
}: NoteEmojiPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ?? (value ? "Change emoji" : "Add emoji")}
          title={value ? "Change emoji" : "Add emoji"}
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-md border border-transparent transition-colors",
            "hover:border-border hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            SIZE_CLASSES[size],
            !value && "text-muted-foreground",
          )}
        >
          {value ? (
            <span aria-hidden>{value}</span>
          ) : (
            <Smile
              className={cn(
                size === "sm" && "h-3.5 w-3.5",
                size === "md" && "h-4 w-4",
                size === "lg" && "h-5 w-5",
              )}
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-h-72 overflow-y-auto pr-1">
          {EMOJI_CATEGORIES.map((cat) => (
            <section key={cat.key} className="mb-2 last:mb-0">
              <h4 className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {cat.label}
              </h4>
              <div className="grid grid-cols-10 gap-0.5">
                {cat.emojis.map((emoji) => {
                  const active = emoji === value;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onChange(emoji);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded text-lg leading-none transition-colors hover:bg-muted",
                        active && "bg-primary/10 ring-1 ring-primary/30",
                      )}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        {value ? (
          <div className="mt-2 flex justify-end border-t pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <X className="mr-1 h-3 w-3" />
              Remove
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
