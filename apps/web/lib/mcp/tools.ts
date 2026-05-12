import { z } from "zod";
import { prisma } from "@omnitool/database";
import { emitActivityEvent } from "@/lib/activity/emit";

/**
 * MCP tool definitions for OmniTool. Each tool is a thin wrapper around an
 * existing Prisma / domain operation so business logic isn't duplicated.
 *
 * Tools are gated by the user identity and token scopes carried via the bearer
 * token (see `apps/web/app/api/mcp/route.ts`).
 */

export type McpScope = "read" | "write";

export interface McpToolContext {
  userId: string;
  scopes: McpScope[];
  /** Default teamspace id (`activeTeamId` analog) — falls back to a personal team. */
  defaultTeamId: string | null;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  requiredScope: McpScope;
  inputSchema: Record<string, unknown>; // JSON Schema for the MCP client
  parser: z.ZodTypeAny;
  handler: (input: unknown, ctx: McpToolContext) => Promise<unknown>;
}

const SCHEMA_NULLABLE_STRING = { type: ["string", "null"] };

// ─── Read tools ─────────────────────────────────────────────

const searchIssues: McpToolDefinition = {
  name: "searchIssues",
  requiredScope: "read",
  description:
    "Search the calling user's issues by title text, status, or project. Returns up to 50 results sorted by recency.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      status: { type: "string" },
      projectId: { type: "string" },
    },
  },
  parser: z.object({
    query: z.string().optional(),
    status: z.string().optional(),
    projectId: z.string().optional(),
  }),
  async handler(rawInput, ctx) {
    const input = rawInput as { query?: string; status?: string; projectId?: string };
    const issues = await prisma.issue.findMany({
      where: {
        project: {
          team: { members: { some: { userId: ctx.userId } } },
        },
        ...(input.status ? { status: input.status } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.query
          ? {
              OR: [
                { title: { contains: input.query, mode: "insensitive" } },
                { description: { contains: input.query, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        identifier: true,
        title: true,
        status: true,
        priority: true,
        projectId: true,
        updatedAt: true,
      },
    });
    return { issues };
  },
};

const getIssue: McpToolDefinition = {
  name: "getIssue",
  requiredScope: "read",
  description: "Fetch a single issue by id or identifier (e.g. AUTO-1234).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  parser: z.object({ id: z.string().min(1) }),
  async handler(rawInput, ctx) {
    const { id } = rawInput as { id: string };
    const issue = await prisma.issue.findFirst({
      where: {
        OR: [{ id }, { identifier: id }],
        project: {
          team: { members: { some: { userId: ctx.userId } } },
        },
      },
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            authorId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!issue) return { issue: null };
    return { issue };
  },
};

const searchNotes: McpToolDefinition = {
  name: "searchNotes",
  requiredScope: "read",
  description:
    "Search the user's notes by title or content text. Returns up to 50 results.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      teamId: SCHEMA_NULLABLE_STRING,
    },
  },
  parser: z.object({
    query: z.string().optional(),
    teamId: z.string().nullable().optional(),
  }),
  async handler(rawInput, ctx) {
    const input = rawInput as { query?: string; teamId?: string | null };
    const teamspaceIds = (
      await prisma.teamMember.findMany({
        where: { userId: ctx.userId },
        select: { teamId: true },
      })
    ).map((m) => m.teamId);
    if (input.teamId && !teamspaceIds.includes(input.teamId)) {
      return { notes: [] };
    }

    const notes = await prisma.note.findMany({
      where: {
        deletedAt: null,
        AND: [
          input.teamId
            ? { teamId: input.teamId }
            : {
                OR: [
                  { authorId: ctx.userId },
                  {
                    teamId: {
                      in: teamspaceIds.length ? teamspaceIds : ["__none__"],
                    },
                  },
                ],
              },
          ...(input.query
            ? [
                {
                  OR: [
                    {
                      title: {
                        contains: input.query,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      contentText: {
                        contains: input.query,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        teamId: true,
        emoji: true,
        updatedAt: true,
      },
    });
    return { notes };
  },
};

const getNote: McpToolDefinition = {
  name: "getNote",
  requiredScope: "read",
  description:
    "Fetch a single note by id, including its block content as JSON and its plain-text rendering.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
  },
  parser: z.object({ id: z.string().min(1) }),
  async handler(rawInput, ctx) {
    const { id } = rawInput as { id: string };
    const teamspaceIds = (
      await prisma.teamMember.findMany({
        where: { userId: ctx.userId },
        select: { teamId: true },
      })
    ).map((m) => m.teamId);

    const note = await prisma.note.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [
          { authorId: ctx.userId },
          { teamId: { in: teamspaceIds.length ? teamspaceIds : ["__none__"] } },
        ],
      },
    });
    if (!note) return { note: null };
    return { note };
  },
};

const listProjects: McpToolDefinition = {
  name: "listProjects",
  requiredScope: "read",
  description: "List the projects in teams the calling user belongs to.",
  inputSchema: { type: "object", properties: {} },
  parser: z.object({}).default({}),
  async handler(_input, ctx) {
    const projects = await prisma.project.findMany({
      where: {
        team: { members: { some: { userId: ctx.userId } } },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        teamId: true,
        status: true,
        updatedAt: true,
      },
    });
    return { projects };
  },
};

// ─── Write tools ────────────────────────────────────────────

const createIssue: McpToolDefinition = {
  name: "createIssue",
  requiredScope: "write",
  description: "Create a new issue in a project the user has access to.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW"] },
    },
    required: ["projectId", "title"],
  },
  parser: z.object({
    projectId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
  }),
  async handler(rawInput, ctx) {
    const input = rawInput as {
      projectId: string;
      title: string;
      description?: string;
      priority?: string;
    };
    const project = await prisma.project.findFirst({
      where: {
        id: input.projectId,
        team: { members: { some: { userId: ctx.userId } } },
      },
    });
    if (!project) {
      throw new Error(`Project ${input.projectId} not found or no access`);
    }
    const issue = await prisma.issue.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "MEDIUM",
        identifier: `MCP-${Date.now()}`,
        projectId: project.id,
        reporterId: ctx.userId,
      },
    });
    await emitActivityEvent({
      type: "issue.created",
      actorType: "integration",
      actorId: ctx.userId,
      subjectType: "issue",
      subjectId: issue.id,
      payload: { source: "mcp" },
    });
    return { issue };
  },
};

