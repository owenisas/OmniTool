"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@omnitool/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@omnitool/ui/components/sheet";
import { Sparkles } from "lucide-react";
import { NoteChatBody } from "./note-chat-body";

const OPEN_KEY = "omnitool:notes-chat-open";

interface OpenChatEventDetail {
  prefill?: string;
}

function readInitialOpen(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(OPEN_KEY) === "true";
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}

export function NoteChatFloating({ noteId }: { noteId: string }) {
  const [open, setOpen] = useState<boolean>(readInitialOpen);
  const isDesktop = useIsDesktop();
  const prefillRef = useRef<((text: string) => void) | null>(null);

  // Persist open state
  useEffect(() => {
    try {
      window.localStorage.setItem(OPEN_KEY, String(open));
    } catch {
      /* private mode / quota exceeded — ignore */
    }
  }, [open]);

  // External "open with prefill" event (slash menu Ask, selection bubble Ask, etc.)
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenChatEventDetail>).detail;
      setOpen(true);
      const prefill = detail?.prefill;
      if (prefill) {
        // Small wait so body mounts and prefill ref binds
        requestAnimationFrame(() => {
          requestAnimationFrame(() => prefillRef.current?.(prefill));
        });
      }
    }
    window.addEventListener("omnitool:open-note-chat", onOpen);
    return () => window.removeEventListener("omnitool:open-note-chat", onOpen);
  }, []);

  // Esc closes the desktop card unless focus is in the BlockNote editor or
  // another modal/popover (let those handle their own Esc).
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      // Don't close if focus is inside BlockNote editor, a Radix popover/dialog,
      // or any other open dialog — let those consume their own Esc.
      if (
        target?.closest(".bn-editor") ||
        target?.closest("[data-radix-popper-content-wrapper]") ||
        target?.closest('[role="dialog"]')
      ) {
        return;
      }
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isDesktop]);

  const handleClose = useCallback(() => setOpen(false), []);

  if (!isDesktop) {
    return (
      <>
        {/* Mobile launcher pill */}
        {!open && (
          <Button
            type="button"
            onClick={() => setOpen(true)}
            className="fixed bottom-4 right-4 z-40 h-12 rounded-full px-4 shadow-lg gap-2"
            aria-label="Open AI assistant"
          >
            <Sparkles className="h-4 w-4" />
            Ask AI
          </Button>
        )}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="right"
            className="flex w-full flex-col p-0 sm:max-w-md"
          >
            <SheetTitle className="sr-only">Notes AI assistant</SheetTitle>
            <NoteChatBody noteId={noteId} onClose={handleClose} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: pill button (collapsed) → floating card (expanded)
  return (
    <div
      id="omnitool-floating-chat"
      className="fixed bottom-6 right-6 z-40"
      aria-label="Notes AI assistant"
    >
      {open ? (
        <div className="flex h-[560px] w-96 flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
          <NoteChatBody
            noteId={noteId}
            onClose={handleClose}
            prefillRef={prefillRef}
          />
        </div>
      ) : (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="h-12 rounded-full px-4 shadow-lg gap-2"
          aria-label="Open AI assistant"
        >
          <Sparkles className="h-4 w-4" />
          Ask AI
        </Button>
      )}
    </div>
  );
}
