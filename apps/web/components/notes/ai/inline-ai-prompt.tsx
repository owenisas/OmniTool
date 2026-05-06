"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import { Loader2, Sparkles, X } from "lucide-react";
import type { BlockNoteEditor } from "@blocknote/core";

interface ActiveState {
  blockId: string;
  rect: DOMRect;
}

interface OpenDetail {
  blockId: string;
}

/**
 * Inline AI prompt overlay anchored to a BlockNote block.
 * Triggered by `/ai` slash item — listens to `omnitool:inline-ai-prompt`.
 *
 * On submit:
 *   1. Calls `/api/ai/notes-inline` with the prompt
 *   2. Streams markdown deltas (Vercel AI SDK data-stream protocol)
 *   3. Debounce-parses to BlockNote blocks every ~80ms when newline arrives
 *   4. Replaces the placeholder block with parsed blocks
 *
 * Esc cancels.
 */
// Use generic-erased editor — we only call common APIs that exist on
// every variant (replaceBlocks, tryParseMarkdownToBlocks, getTextCursorPosition).
type AnyEditor = BlockNoteEditor<any, any, any>;

export function InlineAIPrompt({ editor }: { editor: AnyEditor }) {
  const [active, setActive] = useState<ActiveState | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<AbortController | null>(null);

  // Listen for slash-menu trigger
  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      if (!detail?.blockId) return;
      const dom = editor.domElement;
      if (!dom) return;
      const blockEl = dom.querySelector<HTMLElement>(
        `[data-id="${detail.blockId}"]`
      );
      if (!blockEl) return;
      setActive({ blockId: detail.blockId, rect: blockEl.getBoundingClientRect() });
      setPrompt("");
      setError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    window.addEventListener("omnitool:inline-ai-prompt", onOpen);
    return () => window.removeEventListener("omnitool:inline-ai-prompt", onOpen);
  }, [editor]);

  // Reposition on scroll/resize while active
  useEffect(() => {
    if (!active) return;
    function reposition() {
      const dom = editor.domElement;
      if (!dom || !active) return;
      const blockEl = dom.querySelector<HTMLElement>(
        `[data-id="${active.blockId}"]`
      );
      if (!blockEl) return;
      setActive({ blockId: active.blockId, rect: blockEl.getBoundingClientRect() });
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [active, editor]);

  function close() {
    cancelRef.current?.abort();
    cancelRef.current = null;
    setActive(null);
    setLoading(false);
    setError(null);
  }

  async function submit() {
    if (!active || !prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    const blockId = active.blockId;
    const ctrl = new AbortController();
    cancelRef.current = ctrl;

    let acc = "";
    let lastParse = 0;

    function applyMarkdown(force = false) {
      if (!acc.trim()) return;
      const now = Date.now();
      if (!force && (now - lastParse < 80 || !acc.includes("\n"))) return;
      lastParse = now;
      try {
        const blocks = editor.tryParseMarkdownToBlocks(acc);
        if (blocks.length > 0) {
          editor.replaceBlocks([blockId], blocks);
        }
      } catch {
        // Markdown parser may fail on partial chunks; ignore until next chunk
      }
    }

    try {
      const res = await fetch("/api/ai/notes-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Vercel AI SDK data stream: lines like `0:"chunk"\n` for text deltas.
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("0:")) continue;
          try {
            const text = JSON.parse(line.slice(2));
            if (typeof text === "string") acc += text;
          } catch {
            /* skip malformed line */
          }
        }
        applyMarkdown();
      }

      applyMarkdown(true);
      setActive(null);
      setLoading(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("[inline-ai-prompt]", err);
      setError(err instanceof Error ? err.message : "Failed to generate");
      setLoading(false);
    } finally {
      cancelRef.current = null;
    }
  }

  // Esc handler at window level so it works while loading
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (!active || typeof document === "undefined") return null;

  const left = Math.max(8, active.rect.left);
  const top = active.rect.bottom + 6;
  const width = Math.min(560, Math.max(320, active.rect.width));

  return createPortal(
    <div
      className="fixed z-50 rounded-lg border bg-popover p-2 shadow-lg"
      style={{ left, top, width }}
      role="dialog"
      aria-label="Ask AI"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        <Input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Ask AI to write something..."
          className="flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          disabled={loading}
          aria-label="AI prompt"
        />
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-7 shrink-0 p-0"
          onClick={close}
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {error && (
        <p className="mt-1 px-1 text-xs text-destructive">{error}</p>
      )}
      {!error && (
        <p className="mt-1 px-1 text-[11px] text-muted-foreground">
          Enter to submit · Esc to cancel
        </p>
      )}
    </div>,
    document.body
  );
}
