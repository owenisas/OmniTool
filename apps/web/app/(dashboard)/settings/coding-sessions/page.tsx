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

export default function CodingSessionsSettingsPage() {
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
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Coding Sessions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Scan and manage your local AI coding tool session stores. These sessions
          are used by the &quot;Summarize my day&quot; feature on the dashboard.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Local Session Stores</CardTitle>
              <CardDescription className="mt-1">
                Only known agent folders are traversed (not your whole disk).
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadSessions({ refresh: true })}
              disabled={loadingScan}
              className="gap-2"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingScan ? "animate-spin" : ""}`}
              />
              Rescan
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {loadingScan ? (
            <p className="text-sm text-muted-foreground">Scanning...</p>
          ) : scan ? (
            <>
              <p className="text-sm text-muted-foreground">
                Last scan{" "}
                <time dateTime={scan.scannedAt}>
                  {formatScanTime(scan.scannedAt)}
                </time>
                {scan.totalSessions > 0
                  ? ` · ${scan.totalSessions} session file${scan.totalSessions === 1 ? "" : "s"} on disk.`
                  : " · No indexed session files found."}
                {scan.cached ? " (cached)" : ""}
              </p>

              {toolsWithData.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {toolsWithData.map(([source, count]) => (
                    <Badge key={source} variant="secondary" className="font-normal">
                      {SOURCE_LABELS[source] ?? source}
                      <span className="ml-1.5 tabular-nums text-muted-foreground">
                        ({count})
                      </span>
                    </Badge>
                  ))}
                </div>
              )}

              {scan.totalSessions === 0 && toolsWithData.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No supported AI tool sessions found under the current scan paths.
                </p>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration</CardTitle>
          <CardDescription>
            Control which directories and sources are scanned via environment
            variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted p-3 text-xs font-mono space-y-1">
            <p>
              <span className="text-muted-foreground"># Limit scan to specific directories</span>
            </p>
            <p>CODING_SESSIONS_SCAN_PATHS=/path/to/projects,/another/path</p>
            <p className="mt-2">
              <span className="text-muted-foreground"># Filter to specific sources</span>
            </p>
            <p>CODING_SESSIONS_SCAN_SOURCES=claude-code,cursor,copilot</p>
            <p className="mt-2">
              <span className="text-muted-foreground"># Cache duration (ms, default 15 min)</span>
            </p>
            <p>CODING_SESSIONS_SCAN_CACHE_MS=900000</p>
          </div>
          {scan?.scanRootsOnly?.length ? (
            <p className="text-xs text-muted-foreground">
              Active path filter:{" "}
              <span className="font-medium break-all">
                {scan.scanRootsOnly.join(", ")}
              </span>
            </p>
          ) : null}
          {scan?.sourcesFilter?.length ? (
            <p className="text-xs text-muted-foreground">
              Active source filter:{" "}
              <span className="font-medium">{scan.sourcesFilter.join(", ")}</span>
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
