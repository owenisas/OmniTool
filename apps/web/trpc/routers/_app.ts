import { createTRPCRouter } from "../init";
import { userRouter } from "./user";
import { projectRouter } from "./project";
import { taskRouter } from "./task";
import { issueRouter } from "./issue";
import { noteRouter } from "./note";
import { performanceRouter } from "./performance";
import { timeEntryRouter } from "./timeEntry";
import { teamRouter } from "./team";
import { integrationRouter } from "./integration";
import { dashboardRouter } from "./dashboard";
import { aiConversationRouter } from "./ai-conversation";
import { teamActivityRouter } from "./team-activity";

export const appRouter = createTRPCRouter({
  user: userRouter,
  project: projectRouter,
  task: taskRouter,
  issue: issueRouter,
  note: noteRouter,
  performance: performanceRouter,
  timeEntry: timeEntryRouter,
  team: teamRouter,
  integration: integrationRouter,
  dashboard: dashboardRouter,
  aiConversation: aiConversationRouter,
  teamActivity: teamActivityRouter,
});

export type AppRouter = typeof appRouter;
