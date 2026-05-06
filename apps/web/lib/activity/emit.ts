import { prisma } from "@omnitool/database";
import type { Prisma } from "@omnitool/database";

export type ActivityEventType =
  | "task.created"
  | "task.updated"
  | "task.completed"
  | "task.deleted"
  | "issue.created"
  | "issue.updated"
  | "issue.closed"
  | "issue.deleted"
  | "note.created"
  | "note.updated"
  | "note.deleted"
  | "github.pr.opened"
  | "github.pr.merged"
  | "github.pr.closed"
  | "github.push"
  | "github.issue.opened"
  | "github.issue.closed"
  | "handoff.created"
  | "handoff.submitted"
  | "handoff.completed"
  | "handoff.approved"
  | "handoff.rejected";

export type SubjectType =
  | "task"
  | "issue"
  | "note"
  | "pr"
  | "commit"
  | "handoff";

export type ActorType = "user" | "system" | "integration";

export interface EmitActivityEventParams {
  type: ActivityEventType;
  actorId?: string;
  actorType?: ActorType;
  teamId?: string;
  projectId?: string;
  subjectType: SubjectType;
  subjectId: string;
  payload?: Record<string, unknown>;
}

/**
 * Emit an activity event. Fire-and-forget — does not throw on failure
 * to avoid breaking the primary mutation flow.
 */
export async function emitActivityEvent(
  params: EmitActivityEventParams
): Promise<void> {
  try {
    await prisma.activityEvent.create({
      data: {
        type: params.type,
        actorId: params.actorId ?? null,
        actorType: params.actorType ?? "user",
        teamId: params.teamId ?? null,
        projectId: params.projectId ?? null,
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        payload: (params.payload ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Log but don't crash — event emission is non-critical
    console.error("[ActivityEvent] Failed to emit:", params.type, err);
  }
}

/**
 * Resolve the teamId for a project (cached per request via caller).
 * Useful when the router doesn't already have teamId in context.
 */
export async function getProjectTeamId(
  projectId: string
): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { teamId: true },
  });
  return project?.teamId ?? null;
}
