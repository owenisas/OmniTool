"use client";

import { FileText } from "lucide-react";

interface SharedNote {
  id: string;
  title: string;
  emoji: string | null;
  blocks: unknown;
  contentText: string;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string; avatarUrl: string | null };
  tags: { id: string; name: string; color: string | null }[];
}

// ─── Lightweight block renderer ─────────────────────────────
// Renders BlockNote JSON blocks into read-only HTML. This is intentionally
// simple: it covers the standard block types (paragraph, heading, list items,
// code, etc.) and gracefully degrades unknown custom blocks to their text
// content. We avoid pulling in the full BlockNote editor bundle for this
// public read-only page.

interface InlineContent {
  type: string;
  text?: string;
  content?: InlineContent[];
  styles?: Record<string, boolean | string>;
  props?: Record<string, unknown>;
}

interface Block {
  id?: string;
  type: string;
  content?: InlineContent[];
  props?: Record<string, unknown>;
  children?: Block[];
}

function renderInlineContent(content: InlineContent[] | undefined): string {
  if (!content) return "";
  return content
    .map((item) => {
      if (item.type === "text") {
        let text = escapeHtml(item.text ?? "");
        const styles = item.styles ?? {};
        if (styles.bold) text = `<strong>${text}</strong>`;
        if (styles.italic) text = `<em>${text}</em>`;
        if (styles.underline) text = `<u>${text}</u>`;
        if (styles.strikethrough) text = `<s>${text}</s>`;
        if (styles.code) text = `<code class="px-1 py-0.5 rounded bg-muted text-sm font-mono">${text}</code>`;
        return text;
      }
      if (item.type === "link") {
        const href = escapeHtml(String(item.props?.url ?? "#"));
        const inner = renderInlineContent(item.content);
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="text-primary underline">${inner}</a>`;
      }
      // noteMention, person, etc. -- render as plain text
      if (item.content) return renderInlineContent(item.content);
      if (item.text) return escapeHtml(item.text);
      // For mention-style inline content, try to extract display text from props
      if (item.props) {
        const label =
          (item.props as Record<string, unknown>).name ??
          (item.props as Record<string, unknown>).title ??
          "";
        if (label) return `<span class="text-primary font-medium">${escapeHtml(String(label))}</span>`;
      }
      return "";
    })
    .join("");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBlock(block: Block): string {
  const content = renderInlineContent(block.content);
  const childrenHtml = (block.children ?? []).map(renderBlock).join("");

  switch (block.type) {
    case "paragraph":
      return `<p class="mb-2 leading-relaxed">${content || "&nbsp;"}</p>${childrenHtml}`;
    case "heading": {
      const level = Number(block.props?.level ?? 2);
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      const sizeClass =
        level === 1
          ? "text-3xl font-bold mt-8 mb-3"
          : level === 2
            ? "text-2xl font-semibold mt-6 mb-2"
            : "text-xl font-semibold mt-4 mb-2";
      return `<${tag} class="${sizeClass}">${content}</${tag}>${childrenHtml}`;
    }
    case "bulletListItem":
      return `<li class="ml-6 list-disc mb-1">${content}${childrenHtml ? `<ul class="mt-1">${childrenHtml}</ul>` : ""}</li>`;
    case "numberedListItem":
      return `<li class="ml-6 list-decimal mb-1">${content}${childrenHtml ? `<ol class="mt-1">${childrenHtml}</ol>` : ""}</li>`;
    case "checkListItem": {
      const checked = block.props?.checked === true;
      return `<li class="ml-6 mb-1 flex items-start gap-2">
        <span class="mt-1 ${checked ? "text-green-500" : "text-muted-foreground"}">${checked ? "[x]" : "[ ]"}</span>
        <span class="${checked ? "line-through text-muted-foreground" : ""}">${content}</span>
      </li>${childrenHtml}`;
    }
    case "codeBlock": {
      const lang = block.props?.language ?? "";
      return `<pre class="bg-muted rounded-md p-4 overflow-x-auto mb-3 text-sm"><code${lang ? ` class="language-${escapeHtml(String(lang))}"` : ""}>${content}</code></pre>${childrenHtml}`;
    }
    case "image": {
      const url = block.props?.url ?? "";
      const caption = block.props?.caption ?? "";
      return `<figure class="my-4">
        <img src="${escapeHtml(String(url))}" alt="${escapeHtml(String(caption))}" class="max-w-full rounded-md" loading="lazy" />
        ${caption ? `<figcaption class="text-sm text-muted-foreground mt-1">${escapeHtml(String(caption))}</figcaption>` : ""}
      </figure>${childrenHtml}`;
    }
    case "table": {
      // Tables have rows in children, each row has cells in content
      return `<div class="overflow-x-auto mb-4"><table class="w-full border-collapse border border-border rounded-md text-sm">${childrenHtml}</table></div>`;
    }
    case "tableRow": {
      const cells = block.content ?? [];
      const cellsHtml = cells
        .map(
          (cell) =>
            `<td class="border border-border px-3 py-2">${renderInlineContent(cell.content)}</td>`,
        )
        .join("");
      return `<tr>${cellsHtml}</tr>`;
    }
    case "callout": {
      const emoji = block.props?.emoji ?? "";
      return `<div class="flex gap-3 bg-muted/50 rounded-lg p-4 mb-3 border border-border/50">
        ${emoji ? `<span class="text-lg shrink-0">${escapeHtml(String(emoji))}</span>` : ""}
        <div>${content}${childrenHtml}</div>
      </div>`;
    }
    case "toggle": {
      return `<details class="mb-2"><summary class="cursor-pointer font-medium">${content}</summary><div class="ml-4 mt-1">${childrenHtml}</div></details>`;
    }
    case "noteEmbed": {
      const title = block.props?.title ?? "Linked page";
      return `<div class="flex items-center gap-2 py-1 px-2 bg-muted/30 rounded border border-border/40 mb-2 text-sm">
        <span class="text-muted-foreground">📄</span>
        <span class="text-foreground">${escapeHtml(String(title))}</span>
      </div>${childrenHtml}`;
    }
    case "bookmark": {
      const url = block.props?.url ?? "";
      return `<a href="${escapeHtml(String(url))}" target="_blank" rel="noopener noreferrer" class="block border border-border rounded-md p-3 mb-3 hover:bg-muted/50 transition text-sm text-primary underline">${escapeHtml(String(url))}</a>${childrenHtml}`;
    }
    default:
      // Unknown block type -- render content text if available
      if (content) {
        return `<div class="mb-2">${content}</div>${childrenHtml}`;
      }
      return childrenHtml;
  }
}

function renderBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";

  // Group consecutive list items for proper <ul>/<ol> wrapping
  const html: string[] = [];
  let listBuffer: { type: string; html: string }[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    const type = listBuffer[0].type;
    const tag =
      type === "numberedListItem"
        ? "ol"
        : type === "checkListItem"
          ? "ul"
          : "ul";
    html.push(
      `<${tag} class="mb-3">${listBuffer.map((l) => l.html).join("")}</${tag}>`,
    );
    listBuffer = [];
  }

  for (const block of blocks as Block[]) {
    const isListItem =
      block.type === "bulletListItem" ||
      block.type === "numberedListItem" ||
      block.type === "checkListItem";

    if (isListItem) {
      if (
        listBuffer.length > 0 &&
        listBuffer[0].type !== block.type
      ) {
        flushList();
      }
      listBuffer.push({ type: block.type, html: renderBlock(block) });
    } else {
      flushList();
      html.push(renderBlock(block));
    }
  }
  flushList();

  return html.join("");
}

// ─── Component ──────────────────────────────────────────────

export function SharedNoteContent({ note }: { note: SharedNote }) {
  const blocksHtml = renderBlocks(note.blocks);
  const formattedDate = new Date(note.updatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Top branding bar */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>Shared from OmniTool</span>
          </div>
          <a
            href="/"
            className="text-sm text-primary hover:underline"
          >
            Open OmniTool
          </a>
        </div>
      </header>

      {/* Note content */}
      <main className="mx-auto max-w-3xl px-6 py-10">
        {/* Title */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-3">
            {note.emoji && (
              <span className="text-4xl">{note.emoji}</span>
            )}
            {note.title}
          </h1>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-8 pb-4 border-b border-border">
          {note.author.name && (
            <span>By {note.author.name}</span>
          )}
          <span>Last updated {formattedDate}</span>
          {note.tags.length > 0 && (
            <div className="flex gap-1.5">
              {note.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        {blocksHtml ? (
          <article
            className="prose prose-neutral dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: blocksHtml }}
          />
        ) : note.contentText ? (
          <article className="prose prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap">
            {note.contentText}
          </article>
        ) : (
          <p className="text-muted-foreground italic">
            This note has no content.
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="mx-auto max-w-3xl px-6 py-6 text-center text-sm text-muted-foreground">
          Shared via{" "}
          <a href="/" className="text-primary hover:underline">
            OmniTool
          </a>
        </div>
      </footer>
    </div>
  );
}
