"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";
import { StickyNote } from "lucide-react";

function NoteMentionChipView({
  noteId,
  title,
}: {
  noteId: string;
  title: string;
}) {
  const { data } = trpc.note.getById.useQuery(
    { id: noteId },
    { enabled: noteId.length > 0, staleTime: 60_000 },
  );

  const display = data?.title || title || "Untitled note";

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border bg-blue-500/5 px-1.5 py-0.5 align-baseline text-[12px] font-medium text-blue-700 hover:bg-blue-500/10 dark:text-blue-300"
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (noteId) window.location.href = `/notes/${noteId}`;
      }}
    >
      <StickyNote className="h-3 w-3" />
      <span className="truncate max-w-[200px]">{display}</span>
    </span>
  );
}

export const noteMentionInlineSpec = createReactInlineContentSpec(
  {
    type: "noteMention",
    propSchema: {
      noteId: { default: "" as string },
      title: { default: "" as string },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <NoteMentionChipView
        noteId={inlineContent.props.noteId}
        title={inlineContent.props.title}
      />
    ),
    toExternalHTML: ({ inlineContent }) => (
      <a href={`/notes/${inlineContent.props.noteId}`}>
        {inlineContent.props.title || inlineContent.props.noteId}
      </a>
    ),
  },
);
