import { generateObject } from "ai";
import { z } from "zod";
import { getOmniLanguageModel } from "./language-model";
import { prisma } from "@omnitool/database";

const topicsSchema = z.object({
  topics: z.array(
    z.object({
      name: z.string().describe("Short topic name (2-5 words)"),
      relevance: z
        .enum(["high", "medium"])
        .describe("How central this is to the user's work"),
      source: z
        .enum(["personal", "team"])
        .describe("Whether from personal notes or team project notes"),
    })
  ),
});

export type ExtractedTopic = z.infer<typeof topicsSchema>["topics"][number];

/**
 * Extract professional topics from a user's note corpus.
 * Combines personal notes and team project notes for comprehensive coverage.
 */
export async function extractTopicsFromNotes(
  userId: string,
  teamId?: string
): Promise<ExtractedTopic[]> {
  const lm = getOmniLanguageModel();
  if (!lm) return [];

  // Gather personal notes (most recent, non-deleted)
  const personalNotes = await prisma.note.findMany({
    where: { authorId: userId, deletedAt: null },
    select: { title: true, contentText: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  // Gather team project notes if teamId provided
  let teamNoteText = "";
  if (teamId) {
    const projects = await prisma.project.findMany({
      where: { teamId },
      select: { id: true, name: true, description: true },
    });
    const projectDescriptions = projects
      .map((p) => `Project: ${p.name} — ${p.description ?? ""}`)
      .join("\n");

    // Get notes linked to team projects
    const projectIds = projects.map((p) => p.id);
    const linkedNotes = await prisma.note.findMany({
      where: { linkedProjectId: { in: projectIds }, deletedAt: null },
      select: { title: true, contentText: true },
      take: 20,
    });

    teamNoteText = [
      projectDescriptions,
      ...linkedNotes.map((n) => `${n.title}: ${n.contentText.slice(0, 500)}`),
    ].join("\n\n");
  }

  // Build personal note corpus (cap at ~30k chars for LLM context)
  const personalText = personalNotes
    .map((n) => `${n.title}: ${n.contentText.slice(0, 600)}`)
    .join("\n\n")
    .slice(0, 30000);

  const prompt = `Analyze these notes and extract 5-10 professional topics the user is working on or interested in. These topics will be used to find relevant industry news.

## Personal Notes
${personalText}

${teamNoteText ? `## Team/Project Context\n${teamNoteText}` : ""}

Extract topics that would make good news search queries. Focus on:
- Technologies, frameworks, tools being used
- Industry domains (fintech, healthcare, etc.)
- Technical concepts being explored
- Business themes mentioned repeatedly

Prioritize specificity: "Next.js server components" over "web development".`;

  try {
    const result = await generateObject({
      model: lm.model,
      schema: topicsSchema,
      prompt,
    });
    return result.object.topics;
  } catch (err) {
    console.error("[TopicExtraction] LLM call failed:", err);
    return [];
  }
}
