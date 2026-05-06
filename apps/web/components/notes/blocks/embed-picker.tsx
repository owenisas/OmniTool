"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@omnitool/ui/components/dialog";
import { Input } from "@omnitool/ui/components/input";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import { trpc } from "@/trpc/client";
import { useOptionalNoteEditor } from "../note-editor-context";

export type EmbedPickerKind =
  | "taskList"
  | "projectCard"
  | "dailySummary"
  | "person"
  | "noteMention"
  | "noteEmbed";

export type EmbedPickerEvent = CustomEvent<{
  kind: EmbedPickerKind;
  blockId?: string;
}>;

export type EmbedInsertEvent = CustomEvent<{
  kind: EmbedPickerKind;
  props: Record<string, unknown>;
}>;

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "IN_REVIEW", label: "In review" },
  { value: "DONE", label: "Done" },
  { value: "ALL", label: "All" },
];

function todayLocalIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

export function EmbedPicker() {
  const [kind, setKind] = useState<EmbedPickerKind | null>(null);
  const [search, setSearch] = useState("");
  // Per-kind selection state
  const [taskProjectId, setTaskProjectId] = useState("");
  const [taskStatus, setTaskStatus] = useState("OPEN");
  const [taskLimit, setTaskLimit] = useState(5);

  const [date, setDate] = useState(todayLocalIso());

  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as EmbedPickerEvent;
      setKind(ce.detail.kind);
      setSearch("");
      setTaskProjectId("");
      setTaskStatus("OPEN");
      setTaskLimit(5);
      setDate(todayLocalIso());
    };
    window.addEventListener("omnitool:open-embed-picker", onOpen);
    return () => window.removeEventListener("omnitool:open-embed-picker", onOpen);
  }, []);

  const isOpen = kind !== null;
  const close = () => setKind(null);

  const projectsQuery = trpc.project.list.useQuery(undefined, {
    enabled: kind === "projectCard" || kind === "taskList",
  });
  // For @-person mentions we scope the user list to members of the active
  // note's teamspace (via `useNoteEditor()` context). The daily-summary
  // picker still uses the global user list — it's a content embed, not a
  // notification target.
  const noteEditor = useOptionalNoteEditor();
  const personScopedUsersQuery = trpc.user.listForMention.useQuery(
    { noteId: noteEditor?.noteId ?? "" },
    {
      enabled: kind === "person" && Boolean(noteEditor?.noteId),
    },
  );
  const globalUsersQuery = trpc.user.list.useQuery(undefined, {
    enabled: kind === "dailySummary" || (kind === "person" && !noteEditor?.noteId),
  });
  const usersQuery =
    kind === "person" && noteEditor?.noteId
      ? personScopedUsersQuery
      : globalUsersQuery;
  const noteSearchQuery = trpc.note.searchNotes.useQuery(
    { query: search, limit: 20 },
    {
      enabled: kind === "noteMention" || kind === "noteEmbed",
      staleTime: 5_000,
    },
  );

  const insert = (props: Record<string, unknown>) => {
    if (!kind) return;
    window.dispatchEvent(
      new CustomEvent("omnitool:insert-embed", {
        detail: { kind, props },
      }),
    );
    close();
  };

  const filteredProjects = (projectsQuery.data ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredUsers = (usersQuery.data ?? []).filter((u) =>
    (u.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  const titleByKind: Record<EmbedPickerKind, string> = {
    taskList: "Insert task list",
    projectCard: "Insert project card",
    dailySummary: "Insert daily summary",
    person: "Mention a person",
    noteMention: "Mention a note",
    noteEmbed: "Embed a note",
  };

  const noteResults = noteSearchQuery.data ?? [];

  // Note pickers (mention/embed) need extra room so the snippet preview
  // doesn't squeeze into ellipses immediately. Other kinds keep the
  // narrower default modal.
  const isNotePicker = kind === "noteMention" || kind === "noteEmbed";
  const dialogWidth = isNotePicker
    ? "sm:max-w-xl w-[calc(100vw-2rem)]"
    : "sm:max-w-md";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className={`${dialogWidth} overflow-hidden`}>
        <DialogHeader>
          <DialogTitle>{kind ? titleByKind[kind] : ""}</DialogTitle>
        </DialogHeader>

        {kind === "taskList" ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Filter
              </label>
              <div className="flex flex-wrap gap-1">
                {STATUS_OPTIONS.map((s) => (
                  <Button
                    key={s.value}
                    type="button"
                    size="sm"
                    variant={taskStatus === s.value ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setTaskStatus(s.value)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Project (optional — empty = my tasks)
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
              />
              <div className="mt-1 max-h-40 overflow-y-auto rounded border">
                <button
                  type="button"
                  className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-accent ${
                    taskProjectId === "" ? "bg-accent" : ""
                  }`}
                  onClick={() => setTaskProjectId("")}
                >
                  <span>My tasks (no project filter)</span>
                  {taskProjectId === "" ? (
                    <Badge variant="outline" className="text-[10px]">
                      Selected
                    </Badge>
                  ) : null}
                </button>
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-accent ${
                      taskProjectId === p.id ? "bg-accent" : ""
                    }`}
                    onClick={() => setTaskProjectId(p.id)}
                  >
                    <span className="truncate">{p.name}</span>
                    {taskProjectId === p.id ? (
                      <Badge variant="outline" className="text-[10px]">
                        Selected
                      </Badge>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Limit ({taskLimit})
              </label>
              <input
                type="range"
                min={1}
                max={20}
                value={taskLimit}
                onChange={(e) => setTaskLimit(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={close}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  insert({
                    projectId: taskProjectId,
                    statusFilter: taskStatus,
                    limit: taskLimit,
                    assigneeFilter: taskProjectId ? "any" : "self",
                    label: "",
                  })
                }
              >
                Insert
              </Button>
            </div>
          </div>
        ) : null}

        {kind === "projectCard" ? (
          <div className="space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              autoFocus
            />
            <div className="max-h-72 overflow-y-auto rounded border">
              {filteredProjects.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No projects.</p>
              ) : (
                filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 border-b px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-accent"
                    onClick={() => insert({ projectId: p.id })}
                  >
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {p.status} · {p._count.tasks} tasks
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {kind === "dailySummary" ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Date
              </label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Member
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
              />
              <div className="mt-1 max-h-60 overflow-y-auto rounded border">
                {filteredUsers.length === 0 ? (
                  <p className="p-3 text-xs text-muted-foreground">No members.</p>
                ) : (
                  filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs hover:bg-accent"
                      onClick={() => insert({ userId: u.id, date })}
                    >
                      <span className="truncate">{u.name || u.email}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {kind === "noteMention" || kind === "noteEmbed" ? (
          <div className="space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              autoFocus
            />
            <div className="max-h-72 w-full overflow-y-auto overflow-x-hidden rounded border">
              {noteResults.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">
                  {noteSearchQuery.isFetching
                    ? "Searching…"
                    : "No matching notes."}
                </p>
              ) : (
                noteResults.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="flex w-full min-w-0 flex-col items-stretch gap-0.5 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-accent"
                    onClick={() =>
                      insert({
                        noteId: n.id,
                        title: n.title,
                      })
                    }
                  >
                    <span className="block min-w-0 truncate font-medium">
                      {n.title || "Untitled"}
                    </span>
                    {n.snippet && (
                      <span className="block min-w-0 truncate text-[10px] text-muted-foreground">
                        {n.snippet}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {kind === "person" ? (
          <div className="space-y-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              autoFocus
            />
            <div className="max-h-72 overflow-y-auto rounded border">
              {filteredUsers.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No members.</p>
              ) : (
                filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
                    onClick={() => insert({ userId: u.id, name: u.name || u.email })}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                      ) : (
                        (u.name || "?").charAt(0).toUpperCase()
                      )}
                    </span>
                    <span className="truncate">{u.name || u.email}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
