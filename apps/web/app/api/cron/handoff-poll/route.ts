import { NextResponse } from "next/server";
import { prisma } from "@omnitool/database";
import type { Prisma } from "@omnitool/database";
import { pollCodexTask } from "@/lib/handoffs/providers/codex";
import { pollClaudeCodeTask } from "@/lib/handoffs/providers/claude-code";
import { emitActivityEvent, getProjectTeamId } from "@/lib/activity/emit";

/**
 * Vercel Cron handler: Poll active handoffs for status updates.
 * Schedule: every 5 minutes
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all handoffs that are submitted or in progress
  const activeHandoffs = await prisma.agentHandoff.findMany({
    where: {
      status: { in: ["SUBMITTED", "IN_PROGRESS"] },
      externalRunId: { not: null },
    },
    take: 20, // Cap per-invocation to stay within serverless timeout
  });

  let updated = 0;

  for (const handoff of activeHandoffs) {
    try {
      const externalId = handoff.externalRunId!;

      if (handoff.agentProvider === "codex") {
        const status = await pollCodexTask(externalId);

        if (status.status === "completed") {
          await prisma.agentHandoff.update({
            where: { id: handoff.id },
            data: {
              status: "AWAITING_REVIEW",
              completedAt: new Date(),
              resultSummary: status.result?.summary ?? "Task completed",
              resultArtifacts: (status.result?.artifacts ?? []) as Prisma.InputJsonValue,
            },
          });

          const teamId = await getProjectTeamId(handoff.projectId);
          emitActivityEvent({
            type: "handoff.completed",
            actorId: undefined,
            actorType: "system",
            teamId: teamId ?? undefined,
            projectId: handoff.projectId,
            subjectType: "handoff",
            subjectId: handoff.id,
            payload: {
              title: handoff.title,
              provider: handoff.agentProvider,
            },
          });
          updated++;
        } else if (status.status === "failed") {
          await prisma.agentHandoff.update({
            where: { id: handoff.id },
            data: {
              status: "REJECTED",
              resultSummary: status.error ?? "Task failed",
              completedAt: new Date(),
            },
          });
          updated++;
        } else if (
          status.status === "running" &&
          handoff.status === "SUBMITTED"
        ) {
          await prisma.agentHandoff.update({
            where: { id: handoff.id },
            data: { status: "IN_PROGRESS" },
          });
          updated++;
        }
      } else if (handoff.agentProvider === "claude-code") {
        const status = await pollClaudeCodeTask(externalId);
        if (status.status === "completed" && status.result) {
          await prisma.agentHandoff.update({
            where: { id: handoff.id },
            data: {
              status: "AWAITING_REVIEW",
              completedAt: new Date(),
              resultSummary: status.result.summary,
              resultArtifacts: (status.result.artifacts ?? []) as Prisma.InputJsonValue,
            },
          });
          updated++;
        }
      }
    } catch (err) {
      console.error(
        `[HandoffPoll] Error polling handoff ${handoff.id}:`,
        err
      );
    }
  }

  return NextResponse.json({
    checked: activeHandoffs.length,
    updated,
  });
}
