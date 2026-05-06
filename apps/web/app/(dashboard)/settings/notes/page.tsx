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
import { trpc } from "@/trpc/client";
import { Sparkles, Check, Loader2 } from "lucide-react";

export default function NotesSettingsPage() {
  const utils = trpc.useUtils();
  const prefQuery = trpc.userNotePreference.get.useQuery();
  const notesQuery = trpc.note.list.useQuery();
  const [savedAt, setSavedAt] = useState<number | null>(null);

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
    </div>
  );
}
