"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import { Input } from "@omnitool/ui/components/input";
import { Textarea } from "@omnitool/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@omnitool/ui/components/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@omnitool/ui/components/dialog";
import { TopbarSlot } from "@/components/layout/topbar-slot";
import {
  ArrowLeft,
  Brain,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  GitBranch,
  Loader2,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Shield,
  Trash2,
  Webhook,
  X,
  Zap,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  active:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  paused:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  draft:
    "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  archived:
    "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

const RUN_STATUS_STYLES: Record<string, string> = {
  completed:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  running:
    "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  pending:
    "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  failed:
    "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  waiting_approval:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  cancelled:
    "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
};

const STEP_KINDS = [
  { value: "agent", label: "AI Agent", icon: Brain },
  { value: "action", label: "Action", icon: Zap },
  { value: "condition", label: "Condition", icon: GitBranch },
  { value: "approval", label: "Approval", icon: Shield },
  { value: "delay", label: "Delay", icon: Clock },
] as const;

const AGENT_TYPES = ["triage", "insight", "report"] as const;

const ACTION_TYPES = [
  { value: "send_slack", label: "Send Slack Message" },
  { value: "create_issue", label: "Create Issue" },
  { value: "update_task", label: "Update Task" },
  { value: "create_note", label: "Create Note" },
  { value: "create_github_issue", label: "Create GitHub Issue" },
] as const;

const CONDITION_OPERATORS = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "gt", label: "Greater Than" },
  { value: "lt", label: "Less Than" },
  { value: "exists", label: "Exists" },
] as const;

const EVENT_TYPE_OPTIONS = [
  "issue.created",
  "issue.updated",
  "issue.closed",
  "task.created",
  "task.completed",
  "task.updated",
  "note.created",
  "note.updated",
  "github.pr.opened",
  "github.pr.merged",
  "github.pr.closed",
  "handoff.completed",
  "handoff.started",
] as const;

// ─── Step kind icon helper ──────────────────────────────────

function StepKindIcon({
  kind,
  className,
}: {
  kind: string;
  className?: string;
}) {
  const found = STEP_KINDS.find((s) => s.value === kind);
  if (!found) return <Zap className={className} />;
  const Icon = found.icon;
  return <Icon className={className} />;
}

// ─── Trigger config section ─────────────────────────────────

interface TriggerConfig {
  kind: string;
  eventTypes?: string[];
  cronExpr?: string;
  timezone?: string;
}

