import { NextResponse } from "next/server";
import { prisma } from "@omnitool/database";
import { advanceHandoff } from "@/lib/handoffs/advance";
import { requireCronAuthorization } from "@/lib/cron/auth";

/**
 * Vercel Cron handler: Poll active handoffs for status updates.
 * Schedule: daily on the current Vercel Hobby deployment.
 * Increase this to every 5 minutes only after moving the project to Pro.
 *
 * The per-handoff poll + lifecycle transition lives in `advanceHandoff`
 * (`@/lib/handoffs/advance`), shared with the on-demand re-poll route so both
 * paths stay in lockstep.
 */
export async function GET(req: Request) {
  const unauthorized = requireCronAuthorization(req);
  if (unauthorized) return unauthorized;

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
      const result = await advanceHandoff(handoff);
      if (result.changed) updated++;
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
