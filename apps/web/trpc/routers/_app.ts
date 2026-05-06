import { createTRPCRouter } from "../init";
import { userRouter } from "./user";
import { projectRouter } from "./project";
import { taskRouter } from "./task";
import { issueRouter } from "./issue";
import { noteRouter } from "./note";
import { noteMentionRouter } from "./note-mention";
import { noteCommentRouter } from "./note-comment";
import { performanceRouter } from "./performance";
import { timeEntryRouter } from "./timeEntry";
import { teamRouter } from "./team";
import { integrationRouter } from "./integration";
import { dashboardRouter } from "./dashboard";
import { aiConversationRouter } from "./ai-conversation";
import { teamActivityRouter } from "./team-activity";
import { userNotePreferenceRouter } from "./user-note-preference";
import { activityRouter } from "./activity";
import { entityLinkRouter } from "./entity-link";
import { handoffRouter } from "./handoff";

export const appRouter = createTRPCRouter({
  user: userRouter,
  project: projectRouter,
  task: taskRouter,
  issue: issueRouter,
  note: noteRouter,
  noteMention: noteMentionRouter,
  noteComment: noteCommentRouter,
  performance: performanceRouter,
  timeEntry: timeEntryRouter,
  team: teamRouter,
  integration: integrationRouter,
  dashboard: dashboardRouter,
  aiConversation: aiConversationRouter,
  teamActivity: teamActivityRouter,
  userNotePreference: userNotePreferenceRouter,
  activity: activityRouter,
  entityLink: entityLinkRouter,
  handoff: handoffRouter,
});

export type AppRouter = typeof appRouter;
