-- ============================================================================
-- 001_rls_policies.sql
-- Enable Row Level Security on all tables and define access policies.
--
-- Context:
--   The app currently connects via Prisma using the `postgres` role (DB owner),
--   which bypasses RLS. These policies prepare for future Supabase Auth
--   integration where clients would connect as `app_user` or via PostgREST
--   using the authenticated JWT (auth.uid()).
-- ============================================================================

-- ─── CREATE APP_USER ROLE ───────────────────────────────────────────────────
-- This role will be used by future direct-client access (Supabase Auth / PostgREST).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END
$$;

-- Grant basic schema usage to app_user
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;


-- ─── ENABLE RLS ON ALL TABLES ───────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_IssueLabels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_NoteTags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_TaskLabels" ENABLE ROW LEVEL SECURITY;


-- ─── BYPASS POLICIES FOR PRIVILEGED ROLES ───────────────────────────────────
-- The `postgres` role (current Prisma connection) is a superuser/owner and
-- already bypasses RLS. We add explicit policies for clarity and for
-- `service_role` (Supabase server-side SDK).

-- postgres role bypass (owner already bypasses, but explicit for documentation)
CREATE POLICY "postgres_bypass_all" ON public.users FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.accounts FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.sessions FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.verification_tokens FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.teams FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.team_members FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.projects FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.tasks FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.issues FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.notes FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.tags FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.time_entries FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.performance_metrics FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.ai_conversations FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.ai_messages FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.connected_accounts FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.labels FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.comments FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public.github_import_logs FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public."_IssueLabels" FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public."_NoteTags" FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "postgres_bypass_all" ON public."_TaskLabels" FOR ALL TO postgres USING (true) WITH CHECK (true);

-- service_role bypass (Supabase server SDK)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

CREATE POLICY "service_role_bypass_all" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.verification_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.teams FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.team_members FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.projects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.issues FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.notes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.tags FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.time_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.performance_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.ai_conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.ai_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.connected_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.labels FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.comments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public.github_import_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public."_IssueLabels" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public."_NoteTags" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_bypass_all" ON public."_TaskLabels" FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ─── USER-LEVEL POLICIES (for app_user / authenticated role) ────────────────
-- These policies use auth.uid() which maps to the Supabase Auth JWT sub claim.
-- The user's Supabase Auth ID must match the `id` column in the users table.

-- Helper: get current user's teams
CREATE OR REPLACE FUNCTION public.user_team_ids()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT "teamId" FROM public.team_members WHERE "userId" = auth.uid()::text;
$$;

-- Helper: get project IDs the user has access to (via team membership)
CREATE OR REPLACE FUNCTION public.user_project_ids()
RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.id FROM public.projects p
  WHERE p."teamId" IN (SELECT public.user_team_ids());
$$;


-- ── USERS ───────────────────────────────────────────────────────────────────
-- Users can read other users (needed for team views), but only update themselves
CREATE POLICY "users_select_authenticated" ON public.users
  FOR SELECT TO app_user
  USING (true);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO app_user
  USING (id = auth.uid()::text)
  WITH CHECK (id = auth.uid()::text);

CREATE POLICY "users_delete_own" ON public.users
  FOR DELETE TO app_user
  USING (id = auth.uid()::text);


-- ── ACCOUNTS (Auth.js) ──────────────────────────────────────────────────────
CREATE POLICY "accounts_own" ON public.accounts
  FOR ALL TO app_user
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);


-- ── SESSIONS ────────────────────────────────────────────────────────────────
CREATE POLICY "sessions_own" ON public.sessions
  FOR ALL TO app_user
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);


-- ── VERIFICATION TOKENS ─────────────────────────────────────────────────────
-- Tokens are system-managed; no direct user access needed
CREATE POLICY "verification_tokens_deny" ON public.verification_tokens
  FOR ALL TO app_user
  USING (false);


-- ── TEAMS ───────────────────────────────────────────────────────────────────
-- Users can see teams they belong to
CREATE POLICY "teams_select_member" ON public.teams
  FOR SELECT TO app_user
  USING (id IN (SELECT public.user_team_ids()));

CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT TO app_user
  WITH CHECK (true);  -- Any authenticated user can create a team

CREATE POLICY "teams_update_member" ON public.teams
  FOR UPDATE TO app_user
  USING (id IN (SELECT public.user_team_ids()))
  WITH CHECK (id IN (SELECT public.user_team_ids()));


-- ── TEAM MEMBERS ────────────────────────────────────────────────────────────
CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT TO app_user
  USING ("teamId" IN (SELECT public.user_team_ids()));

CREATE POLICY "team_members_insert" ON public.team_members
  FOR INSERT TO app_user
  WITH CHECK ("teamId" IN (SELECT public.user_team_ids()));

