/**
 * Layer 1 unit tests for the Claude Code handoff provider.
 *
 * The provider runs the headless agent loop by dynamically importing
 * `@anthropic-ai/claude-agent-sdk` and consuming the `query()` async iterable.
 * Here we `vi.mock` that package with a controllable fake `query()` so the test
 * is fully deterministic and never touches the real SDK or network.
 *
 * `../run-events` is mocked too: the real module imports the activity-event
 * plumbing (Prisma), which has no place in a pure unit test. We only assert
 * that the provider transitions task state correctly and surfaces the run
 * result through `pollClaudeCodeTask`.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";

// --- Mocks -----------------------------------------------------------------

/** Per-test control over what the fake SDK `query()` yields. */
const sdkState: {
  messages: Array<Record<string, unknown>>;
  lastOptions?: Record<string, unknown>;
} = { messages: [] };

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (args: { prompt: string; options?: Record<string, unknown> }) => {
    sdkState.lastOptions = args.options;
    return (async function* () {
      for (const m of sdkState.messages) {
        yield m;
      }
    })();
  },
}));

// Stub the observability module so the provider doesn't reach into Prisma.
const recordRunEvent = vi.fn(async (..._args: unknown[]) => {});
vi.mock("../run-events", () => ({
  recordRunEvent: (...args: unknown[]) => recordRunEvent(...args),
}));

// --- Helpers ---------------------------------------------------------------

/**
 * Poll until the task leaves "running" or we exhaust attempts. The headless
 * run is fire-and-forget, so we let the event loop drain between polls.
 */
async function pollUntilSettled(
  poll: (taskId: string) => Promise<{ status: string }>,
  taskId: string,
  maxTries = 50
): Promise<{ status: string }> {
  let last = await poll(taskId);
  for (let i = 0; i < maxTries && last.status === "running"; i++) {
    await new Promise((r) => setTimeout(r, 0));
    last = await poll(taskId);
  }
  return last as { status: string };
}

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  sdkState.messages = [];
  sdkState.lastOptions = undefined;
  recordRunEvent.mockClear();
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

// --- Tests -----------------------------------------------------------------

describe("submitToClaudeCode", () => {
  it("starts a headless run and returns a running task id when an API key is set", async () => {
    sdkState.messages = [
      { type: "result", subtype: "success", result: "All done." },
    ];
    const { submitToClaudeCode } = await import("./claude-code");

    const res = await submitToClaudeCode({
      prompt: "Refactor the auth module",
      repo: "acme/app",
      handoffId: "h1",
    });

    expect(res.status).toBe("running");
    expect(res.taskId).toBe("claude-code-h1");
    // The submit path records a "submitted" run event.
    expect(recordRunEvent).toHaveBeenCalled();
  });

  it("starts a headless run using a subscription OAuth token (no API key)", async () => {
    // `claude setup-token` flow: the only auth present is the subscription
    // token, which must still activate a real run (not the local fallback).
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "sk-ant-oat-test";
    sdkState.messages = [
      { type: "result", subtype: "success", result: "done" },
    ];
    const { submitToClaudeCode } = await import("./claude-code");

    const res = await submitToClaudeCode({
      prompt: "do it",
      repo: "acme/app",
      handoffId: "h6",
    });

    expect(res.status).toBe("running");
    expect(res.taskId).toBe("claude-code-h6");
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  it("falls back to local-execution mode when no API key is configured", async () => {
    // Clear every auth source `hasLocalClaudeAuth` checks so the fallback is
    // deterministic regardless of the developer's ambient environment.
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.CLAUDE_CODE_USE_BEDROCK;
    delete process.env.CLAUDE_CODE_USE_VERTEX;
    delete process.env.CLAUDE_CODE_USE_FOUNDRY;
    const { submitToClaudeCode } = await import("./claude-code");

    const res = await submitToClaudeCode({
      prompt: "do the thing",
      repo: "acme/app",
      handoffId: "h2",
    });

    expect(res.status).toBe("awaiting_local_execution");
    expect(res.taskId).toBe("local-h2");
    expect(res.promptFile).toBe("do the thing");
  });

  it("passes PreToolUse / PostToolUse / Stop hooks into the SDK query", async () => {
    sdkState.messages = [
      { type: "result", subtype: "success", result: "done" },
    ];
    const { submitToClaudeCode, pollClaudeCodeTask } = await import(
      "./claude-code"
    );

    await submitToClaudeCode({
      prompt: "p",
      repo: "acme/app",
      handoffId: "h3",
    });
    await pollUntilSettled(pollClaudeCodeTask, "claude-code-h3");

    const hooks = sdkState.lastOptions?.hooks as
      | Record<string, unknown>
      | undefined;
    expect(hooks).toBeDefined();
    expect(hooks).toHaveProperty("PreToolUse");
    expect(hooks).toHaveProperty("PostToolUse");
    expect(hooks).toHaveProperty("Stop");
  });
});

describe("pollClaudeCodeTask", () => {
  it("reflects completion with the run summary once the SDK run succeeds", async () => {
    sdkState.messages = [
      { type: "assistant" },
      {
        type: "result",
        subtype: "success",
        result: "Opened https://github.com/acme/app/pull/42",
      },
    ];
    const { submitToClaudeCode, pollClaudeCodeTask } = await import(
      "./claude-code"
    );

    await submitToClaudeCode({
      prompt: "ship it",
      repo: "acme/app",
      handoffId: "h4",
    });

    const settled = await pollClaudeCodeTask("claude-code-h4").then((s) =>
      s.status === "running"
        ? pollUntilSettled(pollClaudeCodeTask, "claude-code-h4")
        : s
    );

    const final = await pollClaudeCodeTask("claude-code-h4");
    expect(final.status).toBe("completed");
    expect(final.result?.summary).toContain("pull/42");
    // The PR URL is surfaced as a pr_url artifact for the review UI.
    expect(final.result?.artifacts?.[0]).toMatchObject({
      type: "pr_url",
      content: "https://github.com/acme/app/pull/42",
    });
    expect(settled.status).toBe("completed");
  });

  it("reflects failure when the SDK run reports an error result", async () => {
    sdkState.messages = [
      {
        type: "result",
        subtype: "error_max_turns",
        errors: ["hit the turn limit"],
      },
    ];
    const { submitToClaudeCode, pollClaudeCodeTask } = await import(
      "./claude-code"
    );

    await submitToClaudeCode({
      prompt: "loop forever",
      repo: "acme/app",
      handoffId: "h5",
    });
    const settled = await pollUntilSettled(
      pollClaudeCodeTask,
      "claude-code-h5"
    );

    expect(settled.status).toBe("failed");
    const final = await pollClaudeCodeTask("claude-code-h5");
    expect(final.status).toBe("failed");
    expect((final as { error?: string }).error).toContain("turn limit");
  });

  it("treats an unknown claude-code task as running (left for manual completion)", async () => {
    const { pollClaudeCodeTask } = await import("./claude-code");
    const res = await pollClaudeCodeTask("claude-code-never-submitted");
    expect(res.status).toBe("running");
  });
});
