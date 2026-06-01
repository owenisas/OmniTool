import { prisma } from "@omnitool/database";
import type { Prisma } from "@omnitool/database";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("activity");

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
  | "linear.issue.created"
  | "linear.issue.updated"
  | "linear.issue.closed"
  | "linear.issue.commented"
  | "linear.issue.assigned"
  | "slack.app_mention"
  | "mcp.tool.invoked"
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

    // Fire-and-forget workflow trigger matching
    matchAndTriggerWorkflows(params).catch((err) => {
      log.error("Workflow trigger matching failed", err, {
        eventType: params.type,
      });
    });
  } catch (err) {
    // Log but don't crash — event emission is non-critical
    log.error("Failed to emit activity event", err, {
      eventType: params.type,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
    });
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

// ─── Workflow trigger matching ──────────────────────────────

/**
 * Scan active event-triggered workflows and fire any whose eventTypes
 * include the emitted event type (and whose optional eventFilter matches).
 * Runs fire-and-forget — failures are logged, never propagated.
 */
async function matchAndTriggerWorkflows(
  params: EmitActivityEventParams
): Promise<void> {
  const workflows = await prisma.workflow.findMany({
    where: { status: "active", trigger: { kind: "event" } },
    include: { trigger: true },
  });

  for (const wf of workflows) {
    if (!wf.trigger?.eventTypes) continue;

    let eventTypes: string[];
    try {
      eventTypes = JSON.parse(wf.trigger.eventTypes);
    } catch {
      continue;
    }
    if (!eventTypes.includes(params.type)) continue;

    // Check optional event filter (all keys must match)
    if (wf.trigger.eventFilter) {
      const filter = wf.trigger.eventFilter as Record<string, unknown>;
      const payload = params.payload || {};
      const matches = Object.entries(filter).every(([key, val]) => {
        const actual = key.startsWith("payload.")
          ? (payload as Record<string, unknown>)[key.slice(8)]
          : (params as unknown as Record<string, unknown>)[key];
        return actual === val;
      });
      if (!matches) continue;
    }

    const run = await prisma.workflowRun.create({
      data: {
        workflowId: wf.id,
        triggerData: params as unknown as Prisma.InputJsonValue,
        status: "pending",
      },
    });

    const { executeWorkflowRun } = await import(
      "@/lib/workflows/engine"
    );
    executeWorkflowRun(run.id).catch((err) => {
      log.error("Event-triggered workflow run failed", err, {
        workflowId: wf.id,
        runId: run.id,
        eventType: params.type,
      });
    });
  }
}
