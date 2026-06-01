import { prisma } from "@omnitool/database";
import type { Prisma } from "@omnitool/database";
import { createLogger } from "@/lib/observability/logger";

const log = createLogger("workflow");

// ─── Public API ─────────────────────────────────────────────

/**
 * Execute a workflow run from its current step through completion.
 *
 * Called fire-and-forget from the tRPC router (manual trigger,
 * approval resolution) and from the event-trigger matcher in
 * `lib/activity/emit.ts`. Also called by the scheduler for
 * cron-based workflows and to resume interrupted runs on startup.
 */
export async function executeWorkflowRun(runId: string): Promise<void> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: {
      workflow: {
        include: { steps: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!run || !run.workflow) return;

  // Mark as running
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { status: "running" },
  });

  const steps = run.workflow.steps;
  let currentStep = run.currentStep;
  let context = (run.context as Record<string, unknown>) || {};
  const stepResults: Record<string, unknown> =
    (run.stepResults as Record<string, unknown>) || {};

  try {
    while (currentStep < steps.length) {
      // Re-check run status (may have been cancelled externally)
      const freshRun = await prisma.workflowRun.findUnique({
        where: { id: runId },
        select: { status: true },
      });
      if (freshRun?.status === "cancelled") return;

      const step = steps[currentStep];
      if (!step) break;

      const result = await executeStep(
        step.kind,
        step.config as Record<string, unknown>,
        context,
        run
      );

      // Handle approval gate — pause execution until human resolves
      if (result.status === "waiting_approval") {
        await prisma.workflowRun.update({
          where: { id: runId },
          data: {
            status: "waiting_approval",
            currentStep,
            stepResults: stepResults as Prisma.InputJsonValue,
            context: context as Prisma.InputJsonValue,
            approvalData: result.data as Prisma.InputJsonValue,
          },
        });
        return; // Execution resumes when resolveApproval is called
      }

      // Handle delay step — sleep in-process then continue
      if (result.status === "delay") {
        await prisma.workflowRun.update({
          where: { id: runId },
          data: { currentStep, stepResults: stepResults as Prisma.InputJsonValue, context: context as Prisma.InputJsonValue, status: "running" },
        });
        const delayMs =
          ((step.config as Record<string, unknown>)?.seconds as number ??
            60) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      // Record step result and merge output into context
      stepResults[String(currentStep)] = {
        output: result.output,
        completedAt: new Date().toISOString(),
      };
      if (result.output) {
        context = { ...context, [`step_${currentStep}`]: result.output };
      }

      // Handle condition branching (jump to trueStep or falseStep)
      if (step.kind === "condition" && result.branch !== undefined) {
        const config = step.config as Record<string, unknown>;
        currentStep =
          result.branch === "true"
            ? ((config.trueStep as number) ?? currentStep + 1)
            : ((config.falseStep as number) ?? currentStep + 1);
      } else {
        currentStep++;
      }

      // Persist progress after each step
      await prisma.workflowRun.update({
        where: { id: runId },
        data: { currentStep, stepResults: stepResults as Prisma.InputJsonValue, context: context as Prisma.InputJsonValue },
      });
    }

    // All steps completed successfully
    await prisma.workflowRun.update({
      where: { id: runId },
      data: { status: "completed", completedAt: new Date() },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error("Workflow run failed", err, {
      runId,
      workflowId: run.workflowId,
      currentStep,
    });
    await prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        error: errorMsg,
        completedAt: new Date(),
      },
    });
  }
}

// ─── Step dispatcher ────────────────────────────────────────

interface StepResult {
  status: "ok" | "waiting_approval" | "delay";
  output?: unknown;
  branch?: "true" | "false";
  data?: unknown;
}

async function executeStep(
  kind: string,
  config: Record<string, unknown>,
  context: Record<string, unknown>,
  run: Record<string, unknown>
): Promise<StepResult> {
  switch (kind) {
    case "agent":
      return executeAgentStep(config, context, run);
    case "action":
      return executeActionStep(config, context);
    case "condition":
      return executeConditionStep(config, context);
    case "approval":
      return { status: "waiting_approval", data: config };
    case "delay":
      return { status: "delay" };
    default:
      return { status: "ok" };
  }
}

// ─── Agent step (AI text generation) ────────────────────────

async function executeAgentStep(
  config: Record<string, unknown>,
  context: Record<string, unknown>,
  run: Record<string, unknown>
): Promise<StepResult> {
  try {
    const { generateText } = await import("ai");
    const { getOmniLanguageModel } = await import(
      "@/lib/ai/language-model"
    );

    const resolved = getOmniLanguageModel();
    if (!resolved) {
      return {
        status: "ok",
        output: {
          agentType: config.agentType,
          error: "No AI provider configured (set NVIDIA_API_KEY or ANTHROPIC_API_KEY)",
        },
      };
    }

    const agentType = config.agentType as string;
    const prompt =
      (config.prompt as string) ||
      `Execute ${agentType} analysis on the following context.`;

    const systemPrompt = [
      `You are an automated ${agentType} agent in a workflow system.`,
      `Analyze the provided context and produce actionable output.`,
      ``,
      `Workflow context:`,
      JSON.stringify(context, null, 2),
      ``,
      `Trigger data:`,
      JSON.stringify(run.triggerData ?? {}, null, 2),
    ].join("\n");

    const result = await generateText({
      model: resolved.model,
      system: systemPrompt,
      prompt,
      maxOutputTokens: 2000,
    });

    return {
      status: "ok",
      output: { agentType, text: result.text },
    };
  } catch (err) {
    log.error("Agent step failed", err, { agentType: config.agentType });
    return {
      status: "ok",
      output: {
        agentType: config.agentType,
        error: String(err),
      },
    };
  }
}

