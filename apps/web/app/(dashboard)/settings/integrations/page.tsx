"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Card, CardContent } from "@omnitool/ui/components/card";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import {
  Github,
  BookOpen,
  MessageSquare,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { GitHubImportDialog } from "@/components/integrations/github-import-dialog";

interface IntegrationDef {
  key: string;
  provider: string;
  name: string;
  description: string;
  available: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

const integrations: IntegrationDef[] = [
  {
    key: "github",
    provider: "GITHUB",
    name: "GitHub",
    description: "Import organizations and repositories, link projects",
    available: true,
    icon: Github,
  },
  {
    key: "notion",
    provider: "NOTION",
    name: "Notion",
    description: "Sync pages and databases",
    available: false,
    icon: BookOpen,
  },
  {
    key: "slack",
    provider: "SLACK",
    name: "Slack",
    description: "Notifications and task hooks",
    available: false,
    icon: MessageSquare,
  },
  {
    key: "linear",
    provider: "LINEAR",
    name: "Linear",
    description: "Issue sync and velocity",
    available: false,
    icon: Layers,
  },
];

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected");

  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const connectedQuery = trpc.integration.listConnected.useQuery();
  const disconnectMutation = trpc.integration.disconnect.useMutation({
    onSuccess: () => {
      connectedQuery.refetch();
    },
  });

  const connectedMap = useMemo(() => {
    const map = new Map<
      string,
      {
        providerAccountId: string;
        metadata: string | null;
        scopes: string | null;
        createdAt: Date;
      }
    >();
    if (connectedQuery.data) {
      for (const account of connectedQuery.data) {
        map.set(account.provider, account);
      }
    }
    return map;
  }, [connectedQuery.data]);

  function parseGitHubUsername(metadata: string | null): string | null {
    if (!metadata) return null;
    try {
      const parsed = JSON.parse(metadata);
      return parsed.login || parsed.name || null;
    } catch {
      return null;
    }
  }

  function handleDisconnect(provider: string) {
    disconnectMutation.mutate({ provider });
  }

  const activeIntegrations = integrations.filter((i) => i.available);
  const plannedIntegrations = integrations.filter((i) => !i.available);

  function renderCard(integration: IntegrationDef) {
    const connected = connectedMap.get(integration.provider);
    const isGitHub = integration.key === "github";
    const username = isGitHub
      ? parseGitHubUsername(connected?.metadata ?? null)
      : null;

    return (
      <Card key={integration.key}>
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <integration.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{integration.name}</h3>
                {connected && (
                  <Badge variant="secondary">Connected</Badge>
                )}
                {!integration.available && (
                  <Badge variant="outline">Coming soon</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {integration.description}
              </p>
              {!integration.available && (
                <p className="text-xs text-muted-foreground">
                  OAuth and sync are not wired for this provider yet.
                </p>
              )}
              {isGitHub && connected && username && (
                <p className="text-xs text-muted-foreground">
                  Signed in as{" "}
                  <span className="font-medium text-foreground">{username}</span>
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {integration.available && isGitHub ? (
              connected ? (
                <>
                  <Button size="sm" onClick={() => setImportDialogOpen(true)}>
                    Import from GitHub
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect("GITHUB")}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending
                      ? "Disconnecting..."
                      : "Disconnect"}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    window.location.href =
                      "/api/integrations/github/authorize";
                  }}
                >
                  Connect
                </Button>
              )
            ) : integration.available ? (
              <Button size="sm">Connect</Button>
            ) : (
              <Button size="sm" variant="secondary" disabled>
                Unavailable
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-2">
          Connect external tools to OmniTool. Only GitHub is available today;
          others are planned.
        </p>
      </div>

      {connectedParam === "github" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            GitHub connected successfully. You can now import organizations and
            repositories.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Available
        </h2>
        <div className="grid gap-4">{activeIntegrations.map(renderCard)}</div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Planned
        </h2>
        <div className="grid gap-4">{plannedIntegrations.map(renderCard)}</div>
      </section>

      <GitHubImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </div>
  );
}
