"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { cn } from "@/lib/utils";

/**
 * Color palette for the callout block. Each key maps to Tailwind utility
 * classes providing a tinted background, left border, and dark-mode variants.
 */
const colorStyles: Record<string, string> = {
  blue: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800",
  yellow:
    "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
  red: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
  green:
    "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
  purple:
    "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800",
  gray: "bg-muted border-border",
};

/**
 * Callout / highlight block -- Notion-style.
 *
 * Uses `content: "inline"` so the body text is directly editable. An emoji
 * is displayed on the left (configurable via the `emoji` prop), and the
 * background color is driven by the `color` prop.
 *
 * The emoji is rendered as a static element for now. An emoji picker overlay
 * can be wired in later by intercepting clicks on the emoji span and opening
 * a picker that calls `editor.updateBlock(block.id, { props: { emoji } })`.
 */
function CalloutBlockView({
  block,
  contentRef,
}: {
  block: { props: { emoji: string; color: string } };
  contentRef: (node: HTMLElement | null) => void;
}) {
  const emoji = block.props.emoji || "💡";
  const color = block.props.color || "blue";

  return (
    <div
      className={cn(
        "my-2 flex items-start gap-3 rounded-lg border-l-4 border p-3",
        colorStyles[color] || colorStyles.blue,
      )}
    >
      <span
        contentEditable={false}
        className="mt-0.5 flex h-6 w-6 shrink-0 select-none items-center justify-center text-lg leading-none"
        aria-hidden
        role="img"
      >
        {emoji}
      </span>
      <div ref={contentRef} className="min-w-0 flex-1" />
    </div>
  );
}

/**
 * BlockNote block spec factory for the Callout block.
 *
 * Usage in schema.ts:
 *   import { calloutBlockSpec } from "./callout-block";
 *   // in blockSpecs: { callout: calloutBlockSpec() }
 */
export const calloutBlockSpec = createReactBlockSpec(
  {
    type: "callout" as const,
    propSchema: {
      emoji: { default: "💡" as string },
      color: { default: "blue" as string },
    },
    content: "inline" as const,
  },
  {
    render: (props) => (
      <CalloutBlockView block={props.block} contentRef={props.contentRef} />
    ),
    toExternalHTML: ({ block }) => (
      <div
        style={{
          padding: "8px 12px",
          borderLeft: "4px solid #3b82f6",
          background: "#eff6ff",
          borderRadius: "4px",
        }}
      >
        <span>{block.props.emoji} </span>
        <span>[Callout content]</span>
      </div>
    ),
  },
);