CREATE POLICY "team_members_update" ON public.team_members
  FOR UPDATE TO app_user
  USING ("teamId" IN (SELECT public.user_team_ids()));

CREATE POLICY "team_members_delete" ON public.team_members
  FOR DELETE TO app_user
  USING ("teamId" IN (SELECT public.user_team_ids()));


-- ── PROJECTS ────────────────────────────────────────────────────────────────
CREATE POLICY "projects_select_team" ON public.projects
  FOR SELECT TO app_user
  USING ("teamId" IN (SELECT public.user_team_ids()));

CREATE POLICY "projects_insert_team" ON public.projects
  FOR INSERT TO app_user
  WITH CHECK ("teamId" IN (SELECT public.user_team_ids()));

CREATE POLICY "projects_update_team" ON public.projects
  FOR UPDATE TO app_user
  USING ("teamId" IN (SELECT public.user_team_ids()))
  WITH CHECK ("teamId" IN (SELECT public.user_team_ids()));

CREATE POLICY "projects_delete_team" ON public.projects
  FOR DELETE TO app_user
  USING ("teamId" IN (SELECT public.user_team_ids()));


-- ── TASKS ───────────────────────────────────────────────────────────────────
CREATE POLICY "tasks_select_project" ON public.tasks
  FOR SELECT TO app_user
  USING ("projectId" IN (SELECT public.user_project_ids()));

CREATE POLICY "tasks_insert_project" ON public.tasks
  FOR INSERT TO app_user
  WITH CHECK ("projectId" IN (SELECT public.user_project_ids()));

CREATE POLICY "tasks_update_project" ON public.tasks
  FOR UPDATE TO app_user
  USING ("projectId" IN (SELECT public.user_project_ids()))
  WITH CHECK ("projectId" IN (SELECT public.user_project_ids()));

CREATE POLICY "tasks_delete_project" ON public.tasks
  FOR DELETE TO app_user
  USING ("projectId" IN (SELECT public.user_project_ids()));


-- ── ISSUES ──────────────────────────────────────────────────────────────────
CREATE POLICY "issues_select_project" ON public.issues
  FOR SELECT TO app_user
  USING ("projectId" IN (SELECT public.user_project_ids()));

CREATE POLICY "issues_insert_project" ON public.issues
  FOR INSERT TO app_user
  WITH CHECK ("projectId" IN (SELECT public.user_project_ids()));

CREATE POLICY "issues_update_project" ON public.issues
  FOR UPDATE TO app_user
  USING ("projectId" IN (SELECT public.user_project_ids()))
  WITH CHECK ("projectId" IN (SELECT public.user_project_ids()));

CREATE POLICY "issues_delete_project" ON public.issues
  FOR DELETE TO app_user
  USING ("projectId" IN (SELECT public.user_project_ids()));


-- ── NOTES ───────────────────────────────────────────────────────────────────
-- Users can only access their own notes
CREATE POLICY "notes_own" ON public.notes
  FOR ALL TO app_user
  USING ("authorId" = auth.uid()::text)
  WITH CHECK ("authorId" = auth.uid()::text);


-- ── TAGS ────────────────────────────────────────────────────────────────────
-- Tags are shared/global; anyone can read, anyone can create
CREATE POLICY "tags_select" ON public.tags
  FOR SELECT TO app_user
  USING (true);

CREATE POLICY "tags_insert" ON public.tags
  FOR INSERT TO app_user
  WITH CHECK (true);


-- ── TIME ENTRIES ────────────────────────────────────────────────────────────
CREATE POLICY "time_entries_own" ON public.time_entries
  FOR ALL TO app_user
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);


-- ── PERFORMANCE METRICS ─────────────────────────────────────────────────────
CREATE POLICY "performance_metrics_select_project" ON public.performance_metrics
  FOR SELECT TO app_user
  USING ("projectId" IN (SELECT public.user_project_ids()));

CREATE POLICY "performance_metrics_insert_project" ON public.performance_metrics
  FOR INSERT TO app_user
  WITH CHECK ("projectId" IN (SELECT public.user_project_ids()));


-- ── AI CONVERSATIONS ────────────────────────────────────────────────────────
CREATE POLICY "ai_conversations_own" ON public.ai_conversations
  FOR ALL TO app_user
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);


-- ── AI MESSAGES ─────────────────────────────────────────────────────────────
CREATE POLICY "ai_messages_own_conversation" ON public.ai_messages
  FOR ALL TO app_user
  USING (
    "conversationId" IN (
      SELECT id FROM public.ai_conversations WHERE "userId" = auth.uid()::text
    )
  )
  WITH CHECK (
    "conversationId" IN (
      SELECT id FROM public.ai_conversations WHERE "userId" = auth.uid()::text
    )
  );


-- ── CONNECTED ACCOUNTS ──────────────────────────────────────────────────────
CREATE POLICY "connected_accounts_own" ON public.connected_accounts
  FOR ALL TO app_user
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);


