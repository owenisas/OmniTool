"use client";

import { useEffect, useState } from "react";
import { Badge } from "@omnitool/ui/components/badge";
import { Button } from "@omnitool/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@omnitool/ui/components/card";
import { RefreshCw } from "lucide-react";

interface ScanResponse {
  scannedAt: string;
  totalSessions: number;
  sourceCounts: Record<string, number>;
  cached?: boolean;
  sourcesFilter?: string[] | null;
  customRootSources?: string[] | null;
  scanRootsOnly?: string[] | null;
}

const SOURCE_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  "gemini-cli": "Gemini CLI",
  "vscode-copilot": "VS Code / Copilot",
  aider: "Aider",
  continue: "Continue",
  cline: "Cline",
  "roo-code": "Roo Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  opencode: "OpenCode",
};

export default function CodingSessionsPage() {
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [loadingScan, setLoadingScan] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions(options?: { refresh?: boolean }) {
    setLoadingScan(true);
    setError(null);
    try {
      const qs = options?.refresh ? "?refresh=1" : "";
      const response = await fetch(`/api/coding-sessions${qs}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to scan sessions");
      setScan(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan sessions");
    } finally {
      setLoadingScan(false);
    }
  }

  const toolsWithData = scan
    ? Object.entries(scan.sourceCounts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coding Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Only known agent folders are traversed (not your whole disk). Optional env{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              CODING_SESSIONS_SCAN_PATHS
            </code>{" "}
            limits walks to comma-separated directories. Cache is keyed per scan profile.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadSessions({ refresh: true })}
          disabled={loadingScan}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loadingScan ? "animate-spin" : ""}`} />
          Rescan
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Local stores</CardTitle>
          <CardDescription>
            {loadingScan ? (
              "Scanning…"
            ) : scan ? (
              <>
                Last scan{" "}
                <time dateTime={scan.scannedAt}>{formatScanTime(scan.scannedAt)}</time>
                {scan.totalSessions > 0
                  ? ` · ${scan.totalSessions} session file${scan.totalSessions === 1 ? "" : "s"} on disk (per-tool cap applies).`
                  : " · No indexed session files found."}
                {scan.cached ? " Cached server-side." : ""}
                {scan.scanRootsOnly?.length ? (
                  <>
                    {" "}
                    Paths-only mode:{" "}
                    <span className="break-all font-medium">{scan.scanRootsOnly.join(", ")}</span>.
                  </>
                ) : null}
                {scan.sourcesFilter?.length ? (
                  <>
                    {" "}
                    Sources:{" "}
                    <span className="font-medium">{scan.sourcesFilter.join(", ")}</span>.
                  </>
                ) : null}
                {scan.customRootSources?.length ? (
                  <>
                    {" "}
                    Custom roots for:{" "}
                    <span className="font-medium">{scan.customRootSources.join(", ")}</span>.
                  </>
                ) : null}
              </>
            ) : (
              "Not scanned yet."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingScan ? (
            <p className="text-sm text-muted-foreground">Working…</p>
          ) : toolsWithData.length ? (
            <div className="flex flex-wrap gap-2">
              {toolsWithData.map(([source, count]) => (
                <Badge key={source} variant="secondary" className="font-normal">
                  {SOURCE_LABELS[source] ?? source}
                  <span className="ml-1.5 tabular-nums text-muted-foreground">({count})</span>
                </Badge>
              ))}
            </div>
          ) : scan && scan.totalSessions === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Claude Code, Codex, Gemini CLI, VS Code/Copilot, OpenCode, or other supported
              stores showed sessions under the current scan limits.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function formatScanTime(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}
