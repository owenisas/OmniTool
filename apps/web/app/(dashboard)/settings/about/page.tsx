import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@omnitool/ui/components/card";
import { Badge } from "@omnitool/ui/components/badge";
import { Button } from "@omnitool/ui/components/button";
import { ExternalLink } from "lucide-react";
import {
  getAppVersion,
  getGitHubRepository,
  getReleaseUrl,
  getSourceTagUrl,
  normalizeVersionTag,
} from "@/lib/release-notices";

export default function AboutSettingsPage() {
  const version = getAppVersion();
  const repository = getGitHubRepository();
  const versionTag = /^v?\d+\.\d+\.\d+/.test(version)
    ? normalizeVersionTag(version)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">About OmniTool</h1>
        <p className="mt-2 text-muted-foreground">
          Internal productivity app for teams: projects, tasks, issues, notes,
          metrics, and AI helpers.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Build</CardTitle>
            <Badge variant="secondary" className="font-mono">
              {version}
            </Badge>
          </div>
          <CardDescription>
            Display version comes from{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              NEXT_PUBLIC_APP_VERSION
            </code>{" "}
            when set at build time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Version label:</span>{" "}
            <span className="font-mono font-medium">{version}</span>
          </p>
          <p>
            <span className="text-muted-foreground">GitHub repository:</span>{" "}
            <span className="font-mono font-medium">{repository}</span>
          </p>
          {versionTag ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
              >
                <a
                  href={getReleaseUrl(versionTag, repository)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Release
                </a>
              </Button>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
              >
                <a
                  href={getSourceTagUrl(versionTag, repository)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Source tag
                </a>
              </Button>
            </div>
          ) : null}
          <p className="text-muted-foreground">
            Stack: Next.js, React, Tauri (desktop), PostgreSQL, Prisma, tRPC,
            Supabase Auth, Tailwind, shadcn/ui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
