import { auth } from "@/lib/auth";
import { resolveCodingSessionsScanOptionsFromEnv } from "@/lib/coding-sessions-scan-options";
import { getOmniLanguageModel } from "@/lib/ai/language-model";
import {
  buildSummaryPrompt,
  createExtractiveSummary,
  extractCodingSessionById,
} from "@omnitool/coding-sessions";
import { generateText } from "ai";
import { NextResponse } from "next/server";

type GenerateTextModel = Parameters<typeof generateText>[0]["model"];

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }

    const extracted = await extractCodingSessionById(id, resolveCodingSessionsScanOptionsFromEnv());

    if (!extracted) {
      return NextResponse.json(
        { error: "Session was not found or is not extractable" },
        { status: 404 }
      );
    }

    const fallbackSummary = createExtractiveSummary(extracted);
    const resolved = getOmniLanguageModel();
    const summary =
      resolved != null
        ? await createAiSummary(
            resolved.model as GenerateTextModel,
            extracted,
            fallbackSummary
          )
        : fallbackSummary;

    return NextResponse.json({
      session: {
        ...extracted,
        messages: extracted.messages.slice(0, 40),
        transcriptText: undefined,
      },
      summary,
      usedModel: resolved != null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to summarize coding session",
      },
      { status: 500 }
    );
  }
}

async function createAiSummary(
  model: GenerateTextModel,
  extracted: NonNullable<Awaited<ReturnType<typeof extractCodingSessionById>>>,
  fallbackSummary: ReturnType<typeof createExtractiveSummary>
) {
  try {
    const result = await generateText({
      model,
      prompt: buildSummaryPrompt(extracted),
      temperature: 0.2,
    });
    return {
      ...fallbackSummary,
      ...parseSummaryJson(result.text),
    };
  } catch {
    return fallbackSummary;
  }
}

function parseSummaryJson(text: string) {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  const parsed = JSON.parse(jsonText) as Partial<ReturnType<typeof createExtractiveSummary>>;
  const summary: Partial<ReturnType<typeof createExtractiveSummary>> = {};
  if (typeof parsed.title === "string") summary.title = parsed.title;
  if (typeof parsed.overview === "string") summary.overview = parsed.overview;
  if (Array.isArray(parsed.keyTopics)) summary.keyTopics = parsed.keyTopics;
  if (Array.isArray(parsed.actionItems)) summary.actionItems = parsed.actionItems;
  if (Array.isArray(parsed.risks)) summary.risks = parsed.risks;
  return summary;
}