const commentOnIssue: McpToolDefinition = {
  name: "commentOnIssue",
  requiredScope: "write",
  description: "Append a comment to an issue.",
  inputSchema: {
    type: "object",
    properties: {
      issueId: { type: "string" },
      content: { type: "string" },
    },
    required: ["issueId", "content"],
  },
  parser: z.object({
    issueId: z.string().min(1),
    content: z.string().min(1),
  }),
  async handler(rawInput, ctx) {
    const input = rawInput as { issueId: string; content: string };
    const issue = await prisma.issue.findFirst({
      where: {
        id: input.issueId,
        project: {
          team: { members: { some: { userId: ctx.userId } } },
        },
      },
    });
    if (!issue) {
      throw new Error(`Issue ${input.issueId} not found or no access`);
    }
    const comment = await prisma.comment.create({
      data: {
        content: input.content,
        authorId: ctx.userId,
        issueId: issue.id,
      },
    });
    return { comment };
  },
};

const createNote: McpToolDefinition = {
  name: "createNote",
  requiredScope: "write",
  description:
    "Create a new note. Defaults to the user's personal teamspace if `teamId` is omitted.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      contentText: { type: "string" },
      teamId: SCHEMA_NULLABLE_STRING,
    },
    required: ["title"],
  },
  parser: z.object({
    title: z.string().min(1),
    contentText: z.string().optional(),
    teamId: z.string().nullable().optional(),
  }),
  async handler(rawInput, ctx) {
    const input = rawInput as {
      title: string;
      contentText?: string;
      teamId?: string | null;
    };
    let teamId = input.teamId ?? ctx.defaultTeamId ?? null;
    if (teamId) {
      const member = await prisma.teamMember.findFirst({
        where: { userId: ctx.userId, teamId },
      });
      if (!member) {
        throw new Error(`Team ${teamId} not found or no access`);
      }
    }
    const note = await prisma.note.create({
      data: {
        title: input.title,
        contentText: input.contentText ?? "",
        authorId: ctx.userId,
        teamId,
      },
    });
    await emitActivityEvent({
      type: "note.created",
      actorType: "integration",
      actorId: ctx.userId,
      subjectType: "note",
      subjectId: note.id,
      payload: { source: "mcp" },
    });
    return { note };
  },
};

const appendNote: McpToolDefinition = {
  name: "appendNote",
  requiredScope: "write",
  description:
    "Append plain-text content to an existing note. Each call appends a paragraph block at the end of the note.",
  inputSchema: {
    type: "object",
    properties: {
      noteId: { type: "string" },
      content: { type: "string" },
    },
    required: ["noteId", "content"],
  },
  parser: z.object({
    noteId: z.string().min(1),
    content: z.string().min(1),
  }),
  async handler(rawInput, ctx) {
    const input = rawInput as { noteId: string; content: string };
    const teamspaceIds = (
      await prisma.teamMember.findMany({
        where: { userId: ctx.userId },
        select: { teamId: true },
      })
    ).map((m) => m.teamId);
    const note = await prisma.note.findFirst({
      where: {
        id: input.noteId,
        deletedAt: null,
        OR: [
          { authorId: ctx.userId },
          { teamId: { in: teamspaceIds.length ? teamspaceIds : ["__none__"] } },
        ],
      },
    });
    if (!note) throw new Error(`Note ${input.noteId} not found or no access`);

    const existingBlocks: unknown[] = Array.isArray(note.blocks)
      ? (note.blocks as unknown[])
      : [];
    const appendedBlock = {
      id: `mcp-${Date.now()}`,
      type: "paragraph",
      content: [{ type: "text", text: input.content, styles: {} }],
      props: { textColor: "default", backgroundColor: "default" },
      children: [],
    };
    const newBlocks = [...existingBlocks, appendedBlock];
    const newContentText = `${note.contentText}${note.contentText ? "\n\n" : ""}${input.content}`;

    const updated = await prisma.note.update({
      where: { id: note.id },
      data: {
        blocks: newBlocks as unknown as object,
        contentText: newContentText,
      },
      select: { id: true, title: true, updatedAt: true },
    });
    return { note: updated };
  },
};

// ─── Registry ───────────────────────────────────────────────

export const MCP_TOOLS: McpToolDefinition[] = [
  searchIssues,
  getIssue,
  searchNotes,
  getNote,
  listProjects,
  createIssue,
  commentOnIssue,
  createNote,
  appendNote,
];

export const MCP_TOOLS_BY_NAME: Map<string, McpToolDefinition> = new Map(
  MCP_TOOLS.map((t) => [t.name, t]),
);
