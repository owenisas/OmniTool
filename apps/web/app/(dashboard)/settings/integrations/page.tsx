"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Card, CardContent } from "@omnitool/ui/components/card";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import { CheckCircle2, ExternalLink } from "lucide-react";
import {
  GitHubIcon,
  NotionIcon,
  SlackIcon,
  LinearIcon,
} from "@/components/icons/brand-icons";
import {
  startOAuthFlow,
  getCurrentDeepLinks,
  onDeepLink,
  isTauri,
} from "@/lib/tauri";
import { GitHubImportDialog } from "@/components/integrations/github-import-dialog";
import { NotionImportDialog } from "@/components/integrations/notion-import-dialog";
import { runBackgroundTask } from "@/lib/background-tasks/run";

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
    icon: GitHubIcon,
  },
  {
    key: "notion",
    provider: "NOTION",
    name: "Notion",
    description: "Import pages as notes from your Notion workspace",
    available: true,
    icon: NotionIcon,
  },
  {
    key: "slack",
    provider: "SLACK",
    name: "Slack",
    description: "Notifications and task hooks",
    available: false,
    icon: SlackIcon,
  },
  {
    key: "linear",
    provider: "LINEAR",
    name: "Linear",
    description: "Issue sync and velocity",
    available: false,
    icon: LinearIcon,
  },
];

export default function IntegrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected");
  const connectParam = searchParams.get("connect");

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [notionImportDialogOpen, setNotionImportDialogOpen] = useState(false);
  const startedOAuthRef = useRef<string | null>(null);
  const openedImportRef = useRef<string | null>(null);

  const connectedQuery = trpc.integration.listConnected.useQuery();
  const disconnectMutation = trpc.integration.disconnect.useMutation({
    onSuccess: () => {
      connectedQuery.refetch();
    },
  });
  const utils = trpc.useUtils();
  const recleanMutation = trpc.integration.notion.recleanImported.useMutation();

  /**
   * Re-process every previously imported Notion note through the latest
   * markdown→blocks converter. Strips legacy `<details>`/`<summary>` HTML
   * left over from imports that pre-date the toggle-stripping fix, adds
   * native table/image blocks, and refreshes inter-page links.
   */
  function handleRecleanNotionNotes() {
    void runBackgroundTask({
      id: `notion-reclean-${Date.now()}`,
      kind: "notion-reclean",
      label: "Re-cleaning imported Notion notes",
      href: "/notes",
      successToast: (r: {
        cleaned: number;
        skipped: number;
        failed: number;
        total: number;
      }) =>
        `Cleaned ${r.cleaned} of ${r.total} Notion notes` +
        (r.failed > 0 ? ` · ${r.failed} failed` : "") +
        (r.skipped > 0 ? ` · ${r.skipped} skipped (no markdown)` : ""),
      work: () => recleanMutation.mutateAsync(),
      onSuccess: () => {
        void utils.note.list.invalidate();
        void utils.note.getById.invalidate();
      },
    });
  }

  // Refetch when window regains focus — picks up OAuth completions
  // that happened in the system browser (desktop app flow).
  const refetchOnFocus = useCallback(() => {
    connectedQuery.refetch();
  }, [connectedQuery]);

  useEffect(() => {
    window.addEventListener("focus", refetchOnFocus);
    return () => window.removeEventListener("focus", refetchOnFocus);
  }, [refetchOnFocus]);

  // Listen for deep link events (desktop: omnitool://oauth-complete?provider=xxx)
  useEffect(() => {
    if (!isTauri()) return;

    const handleOAuthComplete = (urls: string[]) => {
      for (const rawUrl of urls) {
        let url: URL;
        try {
          url = new URL(rawUrl);
        } catch {
          continue;
        }

        if (
          url.protocol !== "omnitool:" ||
          url.hostname !== "oauth-complete"
        ) {
          continue;
        }

        const provider = url.searchParams.get("provider");
        const status = url.searchParams.get("status");
        if (provider !== "github" && provider !== "notion") continue;

        connectedQuery.refetch();

        if (status === "success") {
          router.replace(`/settings/integrations?connected=${provider}`);
          if (provider === "github") {
            setImportDialogOpen(true);
          } else {
            setNotionImportDialogOpen(true);
          }
        } else {
          router.replace(`/settings/integrations?error=${provider}_oauth`);
        }
      }
    };

    let cleanup: (() => void) | null = null;
    getCurrentDeepLinks().then(handleOAuthComplete);
    onDeepLink(handleOAuthComplete).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => {
      cleanup?.();
    };
  }, [connectedQuery, router]);

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

  useEffect(() => {
    if (connectedParam === "github" && openedImportRef.current !== "github") {
      openedImportRef.current = "github";
      setImportDialogOpen(true);
    }

    if (connectedParam === "notion" && openedImportRef.current !== "notion") {
      openedImportRef.current = "notion";
      setNotionImportDialogOpen(true);
    }
  }, [connectedParam]);

  useEffect(() => {
    if (connectParam !== "github" && connectParam !== "notion") return;
    if (connectedQuery.isLoading || connectedQuery.isFetching) return;

    const provider = connectParam === "github" ? "GITHUB" : "NOTION";
    const isConnected = connectedMap.has(provider);

    if (isConnected) {
      if (openedImportRef.current !== connectParam) {
        openedImportRef.current = connectParam;
        if (connectParam === "github") {
          setImportDialogOpen(true);
        } else {
          setNotionImportDialogOpen(true);
        }
      }
      return;
    }

    if (startedOAuthRef.current === connectParam) return;
    startedOAuthRef.current = connectParam;

    void startOAuthFlow(
      connectParam === "github"
        ? "/api/integrations/github/authorize"
        : "/api/integrations/notion/authorize",
    );
  }, [
    connectParam,
    connectedMap,
    connectedQuery.isFetching,
    connectedQuery.isLoading,
  ]);

  function parseMetadataName(metadata: string | null): string | null {
    if (!metadata) return null;
    try {
      const parsed = JSON.parse(metadata);
      return parsed.login || parsed.name || parsed.workspace_name || null;
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
    const isNotion = integration.key === "notion";
    const displayName = connected
      ? parseMetadataName(connected.metadata)
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
                {connected && <Badge variant="secondary">Connected</Badge>}
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
              {(isGitHub || isNotion) && connected && displayName && (
                <p className="text-xs text-muted-foreground">
                  {isNotion ? "Workspace: " : "Signed in as "}
                  <span className="font-medium text-foreground">
                    {displayName}
                  </span>
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
                    void startOAuthFlow(
                      "/api/integrations/github/authorize",
                    );
                  }}
                >
                  Connect <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )
            ) : integration.available && isNotion ? (
              connected ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => setNotionImportDialogOpen(true)}
                  >
                    Import from Notion
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRecleanNotionNotes}
                    disabled={recleanMutation.isPending}
                    title="Re-process previously imported notes through the latest formatter (strips legacy HTML toggles, fixes tables, etc.)"
                  >
                    Re-clean imports
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect("NOTION")}
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
                    void startOAuthFlow(
                      "/api/integrations/notion/authorize",
                    );
                  }}
                >
                  Connect <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
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
          Connect external tools to OmniTool.
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

      {connectedParam === "notion" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            Notion connected successfully. You can now import pages as notes.
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

      <NotionImportDialog
        open={notionImportDialogOpen}
        onOpenChange={setNotionImportDialogOpen}
      />
    </div>
  );
}
