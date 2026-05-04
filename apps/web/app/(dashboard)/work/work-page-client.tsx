"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Badge } from "@omnitool/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function WorkPageClient() {
  const { data, isLoading, error } = trpc.dashboard.myWork.useQuery();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error.message === "You are not a member of any team"
          ? "Join a team to see your work in one place."
          : error.message}
      </p>
    );
  }

  if (!data) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg">
            Tasks ({data.tasks.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Open items assigned to you.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing queued.</p>
          ) : (
            <ul className="space-y-2">
              {data.tasks.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/projects/${t.project.slug}`}
                    className="block rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <span className="text-sm font-medium leading-snug">
                      {t.title}
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{t.project.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {t.status.replace(/_/g, " ")}
                      </Badge>
                      {t.dueDate && (
                        <span>
                          Due{" "}
                          {formatDistanceToNow(new Date(t.dueDate), {
                            addSuffix: true,
                          })}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg">
            Issues ({data.issues.length})
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Active issues assigned to you.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">Clear skies.</p>
          ) : (
            <ul className="space-y-2">
              {data.issues.map((i) => (
                <li key={i.id}>
                  <Link
                    href={`/projects/${i.project.slug}`}
                    className="block rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {i.identifier}
                    </span>
                    <span className="mt-0.5 block text-sm font-medium leading-snug">
                      {i.title}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{i.project.name}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {i.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-1">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">
              Notes ({data.notes.length})
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Recent captures by you.
            </p>
          </div>
          <Link
            href="/notes"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Manage
          </Link>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notes yet — open Notes to add one.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.notes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notes/${n.id}`}
                    className="block rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/40"
                  >
                    <span className="text-sm font-medium leading-snug">
                      {n.isPinned && (
                        <span className="mr-1 text-amber-600">Pinned · </span>
                      )}
                      {n.title}
                    </span>
                    {n.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {n.tags.map((tag) => (
                          <Badge key={tag.id} variant="outline" className="text-[10px]">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      Updated{" "}
                      {formatDistanceToNow(new Date(n.updatedAt), {
                        addSuffix: true,
                      })}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
