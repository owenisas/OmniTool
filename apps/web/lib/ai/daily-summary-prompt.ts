interface SessionDigest {
  source: string;
  project?: string | null;
  title: string;
  messageCount: number;
  summary: string;
  keyTopics: string[];
}

/**
 * Build an aggregate daily summary prompt from per-session extractive digests.
 * Asks the LLM to synthesize a holistic "day of code" summary.
 */
export function buildDailySummaryPrompt(
  date: string,
  digests: SessionDigest[]
): string {
  const sessionBlocks = digests
    .map(
      (d, i) =>
        `Session ${i + 1} (${d.source}${d.project ? `, project: ${d.project}` : ""}):
Title: ${d.title}
Messages: ${d.messageCount}
Summary: ${d.summary}
Topics: ${d.keyTopics.join(", ")}`
    )
    .join("\n\n");

  return `You are summarizing a developer's entire day of coding work (${date}).
They had ${digests.length} coding session${digests.length === 1 ? "" : "s"} across various AI coding tools.

Produce a holistic daily summary in JSON with these exact keys:
- title: A punchy 5-10 word title for the day (e.g. "Auth refactor and API tests")
- overview: 3-5 sentence narrative of what was accomplished, challenges encountered, and progress made
- keyTopics: Array of 5-10 key technical topics/areas worked on
- actionItems: Array of next steps or TODOs surfaced from the sessions
- risks: Array of any concerns, blockers, or risks identified (empty array if none)

Rules:
- Synthesize across sessions — do NOT list each session separately.
- Focus on outcomes and progress, not tool usage.
- Keep it concise and useful for a standup or daily log.
- Return ONLY the JSON object, no markdown fences or explanation.

Sessions:
${sessionBlocks}`;
}

export type { SessionDigest };
