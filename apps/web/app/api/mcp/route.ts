import { NextResponse } from "next/server";
import { prisma } from "@omnitool/database";
import { extractBearerFromRequest, hashToken } from "@/lib/mcp/token";
import type { McpScope, McpToolContext } from "@/lib/mcp/tools";
import { MCP_TOOLS, MCP_TOOLS_BY_NAME } from "@/lib/mcp/tools";
import { emitActivityEvent } from "@/lib/activity/emit";

/**
 * Minimal Model Context Protocol server (Streamable HTTP transport).
 *
 * Implements the JSON-RPC subset required by Cursor / Claude Code / Codex
 * MCP clients:
 *   - initialize
 *   - tools/list
 *   - tools/call
 *
 * Authentication: bearer token (PAT) carried as `Authorization: Bearer <token>`.
 * Local development may additionally accept `?token=<plaintext>`. Tokens map to OmniTool users via
 * SHA-256 hash lookup against `PersonalAccessToken.hashedToken`.
 *
 * Each `tools/call` invocation also emits an `mcp.tool.invoked` activity
 * event so the activity feed reflects external agent actions.
 */

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "omnitool";
const SERVER_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function rpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function rpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function parseScopes(rawScopes: string): McpScope[] {
  try {
    const parsed = JSON.parse(rawScopes) as unknown;
    if (Array.isArray(parsed)) {
      const scopes = parsed.filter(
        (scope): scope is McpScope => scope === "read" || scope === "write",
      );
      // Existing tokens were created before scopes were enforced and stored
      // an empty JSON array. Preserve compatibility while enforcing any
      // explicit read/write subset on new or edited records.
      return scopes.length > 0 ? scopes : ["read", "write"];
    }
  } catch {
    // fall through to compatibility default
  }
  return ["read", "write"];
}

function canUseTool(ctx: McpToolContext, requiredScope: McpScope): boolean {
  return ctx.scopes.includes(requiredScope);
}

async function authenticate(req: Request): Promise<
  | { ok: true; userId: string; scopes: McpScope[]; defaultTeamId: string | null }
  | { ok: false; reason: string }
> {
  const presented = extractBearerFromRequest(req, {
    allowQueryToken: process.env.NODE_ENV !== "production",
  });
  if (!presented) {
    return { ok: false, reason: "Missing bearer token" };
  }
  const hashed = hashToken(presented);
  const token = await prisma.personalAccessToken.findUnique({
    where: { hashedToken: hashed },
    include: {
      user: {
        select: { id: true, personalTeamId: true },
      },
    },
  });
  if (!token || token.revokedAt) {
    return { ok: false, reason: "Invalid or revoked token" };
  }
  // Update lastUsedAt fire-and-forget.
  prisma.personalAccessToken
    .update({
      where: { id: token.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      /* noop */
    });

  return {
    ok: true,
    userId: token.user.id,
    scopes: parseScopes(token.scopes),
    defaultTeamId: token.user.personalTeamId ?? null,
  };
}

async function dispatchRpc(
  msg: JsonRpcRequest,
  ctx: McpToolContext,
): Promise<JsonRpcResponse> {
  const id = msg.id ?? null;

  switch (msg.method) {
    case "initialize": {
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
      });
    }
    case "ping": {
      return rpcResult(id, {});
    }
    case "tools/list": {
      return rpcResult(id, {
        tools: MCP_TOOLS.filter((t) => canUseTool(ctx, t.requiredScope)).map(
          (t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }),
        ),
      });
    }
    case "tools/call": {
      const params = (msg.params ?? {}) as {
        name?: string;
        arguments?: unknown;
      };
      const name = params.name;
      if (!name) return rpcError(id, -32602, "Missing tool name");
      const tool = MCP_TOOLS_BY_NAME.get(name);
      if (!tool) return rpcError(id, -32601, `Unknown tool: ${name}`);
      if (!canUseTool(ctx, tool.requiredScope)) {
        return rpcError(
          id,
          -32001,
          `Token is missing required '${tool.requiredScope}' scope for ${name}`,
        );
      }

      let parsed: unknown;
      try {
        parsed = tool.parser.parse(params.arguments ?? {});
      } catch (err) {
        return rpcError(
          id,
          -32602,
          `Invalid arguments for ${name}: ${(err as Error).message}`,
        );
      }

      try {
        const result = await tool.handler(parsed, ctx);

        // Audit: emit an activity event so MCP usage shows up in the feed.
        // Fire-and-forget so a failed emit can't block the response.
        emitActivityEvent({
          type: "mcp.tool.invoked",
          actorType: "integration",
          actorId: ctx.userId,
          subjectType: "note",
          subjectId: ctx.userId,
          payload: {
            toolName: name,
            // Do NOT log full args — they may contain sensitive content.
            argKeys: Object.keys(parsed as Record<string, unknown>),
          },
        }).catch(() => {});

        return rpcResult(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: false,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return rpcResult(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json(
      rpcError(null, -32000, auth.reason),
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), {
      status: 400,
    });
  }

  // Support batched requests per JSON-RPC 2.0.
  if (Array.isArray(body)) {
    const responses = await Promise.all(
      body
        .filter((m): m is JsonRpcRequest => !!m && typeof m === "object")
        .map((m) => dispatchRpc(m, auth)),
    );
    return NextResponse.json(responses);
  }

  if (!body || typeof body !== "object" || (body as JsonRpcRequest).jsonrpc !== "2.0") {
    return NextResponse.json(
      rpcError(null, -32600, "Invalid Request"),
      { status: 400 },
    );
  }

  const response = await dispatchRpc(body as JsonRpcRequest, auth);
  return NextResponse.json(response);
}

export async function GET(req: Request) {
  // GET on the MCP endpoint is reserved for SSE transports, which we don't
  // currently implement. Return a small JSON descriptor so manual probes
  // get a useful response instead of a 405.
  const auth = await authenticate(req);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason, transport: "streamable_http" },
      { status: 401 },
    );
  }
  return NextResponse.json({
    server: SERVER_NAME,
    version: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    transport: "streamable_http",
    endpoint: new URL(req.url).pathname,
    note:
      "Use POST with a JSON-RPC 2.0 body. Methods: initialize, tools/list, tools/call.",
  });
}
