import { prisma } from "@omnitool/database";
import { executeWorkflowRun } from "./engine";

let initialized = false;
const scheduledJobs: Map<string, ReturnType<typeof setInterval>> =
  new Map();

/**
 * Initialize the local workflow scheduler.
 *
 * - Resumes any runs that were interrupted mid-execution (status = "running")
 * - Loads all active scheduled workflows and registers interval timers
 *
 * Safe to call multiple times — subsequent calls are no-ops.
 * Intended to be called once on sidecar startup.
 */
export async function initWorkflowScheduler(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Resume any interrupted runs
  const interruptedRuns = await prisma.workflowRun.findMany({
    where: { status: "running" },
  });
  for (const run of interruptedRuns) {
    executeWorkflowRun(run.id).catch(console.error);
  }

  // Load and register scheduled workflows
  const scheduledWorkflows = await prisma.workflow.findMany({
    where: { status: "active", trigger: { kind: "schedule" } },
    include: { trigger: true },
  });

  for (const wf of scheduledWorkflows) {
    if (wf.trigger?.cronExpr) {
      registerScheduledWorkflow(wf.id, wf.trigger.cronExpr);
    }
  }

  console.log(
    `[WorkflowScheduler] Initialized with ${scheduledWorkflows.length} scheduled workflows, ${interruptedRuns.length} resumed runs`
  );
}

/**
 * Register a workflow for interval-based scheduling.
 * Replaces any existing schedule for the same workflow.
 */
export function registerScheduledWorkflow(
  workflowId: string,
  cronExpr: string
): void {
  const intervalMs = cronToIntervalMs(cronExpr);
  if (intervalMs <= 0) return;

  // Remove existing schedule if present
  unregisterScheduledWorkflow(workflowId);

  const timer = setInterval(async () => {
    try {
      const wf = await prisma.workflow.findUnique({
        where: { id: workflowId },
        include: { trigger: true },
      });
      if (!wf || wf.status !== "active") {
        unregisterScheduledWorkflow(workflowId);
        return;
      }

      const run = await prisma.workflowRun.create({
        data: {
          workflowId,
          triggerData: {
            triggeredAt: new Date().toISOString(),
            type: "schedule",
          },
          status: "pending",
        },
      });

      if (wf.trigger) {
        await prisma.workflowTrigger.update({
          where: { id: wf.trigger.id },
          data: { lastFiredAt: new Date() },
        });
      }

      executeWorkflowRun(run.id).catch(console.error);
    } catch (err) {
      console.error(
        `[WorkflowScheduler] Error firing scheduled workflow ${workflowId}:`,
        err
      );
    }
  }, intervalMs);

  scheduledJobs.set(workflowId, timer);
}

/**
 * Unregister a scheduled workflow, clearing its interval timer.
 */
export function unregisterScheduledWorkflow(workflowId: string): void {
  const existing = scheduledJobs.get(workflowId);
  if (existing) {
    clearInterval(existing);
    scheduledJobs.delete(workflowId);
  }
}

/**
 * Convert common cron expressions to a millisecond interval.
 *
 * This is a simplified mapper for the most common patterns:
 *   "* /5 * * * *" -> every 5 minutes
 *   "0 9 * * 1-5"  -> daily (24h)
 *   "0 * * * *"    -> hourly
 *
 * For production, replace with a proper cron library (e.g. node-cron)
 * that fires at exact wall-clock times and handles timezone offsets.
 */
function cronToIntervalMs(cronExpr: string): number {
  const parts = cronExpr.split(" ");
  if (parts.length !== 5) return 0;

  const [min, hour] = parts;

  // "*/N * * * *" -> every N minutes
  if (min?.startsWith("*/")) {
    const n = parseInt(min.slice(2), 10);
    if (n > 0) return n * 60 * 1000;
  }

  // Specific hour + minute -> daily (24h)
  if (hour !== "*" && min !== "*") {
    return 24 * 60 * 60 * 1000;
  }

  // Specific minute, any hour -> hourly
  if (hour === "*" && min !== "*") {
    return 60 * 60 * 1000;
  }

  // Default: daily
  return 24 * 60 * 60 * 1000;
}
