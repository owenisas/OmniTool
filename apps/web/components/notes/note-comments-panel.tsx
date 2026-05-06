"use client";

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/trpc/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@omnitool/ui/components/sheet";
import { Button } from "@omnitool/ui/components/button";
import { Textarea } from "@omnitool/ui/components/textarea";
import { formatDistanceToNow } from "date-fns";
import {
  Loader2,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NoteCommentsPanelProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID of the current user — used to gate Edit/Delete affordances. */
  currentUserId: string | null;
}

export function NoteCommentsPanel({
  noteId,
  open,
  onOpenChange,
  currentUserId,
}: NoteCommentsPanelProps) {
  const utils = trpc.useUtils();
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const listQuery = trpc.noteComment.list.useQuery(
    { noteId, take: 100 },
    { enabled: open },
  );

  const markRead = trpc.noteComment.markCommentsRead.useMutation();

  // Mark thread as read each time the panel opens.
  useEffect(() => {
    if (!open) return;
    markRead.mutate(
      { noteId },
      {
        onSuccess: () => {
          void utils.noteComment.unreadCountForNote.invalidate({ noteId });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, noteId]);

  // Auto-scroll to newest comment when the list updates.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      listEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 60);
    return () => clearTimeout(t);
  }, [open, listQuery.data?.items.length]);

  const createMutation = trpc.noteComment.create.useMutation({
    onSuccess: () => {
      setBody("");
      void utils.noteComment.list.invalidate({ noteId });
      void utils.noteComment.unreadCountForNote.invalidate({ noteId });
      composerRef.current?.focus();
    },
  });

  const updateMutation = trpc.noteComment.update.useMutation({
    onSuccess: () => {
      setEditingId(null);
      setEditingDraft("");
      void utils.noteComment.list.invalidate({ noteId });
    },
  });

  const deleteMutation = trpc.noteComment.delete.useMutation({
    onSuccess: () => {
      void utils.noteComment.list.invalidate({ noteId });
      void utils.noteComment.unreadCountForNote.invalidate({ noteId });
    },
  });

  function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (createMutation.isPending) return;
    createMutation.mutate({ noteId, body: trimmed });
  }

  function commitEdit() {
    const trimmed = editingDraft.trim();
    if (!trimmed || !editingId) return;
    if (updateMutation.isPending) return;
    updateMutation.mutate({ id: editingId, body: trimmed });
  }

  const items = listQuery.data?.items ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comments
            {items.length > 0 ? (
              <span className="text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            ) : null}
          </SheetTitle>
        </SheetHeader>

        <div className="-mx-6 mt-4 flex-1 overflow-y-auto px-6">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">No comments yet</p>
              <p className="mt-1 max-w-[260px] text-xs text-muted-foreground">
                Start a conversation about this note. Teammates with access to
                the teamspace can join in.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((c) => {
                const isAuthor = c.author.id === currentUserId;
                const isEditing = editingId === c.id;
                return (
                  <li
                    key={c.id}
                    className="rounded-lg border bg-card p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                        {c.author.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.author.avatarUrl}
                            alt=""
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          (c.author.name ?? "?").slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <span className="text-xs font-medium">
                        {c.author.name ?? "Someone"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                      {c.updatedAt > c.createdAt ? (
                        <span className="text-[10px] italic text-muted-foreground">
                          (edited)
                        </span>
                      ) : null}
                      {isAuthor && !isEditing ? (
                        <div className="ml-auto flex items-center gap-0.5 text-muted-foreground">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            title="Edit"
                            onClick={() => {
                              setEditingId(c.id);
                              setEditingDraft(c.body);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 hover:text-destructive"
                            title="Delete"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate({ id: c.id })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <Textarea
                          autoFocus
                          value={editingDraft}
                          onChange={(e) => setEditingDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              commitEdit();
                            }
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditingDraft("");
                            }
                          }}
                          rows={3}
                          className="text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={commitEdit}
                            disabled={
                              updateMutation.isPending || !editingDraft.trim()
                            }
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(null);
                              setEditingDraft("");
                            }}
                          >
                            <X className="mr-1 h-3 w-3" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                        {c.body}
                      </p>
                    )}
                  </li>
                );
              })}
              <div ref={listEndRef} />
            </ul>
          )}
        </div>

        <div className="-mx-6 mt-2 border-t bg-card/50 px-6 pt-3">
          <Textarea
            ref={composerRef}
            placeholder="Add a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            rows={3}
            className="resize-none text-sm"
            disabled={createMutation.isPending}
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              <kbd className="rounded border px-1">⌘</kbd>
              <span className="mx-0.5">+</span>
              <kbd className="rounded border px-1">Enter</kbd> to send
            </p>
            <Button
              type="button"
              size="sm"
              onClick={submit}
              disabled={createMutation.isPending || !body.trim()}
              className={cn("h-7 text-xs")}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 h-3.5 w-3.5" />
              )}
              Comment
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
