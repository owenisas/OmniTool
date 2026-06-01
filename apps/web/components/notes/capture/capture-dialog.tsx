"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@omnitool/ui/components/dialog";
import { Button } from "@omnitool/ui/components/button";
import { Textarea } from "@omnitool/ui/components/textarea";
import { Sparkles, Inbox } from "lucide-react";
import { TopbarSlot } from "@/components/layout/topbar-slot";
import { useCapture } from "./use-capture";

/**
 * Global quick-capture, reachable from anywhere via:
 *   - a "Capture" button injected into the topbar actions slot, and
 *   - the `mod+shift+k` keyboard shortcut.
 *
 * Wraps the same capture pipeline as `QuickCaptureBox`. Mount once, app-wide.
 */
export function CaptureDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { capture, dialog, isPending } = useCapture();

  // mod+shift+k toggles the dialog from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the textarea when the dialog opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    capture(trimmed, { onDone: () => setOpen(false) });
    setOpen(false);
  }

  return (
    <>
      <TopbarSlot target="actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          title="Capture a note (⌘⇧K)"
          aria-label="Quick capture"
        >
          <Inbox className="mr-1 h-4 w-4" />
          Capture
        </Button>
      </TopbarSlot>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Quick capture
            </DialogTitle>
          </DialogHeader>
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Drop a thought — AI files it into the right note…"
            rows={5}
            className="resize-none"
            aria-label="Quick capture"
          />
          <p className="text-[11px] text-muted-foreground">
            <kbd className="rounded border px-1 text-[10px]">⌘</kbd>
            <kbd className="ml-0.5 rounded border px-1 text-[10px]">↵</kbd> to
            file · <kbd className="rounded border px-1 text-[10px]">Esc</kbd> to
            close
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={isPending || !text.trim()}
            >
              <Sparkles className="mr-1 h-4 w-4" />
              Capture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dialog}
    </>
  );
}
