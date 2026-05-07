import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

export const noteTemplateRouter = createTRPCRouter({
  /**
   * List templates accessible to the current user:
   *   - authored by the user
   *   - belonging to a team the user is in (teamId filter)
   *   - built-in (visible to everyone)
   *
   * Optional filters: teamId, category.
   * Ordered: built-ins first, then most recently updated.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          category: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const where: {
        OR: Record<string, unknown>[];
        category?: string;
      } = {
        OR: [
          { authorId: ctx.userId },
          { isBuiltIn: true },
          ...(input?.teamId ? [{ teamId: input.teamId }] : []),
        ],
      };

      if (input?.category) {
        where.category = input.category;
      }

      return ctx.prisma.noteTemplate.findMany({
        where,
        orderBy: [{ isBuiltIn: "desc" }, { updatedAt: "desc" }],
      });
    }),

  /**
   * Fetch a single template by id.
   * Any authenticated user can read any template they can see via `list`
   * (own, team, or built-in). For simplicity we allow reading any template
   * — the blocks JSON contains no secrets.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const template = await ctx.prisma.noteTemplate.findUnique({
        where: { id: input.id },
      });
      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }
      return template;
    }),

  /**
   * Create a new user-authored template.
   * `authorId` is set from the session; `isBuiltIn` is always false for
   * user-created templates.
   */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        emoji: z.string().max(16).optional(),
        description: z.string().max(1000).optional(),
        blocks: z.unknown(),
        contentText: z.string().optional(),
        teamId: z.string().optional(),
        category: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.noteTemplate.create({
        data: {
          title: input.title,
          emoji: input.emoji ?? null,
          description: input.description ?? null,
          blocks: input.blocks as object,
          contentText: input.contentText ?? "",
          authorId: ctx.userId,
          teamId: input.teamId ?? null,
          isBuiltIn: false,
          category: input.category ?? "general",
        },
      });
    }),

  /**
   * Update an existing template. Only the original author can update.
   * Built-in templates cannot be updated through this procedure.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        emoji: z.string().max(16).nullable().optional(),
        description: z.string().max(1000).nullable().optional(),
        blocks: z.unknown().optional(),
        contentText: z.string().optional(),
        category: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.noteTemplate.findUnique({
        where: { id: input.id },
        select: { authorId: true, isBuiltIn: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }
      if (existing.authorId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the template author can update this template",
        });
      }

      const { id, ...data } = input;
      // Strip undefined keys so Prisma only touches explicitly provided fields.
      const updateData: Record<string, unknown> = {};
      if (data.title !== undefined) updateData.title = data.title;
      if (data.emoji !== undefined) updateData.emoji = data.emoji;
      if (data.description !== undefined)
        updateData.description = data.description;
      if (data.blocks !== undefined) updateData.blocks = data.blocks as object;
      if (data.contentText !== undefined)
        updateData.contentText = data.contentText;
      if (data.category !== undefined) updateData.category = data.category;

      return ctx.prisma.noteTemplate.update({
        where: { id },
        data: updateData,
      });
    }),

  /**
   * Delete a template. Only the author can delete. Built-in templates
   * cannot be deleted (they have no real author to authorize against and
   * are meant to persist across all workspaces).
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.noteTemplate.findUnique({
        where: { id: input.id },
        select: { authorId: true, isBuiltIn: true },
      });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }
      if (existing.isBuiltIn) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Built-in templates cannot be deleted",
        });
      }
      if (existing.authorId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the template author can delete this template",
        });
      }

      await ctx.prisma.noteTemplate.delete({ where: { id: input.id } });
      return { ok: true as const };
    }),
});
