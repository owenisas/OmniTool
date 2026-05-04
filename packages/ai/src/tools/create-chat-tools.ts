import { queryTasks } from "./query-tasks";
import { queryIssues } from "./query-issues";
import { queryMetrics } from "./query-metrics";
import { searchNotes } from "./search-notes";
import { makeCreateIssueTool } from "./create-issue";
import { updateTask } from "./update-task";

export function createChatTools(context: { userId: string }) {
  return {
    queryTasks,
    queryIssues,
    queryMetrics,
    searchNotes,
    createIssue: makeCreateIssueTool(context.userId),
    updateTask,
  };
}
