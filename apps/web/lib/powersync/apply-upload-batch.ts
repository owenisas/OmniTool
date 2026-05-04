import { Prisma } from "@omnitool/database";
import { prisma } from "@omnitool/database";
import { UpdateType } from "@powersync/common";

export type SyncUploadOperation = {
  op: UpdateType | "PUT" | "PATCH" | "DELETE";
  table: string;
  id: string;
  data?: Record<string, unknown>;
};

const READONLY = new Set([
  "users",
  "teams",
  "team_members",
  "projects",
  "tags",
  "labels",
  "performance_metrics",
]);

async function assertProjectTeamAccess(
  tx: Prisma.TransactionClient,
  userId: string,
  projectId: string,
) {
  const m = await tx.teamMember.findFirst({
    where: {
      userId,
      team: { projects: { some: { id: projectId } } },
    },
    select: { id: true },
  });
  if (!m) {
    throw new Error("FORBIDDEN");
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : v == null ? undefined : String(v);
}

function int(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") return parseInt(v, 10);
  return undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === 1 || v === "1") return true;
  if (v === 0 || v === "0") return false;
  return undefined;
}

function jsonMaybe(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as Prisma.InputJsonValue;
    } catch {
      return v;
    }
  }
  return v as Prisma.InputJsonValue;
}

