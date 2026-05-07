"use client";

import { useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toggle (collapsible) block -- Notion-style.
 *
 * Uses `content: "inline"` so the summary text is directly editable via
 * BlockNote's inline content system. A chevron button on the left toggles
 * open/closed state. When collapsed the block renders a single line; when
 * expanded a muted hint tells the user to add content in subsequent blocks.
 *
 * BlockNote doesn't support arbitrary nested children inside a custom block,
 * so the "body" of the toggle is the blocks that follow it in the document.
 * The visual hint guides users to place content below.
 */
function ToggleBlockView({
  contentRef,
}: {
  contentRef: (node: HTMLElement | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-1">
      <div className="flex items-start gap-1">
        <button
          type="button"
          contentEditable={false}
          onClick={() => setOpen((prev) => !prev)}
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-accent"
          aria-label={open ? "Collapse toggle" : "Expand toggle"}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-150",
              open && "rotate-90",
            )}
          />
        </button>
        <div ref={contentRef} className="min-w-0 flex-1" />
      </div>
      {open && (
        <div
          contentEditable={false}
          className="ml-7 mt-1 rounded border border-dashed border-border/50 px-3 py-2 text-xs text-muted-foreground"
        >
          Add content in the blocks below this toggle.
        </div>
      )}
    </div>
  );
}

/**
 * BlockNote block spec factory for the Toggle block.
 *
 * Usage in schema.ts:
 *   import { toggleBlockSpec } from "./toggle-block";
 *   // in blockSpecs: { toggle: toggleBlockSpec() }
 */
export const toggleBlockSpec = createReactBlockSpec(
  {
    type: "toggle" as const,
    propSchema: {},
    content: "inline" as const,
  },
  {
    render: (props) => <ToggleBlockView contentRef={props.contentRef} />,
    toExternalHTML: ({ contentRef }) => (
      <details>
        <summary>
          <div ref={contentRef} />
        </summary>
      </details>
    ),
  },
);