// ─── Action step (side effects) ─────────────────────────────

async function executeActionStep(
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<StepResult> {
  const actionType = config.type as string;
  const params = (config.params as Record<string, unknown>) || {};

  switch (actionType) {
    case "send_slack": {
      try {
        const { createSlackClient } = await import(
          "@omnitool/integrations"
        );
        const { sendSlackMessage } = await import(
          "@omnitool/integrations/providers/slack"
        );
        const userId = params.userId as string;
        const channel = params.channel as string;
        const text = interpolateTemplate(
          (params.text as string) || "",
          context
        );
        const client = await createSlackClient(userId);
        await sendSlackMessage(client, channel, text);
        return { status: "ok", output: { sent: true, channel } };
      } catch (err) {
        log.error("Action send_slack failed", err);
        return {
          status: "ok",
          output: { sent: false, error: String(err) },
        };
      }
    }

    case "create_issue": {
      const issue = await prisma.issue.create({
        data: {
          title: interpolateTemplate(
            (params.title as string) || "",
            context
          ),
          description: interpolateTemplate(
            (params.description as string) || "",
            context
          ),
          projectId: params.projectId as string,
          reporterId: params.reporterId as string,
          identifier: `AUTO-${Date.now()}`,
          priority: (params.priority as string) || "MEDIUM",
        },
      });
      return { status: "ok", output: { issueId: issue.id } };
    }

    case "update_task": {
      await prisma.task.update({
        where: { id: params.taskId as string },
        data: {
          ...(params.status ? { status: params.status as string } : {}),
          ...(params.priority
            ? { priority: params.priority as string }
            : {}),
        },
      });
      return { status: "ok", output: { updated: true } };
    }

    case "create_note": {
      const note = await prisma.note.create({
        data: {
          title: interpolateTemplate(
            (params.title as string) || "Workflow Note",
            context
          ),
          contentText: interpolateTemplate(
            (params.content as string) || "",
            context
          ),
          authorId: params.authorId as string,
          teamId: params.teamId as string,
        },
      });
      return { status: "ok", output: { noteId: note.id } };
    }

    case "create_notion_page": {
      try {
        const { createNotionPage } = await import(
          "@omnitool/integrations/providers/notion"
        );
        const userId = params.userId as string;
        const result = await createNotionPage(userId, {
          parentDatabaseId: params.parentDatabaseId as string | undefined,
          parentPageId: params.parentPageId as string | undefined,
          title: interpolateTemplate(
            (params.title as string) || "Workflow Page",
            context,
          ),
          content: interpolateTemplate(
            (params.content as string) || "",
            context,
          ),
        });
        return {
          status: "ok",
          output: { pageId: result.id, url: result.url },
        };
      } catch (err) {
        log.error("Action create_notion_page failed", err);
        return {
          status: "ok",
          output: { created: false, error: String(err) },
        };
      }
    }

    case "append_notion_block": {
      try {
        const { appendNotionBlock } = await import(
          "@omnitool/integrations/providers/notion"
        );
        const userId = params.userId as string;
        const pageId = params.pageId as string;
        const content = interpolateTemplate(
          (params.content as string) || "",
          context,
        );
        await appendNotionBlock(userId, { pageId, content });
        return { status: "ok", output: { appended: true, pageId } };
      } catch (err) {
        log.error("Action append_notion_block failed", err);
        return {
          status: "ok",
          output: { appended: false, error: String(err) },
        };
      }
    }

    default:
      return {
        status: "ok",
        output: { action: actionType, skipped: true },
      };
  }
}

// ─── Condition step (branching) ─────────────────────────────

async function executeConditionStep(
  config: Record<string, unknown>,
  context: Record<string, unknown>
): Promise<StepResult> {
  const field = config.field as string;
  const operator = config.operator as string;
  const value = config.value;

  const actual = getNestedValue(context, field);
  let result = false;

  switch (operator) {
    case "eq":
      result = actual === value;
      break;
    case "neq":
      result = actual !== value;
      break;
    case "contains":
      result = String(actual).includes(String(value));
      break;
    case "gt":
      result = Number(actual) > Number(value);
      break;
    case "lt":
      result = Number(actual) < Number(value);
      break;
    case "exists":
      result = actual !== undefined && actual !== null;
      break;
    default:
      result = false;
  }

  return { status: "ok", branch: result ? "true" : "false" };
}

// ─── Helpers ────────────────────────────────────────────────

function getNestedValue(
  obj: Record<string, unknown>,
  path: string
): unknown {
  return path.split(".").reduce((cur: any, key) => cur?.[key], obj);
}

function interpolateTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{([^}]+)\}/g, (_, path: string) => {
    const val = getNestedValue(context, path);
    return val !== undefined ? String(val) : `{${path}}`;
  });
}
