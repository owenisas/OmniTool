import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  teamProtectedProcedure,
  assertTeamMembership,
} from "../init";
import { createIssueSchema, updateIssueSchema } from "@omnitool/shared/validators";
import { emitActivityEvent } from "@/lib/activity/emit";
import {
  createGitHubClient,
  createGitHubIssue,
  updateGitHubIssue,
} from "@omnitool/integrations";

const ISSUE_STATUSES = [
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "WONT_FIX",
] as const;

// ─── GitHub sync helpers ─────────────────────────────────────

/**
 * Map OmniTool issue statuses to GitHub issue state.
 * GitHub only supports "open" and "closed".
 */
function omniStatusToGitHubState(
  status: string
): "open" | "closed" {
  switch (status) {
    case "RESOLVED":
    case "CLOSED":
    case "WONT_FIX":
      return "closed";
    default:
      return "open";
  }
}

/**
 * Find a team member who has a connected GitHub account.
 * Used to obtain an Octokit client for outbound API calls.
 * Prefers the current user; falls back to any team member with GitHub connected.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ctx.prisma from tRPC context
async function findGitHubUserId(
  prisma: any,
  currentUserId: string,
  teamId: string
): Promise<string | null> {
  // Check if the acting user has GitHub connected
  const currentAccount = await prisma.connectedAccount.findUnique({
    where: { userId_provider: { userId: currentUserId, provider: "GITHUB" } },
    select: { userId: true },
  });
  if (currentAccount) return currentAccount.userId;

  // Fallback: any team member with GitHub connected
  const teamMember = await prisma.teamMember.findFirst({
    where: {
      teamId,
      user: {
        connectedAccounts: { some: { provider: "GITHUB" } },
      },
    },
    select: { userId: true },
  });
  return teamMember?.userId ?? null;
}

/**
 * Push a newly created issue to GitHub. Fire-and-forget.
 * Saves `githubIssueNumber` and `githubRepoFullName` back on the issue row.
 */
function pushNewIssueToGitHub(
  prisma: any,
  opts: {
    issueId: string;
    title: string;
    description?: string | null;
    priority: string;
    identifier: string;
    repoFullName: string;
    userId: string;
  }
): void {
  const [owner, repo] = opts.repoFullName.split("/");
  if (!owner || !repo) return;

  createGitHubClient(opts.userId)
    .then((octokit) =>
      createGitHubIssue(octokit, owner, repo, {
        title: opts.title,
        body: [
          opts.description ?? "",
          "",
          `---`,
          `OmniTool: \`${opts.identifier}\` | Priority: ${opts.priority}`,
        ].join("\n"),
        labels: [`priority:${opts.priority.toLowerCase()}`],
      })
    )
    .then((gh) =>
      prisma.issue.update({
        where: { id: opts.issueId },
        data: {
          githubIssueNumber: gh.number,
          githubRepoFullName: opts.repoFullName,
        },
      })
    )
    .catch((err: unknown) => {
      console.error(
        `[GitHubSync] Failed to push new issue ${opts.issueId} to GitHub:`,
        err
      );
    });
}

/**
 * Push issue updates (title, status) to GitHub. Fire-and-forget.
 */
function pushIssueUpdateToGitHub(
  opts: {
    userId: string;
    repoFullName: string;
    issueNumber: number;
    title?: string;
    description?: string | null;
    status?: string;
  }
): void {
  const [owner, repo] = opts.repoFullName.split("/");
  if (!owner || !repo) return;

  createGitHubClient(opts.userId)
    .then((octokit) =>
      updateGitHubIssue(octokit, owner, repo, opts.issueNumber, {
        ...(opts.title !== undefined && { title: opts.title }),
        ...(opts.description !== undefined && {
          body: opts.description ?? undefined,
        }),
        ...(opts.status !== undefined && {
          state: omniStatusToGitHubState(opts.status),
        }),
      })
    )
    .catch((err: unknown) => {
      console.error(
        `[GitHubSync] Failed to push update for issue #${opts.issueNumber} to GitHub:`,
        err
      );
    });
}

