"use client";

import { useQuery } from "@powersync/react";

// ─── TASKS ──────────────────────────────────────────────────────────────────

export function useLocalTasks(projectId?: string) {
  return useQuery(
    projectId
      ? "SELECT * FROM tasks WHERE projectId = ? ORDER BY position ASC"
      : "SELECT * FROM tasks ORDER BY updatedAt DESC",
    projectId ? [projectId] : [],
  );
}

export function useLocalTasksByAssignee(userId: string) {
  return useQuery(
    "SELECT * FROM tasks WHERE assigneeId = ? AND status != 'DONE' ORDER BY dueDate ASC NULLS LAST, position ASC",
    [userId],
  );
}

export function useLocalTask(id: string) {
  return useQuery("SELECT * FROM tasks WHERE id = ? LIMIT 1", [id]);
}

// ─── ISSUES ─────────────────────────────────────────────────────────────────

export function useLocalIssues(projectId?: string) {
  return useQuery(
    projectId
      ? "SELECT * FROM issues WHERE projectId = ? ORDER BY createdAt DESC"
      : "SELECT * FROM issues ORDER BY createdAt DESC",
    projectId ? [projectId] : [],
  );
}

export function useLocalIssuesByAssignee(userId: string) {
  return useQuery(
    "SELECT * FROM issues WHERE assigneeId = ? AND status != 'CLOSED' ORDER BY createdAt DESC",
    [userId],
  );
}

export function useLocalIssue(id: string) {
  return useQuery("SELECT * FROM issues WHERE id = ? LIMIT 1", [id]);
}

// ─── NOTES ──────────────────────────────────────────────────────────────────

export function useLocalNotes(authorId: string, parentId?: string | null) {
  return useQuery(
    parentId === undefined
      ? "SELECT * FROM notes WHERE authorId = ? ORDER BY isPinned DESC, updatedAt DESC"
      : parentId === null
      ? "SELECT * FROM notes WHERE authorId = ? AND parentId IS NULL ORDER BY position ASC"
      : "SELECT * FROM notes WHERE authorId = ? AND parentId = ? ORDER BY position ASC",
    parentId === undefined || parentId === null ? [authorId] : [authorId, parentId],
  );
}

export function useLocalNote(id: string) {
  return useQuery("SELECT * FROM notes WHERE id = ? LIMIT 1", [id]);
}

export function useLocalNoteSearch(authorId: string, query: string) {
  return useQuery(
    "SELECT * FROM notes WHERE authorId = ? AND (title LIKE ? OR contentText LIKE ?) ORDER BY updatedAt DESC LIMIT 50",
    [authorId, `%${query}%`, `%${query}%`],
  );
}

// ─── COMMENTS ───────────────────────────────────────────────────────────────

export function useLocalComments(opts: { taskId?: string; issueId?: string }) {
  const query = opts.taskId
    ? "SELECT * FROM comments WHERE taskId = ? ORDER BY createdAt ASC"
    : opts.issueId
      ? "SELECT * FROM comments WHERE issueId = ? ORDER BY createdAt ASC"
      : "SELECT * FROM comments WHERE 1=0";
  const params = opts.taskId ? [opts.taskId] : opts.issueId ? [opts.issueId] : [];
  return useQuery(query, params);
}

// ─── TIME ENTRIES ───────────────────────────────────────────────────────────

export function useLocalTimeEntries(userId: string, limit = 50) {
  return useQuery(
    "SELECT * FROM time_entries WHERE userId = ? ORDER BY startTime DESC LIMIT ?",
    [userId, limit],
  );
}

export function useLocalTimeEntriesByTask(taskId: string) {
  return useQuery(
    "SELECT * FROM time_entries WHERE taskId = ? ORDER BY startTime DESC",
    [taskId],
  );
}

// ─── READ-ONLY TABLES ───────────────────────────────────────────────────────

export function useLocalTeams() {
  return useQuery("SELECT * FROM teams ORDER BY name ASC", []);
}

export function useLocalTeamMembers(teamId: string) {
  return useQuery(
    "SELECT tm.*, u.name as userName, u.email as userEmail, u.avatarUrl as userAvatar FROM team_members tm JOIN users u ON tm.userId = u.id WHERE tm.teamId = ? ORDER BY u.name ASC",
    [teamId],
  );
}

export function useLocalProjects(teamId?: string) {
  return useQuery(
    teamId
      ? "SELECT * FROM projects WHERE teamId = ? ORDER BY name ASC"
      : "SELECT * FROM projects ORDER BY name ASC",
    teamId ? [teamId] : [],
  );
}

export function useLocalUsers() {
  return useQuery("SELECT * FROM users ORDER BY name ASC", []);
}

export function useLocalTags() {
  return useQuery("SELECT * FROM tags ORDER BY name ASC", []);
}

export function useLocalLabels() {
  return useQuery("SELECT * FROM labels ORDER BY name ASC", []);
}

// ─── METRICS ────────────────────────────────────────────────────────────────

export function useLocalPerformanceMetrics(projectId: string) {
  return useQuery(
    "SELECT * FROM performance_metrics WHERE projectId = ? ORDER BY periodStart DESC",
    [projectId],
  );
}
