"use client";

import {
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from "@blocknote/core";
import {
  AlertCircle,
  AtSign,
  ChevronRight,
  FilePlus2,
  FolderKanban,
  Globe,
  Hash,
  ListTodo,
  Sparkles,
  StickyNote,
  Sun,
} from "lucide-react";

/**
 * Returns BlockNote's built-in slash items plus custom OmniTool items:
 * - "Ask AI" (group "AI") — dispatches `omnitool:inline-ai-prompt`
 * - "Tasks" / "Project card" / "Daily summary" / "Mention person" (group "Embed")
 *   — dispatch `omnitool:open-embed-picker` for the appropriate kind.
 *
 * The picker dialog (mounted in note-block-editor.tsx) handles selection then
 * dispatches `omnitool:insert-embed`, which the editor wires to `editor.insertBlocks`
 * / `editor.insertInlineContent`.
 */
export function getNotesSlashItems<
  BSchema extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema,
>(editor: BlockNoteEditor<BSchema, I, S>): DefaultReactSuggestionItem[] {
  return [
    {
      title: "Ask AI",
      onItemClick: () => {
        const blockId = editor.getTextCursorPosition().block.id;
        window.dispatchEvent(
          new CustomEvent("omnitool:inline-ai-prompt", {
            detail: { blockId },
          })
        );
      },
      aliases: ["ai", "assistant", "generate"],
      group: "AI",
      subtext: "Generate content with AI",
      icon: <Sparkles className="h-4 w-4" />,
    },
    {
      title: "Tasks",
      onItemClick: () => {
        const blockId = editor.getTextCursorPosition().block.id;
        window.dispatchEvent(
          new CustomEvent("omnitool:open-embed-picker", {
            detail: { kind: "taskList", blockId },
          })
        );
      },
      aliases: ["tasks", "todos", "todo", "kanban"],
      group: "Embed",
      subtext: "Live task list filtered by project / status",
      icon: <ListTodo className="h-4 w-4" />,
    },
    {
      title: "Project card",
      onItemClick: () => {
        const blockId = editor.getTextCursorPosition().block.id;
        window.dispatchEvent(
          new CustomEvent("omnitool:open-embed-picker", {
            detail: { kind: "projectCard", blockId },
          })
        );
      },
      aliases: ["project", "projectcard"],
      group: "Embed",
      subtext: "Reference a project (status, target date, task count)",
      icon: <FolderKanban className="h-4 w-4" />,
    },
    {
      title: "Daily summary",
      onItemClick: () => {
        const blockId = editor.getTextCursorPosition().block.id;
        window.dispatchEvent(
          new CustomEvent("omnitool:open-embed-picker", {
            detail: { kind: "dailySummary", blockId },
          })
        );
      },
      aliases: ["daily", "summary", "standup", "today"],
      group: "Embed",
      subtext: "Embed a team member's daily summary for a specific date",
      icon: <Sun className="h-4 w-4" />,
    },
    {
      title: "Link note",
      onItemClick: () => {
        const blockId = editor.getTextCursorPosition().block.id;
        window.dispatchEvent(
          new CustomEvent("omnitool:open-embed-picker", {
            detail: { kind: "noteMention", blockId },
          }),
        );
      },
      aliases: ["link", "mention", "note", "ref", "[[", "@@"],
      group: "Embed",
      subtext: "Inline link to another note (creates backlink)",
      icon: <Hash className="h-4 w-4" />,
    },
    {
      title: "Subpage",
      onItemClick: () => {
        const blockId = editor.getTextCursorPosition().block.id;
        window.dispatchEvent(
          new CustomEvent("omnitool:create-subpage", {
            detail: { blockId },
          }),
        );
      },
      aliases: ["subpage", "child", "page", "nested"],
      group: "Embed",
      subtext: "Create a new child page nested under this note",
      icon: <FilePlus2 className="h-4 w-4" />,
    },
    {
      title: "Embed note",
      onItemClick: () => {
        const blockId = editor.getTextCursorPosition().block.id;
        window.dispatchEvent(
          new CustomEvent("omnitool:open-embed-picker", {
            detail: { kind: "noteEmbed", blockId },
          }),
        );
      },
      aliases: ["embed", "note", "preview"],
      group: "Embed",
      subtext: "Embed a note preview block",
      icon: <StickyNote className="h-4 w-4" />,
    },
    {
      title: "Mention person",
      onItemClick: () => {
        const blockId = editor.getTextCursorPosition().block.id;
        window.dispatchEvent(
          new CustomEvent("omnitool:open-embed-picker", {
            detail: { kind: "person", blockId },
          })
        );
      },
      aliases: ["@", "mention", "person", "user"],
      group: "Embed",
      subtext: "Tag a teammate inline",
      icon: <AtSign className="h-4 w-4" />,
    },
    {
      title: "Toggle",
      onItemClick: () => {
        const pos = editor.getTextCursorPosition();
        editor.insertBlocks(
          [{ type: "toggle" as any }],
          pos.block,
          "after",
        );
      },
      aliases: ["toggle", "collapse", "expand", "details"],
      group: "Basic blocks",
      subtext: "Collapsible toggle section",
      icon: <ChevronRight className="h-4 w-4" />,
    },
    {
      title: "Callout",
      onItemClick: () => {
        const pos = editor.getTextCursorPosition();
        editor.insertBlocks(
          [{ type: "callout" as any }],
          pos.block,
          "after",
        );
      },
      aliases: ["callout", "highlight", "info", "warning", "tip"],
      group: "Basic blocks",
      subtext: "Highlighted callout box with icon",
      icon: <AlertCircle className="h-4 w-4" />,
    },
    {
      title: "Bookmark",
      onItemClick: () => {
        const pos = editor.getTextCursorPosition();
        editor.insertBlocks(
          [{ type: "bookmark" as any }],
          pos.block,
          "after",
        );
      },
      aliases: ["bookmark", "url", "link", "web", "clip"],
      group: "Basic blocks",
      subtext: "Save a link with preview card",
      icon: <Globe className="h-4 w-4" />,
    },
    ...getDefaultReactSlashMenuItems(editor),
  ];
}