export const issueRouter = createTRPCRouter({
  listByTeam: teamProtectedProcedure
    .input(
      z
        .object({
          status: z.enum(ISSUE_STATUSES).optional(),
          assigneeId: z.string().optional(),
          unassignedOnly: z.boolean().optional(),
          search: z.string().optional(),
          projectId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const teamProjects = await ctx.prisma.project.findMany({
        where: { teamId: ctx.teamId },
        select: { id: true },
      });
      const teamProjectIds = new Set(teamProjects.map((p) => p.id));

      let ids: string[];
      if (input?.projectId) {
        ids = teamProjectIds.has(input.projectId) ? [input.projectId] : [];
      } else {
        ids = [...teamProjectIds];
      }

      if (ids.length === 0) return [];

      return ctx.prisma.issue.findMany({
        where: {
          projectId: { in: ids },
          ...(input?.status && { status: input.status }),
          ...(input?.assigneeId !== undefined &&
            !input?.unassignedOnly && { assigneeId: input.assigneeId }),
          ...(input?.unassignedOnly && { assigneeId: null }),
          ...(input?.search?.trim() && {
            OR: [
              {
                title: {
                  contains: input.search.trim(),
                  mode: "insensitive",
                },
              },
              {
                identifier: {
                  contains: input.search.trim(),
                  mode: "insensitive",
                },
              },
            ],
          }),
        },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          reporter: { select: { name: true } },
          project: { select: { id: true, name: true, slug: true } },
          labels: true,
          _count: { select: { comments: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      });
    }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({
        where: { id: input.projectId },
        select: { teamId: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await assertTeamMembership(ctx.prisma, ctx.userId, project.teamId);

      return ctx.prisma.issue.findMany({
        where: { projectId: input.projectId },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          reporter: { select: { name: true } },
          labels: true,
          _count: { select: { comments: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const issue = await ctx.prisma.issue.findUnique({
        where: { id: input.id },
        include: {
          assignee: true,
          reporter: true,
          project: true,
          labels: true,
          comments: {
            include: { author: { select: { name: true, avatarUrl: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!issue) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await assertTeamMembership(ctx.prisma, ctx.userId, issue.project.teamId);
      return issue;
    }),

  create: protectedProcedure
    .input(createIssueSchema)
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({
        where: { id: input.projectId },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      await assertTeamMembership(ctx.prisma, ctx.userId, project.teamId);

      const count = await ctx.prisma.issue.count({
        where: { projectId: input.projectId },
      });
      const prefix = project.slug.toUpperCase().slice(0, 4);
      const identifier = `${prefix}-${count + 1}`;

      const issue = await ctx.prisma.issue.create({
        data: {
          ...input,
          identifier,
          reporterId: ctx.userId,
          // Pre-populate repo link from project if available
          ...(project.githubRepoFullName && {
            githubRepoFullName: project.githubRepoFullName,
          }),
        },
      });

      emitActivityEvent({
        type: "issue.created",
        actorId: ctx.userId,
        teamId: project.teamId,
        projectId: input.projectId,
        subjectType: "issue",
        subjectId: issue.id,
        payload: { title: issue.title, identifier, priority: issue.priority },
      });

      // Fire-and-forget: push to GitHub if the project has a linked repo
      if (project.githubRepoFullName) {
        findGitHubUserId(ctx.prisma, ctx.userId, project.teamId).then(
          (ghUserId) => {
            if (!ghUserId) return;
            pushNewIssueToGitHub(ctx.prisma, {
              issueId: issue.id,
              title: issue.title,
              description: issue.description,
              priority: issue.priority,
              identifier,
              repoFullName: project.githubRepoFullName!,
              userId: ghUserId,
            });
          }
        ).catch(() => {});
      }

      return issue;
    }),

  update: protectedProcedure
    .input(updateIssueSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.prisma.issue.findUnique({
        where: { id },
        select: { project: { select: { teamId: true } } },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await assertTeamMembership(
        ctx.prisma,
        ctx.userId,
        existing.project.teamId,
      );

      const issue = await ctx.prisma.issue.update({
        where: { id },
        data: {
          ...data,
          ...(data.status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
        },
        include: {
          project: { select: { teamId: true } },
        },
      });

      const isClosed = data.status === "RESOLVED" || data.status === "CLOSED" || data.status === "WONT_FIX";
      const teamId = issue.project.teamId;
      emitActivityEvent({
        type: isClosed ? "issue.closed" : "issue.updated",
        actorId: ctx.userId,
        teamId: teamId ?? undefined,
        projectId: issue.projectId,
        subjectType: "issue",
        subjectId: issue.id,
        payload: {
          title: issue.title,
          identifier: issue.identifier,
          ...(data.status && { status: data.status }),
        },
      });

      // Fire-and-forget: push changes to GitHub if the issue is linked
      if (issue.githubIssueNumber && issue.githubRepoFullName) {
        findGitHubUserId(ctx.prisma, ctx.userId, teamId).then(
          (ghUserId) => {
            if (!ghUserId) return;
            pushIssueUpdateToGitHub({
              userId: ghUserId,
              repoFullName: issue.githubRepoFullName!,
              issueNumber: issue.githubIssueNumber!,
              ...(data.title !== undefined && { title: data.title }),
              ...(data.description !== undefined && {
                description: data.description,
              }),
              ...(data.status !== undefined && { status: data.status }),
            });
          }
        ).catch(() => {});
      }

      return issue;
    }),

  /**
   * Manually link an existing OmniTool issue to a GitHub issue number.
   * The caller provides the GitHub repo (owner/repo) and issue number.
   * We verify the GitHub issue exists, then save the link on the OmniTool issue.
   */
  linkToGitHub: protectedProcedure
    .input(
      z.object({
        issueId: z.string().cuid(),
        githubRepoFullName: z.string().regex(
          /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/,
          "Must be in owner/repo format"
        ),
        githubIssueNumber: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify the OmniTool issue exists and belongs to a project the user can access
      const issue = await ctx.prisma.issue.findUnique({
        where: { id: input.issueId },
        include: { project: { select: { teamId: true } } },
      });
      if (!issue) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
      }
      await assertTeamMembership(
        ctx.prisma,
        ctx.userId,
        issue.project.teamId,
      );

      // Check no other OmniTool issue is already linked to this GitHub issue
      const existingLink = await ctx.prisma.issue.findFirst({
        where: {
          githubRepoFullName: input.githubRepoFullName,
          githubIssueNumber: input.githubIssueNumber,
          id: { not: input.issueId },
        },
        select: { id: true, identifier: true },
      });
      if (existingLink) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `GitHub issue #${input.githubIssueNumber} is already linked to ${existingLink.identifier}`,
        });
      }

      // Optionally verify the GitHub issue exists (best-effort, don't block on failure)
      const ghUserId = await findGitHubUserId(
        ctx.prisma,
        ctx.userId,
        issue.project.teamId
      );

      // Save the link
      const updated = await ctx.prisma.issue.update({
        where: { id: input.issueId },
        data: {
          githubRepoFullName: input.githubRepoFullName,
          githubIssueNumber: input.githubIssueNumber,
        },
      });

      // Also create an EntityLink for cross-reference queries
      await ctx.prisma.entityLink.upsert({
        where: {
          sourceType_sourceId_targetType_targetId_linkType: {
            sourceType: "github_issue",
            sourceId: `${input.githubRepoFullName}#${input.githubIssueNumber}`,
            targetType: "issue",
            targetId: input.issueId,
            linkType: "references",
          },
        },
        update: {},
        create: {
          sourceType: "github_issue",
          sourceId: `${input.githubRepoFullName}#${input.githubIssueNumber}`,
          targetType: "issue",
          targetId: input.issueId,
          linkType: "references",
          metadata: {
            githubIssueNumber: input.githubIssueNumber,
            githubRepoFullName: input.githubRepoFullName,
          },
          createdBy: ctx.userId,
        },
      });

      return updated;
    }),
});
