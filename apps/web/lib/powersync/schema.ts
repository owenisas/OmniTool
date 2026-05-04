import { column, Schema, Table } from "@powersync/common";

/**
 * Client-side schema for replicated Postgres tables.
 * Must align with `infra/powersync/sync-rules.yaml` (column subset / types).
 * Note: Prisma many-to-many join tables are not replicated (composite keys).
 */
export const omniPowerSyncSchema = new Schema({
  users: new Table(
    {
      email: column.text,
      name: column.text,
      avatarUrl: column.text,
      role: column.text,
      githubUserId: column.integer,
      githubLogin: column.text,
      createdAt: column.text,
      updatedAt: column.text,
      emailVerified: column.text,
    },
    { indexes: { users_email: ["email"] } },
  ),

  teams: new Table(
    {
      name: column.text,
      slug: column.text,
      description: column.text,
      githubOrgId: column.integer,
      githubOrgLogin: column.text,
      githubImportedAt: column.text,
      createdAt: column.text,
      updatedAt: column.text,
    },
    { indexes: { teams_slug: ["slug"] } },
  ),

  team_members: new Table(
    {
      userId: column.text,
      teamId: column.text,
      role: column.text,
      joinedAt: column.text,
    },
    { indexes: { tm_user: ["userId"], tm_team: ["teamId"] } },
  ),

  projects: new Table(
    {
      name: column.text,
      slug: column.text,
      description: column.text,
      status: column.text,
      teamId: column.text,
      githubRepoId: column.integer,
      githubRepoFullName: column.text,
      githubImportedAt: column.text,
      startDate: column.text,
      targetDate: column.text,
      createdAt: column.text,
      updatedAt: column.text,
    },
    { indexes: { projects_slug: ["slug"], projects_team: ["teamId"] } },
  ),

  tasks: new Table(
    {
      title: column.text,
      description: column.text,
      status: column.text,
      priority: column.text,
      storyPoints: column.integer,
      projectId: column.text,
      assigneeId: column.text,
      creatorId: column.text,
      parentId: column.text,
      dueDate: column.text,
      completedAt: column.text,
      position: column.integer,
      createdAt: column.text,
      updatedAt: column.text,
    },
    { indexes: { tasks_project: ["projectId"], tasks_assignee: ["assigneeId"] } },
  ),

  issues: new Table(
    {
      identifier: column.text,
      title: column.text,
      description: column.text,
      status: column.text,
      priority: column.text,
      severity: column.text,
      projectId: column.text,
      assigneeId: column.text,
      reporterId: column.text,
      dueDate: column.text,
      resolvedAt: column.text,
      createdAt: column.text,
      updatedAt: column.text,
    },
    { indexes: { issues_project: ["projectId"], issues_identifier: ["identifier"] } },
  ),

  notes: new Table(
    {
      title: column.text,
      content: column.text,
      contentText: column.text,
      blocks: column.text,
      authorId: column.text,
      parentId: column.text,
      position: column.integer,
      isPinned: column.integer,
      createdAt: column.text,
      updatedAt: column.text,
    },
    { indexes: { notes_author: ["authorId"] } },
  ),

  tags: new Table(
    {
      name: column.text,
      color: column.text,
    },
    { indexes: { tags_name: ["name"] } },
  ),

  time_entries: new Table(
    {
      userId: column.text,
      taskId: column.text,
      description: column.text,
      startTime: column.text,
      endTime: column.text,
      duration: column.integer,
      billable: column.integer,
      createdAt: column.text,
      updatedAt: column.text,
    },
    { indexes: { te_user: ["userId"], te_task: ["taskId"] } },
  ),

  performance_metrics: new Table(
    {
      projectId: column.text,
      metricType: column.text,
      value: column.real,
      periodStart: column.text,
      periodEnd: column.text,
      metadata: column.text,
      createdAt: column.text,
    },
    { indexes: { pm_project: ["projectId"] } },
  ),

  labels: new Table(
    {
      name: column.text,
      color: column.text,
    },
    { indexes: { labels_name: ["name"] } },
  ),

  comments: new Table(
    {
      content: column.text,
      authorId: column.text,
      taskId: column.text,
      issueId: column.text,
      createdAt: column.text,
      updatedAt: column.text,
    },
    { indexes: { comments_author: ["authorId"], comments_task: ["taskId"], comments_issue: ["issueId"] } },
  ),
});