function TriggerSection({
  trigger,
  onChange,
  disabled,
}: {
  trigger: TriggerConfig;
  onChange: (t: TriggerConfig) => void;
  disabled: boolean;
}) {
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    trigger.eventTypes ?? [],
  );
  const [cron, setCron] = useState(trigger.cronExpr ?? "");
  const [tz, setTz] = useState(trigger.timezone ?? "America/New_York");

  useEffect(() => {
    setSelectedEvents(trigger.eventTypes ?? []);
    setCron(trigger.cronExpr ?? "");
    setTz(trigger.timezone ?? "America/New_York");
  }, [trigger]);

  function toggleEvent(evt: string) {
    const next = selectedEvents.includes(evt)
      ? selectedEvents.filter((e) => e !== evt)
      : [...selectedEvents, evt];
    setSelectedEvents(next);
    onChange({ ...trigger, eventTypes: next });
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Trigger</h3>
        <Select
          value={trigger.kind}
          onValueChange={(v) =>
            onChange({ ...trigger, kind: v })
          }
          disabled={disabled}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="event">Event</SelectItem>
            <SelectItem value="schedule">Schedule</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {trigger.kind === "event" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Select event types that trigger this workflow:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_TYPE_OPTIONS.map((evt) => {
              const active = selectedEvents.includes(evt);
              return (
                <button
                  key={evt}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleEvent(evt)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  {evt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {trigger.kind === "schedule" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Cron Expression
            </label>
            <Input
              value={cron}
              onChange={(e) => {
                setCron(e.target.value);
                onChange({ ...trigger, cronExpr: e.target.value });
              }}
              placeholder="0 9 * * 1-5"
              disabled={disabled}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {describeCron(cron)}
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Timezone
            </label>
            <Input
              value={tz}
              onChange={(e) => {
                setTz(e.target.value);
                onChange({ ...trigger, timezone: e.target.value });
              }}
              placeholder="America/New_York"
              disabled={disabled}
              className="text-sm"
            />
          </div>
        </div>
      )}

      {trigger.kind === "manual" && (
        <p className="text-xs text-muted-foreground">
          This workflow runs when manually triggered. Use the "Run Now"
          button when the workflow is active.
        </p>
      )}

      {trigger.kind === "webhook" && (
        <p className="text-xs text-muted-foreground">
          Triggered by an incoming HTTP POST to a unique webhook URL.
          The URL will be generated once the workflow is activated.
        </p>
      )}
    </div>
  );
}

/** Simple human-readable cron preview. */
function describeCron(expr: string): string {
  if (!expr.trim()) return "Enter a cron expression";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "Invalid cron (expected 5 fields)";
  const [min, hour, dom, mon, dow] = parts;
  const dayMap: Record<string, string> = {
    "1": "Mon",
    "2": "Tue",
    "3": "Wed",
    "4": "Thu",
    "5": "Fri",
    "6": "Sat",
    "0": "Sun",
    "7": "Sun",
  };

  let desc = "";
  if (min === "0" && hour !== "*") {
    desc += `At ${hour}:00`;
  } else if (min !== "*" && hour !== "*") {
    desc += `At ${hour}:${min!.padStart(2, "0")}`;
  } else if (hour === "*" && min !== "*") {
    desc += `At minute ${min} of every hour`;
  } else {
    desc += "Every minute";
  }

  if (dow !== "*") {
    const days = dow!
      .split(",")
      .flatMap((d) => {
        if (d.includes("-")) {
          const [s, e] = d.split("-").map(Number);
          const range: string[] = [];
          for (let i = s!; i <= e!; i++) range.push(dayMap[String(i)] ?? String(i));
          return range;
        }
        return [dayMap[d] ?? d];
      })
      .join(", ");
    desc += ` on ${days}`;
  }
  if (dom !== "*") desc += ` (day ${dom} of month)`;
  if (mon !== "*") desc += ` in month ${mon}`;
  return desc;
}

// ─── Step editor ────────────────────────────────────────────

interface StepDraft {
  kind: string;
  config: Record<string, unknown>;
  label?: string;
}

function StepCard({
  step,
  index,
  isEditing,
  onToggleEdit,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  disabled,
}: {
  step: StepDraft;
  index: number;
  isEditing: boolean;
  onToggleEdit: () => void;
  onChange: (s: StepDraft) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
}) {
  function configSummary(): string {
    const c = step.config;
    switch (step.kind) {
      case "agent":
        return `${(c.agentType as string) || "triage"} agent`;
      case "action":
        return (c.type as string) || "action";
      case "condition":
        return `${(c.field as string) || "?"} ${(c.operator as string) || "?"} ${String(c.value ?? "")}`;
      case "approval":
        return `Timeout: ${((c.timeout as number) ?? 0) / 3600}h`;
      case "delay":
        return `Wait ${(c.seconds as number) ?? 0}s`;
      default:
        return step.kind;
    }
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Step header row */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={onToggleEdit}
      >
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            disabled={isFirst || disabled}
            className="text-muted-foreground hover:text-foreground disabled:invisible"
            aria-label="Move step up"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            disabled={isLast || disabled}
            className="text-muted-foreground hover:text-foreground disabled:invisible"
            aria-label="Move step down"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>

        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <StepKindIcon kind={step.kind} className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <span className="mr-1.5 text-xs text-muted-foreground">
              #{index + 1}
            </span>
            {step.label || STEP_KINDS.find((s) => s.value === step.kind)?.label || step.kind}
          </p>
          {!isEditing && (
            <p className="truncate text-xs text-muted-foreground">
              {configSummary()}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={disabled}
          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
          aria-label="Remove step"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Inline config form */}
      {isEditing && (
        <div className="space-y-3 border-t px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Label
              </label>
              <Input
                value={step.label ?? ""}
                onChange={(e) =>
                  onChange({ ...step, label: e.target.value })
                }
                placeholder="Step label"
                disabled={disabled}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Kind
              </label>
              <Select
                value={step.kind}
                onValueChange={(v) =>
                  onChange({ ...step, kind: v, config: {} })
                }
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Kind-specific config */}
          {step.kind === "agent" && (
            <AgentStepConfig
              config={step.config}
              onChange={(c) => onChange({ ...step, config: c })}
              disabled={disabled}
            />
          )}
          {step.kind === "action" && (
            <ActionStepConfig
              config={step.config}
              onChange={(c) => onChange({ ...step, config: c })}
              disabled={disabled}
            />
          )}
          {step.kind === "condition" && (
            <ConditionStepConfig
              config={step.config}
              onChange={(c) => onChange({ ...step, config: c })}
              disabled={disabled}
            />
          )}
          {step.kind === "approval" && (
            <ApprovalStepConfig
              config={step.config}
              onChange={(c) => onChange({ ...step, config: c })}
              disabled={disabled}
            />
          )}
          {step.kind === "delay" && (
            <DelayStepConfig
              config={step.config}
              onChange={(c) => onChange({ ...step, config: c })}
              disabled={disabled}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AgentStepConfig({
  config,
  onChange,
  disabled,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Agent Type
        </label>
        <Select
          value={(config.agentType as string) ?? "triage"}
          onValueChange={(v) => onChange({ ...config, agentType: v })}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGENT_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="capitalize">
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Prompt Override (optional)
        </label>
        <Textarea
          value={(config.prompt as string) ?? ""}
          onChange={(e) => onChange({ ...config, prompt: e.target.value })}
          placeholder="Custom prompt for this agent step..."
          disabled={disabled}
          rows={3}
          className="text-sm"
        />
      </div>
    </div>
  );
}

function ActionStepConfig({
  config,
  onChange,
  disabled,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const params = (config.params as Record<string, unknown>) ?? {};

  function setParam(key: string, val: string) {
    onChange({ ...config, params: { ...params, [key]: val } });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Action Type
        </label>
        <Select
          value={(config.type as string) ?? ""}
          onValueChange={(v) =>
            onChange({ ...config, type: v, params: {} })
          }
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select action..." />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config.type === "send_slack" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Message Text
            </label>
            <Textarea
              value={(params.text as string) ?? ""}
              onChange={(e) => setParam("text", e.target.value)}
              placeholder="Use {step_0.text} to reference previous step output"
              disabled={disabled}
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Channel
            </label>
            <Input
              value={(params.channel as string) ?? ""}
              onChange={(e) => setParam("channel", e.target.value)}
              placeholder="#general"
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {config.type === "create_issue" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <Input
              value={(params.title as string) ?? ""}
              onChange={(e) => setParam("title", e.target.value)}
              placeholder="Issue title..."
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Description
            </label>
            <Textarea
              value={(params.description as string) ?? ""}
              onChange={(e) => setParam("description", e.target.value)}
              placeholder="Issue description..."
              disabled={disabled}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>
      )}

      {config.type === "create_note" && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Title
          </label>
          <Input
            value={(params.title as string) ?? ""}
            onChange={(e) => setParam("title", e.target.value)}
            placeholder="Note title... Use {date} for current date"
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

function ConditionStepConfig({
  config,
  onChange,
  disabled,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Field
          </label>
          <Input
            value={(config.field as string) ?? ""}
            onChange={(e) => onChange({ ...config, field: e.target.value })}
            placeholder="step_0.text"
            disabled={disabled}
            className="font-mono text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Operator
          </label>
          <Select
            value={(config.operator as string) ?? "eq"}
            onValueChange={(v) => onChange({ ...config, operator: v })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_OPERATORS.map((op) => (
                <SelectItem key={op.value} value={op.value}>
                  {op.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Value
          </label>
          <Input
            value={String(config.value ?? "")}
            onChange={(e) => onChange({ ...config, value: e.target.value })}
            placeholder="expected value"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            True: go to step #
          </label>
          <Input
            type="number"
            min={0}
            value={(config.trueStep as number) ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                trueStep: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="next (default)"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            False: go to step #
          </label>
          <Input
            type="number"
            min={0}
            value={(config.falseStep as number) ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                falseStep: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder="next (default)"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

function ApprovalStepConfig({
  config,
  onChange,
  disabled,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  const timeoutHours = Math.round(
    ((config.timeout as number) ?? 172800) / 3600,
  );
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        Timeout (hours)
      </label>
      <Input
        type="number"
        min={1}
        value={timeoutHours}
        onChange={(e) =>
          onChange({
            ...config,
            timeout: Number(e.target.value) * 3600,
          })
        }
        disabled={disabled}
      />
      <p className="text-[11px] text-muted-foreground">
        Workflow pauses until a team member approves or rejects.
      </p>
    </div>
  );
}

function DelayStepConfig({
  config,
  onChange,
  disabled,
}: {
  config: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        Delay (seconds)
      </label>
      <Input
        type="number"
        min={1}
        value={(config.seconds as number) ?? 60}
        onChange={(e) =>
          onChange({ ...config, seconds: Number(e.target.value) })
        }
        disabled={disabled}
      />
      <p className="text-[11px] text-muted-foreground">
        {((config.seconds as number) ?? 60) >= 3600
          ? `${(((config.seconds as number) ?? 60) / 3600).toFixed(1)} hours`
          : ((config.seconds as number) ?? 60) >= 60
            ? `${Math.round(((config.seconds as number) ?? 60) / 60)} minutes`
            : `${(config.seconds as number) ?? 60} seconds`}
      </p>
    </div>
  );
}

// ─── Run history section ────────────────────────────────────

function RunHistorySection({ workflowId }: { workflowId: string }) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: runsData, isLoading } = trpc.workflow.listRuns.useQuery({
    workflowId,
    limit: 20,
  });

  const resolveApproval = trpc.workflow.resolveApproval.useMutation({
    onSuccess: () => {
      toast.success("Approval resolved");
      void utils.workflow.listRuns.invalidate({ workflowId });
      void utils.workflow.getById.invalidate({ id: workflowId });
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelRun = trpc.workflow.cancelRun.useMutation({
    onSuccess: () => {
      toast.success("Run cancelled");
      void utils.workflow.listRuns.invalidate({ workflowId });
    },
    onError: (err) => toast.error(err.message),
  });

  const runs = runsData?.items ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No runs yet. Activate the workflow and trigger it to see results here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const isExpanded = expandedRunId === run.id;
        const stepResults = (run.stepResults as Record<string, unknown>) ?? {};
        const approvalData = (run.approvalData as Record<string, unknown>) ?? null;

        return (
          <div key={run.id} className="rounded-lg border bg-card">
            <button
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm"
              onClick={() =>
                setExpandedRunId(isExpanded ? null : run.id)
              }
            >
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 text-[11px] font-medium",
                  RUN_STATUS_STYLES[run.status] ??
                    RUN_STATUS_STYLES.pending,
                )}
              >
                {run.status.replace("_", " ")}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                Run #{run.id.slice(-6)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(run.startedAt)}
              </span>
              {run.status === "running" || run.status === "pending" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    cancelRun.mutate({ runId: run.id });
                  }}
                  disabled={cancelRun.isPending}
                >
                  Cancel
                </Button>
              ) : null}
            </button>

            {isExpanded && (
              <div className="space-y-3 border-t px-4 py-3">
                {run.error && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {run.error}
                  </div>
                )}

                {/* Step-by-step results */}
                {Object.keys(stepResults).length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Step Results
                    </p>
                    {Object.entries(stepResults).map(([idx, result]) => {
                      const r = result as Record<string, unknown>;
                      const output = r?.output as Record<string, unknown>;
                      return (
                        <div
                          key={idx}
                          className="rounded-md bg-muted/50 px-3 py-2 text-xs"
                        >
                          <p className="font-medium">
                            Step {Number(idx) + 1}
                          </p>
                          {output && (
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-muted-foreground">
                              {JSON.stringify(output, null, 2)}
                            </pre>
                          )}
                          {r?.completedAt ? (
                            <p className="mt-1 text-[11px] text-muted-foreground/70">
                              Completed: {formatDate(String(r.completedAt))}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Approval actions */}
                {run.status === "waiting_approval" && (
                  <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                    <Shield className="h-4 w-4 text-amber-600" />
                    <span className="flex-1 text-xs font-medium">
                      Awaiting approval
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 border-red-500/30 text-xs text-red-600 hover:bg-red-500/10"
                      onClick={() =>
                        resolveApproval.mutate({
                          runId: run.id,
                          decision: "rejected",
                        })
                      }
                      disabled={resolveApproval.isPending}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        resolveApproval.mutate({
                          runId: run.id,
                          decision: "approved",
                        })
                      }
                      disabled={resolveApproval.isPending}
                    >
                      <Check className="mr-1 h-3 w-3" />
                      Approve
                    </Button>
                  </div>
                )}

                {/* Approval result */}
                {approvalData != null && typeof approvalData.decision === "string" ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
                    <p className="font-medium">
                      Approval:{" "}
                      <span
                        className={cn(
                          approvalData.decision === "approved"
                            ? "text-emerald-600"
                            : "text-red-600",
                        )}
                      >
                        {approvalData.decision}
                      </span>
                    </p>
                    {typeof approvalData.notes === "string" ? (
                      <p className="mt-1 text-muted-foreground">
                        {approvalData.notes}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page component ────────────────────────────────────

export default function WorkflowDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const params = use(paramsPromise);
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: workflow, isLoading } = trpc.workflow.getById.useQuery(
    { id: params.workflowId },
    { enabled: Boolean(params.workflowId) },
  );

  // ── Draft state for editing ───────────────────────────────
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState<TriggerConfig>({ kind: "manual" });
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [editingStepIdx, setEditingStepIdx] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Hydrate draft from server data
  useEffect(() => {
    if (!workflow) return;
    setName(workflow.name);
    setDescription(workflow.description ?? "");
    if (workflow.trigger) {
      let eventTypes: string[] = [];
      if (workflow.trigger.eventTypes) {
        try {
          eventTypes = JSON.parse(workflow.trigger.eventTypes);
        } catch {
          eventTypes = [];
        }
      }
      setTrigger({
        kind: workflow.trigger.kind,
        eventTypes,
        cronExpr: workflow.trigger.cronExpr ?? undefined,
        timezone: workflow.trigger.timezone ?? undefined,
      });
    }
    setSteps(
      workflow.steps.map((s) => ({
        kind: s.kind,
        config: (s.config as Record<string, unknown>) ?? {},
        label: s.label ?? undefined,
      })),
    );
    setHasUnsavedChanges(false);
  }, [workflow]);

  const isActive = workflow?.status === "active";
  const isEditable = !isActive && workflow?.status !== "archived";

  // ── Mutations ─────────────────────────────────────────────

  const updateWorkflow = trpc.workflow.update.useMutation({
    onSuccess: () => {
      toast.success("Workflow saved");
      setHasUnsavedChanges(false);
      void utils.workflow.getById.invalidate({ id: params.workflowId });
    },
    onError: (err) => toast.error(err.message),
  });

  const activateWorkflow = trpc.workflow.activate.useMutation({
    onSuccess: () => {
      toast.success("Workflow activated");
      void utils.workflow.getById.invalidate({ id: params.workflowId });
      void utils.workflow.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const pauseWorkflow = trpc.workflow.pause.useMutation({
    onSuccess: () => {
      toast.success("Workflow paused");
      void utils.workflow.getById.invalidate({ id: params.workflowId });
      void utils.workflow.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteWorkflow = trpc.workflow.delete.useMutation({
    onSuccess: () => {
      toast.success("Workflow archived");
      void utils.workflow.list.invalidate();
      router.push("/workflows");
    },
    onError: (err) => toast.error(err.message),
  });

  const triggerManual = trpc.workflow.triggerManual.useMutation({
    onSuccess: () => {
      toast.success("Workflow triggered");
      void utils.workflow.listRuns.invalidate({
        workflowId: params.workflowId,
      });
      void utils.workflow.getById.invalidate({ id: params.workflowId });
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Handlers ──────────────────────────────────────────────

  function markDirty() {
    setHasUnsavedChanges(true);
  }

  function handleSave() {
    updateWorkflow.mutate({
      id: params.workflowId,
      name: name.trim() || "Untitled Workflow",
      description: description.trim() || undefined,
      trigger: {
        kind: trigger.kind as "event" | "schedule" | "manual" | "webhook",
        eventTypes:
          trigger.kind === "event" ? trigger.eventTypes : undefined,
        cronExpr:
          trigger.kind === "schedule" ? trigger.cronExpr : undefined,
        timezone:
          trigger.kind === "schedule" ? trigger.timezone : undefined,
      },
      steps: steps.map((s) => ({
        kind: s.kind as
          | "agent"
          | "action"
          | "condition"
          | "approval"
          | "delay"
          | "parallel",
        config: s.config,
        label: s.label,
      })),
    });
  }

  function addStep(atIndex?: number) {
    const newStep: StepDraft = {
      kind: "action",
      config: {},
      label: "",
    };
    const idx = atIndex ?? steps.length;
    const next = [...steps];
    next.splice(idx, 0, newStep);
    setSteps(next);
    setEditingStepIdx(idx);
    markDirty();
  }

  function updateStep(idx: number, step: StepDraft) {
    const next = [...steps];
    next[idx] = step;
    setSteps(next);
    markDirty();
  }

  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx));
    setEditingStepIdx(null);
    markDirty();
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    setSteps(next);
    setEditingStepIdx(target);
    markDirty();
  }

  // ── Loading ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="mx-auto w-full max-w-5xl p-6">
        <p className="text-sm text-muted-foreground">Workflow not found.</p>
        <Button
          variant="ghost"
          className="mt-2"
          onClick={() => router.push("/workflows")}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Workflows
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <TopbarSlot target="actions">
        <div className="flex items-center gap-2">
          {isEditable && hasUnsavedChanges && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updateWorkflow.isPending}
            >
              {updateWorkflow.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1 h-4 w-4" />
              )}
              Save
            </Button>
          )}
          {isActive && workflow.trigger?.kind === "manual" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                triggerManual.mutate({ workflowId: params.workflowId })
              }
              disabled={triggerManual.isPending}
            >
              {triggerManual.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              Run Now
            </Button>
          )}
        </div>
      </TopbarSlot>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          {isEditable ? (
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                markDirty();
              }}
              className="border-none bg-transparent p-0 text-2xl font-bold shadow-none focus-visible:ring-0"
              placeholder="Workflow name"
            />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs font-medium capitalize",
                STATUS_STYLES[workflow.status] ?? STATUS_STYLES.draft,
              )}
            >
              {workflow.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Created {formatDate(workflow.createdAt)}
            </span>
          </div>

          {isEditable ? (
            <Textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                markDirty();
              }}
              placeholder="Add a description..."
              className="min-h-[40px] resize-none border-none bg-transparent p-0 text-sm text-muted-foreground shadow-none focus-visible:ring-0"
              rows={1}
            />
          ) : (
            description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {workflow.status === "draft" || workflow.status === "paused" ? (
            <Button
              size="sm"
              onClick={() =>
                activateWorkflow.mutate({ id: params.workflowId })
              }
              disabled={activateWorkflow.isPending}
            >
              {activateWorkflow.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-1 h-4 w-4" />
              )}
              Activate
            </Button>
          ) : workflow.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                pauseWorkflow.mutate({ id: params.workflowId })
              }
              disabled={pauseWorkflow.isPending}
            >
              {pauseWorkflow.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Pause className="mr-1 h-4 w-4" />
              )}
              Pause
            </Button>
          ) : null}

          {workflow.status !== "archived" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {/* Tabs: Builder / Run History */}
      <Tabs defaultValue="builder">
        <TabsList>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="runs">
            Run History
            {workflow.runs && workflow.runs.length > 0 && (
              <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-medium">
                {workflow.runs.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="mt-4 space-y-4">
          {/* Trigger */}
          <TriggerSection
            trigger={trigger}
            onChange={(t) => {
              setTrigger(t);
              markDirty();
            }}
            disabled={!isEditable}
          />

          {/* Steps */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Steps</h3>
              {isEditable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addStep()}
                  className="h-7 text-xs"
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add Step
                </Button>
              )}
            </div>

            {steps.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No steps yet.
                </p>
                {isEditable && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => addStep()}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Add your first step
                  </Button>
                )}
              </div>
            )}

            {steps.map((step, i) => (
              <div key={i}>
                <StepCard
                  step={step}
                  index={i}
                  isEditing={editingStepIdx === i}
                  onToggleEdit={() =>
                    setEditingStepIdx(editingStepIdx === i ? null : i)
                  }
                  onChange={(s) => updateStep(i, s)}
                  onRemove={() => removeStep(i)}
                  onMoveUp={() => moveStep(i, -1)}
                  onMoveDown={() => moveStep(i, 1)}
                  isFirst={i === 0}
                  isLast={i === steps.length - 1}
                  disabled={!isEditable}
                />
                {/* Add step between */}
                {isEditable && i < steps.length - 1 && (
                  <div className="flex justify-center py-1">
                    <button
                      type="button"
                      onClick={() => addStep(i + 1)}
                      className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                      aria-label="Add step here"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          <RunHistorySection workflowId={params.workflowId} />
        </TabsContent>
      </Tabs>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Archive workflow?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will archive{" "}
            <span className="font-medium text-foreground">
              "{workflow.name}"
            </span>
            . The workflow will stop running but run history is preserved.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteConfirm(false)}
              disabled={deleteWorkflow.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteWorkflow.mutate({ id: params.workflowId })
              }
              disabled={deleteWorkflow.isPending}
            >
              {deleteWorkflow.isPending ? "Archiving..." : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
