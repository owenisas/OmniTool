"use client";

import { useState } from "react";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { Loader2, Sparkles } from "lucide-react";
import type { BlockNoteEditor, BlockIdentifier } from "@blocknote/core";

type AnyEditor = BlockNoteEditor<any, any, any>;
type Action = "improve" | "summarize" | "continue" | "translate" | "custom";

const QUICK_ACTIONS: Array<{ label: string; action: Action }> = [
  { label: "Improve", action: "improve" },
  { label: "Summarize", action: "summarize" },
  { label: "Continue", action: "continue" },
  { label: "Translate", action: "translate" },
];

/**
 * "Ask AI" button that appears in the BlockNote formatting toolbar
 * when text is selected. Offers quick actions (Improve / Summarize /
 * Continue / Translate) and a custom-prompt fallback.
 *
 * - Quick actions stream a result and replace the selected blocks.
 * - "Ask" (custom prompt) opens the floating chat with the selection
 *   prefilled, so the user can have a multi-turn conversation.
 */
export function AskAIToolbarButton({ editor }: { editor: AnyEditor }) {
  const [open, setOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAction(action: Action, prompt?: string) {
    const selectedText = editor.getSelectedText();
    if (!selectedText.trim()) {
      setError("Select some text first");
      return;
    }
    const selection = editor.getSelection();
    const blockIds: BlockIdentifier[] =
      selection?.blocks.map((b) => b.id) ?? [];
    if (blockIds.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/notes-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          prompt:
            action === "custom"
              ? prompt
              : action === "translate"
                ? prompt || "English"
                : undefined,
          contextText: selectedText,
        }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let lastParse = 0;

      const apply = (force = false) => {
        if (!acc.trim()) return;
        const now = Date.now();
        if (!force && (now - lastParse < 80 || !acc.includes("\n"))) return;
        lastParse = now;
        try {
          const blocks = editor.tryParseMarkdownToBlocks(acc);
          if (blocks.length > 0) {
            editor.replaceBlocks(blockIds, blocks);
          }
        } catch {
          /* partial markdown — skip */
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("0:")) continue;
          try {
            const text = JSON.parse(line.slice(2));
            if (typeof text === "string") acc += text;
          } catch {
            /* skip */
          }
        }
        apply();
      }
      apply(true);

      setOpen(false);
      setCustomPrompt("");
    } catch (err) {
      console.error("[ask-ai-toolbar]", err);
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  function askInChat() {
    const text = editor.getSelectedText();
    if (!text.trim()) {
      setError("Select some text first");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("omnitool:open-note-chat", {
        detail: {
          prefill: `About this passage: "${text}" — `,
        },
      })
    );
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-primary hover:bg-accent"
          aria-label="Ask AI about selection"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask AI
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-2"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1">
            {QUICK_ACTIONS.map((qa) => (
              <Button
                key={qa.action}
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 justify-start text-xs"
                disabled={loading}
                onClick={() => void runAction(qa.action)}
              >
                {qa.label}
              </Button>
            ))}
          </div>
          <div className="border-t pt-2">
            <div className="flex items-center gap-1.5">
              <Input
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading && customPrompt.trim()) {
                    e.preventDefault();
                    void runAction("custom", customPrompt);
                  }
                }}
                placeholder="Custom instruction..."
                className="h-8 flex-1 text-xs"
                disabled={loading}
              />
              {loading && (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-7 px-0 text-xs"
              onClick={askInChat}
              disabled={loading}
            >
              Or open in chat instead →
            </Button>
          </div>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
