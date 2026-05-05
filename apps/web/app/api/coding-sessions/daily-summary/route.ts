import { auth } from "@/lib/auth";
import { resolveCodingSessionsScanOptionsFromEnv } from "@/lib/coding-sessions-scan-options";
import {
  filterSessionsByLocalDate,
  getLocalDateString,
} from "@/lib/coding-sessions-date-filter";
import { buildDailySummaryPrompt } from "@/lib/ai/daily-summary-prompt";
import { getOmniLanguageModel } from "@/lib/ai/language-model";
import {
  scanCodingSessions,
  extractCodingSession,
  createExtractiveSummary,
  type CodingSessionRecord,
} from "@omnitool/coding-sessions";
import { prisma } from "@omnitool/database";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { TEAM_COOKIE_NAME } from "@/lib/team-cookie";

export const runtime = "nodejs";

type GenerateTextModel = Parameters<typeof generateText>[0]["model"];

const MAX_SESSIONS = 30;
const MAX_EXTRACT_CHARS = 600;
const CACHE_STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

interface DailySummaryResult {
  title: string;
  overview: string;
  keyTopics: string[];
  actionItems: string[];
  risks: string[];
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { timezone?: string; force?: boolean };
    const tz = body.timezone || "UTC";
    const force = body.force === true;
    const dateStr = getLocalDateString(tz);
    const userId = session.user.id;

    // Resolve active team from cookie
    const cookieStore = await cookies();
    const teamId = cookieStore.get(TEAM_COOKIE_NAME)?.value ?? null;

    // Check DB cache (unless force refresh)
    if (!force) {
      const cached = await prisma.dailyCodingSummary.findUnique({
        where: { userId_date: { userId, date: dateStr } },
      });
      if (cached) {
        const age = Date.now() - cached.updatedAt.getTime();
        if (age < CACHE_STALE_MS) {
          return NextResponse.json({
            summary: deserializeSummary(cached),
            cached: true,
          });
        }
      }
    }

    // Scan local coding sessions
    const allSessions = await scanCodingSessions(
      resolveCodingSessionsScanOptionsFromEnv()
    );

    // Filter to today
    const todaySessions = filterSessionsByLocalDate(allSessions, tz)
      .filter((s) => s.status === "extractable")
      .sort((a, b) => (b.messageCount ?? 0) - (a.messageCount ?? 0))
      .slice(0, MAX_SESSIONS);

    if (todaySessions.length === 0) {
      return NextResponse.json({
        summary: null,
        message: "No coding sessions found for today.",
        cached: false,
      });
    }

    // Extract & produce per-session digests
    const digests = await buildDigests(todaySessions);

    // Generate aggregate summary
    const resolved = getOmniLanguageModel();
    let dailySummary: DailySummaryResult;

    if (resolved) {
      try {
        const result = await generateText({
          model: resolved.model as GenerateTextModel,
          prompt: buildDailySummaryPrompt(dateStr, digests),
          temperature: 0.3,
        });
        dailySummary = parseDailySummaryJson(result.text, digests);
      } catch {
        dailySummary = buildFallbackSummary(digests, dateStr);
      }
    } else {
      dailySummary = buildFallbackSummary(digests, dateStr);
    }

    // Persist to DB (auto-shares with team)
    const totalMessages = todaySessions.reduce(
      (sum, s) => sum + (s.messageCount ?? 0),
      0
    );
    const sourcesArray = [
      ...new Set(todaySessions.map((s) => s.sourceLabel)),
    ];

