import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export const updateTask = tool({
  description: "Update a task's status, priority, or assignment.",
  parameters: z.object({
    taskId: z.string().describe("Task ID"),
    status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]).optional(),
    priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
    assigneeId: z.string().optional().describe("User ID to assign to"),
  }),
  execute: async ({ taskId, status, priority, assigneeId }) => {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(status && { status, ...(status === "DONE" ? { completedAt: new Date() } : {}) }),
        ...(priority && { priority }),
        ...(assigneeId && { assigneeId }),
      },
      include: {
        assignee: { select: { name: true } },
        project: { select: { name: true } },
      },
    });
    return task;
  },
});
