"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { Button } from "@omnitool/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import { Input } from "@omnitool/ui/components/input";
import { trpc } from "@/trpc/client";
import { Sparkles, Check, Loader2, FolderTree, Wand2 } from "lucide-react";
import { ReorganizeDialog } from "@/components/notes/capture/reorganize-dialog";

export default function NotesSettingsPage() {
  const utils = trpc.useUtils();
  const prefQuery = trpc.userNotePreference.get.useQuery();
  const notesQuery = trpc.note.list.useQuery();
  const teamspacesQuery = trpc.team.listMyTeamspaces.useQuery();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [reorganizeOpen, setReorganizeOpen] = useState(false);

  const updatePref = trpc.userNotePreference.update.useMutation({
    onSuccess: () => {
      void utils.userNotePreference.get.invalidate();
      setSavedAt(Date.now());
    },
  });

  const backfill = trpc.note.backfillAutoNotes.useMutation({
    onSuccess: () => {
      void utils.note.list.invalidate();
    },
  });

  const pref = prefQuery.data;
  const notes = notesQuery.data ?? [];
  const teamspaces = teamspacesQuery.data ?? [];

  const isLoading = prefQuery.isLoading || notesQuery.isLoading;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notes</h1>
        <p className="mt-2 text-muted-foreground">
          Configure how Notes integrates with the rest of OmniTool — projects,
          tasks, and team daily summaries.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Project notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                  checked={pref?.autoCreateProjectNotes ?? true}
                  onChange={(e) =>
                    updatePref.mutate({
                      autoCreateProjectNotes: e.target.checked,
                    })
                  }
                  disabled={updatePref.isPending}
                />
                <div>
                  <p className="text-sm font-medium">
                    Auto-create a note for each new project
                  </p>
                  <p className="text-xs text-muted-foreground">
                    When enabled, creating a project also creates a linked note
                    pre-filled with sections (Initial Idea, Progress, Tasks). Only
                    affects projects you create — other team members manage their
                    own.
                  </p>
                </div>
              </label>

              <div>
                <p className="mb-1 text-sm font-medium">
                  Place auto-created project notes under
                </p>
                <Select
                  value={pref?.projectNotesParentId ?? "__root__"}
                  onValueChange={(val) =>
                    updatePref.mutate({
                      projectNotesParentId: val === "__root__" ? null : val,
                    })
                  }
                  disabled={updatePref.isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Top level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__">Top level</SelectItem>
                    {notes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.title || "Untitled"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pick a parent page to keep auto-created project notes organized.
                </p>
              </div>

              {savedAt && Date.now() - savedAt < 3000 ? (
                <p className="flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="h-3 w-3" />
                  Saved
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wand2 className="h-4 w-4 text-primary" />
            AI auto-sort
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                  checked={pref?.autoSortPaste ?? false}
                  onChange={(e) =>
                    updatePref.mutate({ autoSortPaste: e.target.checked })
                  }
                  disabled={updatePref.isPending}
                />
                <div>
                  <p className="text-sm font-medium">
                    Offer to auto-sort large pastes
                  </p>
                  <p className="text-xs text-muted-foreground">
                    When you paste a big block of text into a note, AI offers to
                    file it into its own note in the right section. Your paste is
                    never altered — formatting, markdown, and link embeds keep
                    working normally.
                  </p>
                </div>
              </label>

              <div className="pl-7">
                <p className="mb-1 text-sm font-medium">
                  Trigger threshold (characters)
                </p>
                <Input
                  type="number"
                  min={40}
                  max={5000}
                  step={20}
                  className="w-32"
                  value={pref?.autoSortPasteThreshold ?? 280}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isNaN(n)) return;
                    const clamped = Math.min(5000, Math.max(40, Math.round(n)));
                    updatePref.mutate({ autoSortPasteThreshold: clamped });
                  }}
                  disabled={updatePref.isPending || !(pref?.autoSortPaste ?? false)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Pastes shorter than this (and that aren't multi-line) stay
                  inline. Default 280.
                </p>
              </div>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                  checked={pref?.autoSortPasteKeepOriginal ?? false}
                  onChange={(e) =>
                    updatePref.mutate({
                      autoSortPasteKeepOriginal: e.target.checked,
                    })
                  }
                  disabled={updatePref.isPending || !(pref?.autoSortPaste ?? false)}
                />
                <div>
                  <p className="text-sm font-medium">
                    Keep the original pasted text in place
                  </p>
                  <p className="text-xs text-muted-foreground">
                    When on, the pasted block stays in the current note as well
                    as being filed into a new one. When off, it's moved out.
                  </p>
                </div>
              </label>

              {teamspaces.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium">
                    Default capture teamspace
                  </p>
                  <Select
                    value={pref?.defaultCaptureTeamId ?? "__default__"}
                    onValueChange={(val) =>
                      updatePref.mutate({
                        defaultCaptureTeamId:
                          val === "__default__" ? null : val,
                      })
                    }
                    disabled={updatePref.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Personal (default)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        Personal (default)
                      </SelectItem>
                      {teamspaces.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Where quick captures land when you don't pick a teamspace.
                  </p>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-medium">Organize loose notes</p>
                <p className="mb-3 text-xs text-muted-foreground">
                  Already have top-level notes with no home? Let AI propose a
                  section for each and apply the moves you approve.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReorganizeOpen(true)}
                >
                  <FolderTree className="mr-1 h-4 w-4" />
                  Organize loose notes
                </Button>
              </div>

              {savedAt && Date.now() - savedAt < 3000 ? (
                <p className="flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="h-3 w-3" />
                  Saved
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Backfill</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Already have projects without linked notes? Generate one note per
            project that doesn't have one yet. Idempotent — safe to re-run.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
          >
            <Sparkles className="mr-1 h-4 w-4" />
            {backfill.isPending
              ? "Generating…"
              : backfill.data
                ? `Generated ${backfill.data.created} note${backfill.data.created === 1 ? "" : "s"}`
                : "Generate notes for existing projects"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Notes search covers titles, body text, and embed labels (e.g.{" "}
            <span className="font-mono">[Tasks: My Project]</span>).
          </p>
          <p>
            Live data inside embeds (the actual task list contents at any moment)
            isn't indexed — open the linked task or project page for that.
          </p>
        </CardContent>
      </Card>

      <ReorganizeDialog
        open={reorganizeOpen}
        onOpenChange={setReorganizeOpen}
        teamId={pref?.defaultCaptureTeamId ?? null}
      />
    </div>
  );
}
