import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export function makeUpdateTaskTool(userId: string) {
  return tool({
    description:
      "Update a task's status, priority, or assignment when the signed-in user can access its project.",
    inputSchema: z.object({
      taskId: z.string().describe("Task ID"),
      status: z
        .enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"])
        .optional(),
      priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
      assigneeId: z.string().optional().describe("User ID to assign to"),
    }),
    execute: async ({ taskId, status, priority, assigneeId }) => {
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          project: { team: { members: { some: { userId } } } },
        },
        select: {
          id: true,
          project: { select: { teamId: true } },
        },
      });

      if (!task) {
        return { error: "Task not found or not accessible" };
      }

      if (assigneeId) {
        const assigneeMembership = await prisma.teamMember.findUnique({
          where: {
            userId_teamId: {
              userId: assigneeId,
              teamId: task.project.teamId,
            },
          },
          select: { id: true },
        });

        if (!assigneeMembership) {
          return { error: "Assignee is not a member of this task's team" };
        }
      }

      const updatedTask = await prisma.task.update({
        where: { id: task.id },
        data: {
          ...(status && {
            status,
            completedAt: status === "DONE" ? new Date() : null,
          }),
          ...(priority && { priority }),
          ...(assigneeId && { assigneeId }),
        },
        include: {
          assignee: { select: { name: true } },
          project: { select: { name: true } },
        },
      });
      return updatedTask;
    },
  });
}
