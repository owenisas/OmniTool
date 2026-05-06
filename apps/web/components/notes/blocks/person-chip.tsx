"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";

function PersonChipView({ userId, name }: { userId: string; name: string }) {
  const { data } = trpc.user.getById.useQuery(
    { id: userId },
    { enabled: userId.length > 0, staleTime: 60_000 },
  );

  const display = data?.name || name || "Unknown";
  const initial = (display || "?").charAt(0).toUpperCase();
  const avatarUrl = data?.avatarUrl;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border bg-primary/5 px-1.5 py-0.5 align-baseline text-[12px] font-medium text-primary"
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        if (userId) window.location.href = `/profile/${userId}`;
      }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-semibold">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-4 w-4 rounded-full" />
        ) : (
          initial
        )}
      </span>
      <span>@{display}</span>
    </span>
  );
}

export const personInlineSpec = createReactInlineContentSpec(
  {
    type: "person",
    propSchema: {
      userId: { default: "" as string },
      name: { default: "" as string },
    },
    content: "none",
  },
  {
    render: ({ inlineContent }) => (
      <PersonChipView
        userId={inlineContent.props.userId}
        name={inlineContent.props.name}
      />
    ),
    toExternalHTML: ({ inlineContent }) => (
      <span>@{inlineContent.props.name || inlineContent.props.userId}</span>
    ),
  },
);
