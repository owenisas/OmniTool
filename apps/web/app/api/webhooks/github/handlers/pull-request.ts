import { prisma } from "@omnitool/database";
import { emitActivityEvent } from "@/lib/activity/emit";
import type { WebhookHandler } from "./types";
import { resolveProjectByRepo, resolveUserByGithubLogin, parseTaskReferences } from "./utils";

/**
 * Handle pull_request events: opened, closed, merged, synchronize, reopened.
 */
export const handlePullRequest: WebhookHandler = async (payload) => {
  const action = payload.action as string;
  const pr = payload.pull_request as Record<string, unknown>;
  const repo = payload.repository as Record<string, unknown>;

  if (!pr || !repo) return;

  const repoFullName = repo.full_name as string;
  const prNumber = pr.number as number;
  const prTitle = pr.title as string;
  const prBody = (pr.body as string) ?? "";
  const headBranch = (pr.head as Record<string, unknown>)?.ref as string;
  const baseBranch = (pr.base as Record<string, unknown>)?.ref as string;
  const authorLogin = (pr.user as Record<string, unknown>)?.login as string;
  const githubPrId = pr.id as number;
  const mergedAt = pr.merged_at as string | null;
  const closedAt = pr.closed_at as string | null;
  const prCreatedAt = pr.created_at as string;

  // Determine state
  let state: "open" | "closed" | "merged" = "open";
  if (action === "closed") {
    state = (pr.merged as boolean) ? "merged" : "closed";
  }

  // Find linked OmniTool project
  const project = await resolveProjectByRepo(repoFullName);
  if (!project) {
    console.log(`[webhook/pr] No project for repo ${repoFullName}, skipping`);
    return;
  }

  // Resolve author to OmniTool user
  const authorUserId = await resolveUserByGithubLogin(authorLogin);

  // Upsert the PR record
  const record = await prisma.gitHubPullRequest.upsert({
    where: {
      githubRepoFullName_number: { githubRepoFullName: repoFullName, number: prNumber },
    },
    create: {
      projectId: project.id,
      githubPrId,
      githubRepoFullName: repoFullName,
      number: prNumber,
      title: prTitle,
      state,
      authorGithubLogin: authorLogin,
      authorUserId,
      headBranch,
      baseBranch,
      body: prBody.slice(0, 10000), // cap body length
      mergedAt: mergedAt ? new Date(mergedAt) : null,
      closedAt: closedAt ? new Date(closedAt) : null,
      createdAt: new Date(prCreatedAt),
    },
    update: {
      title: prTitle,
      state,
      body: prBody.slice(0, 10000),
      mergedAt: mergedAt ? new Date(mergedAt) : null,
      closedAt: closedAt ? new Date(closedAt) : null,
    },
  });

  // Auto-link PR to tasks referenced in branch name or PR body
  const refs = await parseTaskReferences(`${headBranch} ${prBody}`);
  if (refs.length > 0) {
    for (const taskId of refs) {
      await prisma.entityLink.upsert({
        where: {
          sourceType_sourceId_targetType_targetId_linkType: {
            sourceType: "github_pr",
            sourceId: record.id,
            targetType: "task",
            targetId: taskId,
            linkType: "implements",
          },
        },
        create: {
          sourceType: "github_pr",
          sourceId: record.id,
          targetType: "task",
          targetId: taskId,
          linkType: "implements",
          metadata: { prNumber, repoFullName },
        },
        update: {},
      });
    }
  }

  // Emit activity event
  const eventType =
    state === "merged"
      ? "github.pr.merged"
      : action === "opened"
        ? "github.pr.opened"
        : "github.pr.closed";

  emitActivityEvent({
    type: eventType as "github.pr.opened" | "github.pr.merged" | "github.pr.closed",
    actorId: authorUserId ?? undefined,
    actorType: authorUserId ? "user" : "integration",
    teamId: project.teamId,
    projectId: project.id,
    subjectType: "pr",
    subjectId: record.id,
    payload: {
      title: prTitle,
      number: prNumber,
      state,
      repo: repoFullName,
      authorLogin,
    },
  });
};
