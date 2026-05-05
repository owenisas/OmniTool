import { queryTasks } from "./query-tasks";
import { queryIssues } from "./query-issues";
import { queryMetrics } from "./query-metrics";
import { searchNotes } from "./search-notes";
import { makeCreateIssueTool } from "./create-issue";
import { updateTask } from "./update-task";
import { makeReadNoteTool } from "./notes/read-note";
import { makeListNotesTool } from "./notes/list-notes";
import { makeCreateNoteTool } from "./notes/create-note";
import { makeOrganizeNoteTool } from "./notes/organize-note";

export function createChatTools(context: { userId: string }) {
  return {
    queryTasks,
    queryIssues,
    queryMetrics,
    searchNotes,
    createIssue: makeCreateIssueTool(context.userId),
    updateTask,
    readNote: makeReadNoteTool(context.userId),
    listNotes: makeListNotesTool(context.userId),
    createNote: makeCreateNoteTool(context.userId),
    organizeNote: makeOrganizeNoteTool(context.userId),
  };
}