function dateOpt(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = typeof v === "string" ? v : String(v);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function applySyncUploadBatch(userId: string, ops: SyncUploadOperation[]) {
  await prisma.$transaction(async (tx) => {
    for (const op of ops) {
      await applyOne(tx, userId, op);
    }
  });
}

async function applyOne(tx: Prisma.TransactionClient, userId: string, op: SyncUploadOperation) {
  if (READONLY.has(op.table)) {
    throw new Error("READONLY_TABLE");
  }

  const table = op.table;

  if (table === "notes") {
    if (op.op === UpdateType.PUT) {
      const d = op.data ?? {};
      if (str(d.authorId) !== userId) throw new Error("FORBIDDEN");
      await tx.note.create({
        data: {
          id: op.id,
          title: str(d.title) ?? "",
          content: str(d.content) ?? null,
          contentText: str(d.contentText) ?? "",
          ...(d.blocks !== undefined ? { blocks: jsonMaybe(d.blocks) } : {}),
          authorId: userId,
          parentId: str(d.parentId) ?? null,
          position: int(d.position) ?? 0,
          isPinned: bool(d.isPinned) ?? false,
          createdAt: dateOpt(d.createdAt) ?? new Date(),
          updatedAt: dateOpt(d.updatedAt) ?? new Date(),
        },
      });
      return;
    }
    if (op.op === UpdateType.PATCH) {
      const n = await tx.note.findFirst({ where: { id: op.id, authorId: userId } });
      if (!n) throw new Error("NOT_FOUND");
      const d = op.data ?? {};
      const patch: Prisma.NoteUncheckedUpdateInput = {};
      if (d.title !== undefined) patch.title = str(d.title);
      if (d.content !== undefined) patch.content = str(d.content) ?? null;
      if (d.contentText !== undefined) patch.contentText = str(d.contentText);
      if (d.blocks !== undefined) patch.blocks = jsonMaybe(d.blocks) ?? Prisma.JsonNull;
      if (d.parentId !== undefined) patch.parentId = str(d.parentId) ?? null;
      if (d.position !== undefined) patch.position = int(d.position);
      if (d.isPinned !== undefined) patch.isPinned = bool(d.isPinned);
      await tx.note.update({
        where: { id: op.id },
        data: patch,
      });
      return;
    }
    if (op.op === UpdateType.DELETE) {
      const n = await tx.note.findFirst({ where: { id: op.id, authorId: userId } });
      if (!n) throw new Error("NOT_FOUND");
      await tx.note.delete({ where: { id: op.id } });
      return;
    }
  }

  if (table === "tasks") {
    if (op.op === UpdateType.PUT) {
      const d = op.data ?? {};
      const projectId = str(d.projectId);
      if (!projectId) throw new Error("BAD_DATA");
      await assertProjectTeamAccess(tx, userId, projectId);
      await tx.task.create({
        data: {
          id: op.id,
          title: str(d.title) ?? "",
          description: str(d.description) ?? null,
          status: str(d.status) ?? "TODO",
          priority: str(d.priority) ?? "MEDIUM",
          storyPoints: int(d.storyPoints) ?? null,
          projectId,
          assigneeId: str(d.assigneeId) ?? null,
          creatorId: str(d.creatorId) ?? userId,
          parentId: str(d.parentId) ?? null,
          dueDate: dateOpt(d.dueDate) ?? null,
          completedAt: dateOpt(d.completedAt) ?? null,
          position: int(d.position) ?? 0,
          createdAt: dateOpt(d.createdAt) ?? new Date(),
          updatedAt: dateOpt(d.updatedAt) ?? new Date(),
        },
      });
      return;
    }
    const existing = await tx.task.findUnique({ where: { id: op.id } });
    if (!existing) throw new Error("NOT_FOUND");
    await assertProjectTeamAccess(tx, userId, existing.projectId);

    if (op.op === UpdateType.PATCH) {
      const d = op.data ?? {};
      await tx.task.update({
        where: { id: op.id },
        data: {
          ...(d.title !== undefined ? { title: str(d.title) } : {}),
          ...(d.description !== undefined ? { description: str(d.description) ?? null } : {}),
          ...(d.status !== undefined ? { status: str(d.status) } : {}),
          ...(d.priority !== undefined ? { priority: str(d.priority) } : {}),
          ...(d.storyPoints !== undefined ? { storyPoints: int(d.storyPoints) } : {}),
          ...(d.assigneeId !== undefined ? { assigneeId: str(d.assigneeId) ?? null } : {}),
          ...(d.parentId !== undefined ? { parentId: str(d.parentId) ?? null } : {}),
          ...(d.dueDate !== undefined ? { dueDate: dateOpt(d.dueDate) } : {}),
          ...(d.completedAt !== undefined ? { completedAt: dateOpt(d.completedAt) } : {}),
          ...(d.position !== undefined ? { position: int(d.position) } : {}),
        },
      });
      return;
    }
    if (op.op === UpdateType.DELETE) {
      await tx.task.delete({ where: { id: op.id } });
      return;
    }
  }

  if (table === "issues") {
    if (op.op === UpdateType.PUT) {
      const d = op.data ?? {};
      const projectId = str(d.projectId);
      if (!projectId) throw new Error("BAD_DATA");
      await assertProjectTeamAccess(tx, userId, projectId);
      await tx.issue.create({
        data: {
          id: op.id,
          identifier: str(d.identifier) ?? op.id.slice(0, 8).toUpperCase(),
          title: str(d.title) ?? "",
          description: str(d.description) ?? null,
          status: str(d.status) ?? "OPEN",
          priority: str(d.priority) ?? "MEDIUM",
          severity: str(d.severity) ?? null,
          projectId,
          assigneeId: str(d.assigneeId) ?? null,
          reporterId: str(d.reporterId) ?? userId,
          dueDate: dateOpt(d.dueDate) ?? null,
          resolvedAt: dateOpt(d.resolvedAt) ?? null,
          createdAt: dateOpt(d.createdAt) ?? new Date(),
          updatedAt: dateOpt(d.updatedAt) ?? new Date(),
        },
      });
      return;
    }
    const existing = await tx.issue.findUnique({ where: { id: op.id } });
    if (!existing) throw new Error("NOT_FOUND");
    await assertProjectTeamAccess(tx, userId, existing.projectId);

    if (op.op === UpdateType.PATCH) {
      const d = op.data ?? {};
      await tx.issue.update({
        where: { id: op.id },
        data: {
          ...(d.title !== undefined ? { title: str(d.title) } : {}),
          ...(d.description !== undefined ? { description: str(d.description) ?? null } : {}),
          ...(d.status !== undefined ? { status: str(d.status) } : {}),
          ...(d.priority !== undefined ? { priority: str(d.priority) } : {}),
          ...(d.severity !== undefined ? { severity: str(d.severity) ?? null } : {}),
          ...(d.assigneeId !== undefined ? { assigneeId: str(d.assigneeId) ?? null } : {}),
          ...(d.dueDate !== undefined ? { dueDate: dateOpt(d.dueDate) } : {}),
          ...(d.resolvedAt !== undefined ? { resolvedAt: dateOpt(d.resolvedAt) } : {}),
        },
      });
      return;
    }
    if (op.op === UpdateType.DELETE) {
      await tx.issue.delete({ where: { id: op.id } });
      return;
    }
  }

  if (table === "comments") {
    if (op.op === UpdateType.PUT) {
      const d = op.data ?? {};
      if (str(d.authorId) !== userId) throw new Error("FORBIDDEN");
      const taskId = str(d.taskId);
      const issueId = str(d.issueId);
      if (taskId) {
        const t = await tx.task.findUnique({ where: { id: taskId } });
        if (!t) throw new Error("BAD_DATA");
        await assertProjectTeamAccess(tx, userId, t.projectId);
      } else if (issueId) {
        const i = await tx.issue.findUnique({ where: { id: issueId } });
        if (!i) throw new Error("BAD_DATA");
        await assertProjectTeamAccess(tx, userId, i.projectId);
      } else {
        throw new Error("BAD_DATA");
      }
      await tx.comment.create({
        data: {
          id: op.id,
          content: str(d.content) ?? "",
          authorId: userId,
          taskId: taskId ?? null,
          issueId: issueId ?? null,
          createdAt: dateOpt(d.createdAt) ?? new Date(),
          updatedAt: dateOpt(d.updatedAt) ?? new Date(),
        },
      });
      return;
    }
    const c = await tx.comment.findUnique({ where: { id: op.id } });
    if (!c || c.authorId !== userId) throw new Error("NOT_FOUND");
    if (c.taskId) {
      const t = await tx.task.findUnique({ where: { id: c.taskId } });
      if (t) await assertProjectTeamAccess(tx, userId, t.projectId);
    } else if (c.issueId) {
      const i = await tx.issue.findUnique({ where: { id: c.issueId } });
      if (i) await assertProjectTeamAccess(tx, userId, i.projectId);
    }

    if (op.op === UpdateType.PATCH) {
      const d = op.data ?? {};
      await tx.comment.update({
        where: { id: op.id },
        data: {
          ...(d.content !== undefined ? { content: str(d.content) } : {}),
        },
      });
      return;
    }
    if (op.op === UpdateType.DELETE) {
      await tx.comment.delete({ where: { id: op.id } });
      return;
    }
  }

  if (table === "time_entries") {
    if (op.op === UpdateType.PUT) {
      const d = op.data ?? {};
      if (str(d.userId) !== userId) throw new Error("FORBIDDEN");
      const start = dateOpt(d.startTime);
      if (!start) throw new Error("BAD_DATA");
      await tx.timeEntry.create({
        data: {
          id: op.id,
          userId,
          taskId: str(d.taskId) ?? null,
          description: str(d.description) ?? null,
          startTime: start,
          endTime: dateOpt(d.endTime) ?? null,
          duration: int(d.duration) ?? null,
          billable: bool(d.billable) ?? true,
          createdAt: dateOpt(d.createdAt) ?? new Date(),
          updatedAt: dateOpt(d.updatedAt) ?? new Date(),
        },
      });
      return;
    }
    const e = await tx.timeEntry.findFirst({ where: { id: op.id, userId } });
    if (!e) throw new Error("NOT_FOUND");

    if (op.op === UpdateType.PATCH) {
      const d = op.data ?? {};
      const patch: Prisma.TimeEntryUncheckedUpdateInput = {};
      if (d.taskId !== undefined) patch.taskId = str(d.taskId) ?? null;
      if (d.description !== undefined) patch.description = str(d.description) ?? null;
      if (d.startTime !== undefined) patch.startTime = dateOpt(d.startTime) ?? new Date();
      if (d.endTime !== undefined) patch.endTime = dateOpt(d.endTime);
      if (d.duration !== undefined) patch.duration = int(d.duration);
      if (d.billable !== undefined) patch.billable = bool(d.billable);
      await tx.timeEntry.update({
        where: { id: op.id },
        data: patch,
      });
      return;
    }
    if (op.op === UpdateType.DELETE) {
      await tx.timeEntry.delete({ where: { id: op.id } });
      return;
    }
  }

  throw new Error("UNSUPPORTED_TABLE");
}
