"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";
import { ArrowUpRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

function NoteEmbedBlockView({ noteId }: { noteId: string }) {
  const { data, isLoading, error } = trpc.note.getById.useQuery(
    { id: noteId },
    { enabled: noteId.length > 0 },
  );

  if (!noteId) {
    return (
      <div
        className="my-2 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Note embed — pick a note to embed.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="my-2 h-16 animate-pulse rounded-lg border bg-muted/30"
        contentEditable={false}
      />
    );
  }

  if (error || !data) {
    return (
      <div
        className="my-2 rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Note no longer available.
      </div>
    );
  }

  const preview = (data.contentText || "").replace(/\s+/g, " ").trim();
  const hasPreview = preview.length > 0;

  return (
    <a
      href={`/notes/${data.id}`}
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group/embed my-2 flex items-start gap-3 rounded-lg border bg-card px-4 py-3 no-underline transition-colors",
        "hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <FileText className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">
          {data.title || "Untitled"}
        </p>
        {hasPreview ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {preview}
          </p>
        ) : (
          <p className="mt-0.5 text-xs italic text-muted-foreground">
            Empty page
          </p>
        )}
      </div>
      <span className="ml-1 mt-0.5 flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover/embed:opacity-100">
        Open
        <ArrowUpRight className="h-3 w-3" />
      </span>
    </a>
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
    render: ({ block }) => <NoteEmbedBlockView noteId={block.props.noteId} />,
    toExternalHTML: ({ block }) => (
      <p>
        <a href={`/notes/${block.props.noteId}`}>
          {block.props.title || block.props.noteId}
        </a>
      </p>
    ),
  },
);
