import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@omnitool/database";
import { createTRPCRouter, protectedProcedure } from "../init";

// ─── Input schemas ──────────────────────────────────────────

const workflowStepSchema = z.object({
  kind: z.enum([
    "agent",
    "action",
    "condition",
    "approval",
    "delay",
    "parallel",
  ]),
  config: z.record(z.unknown()),
  label: z.string().optional(),
});

const workflowTriggerSchema = z.object({
  kind: z.enum(["event", "schedule", "manual", "webhook"]),
  eventTypes: z.array(z.string()).optional(),
  eventFilter: z.record(z.unknown()).optional(),
  cronExpr: z.string().optional(),
  timezone: z.string().optional(),
});

// ─── Router ─────────────────────────────────────────────────

export const workflowRouter = createTRPCRouter({
  /**
   * List workflows for a team, optionally filtered by status.
   */
  list: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        status: z
          .enum(["active", "paused", "draft", "archived"])
          .optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.workflow.findMany({
        where: {
          teamId: input.teamId,
          ...(input.status ? { status: input.status } : {}),
        },
        include: {
          trigger: true,
          _count: { select: { steps: true, runs: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: input.limit,
      });
    }),

  /**
   * Get a single workflow with trigger, steps, and recent runs.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findUnique({
        where: { id: input.id },
        include: {
          trigger: true,
          steps: { orderBy: { position: "asc" } },
          runs: { orderBy: { startedAt: "desc" }, take: 10 },
        },
      });
      if (!workflow) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return workflow;
    }),

  /**
   * Create a new workflow (starts in draft status).
   */
  create: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        trigger: workflowTriggerSchema,
        steps: z.array(workflowStepSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workflow.create({
        data: {
          teamId: input.teamId,
          name: input.name,
          description: input.description,
          createdBy: ctx.userId,
          trigger: {
            create: {
              kind: input.trigger.kind,
              eventTypes: input.trigger.eventTypes
                ? JSON.stringify(input.trigger.eventTypes)
                : null,
              eventFilter: (input.trigger.eventFilter ?? undefined) as Prisma.InputJsonValue | undefined,
              cronExpr: input.trigger.cronExpr,
              timezone: input.trigger.timezone,
            },
          },
          steps: {
            create: input.steps.map((step, i) => ({
              position: i,
              kind: step.kind,
              config: step.config as Prisma.InputJsonValue,
              label: step.label,
            })),
          },
        },
        include: { trigger: true, steps: true },
      });
    }),

  /**
   * Update a workflow (must be paused or draft).
   * Replaces steps and trigger atomically inside a transaction.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        trigger: workflowTriggerSchema.optional(),
        steps: z.array(workflowStepSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const workflow = await ctx.prisma.workflow.findUnique({
        where: { id: input.id },
      });
      if (!workflow) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (workflow.status === "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pause workflow before editing",
        });
      }

      return ctx.prisma.$transaction(async (tx) => {
        // Replace steps if provided
        if (input.steps) {
          await tx.workflowStep.deleteMany({
            where: { workflowId: input.id },
          });
          await tx.workflowStep.createMany({
            data: input.steps.map((step, i) => ({
              workflowId: input.id,
              position: i,
              kind: step.kind,
              config: step.config as any,
              label: step.label,
            })),
          });
        }

        // Upsert trigger if provided
        if (input.trigger) {
          await tx.workflowTrigger.upsert({
            where: { workflowId: input.id },
            update: {
              kind: input.trigger.kind,
              eventTypes: input.trigger.eventTypes
                ? JSON.stringify(input.trigger.eventTypes)
                : null,
              eventFilter: (input.trigger.eventFilter ?? undefined) as Prisma.InputJsonValue | undefined,
              cronExpr: input.trigger.cronExpr,
              timezone: input.trigger.timezone,
            },
            create: {
              workflowId: input.id,
              kind: input.trigger.kind,
              eventTypes: input.trigger.eventTypes
                ? JSON.stringify(input.trigger.eventTypes)
                : null,
              eventFilter: (input.trigger.eventFilter ?? undefined) as Prisma.InputJsonValue | undefined,
              cronExpr: input.trigger.cronExpr,
              timezone: input.trigger.timezone,
            },
          });
        }

        return tx.workflow.update({
          where: { id: input.id },
          data: {
            name: input.name,
            description: input.description,
          },
          include: {
            trigger: true,
            steps: { orderBy: { position: "asc" } },
          },
        });
      });
    }),

  /**
   * Activate a workflow. Validates it has a trigger and at least one step.
   */
  activate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const wf = await ctx.prisma.workflow.findUnique({
        where: { id: input.id },
        include: { trigger: true, steps: true },
      });
      if (!wf) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (!wf.trigger) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workflow must have a trigger",
        });
      }
      if (wf.steps.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workflow must have at least one step",
        });
      }

      return ctx.prisma.workflow.update({
        where: { id: input.id },
        data: { status: "active" },
      });
    }),

  /**
   * Pause an active workflow.
   */
  pause: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workflow.update({
        where: { id: input.id },
        data: { status: "paused" },
      });
    }),

  /**
   * Soft-delete (archive) a workflow.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workflow.update({
        where: { id: input.id },
        data: { status: "archived" },
      });
    }),

  // ─── Runs ─────────────────────────────────────────────────

  /**
   * List workflow runs with cursor-based pagination.
   */
  listRuns: protectedProcedure
    .input(
      z.object({
        workflowId: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const runs = await ctx.prisma.workflowRun.findMany({
        where: {
          ...(input.workflowId ? { workflowId: input.workflowId } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        include: {
          workflow: { select: { name: true, teamId: true } },
        },
        orderBy: { startedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
      });

      const hasMore = runs.length > input.limit;
      return {
        items: runs.slice(0, input.limit),
        nextCursor: hasMore ? runs[input.limit - 1]?.id : undefined,
      };
    }),

  /**
   * Get a single run with its parent workflow and steps.
   */
  getRunById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.prisma.workflowRun.findUnique({
        where: { id: input.id },
        include: {
          workflow: {
            include: { steps: { orderBy: { position: "asc" } } },
          },
        },
      });
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return run;
    }),

  /**
   * Manually trigger a workflow. Creates a run and kicks off execution
   * in the background (fire-and-forget).
   */
  triggerManual: protectedProcedure
    .input(
      z.object({
        workflowId: z.string(),
        inputData: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wf = await ctx.prisma.workflow.findUnique({
        where: { id: input.workflowId },
        include: { trigger: true },
      });
      if (!wf || wf.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workflow must be active",
        });
      }
      if (wf.trigger?.kind !== "manual") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not a manual-trigger workflow",
        });
      }

      const run = await ctx.prisma.workflowRun.create({
        data: {
          workflowId: input.workflowId,
          triggerData: (input.inputData ?? {}) as Prisma.InputJsonValue,
          status: "pending",
        },
      });

      // Fire-and-forget execution
      import("@/lib/workflows/engine")
        .then((m) => m.executeWorkflowRun(run.id))
        .catch(console.error);

      return run;
    }),

  /**
   * Resolve a pending approval step (approve or reject).
   */
  resolveApproval: protectedProcedure
    .input(
      z.object({
        runId: z.string(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const run = await ctx.prisma.workflowRun.findUnique({
        where: { id: input.runId },
      });
      if (!run || run.status !== "waiting_approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Run is not awaiting approval",
        });
      }

      await ctx.prisma.workflowRun.update({
        where: { id: input.runId },
        data: {
          status:
            input.decision === "approved" ? "running" : "cancelled",
          approvalData: {
            decision: input.decision,
            decidedBy: ctx.userId,
            notes: input.notes,
            decidedAt: new Date().toISOString(),
          },
          ...(input.decision === "rejected"
            ? { completedAt: new Date() }
            : {}),
        },
      });

      // Resume execution if approved
      if (input.decision === "approved") {
        import("@/lib/workflows/engine")
          .then((m) => m.executeWorkflowRun(input.runId))
          .catch(console.error);
      }

      return { success: true };
    }),

  /**
   * Cancel a running or pending run.
   */
  cancelRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.workflowRun.update({
        where: { id: input.runId },
        data: { status: "cancelled", completedAt: new Date() },
      });
    }),

  // ─── Templates ────────────────────────────────────────────

  /**
   * List built-in workflow templates (not stored in DB).
   */
  listTemplates: protectedProcedure.query(async () => {
    const { workflowTemplates } = await import(
      "@/lib/workflows/templates"
    );
    return workflowTemplates;
  }),

  /**
   * Create a new workflow from a built-in template.
   */
  createFromTemplate: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        templateId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { workflowTemplates } = await import(
        "@/lib/workflows/templates"
      );
      const template = workflowTemplates.find(
        (t) => t.id === input.templateId
      );
      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      return ctx.prisma.workflow.create({
        data: {
          teamId: input.teamId,
          name: template.name,
          description: template.description,
          templateId: template.id,
          createdBy: ctx.userId,
          trigger: { create: template.trigger },
          steps: {
            create: template.steps.map((s, i) => ({
              position: i,
              kind: s.kind,
              config: s.config as Prisma.InputJsonValue,
              label: s.label,
            })),
          },
        },
        include: { trigger: true, steps: true },
      });
    }),
});
