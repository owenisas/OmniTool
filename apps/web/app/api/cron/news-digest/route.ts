import { NextResponse } from "next/server";
import { prisma } from "@omnitool/database";
import type { Prisma } from "@omnitool/database";
import { extractTopicsFromNotes } from "@/lib/ai/topic-extraction";
import { searchNewsForTopics, synthesizeDigest } from "@/lib/ai/news-search";

/**
 * Vercel Cron handler: Generate daily news digests for opted-in users.
 * Schedule: 0 7 * * * (daily at 7am UTC)
 *
 * Security: Vercel Cron sends CRON_SECRET in the Authorization header.
 */
export async function GET(req: Request) {
  // Verify cron secret (Vercel automatically adds this for cron jobs)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0]!;

  // Find users who have opted into news digests
  // For now, generate for all users who have notes (opt-in can be added to UserNotePreference later)
  const users = await prisma.user.findMany({
    where: {
      notes: { some: { deletedAt: null } },
    },
    select: {
      id: true,
      teamMembers: { select: { teamId: true }, take: 1 },
    },
    take: 50, // Process in batches for serverless timeout limits
  });

  let generated = 0;
  let skipped = 0;

  // Pre-filter users who already have today's digest in a single query
  const existingDigests = await prisma.newsDigest.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      date: today,
    },
    select: { userId: true },
  });
  const alreadyProcessed = new Set(existingDigests.map((d) => d.userId));

  const usersToProcess = users.filter((u) => !alreadyProcessed.has(u.id));
  skipped = users.length - usersToProcess.length;

  // Process users with concurrency limit (5 at a time) to avoid
  // overwhelming AI providers and DB connections.
  const CONCURRENCY = 5;
  for (let i = 0; i < usersToProcess.length; i += CONCURRENCY) {
    const batch = usersToProcess.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (user) => {
        const teamId = user.teamMembers[0]?.teamId;

        // 1. Extract topics from notes
        const topics = await extractTopicsFromNotes(user.id, teamId);
        if (topics.length === 0) return "no_topics";

        // 2. Search for relevant news
        const articles = await searchNewsForTopics(topics);
        if (articles.length === 0) return "no_articles";

        // 3. Synthesize digest
        const { synthesis, summarizedArticles } = await synthesizeDigest(
          articles,
          topics,
        );

        // 4. Store digest
        await prisma.newsDigest.create({
          data: {
            userId: user.id,
            date: today,
            topics: topics as Prisma.InputJsonValue,
            articles: summarizedArticles as unknown as Prisma.InputJsonValue,
            synthesis,
          },
        });

        // 5. Create a note with the digest content
        const digestParent = await getOrCreateDigestParent(user.id);
        await prisma.note.create({
          data: {
            title: `News Digest — ${today}`,
            contentText: synthesis,
            blocks: digestToBlocks(synthesis, summarizedArticles) as Prisma.InputJsonValue,
            authorId: user.id,
            parentId: digestParent.id,
            position: 0,
          },
        });

        return "generated";
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value === "generated") {
        generated++;
      } else if (result.status === "rejected") {
        console.error("[NewsDigest] Failed for user:", result.reason);
      }
    }
  }

  return NextResponse.json({ generated, skipped, total: users.length });
}

/**
 * Find or create the "News Digests" parent note for a user.
 */
async function getOrCreateDigestParent(userId: string) {
  const existing = await prisma.note.findFirst({
    where: {
      authorId: userId,
      title: "News Digests",
      parentId: null,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (existing) return existing;

  return prisma.note.create({
    data: {
      title: "News Digests",
      contentText: "Auto-generated daily news digests based on your notes and interests.",
      authorId: userId,
      isPinned: false,
      position: 9999, // Low priority in sort order
    },
  });
}

/**
 * Convert digest content to BlockNote JSON format.
 */
function digestToBlocks(
  synthesis: string,
  articles: Array<{ title: string; url: string; topic: string }>
): unknown {
  // Simple paragraph blocks for the synthesis
  const blocks = synthesis.split("\n\n").map((paragraph, i) => ({
    id: `digest-block-${i}`,
    type: "paragraph" as const,
    content: [{ type: "text" as const, text: paragraph }],
    props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
    children: [],
  }));

  return blocks;
}
