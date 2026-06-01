"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@omnitool/ui/components/button";
import { Sparkles, X } from "lucide-react";

export interface PasteSortAnchor {
  /** Viewport rect to anchor the card under (typically the pasted block). */
  rect: DOMRect;
}

/**
 * Floating "Auto-sort this into a note?" card shown after a large in-editor
 * paste. Anchored to a DOM rect (the pasted block), like `InlineAIPrompt`.
 * Auto-dismisses after ~8s; Esc closes. Purely presentational — the editor owns
 * the Sort/Keep logic and passes callbacks.
 */
export function PasteSortPrompt({
  anchor,
  onSort,
  onKeep,
}: {
  anchor: PasteSortAnchor | null;
  onSort: () => void;
  onKeep: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(Boolean(anchor));
  }, [anchor]);

  // Auto-dismiss after 8s.
  useEffect(() => {
    if (!anchor) return;
    const t = setTimeout(() => onKeep(), 8000);
    return () => clearTimeout(t);
  }, [anchor, onKeep]);

  // Esc closes (treated as "keep here").
  useEffect(() => {
    if (!anchor) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onKeep();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anchor, onKeep]);

  if (!anchor || !visible || typeof document === "undefined") return null;

  const left = Math.max(8, Math.min(anchor.rect.left, window.innerWidth - 320));
  const top = anchor.rect.bottom + 6;

  return createPortal(
    <div
      className="fixed z-50 flex items-center gap-2 rounded-lg border bg-popover p-2 shadow-lg"
      style={{ left, top }}
      role="dialog"
      aria-label="Auto-sort pasted content"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-sm">Auto-sort this into a note?</span>
      <Button
        type="button"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onSort}
      >
        Sort
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={onKeep}
      >
        Keep here
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 p-0"
        onClick={onKeep}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>,
    document.body,
  );
}
