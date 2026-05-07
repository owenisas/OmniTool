"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import { startOAuthFlow } from "@/lib/tauri";
import { toast } from "sonner";
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
    available: true,
    icon: SlackIcon,
  },
  {
    key: "linear",
    provider: "LINEAR",
    name: "Linear",
    description: "Sync issues and track velocity across teams",
    available: true,
    icon: LinearIcon,
  },
];

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const connectedParam = searchParams.get("connected");
  const connectParam = searchParams.get("connect");

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [notionImportDialogOpen, setNotionImportDialogOpen] = useState(false);
  const startedOAuthRef = useRef<string | null>(null);
  const openedImportRef = useRef<string | null>(null);

  const connectedQuery = trpc.integration.listConnected.useQuery();
  // Track which provider is currently being disconnected so the loading
  // state is scoped to that provider's button only — without this both
  // GitHub and Notion's Disconnect buttons share `disconnectMutation.isPending`
  // and visually disconnect together.
  const [disconnectingProvider, setDisconnectingProvider] = useState<
    string | null
  >(null);
  const utils = trpc.useUtils();
  const disconnectMutation = trpc.integration.disconnect.useMutation({
    onSuccess: (_data, variables) => {
      connectedQuery.refetch();
      // Drop cached org/preview lists — re-connecting may grant access to
      // different orgs/repos. `reset()` clears the data (not just marks
      // stale) so the import dialog shows a clean spinner instead of
      // flashing the pre-grant snapshot before the fresh fetch lands.
      if (variables.provider === "GITHUB") {
        void utils.integration.github.listOrgs.reset();
        void utils.integration.github.previewImport.reset();
      } else if (variables.provider === "NOTION") {
        void utils.integration.notion.listPages.reset();
      }
    },
    onSettled: () => {
      setDisconnectingProvider(null);
    },
  });
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

  // Deep links are handled globally by DesktopAuthDeepLinkHandler, which
  // soft-navigates here with `?connected=<provider>`. The connectedParam
  // effect below opens the import dialog (guarded by openedImportRef so
  // closing it doesn't immediately re-open). refetchOnFocus picks up the
  // new ConnectedAccount row when the user returns to the app.

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
      // Fresh OAuth may have unlocked new orgs (org admin granted third-party
      // access between connections). `reset()` clears the cache entirely so
      // the dialog renders one spinner → full result, instead of flashing
      // the pre-grant list (personal-only) and then growing in the orgs.
      void utils.integration.github.listOrgs.reset();
      setImportDialogOpen(true);
    }

    if (connectedParam === "notion" && openedImportRef.current !== "notion") {
      openedImportRef.current = "notion";
      setNotionImportDialogOpen(true);
    }
  }, [connectedParam, utils]);

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

    startOAuthFlow(
      connectParam === "github"
        ? "/api/integrations/github/authorize"
        : "/api/integrations/notion/authorize",
    ).catch((err) => {
      toast.error(`Failed to start OAuth: ${err instanceof Error ? err.message : "Unknown error"}`);
    });
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
      return parsed.login || parsed.name || parsed.workspace_name || parsed.team_name || null;
    } catch {
      return null;
    }
  }

  function handleDisconnect(provider: string) {
    setDisconnectingProvider(provider);
    disconnectMutation.mutate({ provider });
  }

  const activeIntegrations = integrations.filter((i) => i.available);
  const plannedIntegrations = integrations.filter((i) => !i.available);

  function renderCard(integration: IntegrationDef) {
    const connected = connectedMap.get(integration.provider);
    const isGitHub = integration.key === "github";
    const isNotion = integration.key === "notion";
    const isSlack = integration.key === "slack";
    const isLinear = integration.key === "linear";
    const displayName = connected
      ? parseMetadataName(connected.metadata)
      : null;

    return (
      <Card key={integration.key}>
        {/* Always stack vertically. The settings layout has its own sidebar
         * which limits this card to ~712px even at 1280px viewport — too
         * narrow for icon + description + 3 action buttons side-by-side
         * (Notion connected state). Stacking gives the description full
         * width and lets buttons wrap onto their own row underneath. */}
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <integration.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
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
              {(isGitHub || isNotion || isSlack || isLinear) && connected && displayName && (
                <p className="text-xs text-muted-foreground">
                  {isNotion ? "Workspace: " : isSlack ? "Team: " : isLinear ? "Workspace: " : "Signed in as "}
                  <span className="font-medium text-foreground">
                    {displayName}
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                    disabled={disconnectingProvider === "GITHUB"}
                  >
                    {disconnectingProvider === "GITHUB"
                      ? "Disconnecting..."
                      : "Disconnect"}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    startOAuthFlow(
                      "/api/integrations/github/authorize",
                    ).catch((err) => {
                      toast.error(`GitHub connect failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                    });
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
                    disabled={disconnectingProvider === "NOTION"}
                  >
                    {disconnectingProvider === "NOTION"
                      ? "Disconnecting..."
                      : "Disconnect"}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    startOAuthFlow(
                      "/api/integrations/notion/authorize",
                    ).catch((err) => {
                      toast.error(`Notion connect failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                    });
                  }}
                >
                  Connect <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )
            ) : integration.available && isSlack ? (
              connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDisconnect("SLACK")}
                  disabled={disconnectingProvider === "SLACK"}
                >
                  {disconnectingProvider === "SLACK"
                    ? "Disconnecting..."
                    : "Disconnect"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    startOAuthFlow(
                      "/api/integrations/slack/authorize",
                    ).catch((err) => {
                      toast.error(`Slack connect failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                    });
                  }}
                >
                  Connect <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              )
            ) : integration.available && isLinear ? (
              connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDisconnect("LINEAR")}
                  disabled={disconnectingProvider === "LINEAR"}
                >
                  {disconnectingProvider === "LINEAR"
                    ? "Disconnecting..."
                    : "Disconnect"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    startOAuthFlow(
                      "/api/integrations/linear/authorize",
                    ).catch((err) => {
                      toast.error(`Linear connect failed: ${err instanceof Error ? err.message : "Unknown error"}`);
                    });
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

      {connectedParam === "slack" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            Slack connected successfully. Notifications and task hooks are now
            available.
          </p>
        </div>
      )}

      {connectedParam === "linear" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            Linear connected successfully. Issues and velocity tracking are now
            available.
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
