"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { trpc } from "@/trpc/client";
import { useTeam } from "@/components/providers/team-provider";
import { Button } from "@omnitool/ui/components/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Brain,
  Calendar,
  Clock,
  FileText,
  GitBranch,
  Loader2,
  MousePointerClick,
  Plus,
  Shield,
  Webhook,
  Zap,
} from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  "issue-management": "Issue Management",
  reporting: "Reporting",
  github: "GitHub",
  monitoring: "Monitoring",
  handoffs: "Handoffs",
};

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
  event: <Zap className="h-4 w-4" />,
  schedule: <Calendar className="h-4 w-4" />,
  manual: <MousePointerClick className="h-4 w-4" />,
  webhook: <Webhook className="h-4 w-4" />,
};

const STEP_ICONS: Record<string, React.ReactNode> = {
  agent: <Brain className="h-3.5 w-3.5" />,
  action: <Zap className="h-3.5 w-3.5" />,
  condition: <GitBranch className="h-3.5 w-3.5" />,
  approval: <Shield className="h-3.5 w-3.5" />,
  delay: <Clock className="h-3.5 w-3.5" />,
};

export default function NewWorkflowPage() {
  const router = useRouter();
  const { activeTeamId } = useTeam();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const { data: templates, isLoading } =
    trpc.workflow.listTemplates.useQuery();
  const utils = trpc.useUtils();

  const createFromTemplate = trpc.workflow.createFromTemplate.useMutation({
    onSuccess: (wf) => {
      void utils.workflow.list.invalidate();
      toast.success(`Created "${wf.name}" from template`);
      router.push(`/workflows/${wf.id}`);
    },
    onError: (err) => {
      toast.error(err.message);
      setCreatingId(null);
    },
  });

  const createBlank = trpc.workflow.create.useMutation({
    onSuccess: (wf) => {
      void utils.workflow.list.invalidate();
      toast.success("Created blank workflow");
      router.push(`/workflows/${wf.id}`);
    },
    onError: (err) => {
      toast.error(err.message);
      setCreatingId(null);
    },
  });

  function handleCreateBlank() {
    if (!activeTeamId || creatingId) return;
    setCreatingId("__blank__");
    createBlank.mutate({
      teamId: activeTeamId,
      name: "Untitled Workflow",
      trigger: { kind: "manual" },
      steps: [],
    });
  }

  function handleUseTemplate(templateId: string) {
    if (!activeTeamId || creatingId) return;
    setCreatingId(templateId);
    createFromTemplate.mutate({
      teamId: activeTeamId,
      templateId,
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Workflow</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start from a template or create a blank workflow.
        </p>
      </div>

      {/* Blank workflow card */}
      <button
        type="button"
        onClick={handleCreateBlank}
        disabled={creatingId !== null}
        className={cn(
          "flex w-full items-center gap-4 rounded-lg border-2 border-dashed bg-card p-5 text-left transition-colors",
          "hover:border-primary/40 hover:bg-muted/30",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {creatingId === "__blank__" ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Plus className="h-6 w-6" />
          )}
        </div>
        <div>
          <p className="font-semibold">Blank Workflow</p>
          <p className="text-sm text-muted-foreground">
            Start from scratch with a manual trigger and no steps.
          </p>
        </div>
      </button>

      {/* Templates loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Template grid */}
      {templates && templates.length > 0 && (
        <>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Templates
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((tpl) => {
              const isCreating = creatingId === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleUseTemplate(tpl.id)}
                  disabled={creatingId !== null}
                  className={cn(
                    "flex flex-col items-start gap-3 rounded-lg border bg-card p-5 text-left transition-colors",
                    "hover:border-primary/40 hover:bg-muted/30",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  <div className="flex w-full items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      {isCreating ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        TRIGGER_ICONS[tpl.trigger.kind] ?? (
                          <Zap className="h-5 w-5" />
                        )
                      )}
                    </div>
                    {tpl.category && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className="font-semibold leading-tight">{tpl.name}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
                      {tpl.description}
                    </p>
                  </div>

                  <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      {TRIGGER_ICONS[tpl.trigger.kind]}
                      {tpl.trigger.kind}
                    </span>
                    <span className="text-border">|</span>
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {tpl.steps.length} step{tpl.steps.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Step preview chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {tpl.steps.map((step, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {STEP_ICONS[step.kind]}
                        {step.label || step.kind}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
