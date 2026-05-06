import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  teamProtectedProcedure,
} from "../init";
import { createIssueSchema, updateIssueSchema } from "@omnitool/shared/validators";
import { emitActivityEvent, getProjectTeamId } from "@/lib/activity/emit";

const ISSUE_STATUSES = [
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "WONT_FIX",
] as const;

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
      return ctx.prisma.issue.findUnique({
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
    }),

  create: protectedProcedure
    .input(createIssueSchema)
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({
        where: { id: input.projectId },
      });
      if (!project) throw new Error("Project not found");

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

      return issue;
    }),

  update: protectedProcedure
    .input(updateIssueSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const issue = await ctx.prisma.issue.update({
        where: { id },
        data: {
          ...data,
          ...(data.status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
        },
      });

      const isClosed = data.status === "RESOLVED" || data.status === "CLOSED" || data.status === "WONT_FIX";
      const teamId = await getProjectTeamId(issue.projectId);
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

      return issue;
    }),
});
