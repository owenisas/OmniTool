import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";
import {
  generatePersonalAccessToken,
  hashToken,
} from "@/lib/mcp/token";

/**
 * Personal Access Tokens for OmniTool's MCP server.
 *
 * Tokens are random hex prefixed `omt_`, shown to the user once on
 * creation, and stored only as a SHA-256 hash. Revocation is soft
 * (`revokedAt`) so the audit history persists.
 */
export const personalAccessTokenRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tokens = await ctx.prisma.personalAccessToken.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        scopes: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return tokens;
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(64),
        scopes: z.array(z.enum(["read", "write"])).default(["read", "write"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { plaintext, hashed } = generatePersonalAccessToken();
      const scopes =
        input.scopes.length > 0 ? input.scopes : (["read", "write"] as const);
      const row = await ctx.prisma.personalAccessToken.create({
        data: {
          userId: ctx.userId,
          name: input.name,
          hashedToken: hashed,
          scopes: JSON.stringify(scopes),
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
      });
      return {
        ...row,
        plaintext,
      };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const token = await ctx.prisma.personalAccessToken.findUnique({
        where: { id: input.id },
      });
      if (!token || token.userId !== ctx.userId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Token not found",
        });
      }
      await ctx.prisma.personalAccessToken.update({
        where: { id: input.id },
        data: { revokedAt: new Date() },
      });
      return { ok: true };
    }),

  /**
   * Internal: rotate a token's `lastUsedAt`. Called by the MCP server
   * after each authenticated tool call so the UI can show recency.
   */
  touch: protectedProcedure
    .input(z.object({ plaintext: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const hashed = hashToken(input.plaintext);
      await ctx.prisma.personalAccessToken.updateMany({
        where: { hashedToken: hashed, userId: ctx.userId },
        data: { lastUsedAt: new Date() },
      });
      return { ok: true };
    }),
});
