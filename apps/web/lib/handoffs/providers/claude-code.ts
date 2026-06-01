/**
 * Claude Code agent adapter.
 *
 * Runs the handoff headlessly via the Anthropic Agent SDK (`query()`), the
 * documented mechanism for automation without a terminal. The SDK run is
 * long-lived (well beyond a single request), so `submitToClaudeCode` kicks it
 * off in the background and returns immediately with a task id; the result is
 * stored in-process and read back by `pollClaudeCodeTask` (which the cron
 * poller calls). This mirrors the codex submit/poll split.
 *
 * Auth is resolved from the local environment the sidecar already runs under
 * (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` gateway, a `CLAUDE_CODE_OAUTH_TOKEN`
 * from `claude setup-token`, or Bedrock/Vertex/Foundry flags) — see
 * `hasLocalClaudeAuth`. The subscription OAuth token reuses your Claude plan
 * without a metered API key; the bundled CLI honors it in normal (non `--bare`)
 * mode. The SDK will NOT silently fall back to the interactive claude.ai login,
 * so when no auth is present (or the SDK can't be loaded) the adapter gracefully
 * degrades to "prompt generation" mode: the task stays awaiting local execution
 * and the user finishes it via the `handoff.markComplete` mutation — preserving
 * the prior behavior.
 *
 * Observability: the headless run wires the Agent SDK PreToolUse / PostToolUse
 * / Stop lifecycle hooks to `recordRunEvent` (see `../run-events`), which feeds
 * the existing activity-event stream plus an in-process per-task buffer. The
 * SDK's own OTEL spans are unreliable for this path, so we capture run
 * telemetry ourselves via the hooks (which do fire). Hooks are resilient and
 * never throw.
 */

import { recordRunEvent } from "../run-events";

export interface ClaudeCodeSubmitResult {
  taskId: string;
  status: string;
  promptFile?: string; // Path/prompt surfaced for local mode
}

export type ClaudeCodeArtifact = {
  type: "patch" | "file" | "pr_url";
  content: string;
  path?: string;
};

export interface ClaudeCodeTaskStatus {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: {
    summary: string;
    artifacts: ClaudeCodeArtifact[];
  };
  error?: string;
}

/**
 * Minimal structural typings for the bits of `@anthropic-ai/claude-agent-sdk`
 * we consume. Declared locally (rather than imported) so the module stays an
 * optional runtime dependency — the file compiles whether or not the package
 * is present in node_modules.
 */
interface AgentSdkResultMessage {
  type: "result";
  subtype: string;
  result?: string;
  errors?: string[];
}
interface AgentSdkMessage {
  type: string;
}
function isResultMessage(m: AgentSdkMessage): m is AgentSdkResultMessage {
  return m.type === "result";
}

/**
 * Structural typings for the subset of the SDK hook API we consume. The hook
 * input is a discriminated union on `hook_event_name`; a hook callback returns
 * a (possibly empty) JSON output object — `{}` means "no-op, continue".
 */
interface AgentSdkHookInput {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_use_id?: string;
  duration_ms?: number;
  last_assistant_message?: string;
  session_id?: string;
}
type AgentSdkHookCallback = (
  input: AgentSdkHookInput,
  toolUseId: string | undefined,
  ctx: { signal?: AbortSignal }
) => Promise<Record<string, unknown>>;
interface AgentSdkHookMatcher {
  matcher?: string;
  hooks: AgentSdkHookCallback[];
  timeout?: number;
}
type AgentSdkHooks = Partial<
  Record<"PreToolUse" | "PostToolUse" | "Stop", AgentSdkHookMatcher[]>
>;

type AgentSdkQuery = (args: {
  prompt: string;
  options?: {
    permissionMode?: string;
    allowDangerouslySkipPermissions?: boolean;
    systemPrompt?: { type: "preset"; preset: "claude_code"; append?: string };
    env?: Record<string, string>;
    cwd?: string;
    hooks?: AgentSdkHooks;
  };
}) => AsyncIterable<AgentSdkMessage>;

const TASK_ID_PREFIX = "claude-code-";

/**
 * In-process store of headless run outcomes, keyed by task id. The cron poller
 * (and on-demand re-poll) reads this via `pollClaudeCodeTask`. In-memory by
 * design — same single-process tradeoff as the background-tasks store; a run
 * lost to a restart simply reverts to "running" and can be resubmitted.
 */
const runStore = new Map<string, ClaudeCodeTaskStatus>();

