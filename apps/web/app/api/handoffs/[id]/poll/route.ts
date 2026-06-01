import { NextResponse } from "next/server";
import { prisma } from "@omnitool/database";
import { auth } from "@/lib/auth";
import { advanceHandoff } from "@/lib/handoffs/advance";

export const runtime = "nodejs";

/**
 * On-demand handoff re-poll.
 *
 * POST /api/handoffs/[id]/poll
 *
 * Advances a single handoff immediately instead of waiting for the daily cron
 * (a Vercel Hobby-plan artifact). Reuses the same provider pollers + lifecycle
 * transition as the cron via `advanceHandoff` — Codex and Claude Code are both
 * handled because the advance helper is provider-generic.
 *
 * Auth: the caller must own the handoff. We resolve the session with `auth()`
 * and scope the lookup to `userId`, mirroring the handoff tRPC router. A
 * handoff that is not owned by the caller (or does not exist) returns 404 — we
 * do not distinguish the two so ownership isn't leaked.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Scope to the owner — same pattern as `handoff.getById` / `handoff.submit`.
  const handoff = await prisma.agentHandoff.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!handoff) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only handoffs that are mid-flight and have an external run are pollable.
  if (
    !handoff.externalRunId ||
    (handoff.status !== "SUBMITTED" && handoff.status !== "IN_PROGRESS")
  ) {
    return NextResponse.json({
      id: handoff.id,
      status: handoff.status,
      changed: false,
      pollable: false,
    });
  }

  try {
    const result = await advanceHandoff(handoff);
    return NextResponse.json({
      id: handoff.id,
      status: result.status,
      changed: result.changed,
      pollable: true,
    });
  } catch (err) {
    console.error(`[HandoffPoll] On-demand poll failed for ${handoff.id}:`, err);
    return NextResponse.json(
      { error: "Failed to poll handoff" },
      { status: 502 }
    );
  }
}
