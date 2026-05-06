"use client";

import { useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";
import { FileText } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { cn } from "@/lib/utils";

const HOVER_OPEN_DELAY = 220;
const HOVER_CLOSE_DELAY = 140;

/**
 * Notion-style inline page reference block.
 *
 * Visual: a single-line row — emoji (or default file icon) + title. The whole
 * row is the link. No preview, no "Open" button — matches Notion's nested
 * page block exactly.
 *
 * Hover preview: a Popover opens after a short delay showing the page's emoji,
 * title, and first ~280 chars of content. Tracks pointer over both the link
 * and the popover so quick mouse transitions don't dismiss it.
 */
function NoteEmbedBlockView({
  noteId,
  fallbackTitle,
}: {
  noteId: string;
  fallbackTitle?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error } = trpc.note.getById.useQuery(
    { id: noteId },
    { enabled: noteId.length > 0 },
  );

  function scheduleOpen() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setHovered(true), HOVER_OPEN_DELAY);
  }

  function scheduleClose() {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), HOVER_CLOSE_DELAY);
  }

  if (!noteId) {
    return (
      <div
        className="my-1 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Note embed — pick a note to embed.
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="my-1 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Note no longer available.
      </div>
    );
  }

  const emoji = data?.emoji as string | null | undefined;
  const title = data?.title || fallbackTitle || "Untitled";
  const preview = (data?.contentText || "").replace(/\s+/g, " ").trim();
  const showPreview = preview.length > 0;

  // Notion-style row: full-width block-level link, small icon + single-line
  // title, underline on hover. We do NOT stopPropagation on mouseDown because
  // BlockNote's side-menu drag handle (in the gutter at the row's left)
  // needs to receive pointerdown events to start a drag. The link itself is
  // still clickable — the drag handle is a separate target outside the row.
  const row = (
    <a
      href={`/notes/${noteId}`}
      contentEditable={false}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group/embed my-0.5 flex w-fit max-w-full items-center gap-1.5 rounded-sm px-1 py-1 text-sm no-underline transition-colors",
        "hover:bg-accent/50",
      )}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
        aria-hidden
      >
        {emoji ? (
          <span className="text-[14px] leading-none">{emoji}</span>
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="truncate font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 group-hover/embed:decoration-muted-foreground">
        {isLoading && !data ? fallbackTitle || "Untitled" : title}
      </span>
    </a>
  );

  return (
    <Popover open={hovered}>
      <PopoverTrigger asChild>{row}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-80 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        <a
          href={`/notes/${noteId}`}
          className="block rounded-md p-3 no-underline"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              {emoji ? (
                <span className="text-[18px] leading-none">{emoji}</span>
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {title}
              </p>
              {showPreview ? (
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {preview}
                </p>
              ) : (
                <p className="mt-1 text-xs italic text-muted-foreground">
                  Empty page
                </p>
              )}
            </div>
          </div>
        </a>
      </PopoverContent>
    </Popover>
  );
}

export const noteEmbedBlockSpec = createReactBlockSpec(
  {
    type: "noteEmbed",
    propSchema: {
      noteId: { default: "" as string },
      title: { default: "" as string },
    },
    content: "none",
  },
  {
    render: ({ block }) => (
      <NoteEmbedBlockView
        noteId={block.props.noteId}
        fallbackTitle={block.props.title}
      />
    ),
    toExternalHTML: ({ block }) => (
      <p>
        <a href={`/notes/${block.props.noteId}`}>
          {block.props.title || block.props.noteId}
        </a>
      </p>
    ),
  },
);
