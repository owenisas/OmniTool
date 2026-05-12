"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Card, CardContent } from "@omnitool/ui/components/card";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import { Label } from "@omnitool/ui/components/label";
import { toast } from "sonner";
import { Copy, Trash2, KeyRound } from "lucide-react";

/**
 * Settings → Integrations → MCP. Manage Personal Access Tokens that
 * external coding agents (Cursor, Claude Code, Codex) use to call
 * OmniTool's MCP server at `/api/mcp`.
 */
export default function McpSettingsPage() {
  const utils = trpc.useUtils();
  const tokensQuery = trpc.personalAccessToken.list.useQuery();

  const [name, setName] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const createToken = trpc.personalAccessToken.create.useMutation({
    onSuccess: async (row) => {
      setCreatedToken(row.plaintext);
      setName("");
      await utils.personalAccessToken.list.invalidate();
      toast.success(`Token "${row.name}" created`);
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeToken = trpc.personalAccessToken.revoke.useMutation({
    onSuccess: async () => {
      await utils.personalAccessToken.list.invalidate();
      toast.success("Token revoked");
    },
    onError: (err) => toast.error(err.message),
  });

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";
  const mcpEndpoint = `${baseUrl}/api/mcp`;

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error("Copy failed"));
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">MCP server</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Cursor, Claude Code, or OpenAI Codex to OmniTool. Each agent
          authenticates with a personal access token and can search and
          modify your issues, notes, and projects.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Endpoint</h2>
          </div>
          <div className="flex gap-2">
            <Input value={mcpEndpoint} readOnly className="font-mono text-xs" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(mcpEndpoint, "Endpoint")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Streamable HTTP transport. POST JSON-RPC 2.0 with{" "}
            <code className="rounded bg-muted px-1">Authorization: Bearer &lt;token&gt;</code>.
            Methods: <code className="rounded bg-muted px-1">initialize</code>,{" "}
            <code className="rounded bg-muted px-1">tools/list</code>,{" "}
            <code className="rounded bg-muted px-1">tools/call</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h2 className="text-sm font-medium">Create a token</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              The plaintext is shown once on creation — copy it before
              navigating away.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="token-name">Name</Label>
              <Input
                id="token-name"
                placeholder="My laptop"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button
              type="button"
              size="sm"
              disabled={createToken.isPending || !name.trim()}
              onClick={() =>
                createToken.mutate({ name: name.trim(), scopes: ["read", "write"] })
              }
            >
              Create
            </Button>
          </div>

          {createdToken ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 dark:bg-amber-950/20">
              <p className="text-xs font-medium text-amber-700 dark:text-amber-200">
                Copy this token now — you won't see it again.
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  value={createdToken}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(createdToken, "Token")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">
                Example Cursor / Claude Code config:
              </p>
              <pre className="mt-2 overflow-x-auto rounded bg-muted/60 p-2 text-[10px] leading-snug">
{`{
  "mcpServers": {
    "omnitool": {
      "url": "${mcpEndpoint}",
      "transport": "streamable_http",
      "headers": { "Authorization": "Bearer ${createdToken}" }
    }
  }
}`}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="text-sm font-medium">Active tokens</h2>
          {tokensQuery.data?.length ? (
            <div className="divide-y rounded-md border">
              {tokensQuery.data.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.revokedAt
                        ? `Revoked ${new Date(t.revokedAt).toLocaleDateString()}`
                        : t.lastUsedAt
                          ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                          : "Never used"}
                      {" · "}
                      Created {new Date(t.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {!t.revokedAt ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => revokeToken.mutate({ id: t.id })}
                      disabled={revokeToken.isPending}
                      title="Revoke"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No tokens yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
