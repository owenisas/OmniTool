import { serverTrpc } from "@/trpc/server";
import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { Badge } from "@omnitool/ui/components/badge";
import Link from "next/link";
import { FolderKanban, Bug, CheckSquare } from "lucide-react";

const statusColors: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  PAUSED: "bg-amber-500/15 text-amber-700 border-amber-200",
  COMPLETED: "bg-blue-500/15 text-blue-700 border-blue-200",
  ARCHIVED: "bg-slate-500/15 text-slate-600 border-slate-200",
};

export default async function ProjectsPage() {
  const trpc = await serverTrpc();
  const projects = await trpc.project.list();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderKanban className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No projects yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.slug}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-tight min-w-0 truncate">
                      {project.name}
                    </CardTitle>
                    <Badge
                      className={`${statusColors[project.status] || ""} shrink-0`}
                    >
                      {project.status}
                    </Badge>
                  </div>
                  {project.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {project.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                        {project._count.tasks} tasks
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Bug className="h-3.5 w-3.5 shrink-0" />
                        {project._count.issues} issues
                      </span>
                    </div>
                    {project.team && (
                      <span className="min-w-0 truncate text-xs">
                        {project.team.name}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
