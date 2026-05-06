/**
 * OpenAI Codex agent adapter.
 * Submits tasks via the Codex API and polls for results.
 */

export interface CodexSubmitResult {
  taskId: string;
  status: string;
}

export interface CodexTaskStatus {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  result?: {
    summary: string;
    artifacts: Array<{
      type: "patch" | "file" | "pr_url";
      content: string;
      path?: string;
    }>;
  };
  error?: string;
}

/**
 * Submit a task to the Codex API.
 */
export async function submitToCodex(opts: {
  prompt: string;
  repo: string;
  branch?: string;
}): Promise<CodexSubmitResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured for Codex handoffs");
  }

  // Codex API endpoint (OpenAI's code agent)
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "codex-mini-latest",
      instructions: opts.prompt,
      tools: [
        {
          type: "codex",
          container: {
            image: "universal",
            environment: {
              GITHUB_REPO: opts.repo,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Codex API error: ${response.status} — ${err}`);
  }

  const data = (await response.json()) as { id: string; status: string };
  return { taskId: data.id, status: data.status };
}

/**
 * Poll Codex task status.
 */
export async function pollCodexTask(taskId: string): Promise<CodexTaskStatus> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const response = await fetch(
    `https://api.openai.com/v1/responses/${taskId}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Codex poll error: ${response.status}`);
  }

  const data = (await response.json()) as {
    id: string;
    status: string;
    output?: Array<{ type: string; content?: Array<{ text: string }> }>;
    error?: { message: string };
  };

  // Map Codex response to our status format
  const status = mapCodexStatus(data.status);

  let result: CodexTaskStatus["result"] | undefined;
  if (status === "completed" && data.output) {
    const textOutput = data.output
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .map((c) => c.text)
      .join("\n");

    result = {
      summary: textOutput.slice(0, 5000),
      artifacts: [],
    };
  }

  return {
    id: taskId,
    status,
    result,
    error: data.error?.message,
  };
}

function mapCodexStatus(
  apiStatus: string
): CodexTaskStatus["status"] {
  switch (apiStatus) {
    case "queued":
    case "in_progress":
      return "running";
    case "completed":
      return "completed";
    case "failed":
    case "incomplete":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "queued";
  }
}
