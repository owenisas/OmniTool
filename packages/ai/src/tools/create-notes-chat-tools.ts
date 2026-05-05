import { makeReadNoteTool } from "./notes/read-note";
import { makeListNotesTool } from "./notes/list-notes";
import { makeCreateNoteTool } from "./notes/create-note";
import { makeOrganizeNoteTool } from "./notes/organize-note";
import { makeAppendToNoteTool } from "./notes/append-to-note";
import { makeEditNoteSectionTool } from "./notes/edit-note-section";
import { makeRemoveBlocksTool } from "./notes/remove-blocks";
import { fetchWebPage } from "./notes/fetch-web-page";
import { searchWeb } from "./notes/search-web";
import { searchNotes } from "./search-notes";

export function createNotesChatTools(context: {
  userId: string;
  noteId?: string;
}) {
  return {
    // Note reading & browsing
    readNote: makeReadNoteTool(context.userId),
    listNotes: makeListNotesTool(context.userId),
    searchNotes,

    // Note creation & editing
    createNote: makeCreateNoteTool(context.userId),
    appendToNote: makeAppendToNoteTool(context.userId),
    editNoteSection: makeEditNoteSectionTool(context.userId),
    removeBlocks: makeRemoveBlocksTool(context.userId),
    organizeNote: makeOrganizeNoteTool(context.userId),

    // Research
    fetchWebPage,
    searchWeb,
  };
}