/**
 * Whether the sidecar's local environment carries auth the bundled Claude Code
 * runtime can use. Recognized (in precedence): cloud-provider creds
 * (Bedrock/Vertex/Foundry), `ANTHROPIC_AUTH_TOKEN` (gateway), `ANTHROPIC_API_KEY`,
 * and a `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` (reuses the Claude
 * subscription; honored by the bundled CLI outside `--bare` mode). Returns false
 * when nothing usable is configured (→ local-execution fallback).
 */
function hasLocalClaudeAuth(): boolean {
  const e = process.env;
  return Boolean(
    e.ANTHROPIC_API_KEY?.trim() ||
      e.ANTHROPIC_AUTH_TOKEN?.trim() ||
      e.CLAUDE_CODE_OAUTH_TOKEN?.trim() ||
      e.CLAUDE_CODE_USE_BEDROCK === "1" ||
      e.CLAUDE_CODE_USE_VERTEX === "1" ||
      e.CLAUDE_CODE_USE_FOUNDRY === "1"
  );
}

/**
 * Submit a task to Claude Code.
 *
 * With an Anthropic API key configured, this starts a real headless Agent SDK
 * run in the background and returns a task id immediately. Without a key, it
 * falls back to local prompt-generation mode (manual completion via tRPC).
 */
