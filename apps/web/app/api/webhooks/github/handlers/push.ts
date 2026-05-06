import { prisma } from "@omnitool/database";
import { emitActivityEvent } from "@/lib/activity/emit";
import type { WebhookHandler } from "./types";
import { resolveProjectByRepo, parseTaskReferences } from "./utils";

interface CommitPayload {
  id: string;
  message: string;
  timestamp: string;
  author: { username?: string; name?: string };
  added?: string[];
  removed?: string[];
  modified?: string[];
}

/**
 * Handle push events — record commits and link to tasks via commit messages.
 *
 * Performance: batch-resolves all author logins in a single query instead of
 * one query per commit. Entity link upserts are parallelized per commit.
 */
export const handlePush: WebhookHandler = async (payload) => {
  const repo = payload.repository as Record<string, unknown>;
  const commits = payload.commits as CommitPayload[] | undefined;
  const ref = payload.ref as string;

  if (!repo || !commits || commits.length === 0) return;

  // Only process pushes to main-ish branches (not tags)
  if (!ref.startsWith("refs/heads/")) return;

  const repoFullName = repo.full_name as string;
  const project = await resolveProjectByRepo(repoFullName);
  if (!project) return;

  // Batch-resolve all unique author logins in one query
  const allLogins = new Set<string>();
  for (const commit of commits) {
    if (commit.author?.username) allLogins.add(commit.author.username);
  }
  const pusher = payload.pusher as Record<string, unknown> | undefined;
  const pusherLogin = (pusher?.name as string) ?? null;
  if (pusherLogin) allLogins.add(pusherLogin);

  const loginToUserId = new Map<string, string>();
  if (allLogins.size > 0) {
    const users = await prisma.user.findMany({
      where: { githubLogin: { in: Array.from(allLogins) } },
      select: { id: true, githubLogin: true },
    });
    for (const u of users) {
      if (u.githubLogin) loginToUserId.set(u.githubLogin, u.id);
    }
  }

  // Process commits — upsert each, then batch entity link upserts
  const entityLinkPromises: Promise<unknown>[] = [];

  for (const commit of commits) {
    const authorLogin = commit.author?.username ?? null;
    const authorUserId = authorLogin
      ? (loginToUserId.get(authorLogin) ?? null)
      : null;

    // Calculate rough additions/deletions from file lists
    const additions = (commit.added?.length ?? 0) + (commit.modified?.length ?? 0);
    const deletions = commit.removed?.length ?? 0;

    // Upsert commit
    const record = await prisma.gitHubCommit.upsert({
      where: {
        projectId_sha: { projectId: project.id, sha: commit.id },
      },
      create: {
        projectId: project.id,
        sha: commit.id,
        message: commit.message.slice(0, 2000),
        authorGithubLogin: authorLogin,
        authorUserId,
        timestamp: new Date(commit.timestamp),
        additions,
        deletions,
      },
      update: {
        message: commit.message.slice(0, 2000),
        authorUserId, // update if user linked their account later
      },
    });

    // Link to referenced tasks — parallelize upserts
    const refs = await parseTaskReferences(commit.message);
    for (const taskId of refs) {
      entityLinkPromises.push(
        prisma.entityLink.upsert({
          where: {
            sourceType_sourceId_targetType_targetId_linkType: {
              sourceType: "commit",
              sourceId: record.id,
              targetType: "task",
              targetId: taskId,
              linkType: "references",
            },
          },
          create: {
            sourceType: "commit",
            sourceId: record.id,
            targetType: "task",
            targetId: taskId,
            linkType: "references",
            metadata: { sha: commit.id, repoFullName },
          },
          update: {},
        }),
      );
    }
  }

  // Flush all entity link upserts in parallel
  await Promise.all(entityLinkPromises);

  // Emit a single push event (batch of commits)
  const pusherUserId = pusherLogin
    ? (loginToUserId.get(pusherLogin) ?? null)
    : null;

  emitActivityEvent({
    type: "github.push",
    actorId: pusherUserId ?? undefined,
    actorType: pusherUserId ? "user" : "integration",
    teamId: project.teamId,
    projectId: project.id,
    subjectType: "commit",
    subjectId: commits[0]!.id,
    payload: {
      repo: repoFullName,
      branch: ref.replace("refs/heads/", ""),
      commitCount: commits.length,
      commits: commits.slice(0, 5).map((c) => ({
        sha: c.id.slice(0, 7),
        message: c.message.split("\n")[0]?.slice(0, 80),
        author: c.author?.username,
      })),
    },
  });
};
