import { prisma } from "@omnitool/database";
import { emitActivityEvent } from "@/lib/activity/emit";
import type { WebhookHandler } from "./types";
import { resolveProjectByRepo, resolveUserByGithubLogin } from "./utils";

/**
 * Loop-prevention guard: if the OmniTool issue was updated within the last
 * N seconds, the inbound webhook is likely an echo of our own outbound push.
 * Skip the update to prevent infinite ping-pong.
 */
const ECHO_GUARD_SECONDS = 10;

function isLikelyEcho(issueUpdatedAt: Date): boolean {
  const diffMs = Date.now() - issueUpdatedAt.getTime();
  return diffMs < ECHO_GUARD_SECONDS * 1000;
}

/**
 * Map GitHub issue state to OmniTool issue status.
 */
function githubStateToOmniStatus(state: string, action: string): string {
  if (state === "closed" || action === "closed") return "RESOLVED";
  if (action === "reopened") return "OPEN";
  return "OPEN";
}

/**
 * Handle issues events: opened, edited, closed, reopened, labeled.
 *
 * Bidirectional sync logic:
 * 1. Look up a linked OmniTool issue by `githubRepoFullName + githubIssueNumber`
 *    (the canonical link columns on the Issue model). Falls back to EntityLink
 *    for backwards compatibility.
 * 2. For "opened": if no linked issue exists and the project is tracked, we
 *    could auto-create — for now we just emit an activity event.
 * 3. For "edited": sync title and description changes.
 * 4. For "closed"/"reopened": sync status.
 * 5. Echo guard: skip updates if OmniTool touched the issue within the last
 *    10 seconds (our outbound push likely triggered this webhook).
 */
export const handleIssues: WebhookHandler = async (payload) => {
  const action = payload.action as string;
  const issue = payload.issue as Record<string, unknown>;
  const repo = payload.repository as Record<string, unknown>;

  if (!issue || !repo) return;

  const repoFullName = repo.full_name as string;
  const issueNumber = issue.number as number;
  const issueTitle = issue.title as string;
  const issueBody = (issue.body as string) ?? "";
  const authorLogin = (issue.user as Record<string, unknown>)?.login as string;
  const state = issue.state as string; // "open" | "closed"
  const labels = (issue.labels as Array<{ name: string }>) ?? [];

  const project = await resolveProjectByRepo(repoFullName);
  if (!project) return;

  const authorUserId = await resolveUserByGithubLogin(authorLogin);

  // ── Find linked OmniTool issue ──────────────────────────────
  // Primary: direct columns on Issue model (canonical for bidirectional sync)
  let linkedIssue = await prisma.issue.findFirst({
    where: {
      githubRepoFullName: repoFullName,
      githubIssueNumber: issueNumber,
    },
    select: { id: true, title: true, status: true, updatedAt: true },
  });

  // Fallback: legacy EntityLink-based lookup
  if (!linkedIssue) {
    const entityLink = await prisma.entityLink.findFirst({
      where: {
        sourceType: "github_issue",
        targetType: "issue",
        metadata: {
          path: ["githubIssueNumber"],
          equals: issueNumber,
        },
      },
    });
    if (entityLink) {
      linkedIssue = await prisma.issue.findUnique({
        where: { id: entityLink.targetId },
        select: { id: true, title: true, status: true, updatedAt: true },
      });
    }
  }

  // ── Sync inbound changes to the linked OmniTool issue ───────
  if (linkedIssue) {
    // Echo guard: if we just pushed an update, don't overwrite with the echo
    if (isLikelyEcho(linkedIssue.updatedAt)) {
      console.log(
        `[GitHub Webhook] Skipping echo for ${repoFullName}#${issueNumber} ` +
          `(OmniTool issue ${linkedIssue.id} updated ${Date.now() - linkedIssue.updatedAt.getTime()}ms ago)`
      );
    } else {
      // Build the update payload based on the action
      const updateData: Record<string, unknown> = {};

      if (action === "edited") {
        // Sync title and description
        if (issueTitle !== linkedIssue.title) {
          updateData.title = issueTitle;
        }
        // Always overwrite description on edit — no way to diff meaningfully
        updateData.description = issueBody || null;
      }

      if (action === "closed" || action === "reopened") {
        const newStatus = githubStateToOmniStatus(state, action);
        if (newStatus !== linkedIssue.status) {
          updateData.status = newStatus;
          if (newStatus === "RESOLVED") {
            updateData.resolvedAt = new Date();
          } else {
            updateData.resolvedAt = null;
          }
        }
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.issue.update({
          where: { id: linkedIssue.id },
          data: updateData,
        });
        console.log(
          `[GitHub Webhook] Synced ${action} for ${repoFullName}#${issueNumber} ` +
            `to OmniTool issue ${linkedIssue.id}:`,
          Object.keys(updateData)
        );
      }
    }
  }

  // ── Emit activity event ─────────────────────────────────────
  if (action === "opened" || action === "closed") {
    const eventType =
      action === "opened" ? "github.issue.opened" : "github.issue.closed";

    emitActivityEvent({
      type: eventType as "github.issue.opened" | "github.issue.closed",
      actorId: authorUserId ?? undefined,
      actorType: authorUserId ? "user" : "integration",
      teamId: project.teamId,
      projectId: project.id,
      subjectType: "issue",
      subjectId:
        linkedIssue?.id ??
        `github-issue-${repoFullName}-${issueNumber}`,
      payload: {
        title: issueTitle,
        number: issueNumber,
        state,
        repo: repoFullName,
        authorLogin,
        labels: labels.map((l) => l.name),
        isGitHubIssue: true,
      },
    });
  }
};
