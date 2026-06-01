/**
 * Advance a single handoff by polling its provider and applying the resulting
 * lifecycle transition.
 *
 * Shared by the daily cron poller (`app/api/cron/handoff-poll/route.ts`) and
 * the on-demand re-poll route (`app/api/handoffs/[id]/poll/route.ts`) so both
 * paths apply identical state transitions — there is exactly one place that
 * maps a provider poll result onto the `AgentHandoff` lifecycle.
 *
 * Provider-generic: dispatches on `agentProvider` to the matching poller
 * (`pollCodexTask` / `pollClaudeCodeTask`). A handoff with no `externalRunId`
 * or an unknown provider is a no-op (`changed: false`).
 */

import { prisma } from "@omnitool/database";
import type { AgentHandoff, Prisma } from "@omnitool/database";
import { pollCodexTask } from "@/lib/handoffs/providers/codex";
import { pollClaudeCodeTask } from "@/lib/handoffs/providers/claude-code";
import { emitActivityEvent, getProjectTeamId } from "@/lib/activity/emit";

export interface AdvanceResult {
  /** Whether the handoff row was updated by this poll. */
  changed: boolean;
  /** The handoff status after the poll (unchanged when `changed` is false). */
  status: string;
}

type PollResult = {
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  result?: {
    summary: string;
    artifacts: Array<{ type: string; content: string; path?: string }>;
  };
  error?: string;
};

/** Poll the right provider for a handoff. Returns null when unpollable. */
async function pollHandoff(handoff: AgentHandoff): Promise<PollResult | null> {
  const externalId = handoff.externalRunId;
  if (!externalId) return null;

  if (handoff.agentProvider === "codex") {
    return pollCodexTask(externalId);
  }
  if (handoff.agentProvider === "claude-code") {
    return pollClaudeCodeTask(externalId);
  }
  return null;
}

/**
 * Poll one handoff and apply the lifecycle transition. Resilient to provider
 * errors at the call site (callers wrap in try/catch); the transition logic
 * itself is deterministic.
 */
export async function advanceHandoff(
  handoff: AgentHandoff
): Promise<AdvanceResult> {
  const poll = await pollHandoff(handoff);
  if (!poll) return { changed: false, status: handoff.status };

  if (poll.status === "completed" && poll.result) {
    await prisma.agentHandoff.update({
      where: { id: handoff.id },
      data: {
        status: "AWAITING_REVIEW",
        completedAt: new Date(),
        resultSummary: poll.result.summary ?? "Task completed",
        resultArtifacts: (poll.result.artifacts ??
          []) as Prisma.InputJsonValue,
      },
    });

    const teamId = await getProjectTeamId(handoff.projectId);
    await emitActivityEvent({
      type: "handoff.completed",
      actorType: "system",
      teamId: teamId ?? undefined,
      projectId: handoff.projectId,
      subjectType: "handoff",
      subjectId: handoff.id,
      payload: { title: handoff.title, provider: handoff.agentProvider },
    });

    return { changed: true, status: "AWAITING_REVIEW" };
  }

  if (poll.status === "failed" || poll.status === "cancelled") {
    await prisma.agentHandoff.update({
      where: { id: handoff.id },
      data: {
        status: "REJECTED",
        resultSummary: poll.error ?? "Task failed",
        completedAt: new Date(),
      },
    });
    return { changed: true, status: "REJECTED" };
  }

  if (poll.status === "running" && handoff.status === "SUBMITTED") {
    await prisma.agentHandoff.update({
      where: { id: handoff.id },
      data: { status: "IN_PROGRESS" },
    });
    return { changed: true, status: "IN_PROGRESS" };
  }

  return { changed: false, status: handoff.status };
}
