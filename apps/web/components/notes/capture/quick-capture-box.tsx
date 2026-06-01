"use client";

import { useState } from "react";
import { Card } from "@omnitool/ui/components/card";
import { Button } from "@omnitool/ui/components/button";
import { Textarea } from "@omnitool/ui/components/textarea";
import { Sparkles } from "lucide-react";
import { trpc } from "@/trpc/client";
import { TeamspaceSwitcher } from "@/components/notes/teamspace-switcher";
import { useCapture } from "./use-capture";

/**
 * Frictionless "drop a thought, AI files it" box for the top of /notes.
 *
 * Submit clears the textarea optimistically and hands the text to the shared
 * capture pipeline (`useCapture`) which runs `note.autoFile` as a background
 * task and fires the "Filed in X" toast. Cmd/Ctrl+Enter submits.
 */
export function QuickCaptureBox({
  defaultTeamId,
}: {
  /** Pre-select a teamspace (e.g. the active /notes lens). `null` = default. */
  defaultTeamId?: string | null;
}) {
  const [text, setText] = useState("");
  const [teamId, setTeamId] = useState<string | null>(defaultTeamId ?? null);

  // Default the capture teamspace to the user's saved preference if no explicit
  // lens was passed in.
  const { data: pref } = trpc.userNotePreference.get.useQuery(undefined, {
    staleTime: 60_000,
  });
  const resolvedTeamId =
    teamId ?? defaultTeamId ?? pref?.defaultCaptureTeamId ?? null;

  const { capture, dialog, isPending } = useCapture();

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText(""); // optimistic clear
    capture(trimmed, resolvedTeamId ? { teamId: resolvedTeamId } : undefined);
  }

  return (
    <Card className="space-y-2 p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Capture a thought — AI files it into the right note…"
        rows={2}
        className="min-h-[56px] resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        aria-label="Quick capture"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 max-w-[55%]">
          <TeamspaceSwitcher
            value={teamId ?? defaultTeamId ?? pref?.defaultCaptureTeamId ?? null}
            onChange={setTeamId}
            disabled={isPending}
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={isPending || !text.trim()}
          aria-label="Capture note"
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          Capture
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        <kbd className="rounded border px-1 text-[10px]">⌘</kbd>
        <kbd className="ml-0.5 rounded border px-1 text-[10px]">↵</kbd> to file
      </p>
      {dialog}
    </Card>
  );
}
