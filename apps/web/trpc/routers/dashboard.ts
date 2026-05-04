import { createTRPCRouter, teamProtectedProcedure } from "../init";

export const dashboardRouter = createTRPCRouter({
  overview: teamProtectedProcedure.query(async ({ ctx }) => {
    const projects = await ctx.prisma.project.findMany({
      where: { teamId: ctx.teamId },
      select: { id: true },
    });
    const ids = projects.map((p) => p.id);

    if (ids.length === 0) {
      return {
        myOpenTasks: 0,
        openIssues: 0,
        myAssignedIssues: 0,
        recentNotes: [] as Array<{
          id: string;
          title: string;
          updatedAt: Date;
          isPinned: boolean;
        }>,
        upcomingDue: [] as Array<{
          id: string;
          title: string;
          dueDate: Date | null;
          project: { name: string; slug: string };
        }>,
      };
    }

    const twoWeeksAhead = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const [myOpenTasks, openIssues, myAssignedIssues, recentNotes, upcomingDue] =
      await Promise.all([
        ctx.prisma.task.count({
          where: {
            projectId: { in: ids },
            assigneeId: ctx.userId,
            status: { not: "DONE" },
          },
        }),
        ctx.prisma.issue.count({
          where: {
            projectId: { in: ids },
            status: { in: ["OPEN", "TRIAGED", "IN_PROGRESS"] },
          },
        }),
        ctx.prisma.issue.count({
          where: {
            projectId: { in: ids },
            assigneeId: ctx.userId,
            status: { in: ["OPEN", "TRIAGED", "IN_PROGRESS"] },
          },
        }),
        ctx.prisma.note.findMany({
          where: { authorId: ctx.userId },
          orderBy: { updatedAt: "desc" },
          take: 5,
          select: { id: true, title: true, updatedAt: true, isPinned: true },
        }),
        ctx.prisma.task.findMany({
          where: {
            projectId: { in: ids },
            assigneeId: ctx.userId,
            status: { not: "DONE" },
            dueDate: { not: null, lte: twoWeeksAhead },
          },
          orderBy: { dueDate: "asc" },
          take: 8,
          select: {
            id: true,
            title: true,
            dueDate: true,
            project: { select: { name: true, slug: true } },
          },
        }),
      ]);

    return {
      myOpenTasks,
      openIssues,
      myAssignedIssues,
      recentNotes,
      upcomingDue,
    };
  }),

  myWork: teamProtectedProcedure.query(async ({ ctx }) => {
    const projects = await ctx.prisma.project.findMany({
      where: { teamId: ctx.teamId },
      select: { id: true },
    });
    const ids = projects.map((p) => p.id);
    const openIssueStatuses = ["OPEN", "TRIAGED", "IN_PROGRESS"] as const;

    if (ids.length === 0) {
      return {
        tasks: [],
        issues: [],
        notes: [],
      };
    }

    const [tasks, issues, notes] = await Promise.all([
      ctx.prisma.task.findMany({
        where: {
          projectId: { in: ids },
          assigneeId: ctx.userId,
          status: { not: "DONE" },
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          labels: true,
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 100,
      }),
      ctx.prisma.issue.findMany({
        where: {
          projectId: { in: ids },
          assigneeId: ctx.userId,
          status: { in: [...openIssueStatuses] },
        },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          labels: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      ctx.prisma.note.findMany({
        where: { authorId: ctx.userId },
        select: {
          id: true,
          title: true,
          contentText: true,
          updatedAt: true,
          isPinned: true,
          parentId: true,
          position: true,
          tags: true,
        },
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        take: 15,
      }),
    ]);

    return { tasks, issues, notes };
  }),
});
