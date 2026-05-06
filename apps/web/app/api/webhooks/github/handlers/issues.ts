import { prisma } from "@omnitool/database";
import { emitActivityEvent } from "@/lib/activity/emit";
import type { WebhookHandler } from "./types";
import { resolveProjectByRepo, resolveUserByGithubLogin } from "./utils";

/**
 * Handle issues events: opened, closed, reopened, labeled.
 * Mirrors GitHub issue state changes and emits activity events.
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

  // Check if there's an existing OmniTool issue linked via EntityLink
  const existingLink = await prisma.entityLink.findFirst({
    where: {
      sourceType: "github_issue",
      targetType: "issue",
      metadata: {
        path: ["githubIssueNumber"],
        equals: issueNumber,
      },
    },
  });

  // If a linked OmniTool issue exists, sync its status
  if (existingLink && (action === "closed" || action === "reopened")) {
    const newStatus = action === "closed" ? "RESOLVED" : "OPEN";
    await prisma.issue.update({
      where: { id: existingLink.targetId },
      data: {
        status: newStatus,
        ...(newStatus === "RESOLVED" ? { resolvedAt: new Date() } : { resolvedAt: null }),
      },
    });
  }

  // Emit activity event
  const eventType = action === "opened" ? "github.issue.opened" : "github.issue.closed";

  if (action === "opened" || action === "closed") {
    emitActivityEvent({
      type: eventType as "github.issue.opened" | "github.issue.closed",
      actorId: authorUserId ?? undefined,
      actorType: authorUserId ? "user" : "integration",
      teamId: project.teamId,
      projectId: project.id,
      subjectType: "issue",
      subjectId: existingLink?.targetId ?? `github-issue-${repoFullName}-${issueNumber}`,
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
