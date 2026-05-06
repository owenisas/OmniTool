"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Input } from "@omnitool/ui/components/input";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import { X } from "lucide-react";
import { trpc } from "@/trpc/client";
import { cn } from "@/lib/utils";
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

interface AnchorRect {
  top: number;
  left: number;
}

interface CursorPoint {
  x: number;
  y: number;
  bottom: number;
}

/**
 * Snapshot the current text-caret position. Mirrors where BlockNote's slash
 * suggestion menu was floating — so the picker opens "in place of" the slash
 * dropdown instead of jumping to the block's left edge.
 */
function captureCursorPoint(): CursorPoint | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  // Empty range (caret with no selection) sometimes returns 0,0,0,0 — fall
  // back to the start container's parent rect in that case.
  if (rect.width === 0 && rect.height === 0 && rect.top === 0) {
    const node = range.startContainer;
    const el =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as HTMLElement)
        : (node.parentElement as HTMLElement | null);
    if (!el) return null;
    const parentRect = el.getBoundingClientRect();
    return {
      x: parentRect.left,
      y: parentRect.top,
      bottom: parentRect.bottom,
    };
  }
  return { x: rect.left, y: rect.top, bottom: rect.bottom };
}

/**
 * Compute floating-panel position anchored to the cursor (same anchor as the
 * slash menu). Falls back to the block's DOM rect, then to viewport-centered.
 */
function computePosition(
  cursor: CursorPoint | null,
  blockId: string | null,
  width: number,
): AnchorRect {
  if (typeof window === "undefined") return { top: 80, left: 80 };
  const padding = 12;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const estimatedHeight = 360;

  // Primary: cursor rect (matches slash-menu anchor exactly).
  if (cursor) {
    let left = cursor.x;
    if (left + width + padding > viewportW) {
      left = Math.max(padding, viewportW - width - padding);
    }
    let top = cursor.bottom + 4;
    if (top + estimatedHeight > viewportH) {
      top = Math.max(padding, cursor.y - estimatedHeight - 4);
    }
    return { top, left };
  }

  // Secondary: block element rect (when caret is unavailable, e.g. focus
  // already moved before the event handler captured the selection).
  if (blockId) {
    const el = document.querySelector(
      `[data-id="${blockId}"]`,
    ) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      let left = rect.left;
      if (left + width + padding > viewportW) {
        left = Math.max(padding, viewportW - width - padding);
      }
      let top = rect.bottom + 4;
      if (top + estimatedHeight > viewportH) {
        top = Math.max(padding, rect.top - estimatedHeight - 4);
      }
      return { top, left };
    }
  }
  return {
    top: padding + 60,
    left: Math.max(padding, viewportW / 2 - width / 2),
  };
}

export function EmbedPicker() {
  const [kind, setKind] = useState<EmbedPickerKind | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Per-kind selection state
  const [taskProjectId, setTaskProjectId] = useState("");
  const [taskStatus, setTaskStatus] = useState("OPEN");
  const [taskLimit, setTaskLimit] = useState(5);

  const [date, setDate] = useState(todayLocalIso());

  // Anchor position is computed once on open from the cursor rect (captured
  // synchronously inside the event handler so we anchor to where the slash
  // menu was, not to wherever focus drifts after the menu closes).
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const cursorPointRef = useRef<CursorPoint | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const ce = e as EmbedPickerEvent;
      // Snapshot the caret rect BEFORE React re-renders / focus moves to the
      // picker — this is the only reliable way to keep the anchor identical
      // to the slash menu position.
      cursorPointRef.current = captureCursorPoint();
      setKind(ce.detail.kind);
      setBlockId(ce.detail.blockId ?? null);
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
  const close = () => {
    setKind(null);
    setBlockId(null);
  };

  // Recompute anchor position synchronously after open so the panel doesn't
  // flash at (0,0) before paint. Width is read from the rendered panel for
  // accurate right-edge clamping.
  useLayoutEffect(() => {
    if (!isOpen) {
      setAnchor(null);
      return;
    }
    const isNotePicker = kind === "noteMention" || kind === "noteEmbed";
    const width = isNotePicker ? 480 : 360;
    setAnchor(computePosition(cursorPointRef.current, blockId, width));
  }, [isOpen, kind, blockId]);

  // Click-outside + Escape to dismiss. Click-outside is scoped to the panel
  // so clicks inside (e.g. on inputs) keep the picker open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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

  if (!isOpen || !anchor) return null;

  // Note pickers (mention/embed) need extra room so the snippet preview
  // doesn't squeeze into ellipses immediately. Other kinds keep narrow.
  const isNotePicker = kind === "noteMention" || kind === "noteEmbed";
  const widthClass = isNotePicker ? "w-[480px]" : "w-[360px]";

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={false}
      style={{
        position: "fixed",
        top: anchor.top,
        left: anchor.left,
        zIndex: 50,
      }}
      className={cn(
        "rounded-lg border bg-popover text-popover-foreground shadow-lg",
        "animate-in fade-in-0 zoom-in-95",
        widthClass,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs font-semibold text-foreground">
          {kind ? titleByKind[kind] : ""}
        </span>
        <button
          type="button"
          onClick={close}
          className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close picker"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3">
        {kind === "taskList" ? (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
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
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Project (optional — empty = my tasks)
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects…"
                className="h-8 text-xs"
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
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
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
            <div className="flex justify-end gap-2 pt-1">
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
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              autoFocus
              className="h-8 text-xs"
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
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Date
              </label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                Member
              </label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="h-8 text-xs"
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
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes…"
              autoFocus
              className="h-8 text-xs"
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
          <div className="space-y-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              autoFocus
              className="h-8 text-xs"
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
      </div>
    </div>
  );
}
