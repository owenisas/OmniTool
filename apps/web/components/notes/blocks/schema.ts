import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { taskListBlockSpec } from "./task-list-block";
import { projectCardBlockSpec } from "./project-card-block";
import { dailySummaryBlockSpec } from "./daily-summary-block";
import { noteEmbedBlockSpec } from "./note-embed-block";
import { toggleBlockSpec } from "./toggle-block";
import { calloutBlockSpec } from "./callout-block";
import { bookmarkBlockSpec } from "./bookmark-block";
import { personInlineSpec } from "./person-chip";
import { noteMentionInlineSpec } from "./note-mention-chip";

/**
 * Composed BlockNote schema for OmniTool notes.
 * Adds custom embed blocks (taskList, projectCard, dailySummary, noteEmbed)
 * and inline mention chips ("person", "noteMention") on top of all default
 * blocks/inline content.
 */
export const noteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    taskList: taskListBlockSpec(),
    projectCard: projectCardBlockSpec(),
    dailySummary: dailySummaryBlockSpec(),
    noteEmbed: noteEmbedBlockSpec(),
    toggle: toggleBlockSpec(),
    callout: calloutBlockSpec(),
    bookmark: bookmarkBlockSpec(),
  },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    person: personInlineSpec,
    noteMention: noteMentionInlineSpec,
  },
});

export type NoteEditor = typeof noteSchema.BlockNoteEditor;
