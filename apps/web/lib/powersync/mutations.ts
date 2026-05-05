"use client";

import { usePowerSync } from "@powersync/react";
import { useCallback } from "react";

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// ─── TASKS ──────────────────────────────────────────────────────────────────

export function useLocalTaskMutations() {
  const db = usePowerSync();

  const create = useCallback(
    async (data: {
      title: string;
      projectId: string;
      creatorId: string;
      description?: string;
      status?: string;
      priority?: string;
      storyPoints?: number;
      assigneeId?: string;
      parentId?: string;
      dueDate?: string;
      position?: number;
    }) => {
      const id = uuid();
      await db.execute(
        `INSERT INTO tasks (id, title, description, status, priority, storyPoints, projectId, assigneeId, creatorId, parentId, dueDate, completedAt, position, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.title,
          data.description ?? null,
          data.status ?? "TODO",
          data.priority ?? "MEDIUM",
          data.storyPoints ?? null,
          data.projectId,
          data.assigneeId ?? null,
          data.creatorId,
          data.parentId ?? null,
          data.dueDate ?? null,
          null,
          data.position ?? 0,
          now(),
          now(),
        ],
      );
      return id;
    },
    [db],
  );

  const update = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const keys = Object.keys(patch);
      if (keys.length === 0) return;
      const setClauses = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => patch[k] ?? null);
      await db.execute(
        `UPDATE tasks SET ${setClauses}, updatedAt = ? WHERE id = ?`,
        [...values, now(), id],
      );
    },
    [db],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.execute("DELETE FROM tasks WHERE id = ?", [id]);
    },
    [db],
  );

  return { create, update, remove };
}

// ─── NOTES ──────────────────────────────────────────────────────────────────

export function useLocalNoteMutations() {
  const db = usePowerSync();

  const create = useCallback(
    async (data: {
      title: string;
      authorId: string;
      content?: string;
      contentText?: string;
      blocks?: string;
      parentId?: string;
      position?: number;
      isPinned?: boolean;
    }) => {
      const id = uuid();
      await db.execute(
        `INSERT INTO notes (id, title, content, contentText, blocks, authorId, parentId, position, isPinned, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.title,
          data.content ?? null,
          data.contentText ?? "",
          data.blocks ?? null,
          data.authorId,
          data.parentId ?? null,
          data.position ?? 0,
          data.isPinned ? 1 : 0,
          now(),
          now(),
        ],
      );
      return id;
    },
    [db],
  );

  const update = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const keys = Object.keys(patch);
      if (keys.length === 0) return;
      const setClauses = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => {
        const v = patch[k];
        if (typeof v === "boolean") return v ? 1 : 0;
        return v ?? null;
      });
      await db.execute(
        `UPDATE notes SET ${setClauses}, updatedAt = ? WHERE id = ?`,
        [...values, now(), id],
      );
    },
    [db],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.execute("DELETE FROM notes WHERE id = ?", [id]);
    },
    [db],
  );

  return { create, update, remove };
}

// ─── ISSUES ─────────────────────────────────────────────────────────────────

export function useLocalIssueMutations() {
  const db = usePowerSync();

  const create = useCallback(
    async (data: {
      title: string;
      projectId: string;
      reporterId: string;
      identifier?: string;
      description?: string;
      status?: string;
      priority?: string;
      severity?: string;
      assigneeId?: string;
      dueDate?: string;
    }) => {
      const id = uuid();
      const identifier = data.identifier ?? id.slice(0, 8).toUpperCase();
      await db.execute(
        `INSERT INTO issues (id, identifier, title, description, status, priority, severity, projectId, assigneeId, reporterId, dueDate, resolvedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          identifier,
          data.title,
          data.description ?? null,
          data.status ?? "OPEN",
          data.priority ?? "MEDIUM",
          data.severity ?? null,
          data.projectId,
          data.assigneeId ?? null,
          data.reporterId,
          data.dueDate ?? null,
          null,
          now(),
          now(),
        ],
      );
      return id;
    },
    [db],
  );

  const update = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const keys = Object.keys(patch);
      if (keys.length === 0) return;
      const setClauses = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => patch[k] ?? null);
      await db.execute(
        `UPDATE issues SET ${setClauses}, updatedAt = ? WHERE id = ?`,
        [...values, now(), id],
      );
    },
    [db],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.execute("DELETE FROM issues WHERE id = ?", [id]);
    },
    [db],
  );

  return { create, update, remove };
}

// ─── COMMENTS ───────────────────────────────────────────────────────────────

export function useLocalCommentMutations() {
  const db = usePowerSync();

  const create = useCallback(
    async (data: {
      content: string;
      authorId: string;
      taskId?: string;
      issueId?: string;
    }) => {
      const id = uuid();
      await db.execute(
        `INSERT INTO comments (id, content, authorId, taskId, issueId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.content,
          data.authorId,
          data.taskId ?? null,
          data.issueId ?? null,
          now(),
          now(),
        ],
      );
      return id;
    },
    [db],
  );

  const update = useCallback(
    async (id: string, content: string) => {
      await db.execute(
        "UPDATE comments SET content = ?, updatedAt = ? WHERE id = ?",
        [content, now(), id],
      );
    },
    [db],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.execute("DELETE FROM comments WHERE id = ?", [id]);
    },
    [db],
  );

  return { create, update, remove };
}

// ─── TIME ENTRIES ───────────────────────────────────────────────────────────

export function useLocalTimeEntryMutations() {
  const db = usePowerSync();

  const create = useCallback(
    async (data: {
      userId: string;
      startTime: string;
      taskId?: string;
      description?: string;
      endTime?: string;
      duration?: number;
      billable?: boolean;
    }) => {
      const id = uuid();
      await db.execute(
        `INSERT INTO time_entries (id, userId, taskId, description, startTime, endTime, duration, billable, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.userId,
          data.taskId ?? null,
          data.description ?? null,
          data.startTime,
          data.endTime ?? null,
          data.duration ?? null,
          data.billable !== false ? 1 : 0,
          now(),
          now(),
        ],
      );
      return id;
    },
    [db],
  );

  const update = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const keys = Object.keys(patch);
      if (keys.length === 0) return;
      const setClauses = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => {
        const v = patch[k];
        if (typeof v === "boolean") return v ? 1 : 0;
        return v ?? null;
      });
      await db.execute(
        `UPDATE time_entries SET ${setClauses}, updatedAt = ? WHERE id = ?`,
        [...values, now(), id],
      );
    },
    [db],
  );

  const remove = useCallback(
    async (id: string) => {
      await db.execute("DELETE FROM time_entries WHERE id = ?", [id]);
    },
    [db],
  );

  return { create, update, remove };
}
