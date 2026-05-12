import { makeQueryTasksTool } from "./query-tasks";
import { makeQueryIssuesTool } from "./query-issues";
import { makeQueryMetricsTool } from "./query-metrics";
import { makeSearchNotesTool } from "./search-notes";
import { makeCreateIssueTool } from "./create-issue";
import { makeUpdateTaskTool } from "./update-task";
import { makeReadNoteTool } from "./notes/read-note";
import { makeListNotesTool } from "./notes/list-notes";
import { makeCreateNoteTool } from "./notes/create-note";
import { makeOrganizeNoteTool } from "./notes/organize-note";

export function createChatTools(context: { userId: string }) {
  return {
    queryTasks: makeQueryTasksTool(context.userId),
    queryIssues: makeQueryIssuesTool(context.userId),
    queryMetrics: makeQueryMetricsTool(context.userId),
    searchNotes: makeSearchNotesTool(context.userId),
    createIssue: makeCreateIssueTool(context.userId),
    updateTask: makeUpdateTaskTool(context.userId),
    readNote: makeReadNoteTool(context.userId),
    listNotes: makeListNotesTool(context.userId),
    createNote: makeCreateNoteTool(context.userId),
    organizeNote: makeOrganizeNoteTool(context.userId),
  };
}