    await prisma.dailyCodingSummary.upsert({
      where: { userId_date: { userId, date: dateStr } },
      create: {
        userId,
        teamId,
        date: dateStr,
        timezone: tz,
        sessionCount: todaySessions.length,
        totalMessages,
        sources: JSON.stringify(sourcesArray),
        title: dailySummary.title,
        overview: dailySummary.overview,
        keyTopics: JSON.stringify(dailySummary.keyTopics),
        actionItems: JSON.stringify(dailySummary.actionItems),
        risks: JSON.stringify(dailySummary.risks),
        perSessionMeta: JSON.stringify(
          digests.map((d) => ({
            id: d.id,
            source: d.source,
            title: d.title,
            messageCount: d.messageCount,
            project: d.project,
          }))
        ),
        modelUsed: resolved?.provider ?? null,
      },
      update: {
        teamId,
        timezone: tz,
        sessionCount: todaySessions.length,
        totalMessages,
        sources: JSON.stringify(sourcesArray),
        title: dailySummary.title,
        overview: dailySummary.overview,
        keyTopics: JSON.stringify(dailySummary.keyTopics),
        actionItems: JSON.stringify(dailySummary.actionItems),
        risks: JSON.stringify(dailySummary.risks),
        perSessionMeta: JSON.stringify(
          digests.map((d) => ({
            id: d.id,
            source: d.source,
            title: d.title,
            messageCount: d.messageCount,
            project: d.project,
          }))
        ),
        modelUsed: resolved?.provider ?? null,
      },
    });

    return NextResponse.json({
      summary: {
        ...dailySummary,
        sessionCount: todaySessions.length,
        totalMessages,
        sources: sourcesArray,
      },
      cached: false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate daily summary",
      },
      { status: 500 }
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────

interface Digest {
  id: string;
  source: string;
  project?: string | null;
  title: string;
  messageCount: number;
  summary: string;
  keyTopics: string[];
}

async function buildDigests(sessions: CodingSessionRecord[]): Promise<Digest[]> {
  const results: Digest[] = [];

  for (const record of sessions) {
    try {
      const extracted = await extractCodingSession(record);
      const summary = createExtractiveSummary(extracted);
      results.push({
        id: record.id,
        source: record.sourceLabel,
        project: record.project,
        title: summary.title,
        messageCount: extracted.messageCount,
        summary: summary.overview.slice(0, MAX_EXTRACT_CHARS),
        keyTopics: summary.keyTopics.slice(0, 5),
      });
    } catch {
      // Skip sessions that fail extraction
    }
  }

  return results;
}

function parseDailySummaryJson(
  text: string,
  digests: Digest[]
): DailySummaryResult {
  try {
    const jsonText = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    const parsed = JSON.parse(jsonText) as Partial<DailySummaryResult>;
    return {
      title:
        typeof parsed.title === "string"
          ? parsed.title
          : buildFallbackTitle(digests),
      overview:
        typeof parsed.overview === "string"
          ? parsed.overview
          : "Summary of today's coding work.",
      keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    };
  } catch {
    return buildFallbackSummary(digests, "today");
  }
}

function buildFallbackSummary(digests: Digest[], _date: string): DailySummaryResult {
  const allTopics = digests.flatMap((d) => d.keyTopics);
  const uniqueTopics = [...new Set(allTopics)].slice(0, 8);

  return {
    title: buildFallbackTitle(digests),
    overview: digests.map((d) => d.summary).join(" ").slice(0, 500),
    keyTopics: uniqueTopics,
    actionItems: [],
    risks: [],
  };
}

function buildFallbackTitle(digests: Digest[]): string {
  if (digests.length === 0) return "Coding day";
  if (digests.length === 1) return digests[0].title;
  const topics = digests.flatMap((d) => d.keyTopics).slice(0, 3);
  return topics.length > 0
    ? topics.join(", ")
    : `${digests.length} coding sessions`;
}

function deserializeSummary(row: {
  title: string;
  overview: string;
  keyTopics: string;
  actionItems: string;
  risks: string;
  sessionCount: number;
  totalMessages: number;
  sources: string;
}) {
  return {
    title: row.title,
    overview: row.overview,
    keyTopics: JSON.parse(row.keyTopics) as string[],
    actionItems: JSON.parse(row.actionItems) as string[],
    risks: JSON.parse(row.risks) as string[],
    sessionCount: row.sessionCount,
    totalMessages: row.totalMessages,
    sources: JSON.parse(row.sources) as string[],
  };
}
