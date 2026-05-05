import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

export const aiConversationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(50),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const cursor = input?.cursor;

      const conversations = await ctx.prisma.aIConversation.findMany({
        where: { userId: ctx.userId },
        take: limit + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          agentType: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              content: true,
              role: true,
              createdAt: true,
            },
          },
        },
      });

      let nextCursor: string | undefined;
      if (conversations.length > limit) {
        const next = conversations.pop();
        nextCursor = next?.id;
      }

      const items = conversations.map((c) => ({
        id: c.id,
        title: c.title,
        agentType: c.agentType,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastMessage: c.messages[0] ?? null,
      }));

      return { items, nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.prisma.aIConversation.findFirst({
        where: { id: input.id, userId: ctx.userId },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              role: true,
              content: true,
              toolCalls: true,
              toolResults: true,
              tokenCount: true,
              createdAt: true,
            },
          },
        },
      });

      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      return conversation;
    }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().max(200).optional(),
        agentType: z.string().default("chat"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.aIConversation.create({
        data: {
          userId: ctx.userId,
          title: input.title ?? null,
          agentType: input.agentType,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.aIConversation.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }
      await ctx.prisma.aIConversation.delete({ where: { id: input.id } });
      return { ok: true as const };
    }),

  rename: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.aIConversation.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }
      return ctx.prisma.aIConversation.update({
        where: { id: input.id },
        data: { title: input.title },
      });
    }),
});