export async function submitToClaudeCode(opts: {
  prompt: string;
  repo: string;
  branch?: string;
  handoffId: string;
  /** Project the handoff belongs to — used to attribute run-event telemetry. */
  projectId?: string | null;
}): Promise<ClaudeCodeSubmitResult> {
  // No usable local auth → keep the legacy local-execution contract so manual
  // markComplete still works and nothing breaks for users without Claude auth
  // configured in the sidecar environment.
  if (!hasLocalClaudeAuth()) {
    return {
      taskId: `local-${opts.handoffId}`,
      status: "awaiting_local_execution",
      promptFile: opts.prompt,
    };
  }

  const taskId = `${TASK_ID_PREFIX}${opts.handoffId}`;
  runStore.set(taskId, { id: taskId, status: "running" });

  // Mark the run as started in the observability stream (resilient — never
  // throws, so a telemetry failure can't block submission).
  void recordRunEvent({
    handoffId: opts.handoffId,
    taskId,
    projectId: opts.projectId,
    phase: "submitted",
  });

  // Fire-and-forget: the run outlives the request. Result lands in runStore.
  void runHeadlessClaudeCode(taskId, opts).catch((err) => {
    runStore.set(taskId, {
      id: taskId,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { taskId, status: "running" };
}

/**
 * Execute the handoff prompt headlessly via the Agent SDK and record the
 * outcome in `runStore`. Dynamically imports the SDK so a missing/uninstalled
 * package degrades to a clear failure status instead of breaking the bundle.
 */
async function runHeadlessClaudeCode(
  taskId: string,
  opts: {
    prompt: string;
    repo: string;
    branch?: string;
    handoffId: string;
    projectId?: string | null;
  }
): Promise<void> {
  // Loaded at runtime via an indirected specifier — the dependency is optional,
  // so it is not statically resolved (keeps typecheck/build green even before
  // the package is installed). Declared in package.json; install adds it.
  let query: AgentSdkQuery;
  try {
    const sdkModule = "@anthropic-ai/claude-agent-sdk";
    const mod = (await import(/* @vite-ignore */ sdkModule)) as {
      query: AgentSdkQuery;
    };
    query = mod.query;
  } catch {
    runStore.set(taskId, {
      id: taskId,
      status: "failed",
      error:
        "@anthropic-ai/claude-agent-sdk is not installed; run pnpm install",
    });
    return;
  }

  let summary = "";
  let errorMessage: string | undefined;

  const hooks = buildRunObservabilityHooks(
    taskId,
    opts.handoffId,
    opts.projectId
  );

  for await (const message of query({
    prompt: opts.prompt,
    options: {
      // Headless automation: no interactive prompts. The run executes in an
      // ephemeral working directory; artifacts surface in the final summary.
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      systemPrompt: { type: "preset", preset: "claude_code" },
      // No `env` override: the spawned CLI inherits the sidecar's own
      // environment, reusing whatever local Claude auth is configured. We must
      // NOT inject ANTHROPIC_API_KEY="" — an empty key takes precedence and
      // breaks auth (leave it unset instead, per Anthropic docs).
      // PreToolUse / PostToolUse / Stop lifecycle hooks → structured run
      // events. Hooks observe only; they never block (always return `{}`).
      hooks,
    },
  })) {
    if (isResultMessage(message)) {
      if (message.subtype === "success") {
        summary = message.result ?? "";
      } else {
        errorMessage = message.errors?.join("; ") || message.subtype;
      }
    }
  }

  if (errorMessage) {
    runStore.set(taskId, { id: taskId, status: "failed", error: errorMessage });
    void recordRunEvent({
      handoffId: opts.handoffId,
      taskId,
      projectId: opts.projectId,
      phase: "failed",
      detail: errorMessage,
    });
    return;
  }

  runStore.set(taskId, {
    id: taskId,
    status: "completed",
    result: {
      summary: summary.slice(0, 5000) || "Task completed",
      artifacts: extractArtifacts(summary),
    },
  });
}

/**
 * Build the PreToolUse / PostToolUse / Stop hook set for a run. Each hook only
 * observes — it records a structured run event and returns `{}` (continue) so
 * it never alters or blocks agent behavior. All hooks are wrapped so a failure
 * inside them is swallowed (the agent loop must never break on telemetry).
 */
function buildRunObservabilityHooks(
  taskId: string,
  handoffId: string,
  projectId?: string | null
): {
  PreToolUse: AgentSdkHookMatcher[];
  PostToolUse: AgentSdkHookMatcher[];
  Stop: AgentSdkHookMatcher[];
} {
  const preToolUse: AgentSdkHookCallback = async (input) => {
    try {
      if (input.hook_event_name === "PreToolUse") {
        void recordRunEvent({
          handoffId,
          taskId,
          projectId,
          phase: "tool_started",
          tool: input.tool_name,
          toolUseId: input.tool_use_id,
        });
      }
    } catch {
      // Never throw out of a hook.
    }
    return {};
  };

  const postToolUse: AgentSdkHookCallback = async (input) => {
    try {
      if (input.hook_event_name === "PostToolUse") {
        void recordRunEvent({
          handoffId,
          taskId,
          projectId,
          phase: "tool_finished",
          tool: input.tool_name,
          toolUseId: input.tool_use_id,
          durationMs: input.duration_ms,
        });
      }
    } catch {
      // Never throw out of a hook.
    }
    return {};
  };

  const stop: AgentSdkHookCallback = async (input) => {
    try {
      if (input.hook_event_name === "Stop") {
        void recordRunEvent({
          handoffId,
          taskId,
          projectId,
          phase: "stopped",
          detail: input.last_assistant_message,
        });
      }
    } catch {
      // Never throw out of a hook.
    }
    return {};
  };

  return {
    PreToolUse: [{ hooks: [preToolUse] }],
    PostToolUse: [{ hooks: [postToolUse] }],
    Stop: [{ hooks: [stop] }],
  };
}

/**
 * Best-effort extraction of structured artifacts from the run summary. The
 * headless run reports a PR URL or branch in its final message; we surface any
 * such URL as a `pr_url` artifact so the review UI can link out.
 */
function extractArtifacts(summary: string): ClaudeCodeArtifact[] {
  const artifacts: ClaudeCodeArtifact[] = [];
  const prUrlMatch = summary.match(
    /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/
  );
  if (prUrlMatch) {
    artifacts.push({ type: "pr_url", content: prUrlMatch[0] });
  }
  return artifacts;
}

/**
 * Poll Claude Code task status.
 *
 * Headless runs read their outcome from the in-process `runStore`. Legacy
 * `local-` tasks (no API key at submit time) always report "running" — they
 * are advanced manually via the `handoff.markComplete` tRPC mutation.
 */
export async function pollClaudeCodeTask(
  taskId: string
): Promise<ClaudeCodeTaskStatus> {
  if (taskId.startsWith(TASK_ID_PREFIX)) {
    return (
      runStore.get(taskId) ?? {
        id: taskId,
        // Unknown to this process (e.g. lost to a restart) → treat as running
        // so the cron poller leaves it for manual completion rather than
        // marking it failed.
        status: "running",
      }
    );
  }

  // Legacy local tasks rely on manual status updates from the user.
  return {
    id: taskId,
    status: "running",
  };
}

/**
 * Format a handoff prompt specifically for Claude Code usage.
 * Wraps the context in Claude Code-friendly format with directives.
 */
export function formatForClaudeCodeCLI(
  prompt: string,
  repo: string
): string {
  return `# Claude Code Task

## Repository
${repo}

## Instructions
${prompt}

## Execution Notes
- Create a feature branch from main
- Make atomic commits with clear messages
- Run tests before completing
- Create a PR when done and report the URL
`;
}
