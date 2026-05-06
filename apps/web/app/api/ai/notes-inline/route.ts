import { auth } from "@/lib/auth";
import { getOmniLanguageModel } from "@/lib/ai/language-model";
import { apiLimiter } from "@/lib/rate-limit";
import { streamText } from "ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type StreamTextModel = Parameters<typeof streamText>[0]["model"];

type Action = "improve" | "summarize" | "continue" | "translate" | "custom";

const ACTION_INSTRUCTIONS: Record<Action, (prompt?: string) => string> = {
  improve: () =>
    "Rewrite the user's passage to be clearer, more concise, and more polished. Preserve meaning, voice, and intent. Output only the rewritten passage in markdown — no preamble, no explanation.",
  summarize: () =>
    "Summarize the user's passage into a tight, faithful summary. Output only the summary in markdown — no preamble, no explanation.",
  continue: () =>
    "Continue writing the user's passage in the same voice and style. Output only the continuation in markdown — no preamble, no explanation.",
  translate: (prompt) =>
    `Translate the user's passage into ${prompt || "English"}. Output only the translation in markdown — no preamble, no explanation.`,
  custom: (prompt) =>
    `Apply the following instruction to the user's passage: "${prompt ?? ""}". Output only the resulting passage in markdown — no preamble, no explanation.`,
};

const SYSTEM_PROMPT_BASE = `You are an inline writing assistant inside a block-based note editor. Always respond in plain markdown — no preamble like "Sure!" or "Here is...". Use headings, lists, and code blocks where appropriate, but only when they fit the request. Never wrap the entire response in a code block.`;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit (graceful: skipped when Upstash env not set)
  if (apiLimiter) {
    const { success } = await apiLimiter.limit(`notes-inline:${session.user.id}:${clientIp(req)}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
    }
  }

  const resolved = getOmniLanguageModel();
  if (!resolved) {
    return NextResponse.json(
      {
        error:
          "AI is not configured. Set NVIDIA_API_KEY or ANTHROPIC_API_KEY in the server environment.",
      },
      { status: 503 }
    );
  }

  let body: {
    prompt?: string;
    contextText?: string;
    action?: Action;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const action: Action = body.action ?? "custom";
  const promptInput = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const contextText =
    typeof body.contextText === "string"
      ? body.contextText.slice(0, 8000)
      : "";

  // Validate inputs by action
  if (action === "custom" && !promptInput && !contextText) {
    return NextResponse.json(
      { error: "Missing prompt" },
      { status: 400 }
    );
  }

  const instruction = ACTION_INSTRUCTIONS[action](promptInput);
  const system = `${SYSTEM_PROMPT_BASE}\n\n${instruction}`;

  // Build the user message
  const userParts: string[] = [];
  if (contextText) {
    userParts.push("Passage:\n\n" + contextText);
  }
  if (action === "custom" && promptInput) {
    userParts.push(contextText ? `\nInstruction: ${promptInput}` : promptInput);
  }
  if (userParts.length === 0) {
    return NextResponse.json(
      { error: "Empty input" },
      { status: 400 }
    );
  }

  try {
    const result = streamText({
      model: resolved.model as StreamTextModel,
      system,
      messages: [
        {
          role: "user",
          content: userParts.join("\n"),
        },
      ],
      temperature: 0.4,
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error("[api/ai/notes-inline]", error);
    const message =
      error instanceof Error ? error.message : "Failed to process request";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