-- ── LABELS ──────────────────────────────────────────────────────────────────
-- Labels are shared across the workspace; readable by all, writable by all
CREATE POLICY "labels_select" ON public.labels
  FOR SELECT TO app_user
  USING (true);

CREATE POLICY "labels_insert" ON public.labels
  FOR INSERT TO app_user
  WITH CHECK (true);

CREATE POLICY "labels_update" ON public.labels
  FOR UPDATE TO app_user
  USING (true);


-- ── COMMENTS ────────────────────────────────────────────────────────────────
-- Users can read comments on tasks/issues in their projects; write own comments
CREATE POLICY "comments_select_project" ON public.comments
  FOR SELECT TO app_user
  USING (
    ("taskId" IS NOT NULL AND "taskId" IN (SELECT id FROM public.tasks WHERE "projectId" IN (SELECT public.user_project_ids())))
    OR
    ("issueId" IS NOT NULL AND "issueId" IN (SELECT id FROM public.issues WHERE "projectId" IN (SELECT public.user_project_ids())))
  );

CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT TO app_user
  WITH CHECK ("authorId" = auth.uid()::text);

CREATE POLICY "comments_update_own" ON public.comments
  FOR UPDATE TO app_user
  USING ("authorId" = auth.uid()::text)
  WITH CHECK ("authorId" = auth.uid()::text);

CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE TO app_user
  USING ("authorId" = auth.uid()::text);


-- ── GITHUB IMPORT LOGS ──────────────────────────────────────────────────────
CREATE POLICY "github_import_logs_own" ON public.github_import_logs
  FOR ALL TO app_user
  USING ("userId" = auth.uid()::text)
  WITH CHECK ("userId" = auth.uid()::text);


-- ── JOIN TABLES (_IssueLabels, _NoteTags, _TaskLabels) ──────────────────────
-- These Prisma implicit many-to-many tables use columns A and B.
-- Access follows the parent entity policies.

-- _IssueLabels: accessible if user can access the issue (column A = issue id)
CREATE POLICY "issue_labels_select" ON public."_IssueLabels"
  FOR SELECT TO app_user
  USING ("A" IN (SELECT id FROM public.issues WHERE "projectId" IN (SELECT public.user_project_ids())));

CREATE POLICY "issue_labels_insert" ON public."_IssueLabels"
  FOR INSERT TO app_user
  WITH CHECK ("A" IN (SELECT id FROM public.issues WHERE "projectId" IN (SELECT public.user_project_ids())));

CREATE POLICY "issue_labels_delete" ON public."_IssueLabels"
  FOR DELETE TO app_user
  USING ("A" IN (SELECT id FROM public.issues WHERE "projectId" IN (SELECT public.user_project_ids())));

-- _NoteTags: accessible if user owns the note (column A = note id)
CREATE POLICY "note_tags_select" ON public."_NoteTags"
  FOR SELECT TO app_user
  USING ("A" IN (SELECT id FROM public.notes WHERE "authorId" = auth.uid()::text));

CREATE POLICY "note_tags_insert" ON public."_NoteTags"
  FOR INSERT TO app_user
  WITH CHECK ("A" IN (SELECT id FROM public.notes WHERE "authorId" = auth.uid()::text));

CREATE POLICY "note_tags_delete" ON public."_NoteTags"
  FOR DELETE TO app_user
  USING ("A" IN (SELECT id FROM public.notes WHERE "authorId" = auth.uid()::text));

-- _TaskLabels: accessible if user can access the task (column A = task id)
CREATE POLICY "task_labels_select" ON public."_TaskLabels"
  FOR SELECT TO app_user
  USING ("A" IN (SELECT id FROM public.tasks WHERE "projectId" IN (SELECT public.user_project_ids())));

CREATE POLICY "task_labels_insert" ON public."_TaskLabels"
  FOR INSERT TO app_user
  WITH CHECK ("A" IN (SELECT id FROM public.tasks WHERE "projectId" IN (SELECT public.user_project_ids())));

CREATE POLICY "task_labels_delete" ON public."_TaskLabels"
  FOR DELETE TO app_user
  USING ("A" IN (SELECT id FROM public.tasks WHERE "projectId" IN (SELECT public.user_project_ids())));


-- ============================================================================
-- NOTES:
-- 1. The `postgres` role is a superuser and bypasses RLS regardless of policies.
--    The explicit policies above are for documentation clarity.
-- 2. When migrating to Supabase Auth, map auth.uid() to the users.id column.
-- 3. For PostgREST (Supabase auto-API), grant the `authenticated` role the
--    same privileges as `app_user` and duplicate or adjust policies.
-- 4. Consider adding ADMIN-level team member checks for destructive operations.
-- ============================================================================
