"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";
import { FileText } from "lucide-react";

/**
 * Inline note link — same Notion-style visual as the subpage `noteEmbed`
 * block, just sized to flow within text. Icon (emoji or page) + underlined
 * title. Click navigates.
 */
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
  const emoji = data?.emoji as string | null | undefined;

  return (
    <span
      className="group/mention inline-flex items-center gap-1 rounded-sm px-0.5 align-baseline text-sm transition-colors hover:bg-accent/50"
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (noteId) window.location.href = `/notes/${noteId}`;
      }}
    >
      <span
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
        aria-hidden
      >
        {emoji ? (
          <span className="text-[14px] leading-none">{emoji}</span>
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
      </span>
      <span className="truncate max-w-[260px] font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 group-hover/mention:decoration-muted-foreground">
        {display}
      </span>
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
