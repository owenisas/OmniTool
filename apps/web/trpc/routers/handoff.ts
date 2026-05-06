import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@omnitool/database";
import { createTRPCRouter, protectedProcedure } from "../init";
import { emitActivityEvent, getProjectTeamId } from "@/lib/activity/emit";
import {
  assembleHandoffContext,
  formatContextForAgent,
} from "@/lib/handoffs/context-assembler";
import { submitToCodex } from "@/lib/handoffs/providers/codex";
import {
  submitToClaudeCode,
  formatForClaudeCodeCLI,
} from "@/lib/handoffs/providers/claude-code";

export const handoffRouter = createTRPCRouter({
  /**
   * List handoffs for the current user, optionally filtered by project or status.
   */
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.agentHandoff.findMany({
        where: {
          userId: ctx.userId,
          ...(input.projectId && { projectId: input.projectId }),
          ...(input.status && { status: input.status }),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: {
          project: { select: { name: true, githubRepoFullName: true } },
        },
      });
    }),

  /**
   * Get a single handoff by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const handoff = await ctx.prisma.agentHandoff.findFirst({
        where: { id: input.id, userId: ctx.userId },
        include: {
          project: { select: { name: true, githubRepoFullName: true } },
        },
      });
      if (!handoff) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return handoff;
    }),

  /**
   * Create a new handoff (draft state).
   */
  create: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().min(1),
        agentProvider: z.enum(["codex", "claude-code"]),
        taskIds: z.array(z.string()).optional(),
        issueIds: z.array(z.string()).optional(),
        noteIds: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Assemble context from related entities
      const context = await assembleHandoffContext({
        projectId: input.projectId,
        taskIds: input.taskIds,
        issueIds: input.issueIds,
        noteIds: input.noteIds,
      });
      context.title = input.title;
      context.description = input.description;

      const handoff = await ctx.prisma.agentHandoff.create({
        data: {
          userId: ctx.userId,
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          agentProvider: input.agentProvider,
          contextPayload: context as unknown as Prisma.InputJsonValue,
          status: "DRAFT",
        },
      });

      const teamId = await getProjectTeamId(input.projectId);
      emitActivityEvent({
        type: "handoff.created",
        actorId: ctx.userId,
        teamId: teamId ?? undefined,
        projectId: input.projectId,
        subjectType: "handoff",
        subjectId: handoff.id,
        payload: { title: input.title, provider: input.agentProvider },
      });

      // Create entity links to related tasks/issues
      const linkPromises: Promise<unknown>[] = [];
      for (const taskId of input.taskIds ?? []) {
        linkPromises.push(
          ctx.prisma.entityLink.upsert({
            where: {
              sourceType_sourceId_targetType_targetId_linkType: {
                sourceType: "handoff",
                sourceId: handoff.id,
                targetType: "task",
                targetId: taskId,
                linkType: "implements",
              },
            },
            create: {
              sourceType: "handoff",
              sourceId: handoff.id,
              targetType: "task",
              targetId: taskId,
              linkType: "implements",
              createdBy: ctx.userId,
            },
            update: {},
          })
        );
      }
      for (const issueId of input.issueIds ?? []) {
        linkPromises.push(
          ctx.prisma.entityLink.upsert({
            where: {
              sourceType_sourceId_targetType_targetId_linkType: {
                sourceType: "handoff",
                sourceId: handoff.id,
                targetType: "issue",
                targetId: issueId,
                linkType: "implements",
              },
            },
            create: {
              sourceType: "handoff",
              sourceId: handoff.id,
              targetType: "issue",
              targetId: issueId,
              linkType: "implements",
              createdBy: ctx.userId,
            },
            update: {},
          })
        );
      }
      await Promise.all(linkPromises);

      return handoff;
    }),

  /**
   * Submit a draft handoff to the agent provider.
   */
  submit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const handoff = await ctx.prisma.agentHandoff.findFirst({
        where: { id: input.id, userId: ctx.userId, status: "DRAFT" },
        include: { project: { select: { githubRepoFullName: true } } },
      });
      if (!handoff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Handoff not found or not in DRAFT state",
        });
      }

      const context = handoff.contextPayload as Record<string, unknown>;
      const prompt = formatContextForAgent(
        context as any,
        handoff.agentProvider as "codex" | "claude-code"
      );
      const repo = handoff.project.githubRepoFullName ?? "";

      let externalRunId: string;
      let externalUrl: string | null = null;

      if (handoff.agentProvider === "codex") {
        const result = await submitToCodex({ prompt, repo });
        externalRunId = result.taskId;
        externalUrl = `https://platform.openai.com/codex/${result.taskId}`;
      } else {
        const result = await submitToClaudeCode({
          prompt: formatForClaudeCodeCLI(prompt, repo),
          repo,
          handoffId: handoff.id,
        });
        externalRunId = result.taskId;
      }

      const updated = await ctx.prisma.agentHandoff.update({
        where: { id: handoff.id },
        data: {
          status: "SUBMITTED",
          submittedAt: new Date(),
          externalRunId,
          externalUrl,
        },
      });

      const teamId = await getProjectTeamId(handoff.projectId);
      emitActivityEvent({
        type: "handoff.submitted",
        actorId: ctx.userId,
        teamId: teamId ?? undefined,
        projectId: handoff.projectId,
        subjectType: "handoff",
        subjectId: handoff.id,
        payload: {
          title: handoff.title,
          provider: handoff.agentProvider,
          externalRunId,
        },
      });

      return updated;
    }),

  /**
   * Review a completed handoff (approve or reject).
   */
  review: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["approved", "rejected"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const handoff = await ctx.prisma.agentHandoff.findFirst({
        where: { id: input.id, userId: ctx.userId, status: "AWAITING_REVIEW" },
      });
      if (!handoff) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Handoff not found or not awaiting review",
        });
      }

      const updated = await ctx.prisma.agentHandoff.update({
        where: { id: handoff.id },
        data: {
          reviewedBy: ctx.userId,
          reviewStatus: input.status,
          reviewNotes: input.notes,
          reviewedAt: new Date(),
          status: input.status === "approved" ? "APPROVED" : "REJECTED",
        },
      });

      const teamId = await getProjectTeamId(handoff.projectId);
      emitActivityEvent({
        type: input.status === "approved" ? "handoff.approved" : "handoff.rejected",
        actorId: ctx.userId,
        teamId: teamId ?? undefined,
        projectId: handoff.projectId,
        subjectType: "handoff",
        subjectId: handoff.id,
        payload: { title: handoff.title, reviewStatus: input.status },
      });

      // If approved, auto-close linked tasks/issues
      if (input.status === "approved") {
        const links = await ctx.prisma.entityLink.findMany({
          where: {
            sourceType: "handoff",
            sourceId: handoff.id,
            linkType: "implements",
          },
        });

        for (const link of links) {
          if (link.targetType === "task") {
            await ctx.prisma.task.update({
              where: { id: link.targetId },
              data: { status: "DONE", completedAt: new Date() },
            });
          } else if (link.targetType === "issue") {
            await ctx.prisma.issue.update({
              where: { id: link.targetId },
              data: { status: "RESOLVED", resolvedAt: new Date() },
            });
          }
        }
      }

      return updated;
    }),

  /**
   * Manually complete a handoff (for local Claude Code executions).
   */
  markComplete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        resultSummary: z.string(),
        resultArtifacts: z
          .array(
            z.object({
              type: z.enum(["patch", "file", "pr_url"]),
              content: z.string(),
              path: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const handoff = await ctx.prisma.agentHandoff.findFirst({
        where: {
          id: input.id,
          userId: ctx.userId,
          status: { in: ["SUBMITTED", "IN_PROGRESS"] },
        },
      });
      if (!handoff) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return ctx.prisma.agentHandoff.update({
        where: { id: handoff.id },
        data: {
          status: "AWAITING_REVIEW",
          resultSummary: input.resultSummary,
          resultArtifacts: (input.resultArtifacts ?? []) as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    }),
});
