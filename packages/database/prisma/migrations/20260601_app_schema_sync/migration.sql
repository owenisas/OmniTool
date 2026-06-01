-- Bring Prisma migrations back in line with the current application schema.
--
-- Several app features were added after the initial migration and appear to
-- have reached some environments via db:push/manual SQL. Keep this migration
-- idempotent so stale and partially-updated databases can both deploy safely.

-- Users / teams
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "supabaseAuthId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "slackUserId" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "personalTeamId" TEXT;

ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'TEAM';
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "slackReplyMode" TEXT NOT NULL DEFAULT 'full';

CREATE UNIQUE INDEX IF NOT EXISTS "users_supabaseAuthId_key" ON "users"("supabaseAuthId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_githubUserId_key" ON "users"("githubUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_githubLogin_key" ON "users"("githubLogin");
CREATE UNIQUE INDEX IF NOT EXISTS "users_slackUserId_key" ON "users"("slackUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_personalTeamId_key" ON "users"("personalTeamId");
CREATE UNIQUE INDEX IF NOT EXISTS "teams_githubOrgId_key" ON "teams"("githubOrgId");
CREATE UNIQUE INDEX IF NOT EXISTS "teams_githubOrgLogin_key" ON "teams"("githubOrgLogin");
CREATE INDEX IF NOT EXISTS "teams_kind_idx" ON "teams"("kind");

-- Tasks / issues
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "firstStartedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "tasks_projectId_idx" ON "tasks"("projectId");
CREATE INDEX IF NOT EXISTS "tasks_assigneeId_idx" ON "tasks"("assigneeId");
CREATE INDEX IF NOT EXISTS "tasks_creatorId_idx" ON "tasks"("creatorId");

ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "githubIssueNumber" INTEGER;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "githubRepoFullName" TEXT;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "linearIssueId" TEXT;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "linearTeamKey" TEXT;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "linearIdentifier" TEXT;
ALTER TABLE "issues" ADD COLUMN IF NOT EXISTS "linearSyncedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "issues_projectId_idx" ON "issues"("projectId");
CREATE INDEX IF NOT EXISTS "issues_assigneeId_idx" ON "issues"("assigneeId");
CREATE INDEX IF NOT EXISTS "issues_reporterId_idx" ON "issues"("reporterId");
CREATE INDEX IF NOT EXISTS "issues_githubRepoFullName_githubIssueNumber_idx" ON "issues"("githubRepoFullName", "githubIssueNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "issues_linearIssueId_key" ON "issues"("linearIssueId");

-- Notes core
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "emoji" VARCHAR(16);
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "linkedProjectId" TEXT;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "isAutoCreated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("contentText", '')), 'B')
  ) STORED;

-- Current schema allows duplicate Notion page ids across teamspaces and only
-- enforces uniqueness for active rows within the same teamspace.
DROP INDEX IF EXISTS "notes_notionPageId_key";
CREATE INDEX IF NOT EXISTS "notes_teamId_parentId_position_idx" ON "notes"("teamId", "parentId", "position");
CREATE INDEX IF NOT EXISTS "notes_teamId_deletedAt_idx" ON "notes"("teamId", "deletedAt");
CREATE INDEX IF NOT EXISTS "notes_teamId_idx" ON "notes"("teamId");
CREATE INDEX IF NOT EXISTS "notes_authorId_idx" ON "notes"("authorId");
CREATE INDEX IF NOT EXISTS "notes_linkedProjectId_idx" ON "notes"("linkedProjectId");
CREATE INDEX IF NOT EXISTS "notes_authorId_deletedAt_idx" ON "notes"("authorId", "deletedAt");
CREATE INDEX IF NOT EXISTS "idx_notes_search_vector" ON "notes" USING GIN ("search_vector");
CREATE UNIQUE INDEX IF NOT EXISTS "notes_linkedProjectId_key" ON "notes"("linkedProjectId");

-- Note collaboration and history
CREATE TABLE IF NOT EXISTS "note_links" (
  "id" TEXT NOT NULL,
  "sourceNoteId" TEXT NOT NULL,
  "targetNoteId" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'mention',
  "blockId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "note_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "note_mentions" (
  "id" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "blockId" TEXT,
  "mentionedUserId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "note_mentions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "note_comments" (
  "id" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "blockAnchor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "note_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "note_comment_reads" (
  "userId" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "note_comment_reads_pkey" PRIMARY KEY ("userId", "noteId")
);

CREATE TABLE IF NOT EXISTS "note_versions" (
  "id" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "editorUserId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "aiTool" TEXT,
  "title" TEXT NOT NULL,
  "blocks" JSONB NOT NULL,
  "contentText" TEXT NOT NULL DEFAULT '',
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "note_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "note_links_sourceNoteId_targetNoteId_kind_blockId_key" ON "note_links"("sourceNoteId", "targetNoteId", "kind", "blockId");
CREATE INDEX IF NOT EXISTS "note_links_targetNoteId_idx" ON "note_links"("targetNoteId");
CREATE INDEX IF NOT EXISTS "note_links_sourceNoteId_idx" ON "note_links"("sourceNoteId");
CREATE INDEX IF NOT EXISTS "note_mentions_mentionedUserId_readAt_idx" ON "note_mentions"("mentionedUserId", "readAt");
CREATE INDEX IF NOT EXISTS "note_mentions_noteId_idx" ON "note_mentions"("noteId");
CREATE INDEX IF NOT EXISTS "note_comments_noteId_createdAt_idx" ON "note_comments"("noteId", "createdAt");
CREATE INDEX IF NOT EXISTS "note_versions_noteId_snapshotAt_idx" ON "note_versions"("noteId", "snapshotAt");
CREATE INDEX IF NOT EXISTS "note_versions_editorUserId_idx" ON "note_versions"("editorUserId");

-- Conversations
ALTER TABLE "ai_conversations" ADD COLUMN IF NOT EXISTS "noteId" TEXT;
CREATE INDEX IF NOT EXISTS "ai_conversations_noteId_idx" ON "ai_conversations"("noteId");
CREATE INDEX IF NOT EXISTS "ai_conversations_userId_idx" ON "ai_conversations"("userId");

-- Coding summaries / activity / entity links / mirrors
CREATE TABLE IF NOT EXISTS "daily_coding_summaries" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "teamId" TEXT,
  "date" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "sessionCount" INTEGER NOT NULL,
  "totalMessages" INTEGER NOT NULL,
  "sources" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "overview" TEXT NOT NULL,
  "keyTopics" TEXT NOT NULL,
  "actionItems" TEXT NOT NULL,
  "risks" TEXT NOT NULL,
  "perSessionMeta" TEXT,
  "modelUsed" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "daily_coding_summaries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "activity_events" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "actorId" TEXT,
  "actorType" TEXT NOT NULL DEFAULT 'user',
  "teamId" TEXT,
  "projectId" TEXT,
  "subjectType" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "entity_links" (
  "id" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "linkType" TEXT NOT NULL,
  "metadata" JSONB,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "entity_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "github_pull_requests" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "githubPrId" INTEGER NOT NULL,
  "githubRepoFullName" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "authorGithubLogin" TEXT,
  "authorUserId" TEXT,
  "headBranch" TEXT NOT NULL,
  "baseBranch" TEXT NOT NULL,
  "body" TEXT,
  "mergedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "github_pull_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "github_commits" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "sha" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "authorGithubLogin" TEXT,
  "authorUserId" TEXT,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "additions" INTEGER,
  "deletions" INTEGER,
  CONSTRAINT "github_commits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_coding_summaries_userId_date_key" ON "daily_coding_summaries"("userId", "date");
CREATE INDEX IF NOT EXISTS "daily_coding_summaries_teamId_date_idx" ON "daily_coding_summaries"("teamId", "date");
CREATE INDEX IF NOT EXISTS "activity_events_teamId_createdAt_idx" ON "activity_events"("teamId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_events_projectId_createdAt_idx" ON "activity_events"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_events_subjectType_subjectId_idx" ON "activity_events"("subjectType", "subjectId");
CREATE INDEX IF NOT EXISTS "activity_events_actorId_createdAt_idx" ON "activity_events"("actorId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "entity_links_sourceType_sourceId_targetType_targetId_linkType_key" ON "entity_links"("sourceType", "sourceId", "targetType", "targetId", "linkType");
CREATE INDEX IF NOT EXISTS "entity_links_sourceType_sourceId_idx" ON "entity_links"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "entity_links_targetType_targetId_idx" ON "entity_links"("targetType", "targetId");
CREATE UNIQUE INDEX IF NOT EXISTS "github_pull_requests_githubRepoFullName_number_key" ON "github_pull_requests"("githubRepoFullName", "number");
CREATE INDEX IF NOT EXISTS "github_pull_requests_projectId_state_idx" ON "github_pull_requests"("projectId", "state");
CREATE INDEX IF NOT EXISTS "github_pull_requests_authorUserId_idx" ON "github_pull_requests"("authorUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "github_commits_projectId_sha_key" ON "github_commits"("projectId", "sha");
CREATE INDEX IF NOT EXISTS "github_commits_authorUserId_timestamp_idx" ON "github_commits"("authorUserId", "timestamp");

-- News, handoffs, preferences
CREATE TABLE IF NOT EXISTS "news_digests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "topics" JSONB NOT NULL,
  "articles" JSONB NOT NULL,
  "synthesis" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "news_digests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "agent_handoffs" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "contextPayload" JSONB NOT NULL,
  "agentProvider" TEXT NOT NULL,
  "agentConfig" JSONB,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "externalRunId" TEXT,
  "externalUrl" TEXT,
  "resultSummary" TEXT,
  "resultArtifacts" JSONB,
  "completedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "reviewStatus" TEXT,
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_handoffs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "user_note_preferences" (
  "userId" TEXT NOT NULL,
  "autoCreateProjectNotes" BOOLEAN NOT NULL DEFAULT true,
  "projectNotesParentId" TEXT,
  "viewMode" TEXT NOT NULL DEFAULT 'cards',
  "sortBy" TEXT NOT NULL DEFAULT 'updatedDesc',
  "groupBy" TEXT NOT NULL DEFAULT 'none',
  "activeTeamspaceId" TEXT,
  "inboxNoteParentId" TEXT,
  "autoSortPaste" BOOLEAN NOT NULL DEFAULT false,
  "autoSortPasteThreshold" INTEGER NOT NULL DEFAULT 280,
  "autoSortPasteKeepOriginal" BOOLEAN NOT NULL DEFAULT false,
  "defaultCaptureTeamId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_note_preferences_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "news_digests_userId_date_key" ON "news_digests"("userId", "date");
CREATE INDEX IF NOT EXISTS "agent_handoffs_userId_status_idx" ON "agent_handoffs"("userId", "status");
CREATE INDEX IF NOT EXISTS "agent_handoffs_projectId_status_idx" ON "agent_handoffs"("projectId", "status");

-- Notion-style note structures
CREATE TABLE IF NOT EXISTS "note_templates" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "emoji" VARCHAR(16),
  "description" TEXT,
  "blocks" JSONB NOT NULL,
  "contentText" TEXT NOT NULL DEFAULT '',
  "authorId" TEXT NOT NULL,
  "teamId" TEXT,
  "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
  "category" TEXT NOT NULL DEFAULT 'general',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "note_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "note_databases" (
  "id" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "schema" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "note_databases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "note_database_rows" (
  "id" TEXT NOT NULL,
  "databaseId" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "properties" JSONB NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "note_database_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "note_database_views" (
  "id" TEXT NOT NULL,
  "databaseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "note_database_views_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "note_shares" (
  "id" TEXT NOT NULL,
  "noteId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "token" TEXT,
  "role" TEXT NOT NULL DEFAULT 'viewer',
  "expiresAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "note_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "synced_blocks" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "blocks" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "synced_blocks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "note_templates_teamId_idx" ON "note_templates"("teamId");
CREATE INDEX IF NOT EXISTS "note_templates_authorId_idx" ON "note_templates"("authorId");
CREATE UNIQUE INDEX IF NOT EXISTS "note_databases_noteId_key" ON "note_databases"("noteId");
CREATE UNIQUE INDEX IF NOT EXISTS "note_database_rows_noteId_key" ON "note_database_rows"("noteId");
CREATE INDEX IF NOT EXISTS "note_database_rows_databaseId_position_idx" ON "note_database_rows"("databaseId", "position");
CREATE INDEX IF NOT EXISTS "note_database_views_databaseId_position_idx" ON "note_database_views"("databaseId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "note_shares_token_key" ON "note_shares"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "note_shares_noteId_targetType_targetId_key" ON "note_shares"("noteId", "targetType", "targetId");
CREATE INDEX IF NOT EXISTS "note_shares_token_idx" ON "note_shares"("token");
CREATE INDEX IF NOT EXISTS "synced_blocks_teamId_idx" ON "synced_blocks"("teamId");

-- Workflow engine
CREATE TABLE IF NOT EXISTS "workflows" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "templateId" TEXT,
  "createdBy" TEXT NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "workflow_triggers" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "eventTypes" TEXT,
  "eventFilter" JSONB,
  "cronExpr" TEXT,
  "timezone" TEXT,
  "webhookSlug" TEXT,
  "lastFiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_triggers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "workflow_steps" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "config" JSONB NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "triggerData" JSONB,
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "stepResults" JSONB NOT NULL DEFAULT '{}',
  "context" JSONB NOT NULL DEFAULT '{}',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "error" TEXT,
  "approvalData" JSONB,
  CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflows_teamId_status_idx" ON "workflows"("teamId", "status");
CREATE INDEX IF NOT EXISTS "workflows_createdBy_idx" ON "workflows"("createdBy");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_triggers_workflowId_key" ON "workflow_triggers"("workflowId");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_triggers_webhookSlug_key" ON "workflow_triggers"("webhookSlug");
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_steps_workflowId_position_key" ON "workflow_steps"("workflowId", "position");
CREATE INDEX IF NOT EXISTS "workflow_steps_workflowId_idx" ON "workflow_steps"("workflowId");
CREATE INDEX IF NOT EXISTS "workflow_runs_workflowId_status_idx" ON "workflow_runs"("workflowId", "status");
CREATE INDEX IF NOT EXISTS "workflow_runs_status_startedAt_idx" ON "workflow_runs"("status", "startedAt");

-- Slack / MCP
CREATE TABLE IF NOT EXISTS "slack_notification_configs" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "channelName" TEXT NOT NULL,
  "eventTypes" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "slack_notification_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "slack_team_installs" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "teamName" TEXT NOT NULL,
  "botUserId" TEXT NOT NULL,
  "encryptedBotToken" TEXT NOT NULL,
  "installerUserId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "slack_team_installs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "personal_access_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "hashedToken" TEXT NOT NULL,
  "scopes" TEXT NOT NULL DEFAULT '[]',
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personal_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "slack_notification_configs_teamId_channelId_key" ON "slack_notification_configs"("teamId", "channelId");
CREATE UNIQUE INDEX IF NOT EXISTS "slack_team_installs_teamId_key" ON "slack_team_installs"("teamId");
CREATE INDEX IF NOT EXISTS "slack_team_installs_installerUserId_idx" ON "slack_team_installs"("installerUserId");
CREATE INDEX IF NOT EXISTS "slack_team_installs_workspaceId_idx" ON "slack_team_installs"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "personal_access_tokens_hashedToken_key" ON "personal_access_tokens"("hashedToken");
CREATE INDEX IF NOT EXISTS "personal_access_tokens_userId_idx" ON "personal_access_tokens"("userId");

-- Foreign keys. Guard by constraint name because Postgres has no
-- ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_personalTeamId_fkey') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_personalTeamId_fkey" FOREIGN KEY ("personalTeamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_teamId_fkey') THEN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notes_linkedProjectId_fkey') THEN
    ALTER TABLE "notes" ADD CONSTRAINT "notes_linkedProjectId_fkey" FOREIGN KEY ("linkedProjectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_links_sourceNoteId_fkey') THEN
    ALTER TABLE "note_links" ADD CONSTRAINT "note_links_sourceNoteId_fkey" FOREIGN KEY ("sourceNoteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_links_targetNoteId_fkey') THEN
    ALTER TABLE "note_links" ADD CONSTRAINT "note_links_targetNoteId_fkey" FOREIGN KEY ("targetNoteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_mentions_noteId_fkey') THEN
    ALTER TABLE "note_mentions" ADD CONSTRAINT "note_mentions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_mentions_mentionedUserId_fkey') THEN
    ALTER TABLE "note_mentions" ADD CONSTRAINT "note_mentions_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_mentions_createdById_fkey') THEN
    ALTER TABLE "note_mentions" ADD CONSTRAINT "note_mentions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_comments_noteId_fkey') THEN
    ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_comments_authorId_fkey') THEN
    ALTER TABLE "note_comments" ADD CONSTRAINT "note_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_comment_reads_userId_fkey') THEN
    ALTER TABLE "note_comment_reads" ADD CONSTRAINT "note_comment_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_comment_reads_noteId_fkey') THEN
    ALTER TABLE "note_comment_reads" ADD CONSTRAINT "note_comment_reads_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_versions_noteId_fkey') THEN
    ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_versions_editorUserId_fkey') THEN
    ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_editorUserId_fkey" FOREIGN KEY ("editorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_conversations_noteId_fkey') THEN
    ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_coding_summaries_userId_fkey') THEN
    ALTER TABLE "daily_coding_summaries" ADD CONSTRAINT "daily_coding_summaries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_coding_summaries_teamId_fkey') THEN
    ALTER TABLE "daily_coding_summaries" ADD CONSTRAINT "daily_coding_summaries_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_pull_requests_projectId_fkey') THEN
    ALTER TABLE "github_pull_requests" ADD CONSTRAINT "github_pull_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_commits_projectId_fkey') THEN
    ALTER TABLE "github_commits" ADD CONSTRAINT "github_commits_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'news_digests_userId_fkey') THEN
    ALTER TABLE "news_digests" ADD CONSTRAINT "news_digests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_handoffs_userId_fkey') THEN
    ALTER TABLE "agent_handoffs" ADD CONSTRAINT "agent_handoffs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_handoffs_projectId_fkey') THEN
    ALTER TABLE "agent_handoffs" ADD CONSTRAINT "agent_handoffs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_note_preferences_userId_fkey') THEN
    ALTER TABLE "user_note_preferences" ADD CONSTRAINT "user_note_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_databases_noteId_fkey') THEN
    ALTER TABLE "note_databases" ADD CONSTRAINT "note_databases_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_database_rows_databaseId_fkey') THEN
    ALTER TABLE "note_database_rows" ADD CONSTRAINT "note_database_rows_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "note_databases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_database_rows_noteId_fkey') THEN
    ALTER TABLE "note_database_rows" ADD CONSTRAINT "note_database_rows_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_database_views_databaseId_fkey') THEN
    ALTER TABLE "note_database_views" ADD CONSTRAINT "note_database_views_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "note_databases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'note_shares_noteId_fkey') THEN
    ALTER TABLE "note_shares" ADD CONSTRAINT "note_shares_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_triggers_workflowId_fkey') THEN
    ALTER TABLE "workflow_triggers" ADD CONSTRAINT "workflow_triggers_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_steps_workflowId_fkey') THEN
    ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_runs_workflowId_fkey') THEN
    ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slack_team_installs_installerUserId_fkey') THEN
    ALTER TABLE "slack_team_installs" ADD CONSTRAINT "slack_team_installs_installerUserId_fkey" FOREIGN KEY ("installerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slack_team_installs_workspaceId_fkey') THEN
    ALTER TABLE "slack_team_installs" ADD CONSTRAINT "slack_team_installs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'personal_access_tokens_userId_fkey') THEN
    ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
