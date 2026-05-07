"use client";

import { useState, useEffect } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { ExternalLink, Globe, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UnfurlData {
  title: string;
  description: string;
  favicon: string;
  image: string;
  url: string;
}

function BookmarkBlockView({
  block,
  editor,
}: {
  block: { props: { url: string; title: string; description: string; favicon: string; image: string } };
  editor: any;
}) {
  const { url, title, description, favicon, image } = block.props;
  const [loading, setLoading] = useState(false);
  const [editingUrl, setEditingUrl] = useState(!url);
  const [inputUrl, setInputUrl] = useState(url || "");

  useEffect(() => {
    if (url && !title) {
      unfurl(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unfurl(targetUrl: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/notes/unfurl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });
      if (!res.ok) throw new Error("Failed to unfurl");
      const data: UnfurlData = await res.json();
      editor.updateBlock(block, {
        props: {
          url: targetUrl,
          title: data.title || targetUrl,
          description: data.description || "",
          favicon: data.favicon || "",
          image: data.image || "",
        },
      });
      setEditingUrl(false);
    } catch {
      editor.updateBlock(block, {
        props: { url: targetUrl, title: targetUrl, description: "", favicon: "", image: "" },
      });
      setEditingUrl(false);
    } finally {
      setLoading(false);
    }
  }

  if (editingUrl || !url) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-md border bg-muted/30 p-3" contentEditable={false}>
        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="url"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputUrl.trim()) {
              unfurl(inputUrl.trim());
            }
          }}
          placeholder="Paste a URL and press Enter..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoFocus
        />
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      contentEditable={false}
      className={cn(
        "group my-2 flex overflow-hidden rounded-md border no-underline transition-colors hover:bg-accent/30",
        image ? "flex-col" : "flex-row items-center",
      )}
    >
      {image && (
        <div className="h-32 w-full overflow-hidden border-b bg-muted">
          <img src={image} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-start gap-2.5 p-3">
        {favicon ? (
          <img src={favicon} alt="" className="mt-0.5 h-4 w-4 shrink-0 rounded-sm" />
        ) : (
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{title || url}</p>
          {description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{description}</p>
          )}
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70">
            <ExternalLink className="h-3 w-3" />
            <span className="truncate">{new URL(url).hostname}</span>
          </p>
        </div>
      </div>
    </a>
  );
}

export const bookmarkBlockSpec = createReactBlockSpec(
  {
    type: "bookmark",
    propSchema: {
      url: { default: "" as string },
      title: { default: "" as string },
      description: { default: "" as string },
      favicon: { default: "" as string },
      image: { default: "" as string },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <BookmarkBlockView block={block} editor={editor} />
    ),
    toExternalHTML: ({ block }) => (
      <p>
        <a href={block.props.url}>{block.props.title || block.props.url}</a>
      </p>
    ),
  },
);
