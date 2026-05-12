/**
 * Claude Code agent adapter.
 * Generates structured prompts for local Claude Code execution
 * and (when available) submits via the Anthropic agent API.
 */

export interface ClaudeCodeSubmitResult {
  taskId: string;
  status: string;
  promptFile?: string; // Path where prompt was written (for local mode)
}

export interface ClaudeCodeTaskStatus {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: {
    summary: string;
    artifacts: Array<{
      type: "patch" | "file" | "pr_url";
      content: string;
      path?: string;
    }>;
  };
}

/**
 * Submit a task to Claude Code.
 *
 * Operates in "prompt generation" mode: returns a structured prompt the
 * user can paste into their local Claude Code session. Polling later
 * relies on manual status updates from the user (see pollClaudeCodeTask).
 */
export async function submitToClaudeCode(opts: {
  prompt: string;
  repo: string;
  branch?: string;
  handoffId: string;
}): Promise<ClaudeCodeSubmitResult> {
  return {
    taskId: `local-${opts.handoffId}`,
    status: "awaiting_local_execution",
    promptFile: opts.prompt,
  };
}

/**
 * Poll Claude Code task status.
 * For local mode, this always returns the stored status.
 * For remote mode, this will query the Anthropic API.
 */
export async function pollClaudeCodeTask(
  taskId: string
): Promise<ClaudeCodeTaskStatus> {
  // Local tasks can't be polled — they rely on manual status updates
  if (taskId.startsWith("local-")) {
    return {
      id: taskId,
      status: "running", // User must manually mark complete
    };
  }

  // Remote polling (future)
  return {
    id: taskId,
    status: "running",
  };
}

/**
 * Format a handoff prompt specifically for Claude Code CLI usage.
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
