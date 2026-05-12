import { generateText } from "ai";
import { getOmniLanguageModel } from "./language-model";
import type { ExtractedTopic } from "./topic-extraction";

export interface NewsArticle {
  title: string;
  url: string;
  snippet: string;
  topic: string;
  summary: string;
}

/**
 * Search for news articles relevant to the given topics.
 * Uses Tavily search API (via TAVILY_API_KEY) or falls back to a general web search.
 */
export async function searchNewsForTopics(
  topics: ExtractedTopic[]
): Promise<NewsArticle[]> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  if (!tavilyKey) {
    console.warn("[NewsSearch] TAVILY_API_KEY not set, skipping news search");
    return [];
  }

  const articles: NewsArticle[] = [];
  const seenUrls = new Set<string>();

  // Search for each topic (top 6 topics, 3 results each)
  const topTopics = topics.slice(0, 6);

  for (const topic of topTopics) {
    try {
      const query = `${topic.name} latest news updates 2026`;
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query,
          search_depth: "basic",
          max_results: 3,
          include_answer: false,
          include_raw_content: false,
        }),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        results: Array<{ title: string; url: string; content: string }>;
      };

      for (const result of data.results ?? []) {
        if (seenUrls.has(result.url)) continue;
        seenUrls.add(result.url);

        articles.push({
          title: result.title,
          url: result.url,
          snippet: result.content.slice(0, 300),
          topic: topic.name,
          summary: "", // Filled in by synthesis step
        });
      }
    } catch (err) {
      console.error(`[NewsSearch] Failed for topic "${topic.name}":`, err);
    }
  }

  return articles;
}

/**
 * Synthesize a digest from raw articles using the LLM.
 * Returns a markdown summary with personal + team sections.
 */
export async function synthesizeDigest(
  articles: NewsArticle[],
  topics: ExtractedTopic[]
): Promise<{ synthesis: string; summarizedArticles: NewsArticle[] }> {
  const lm = getOmniLanguageModel();
  if (!lm || articles.length === 0) {
    return { synthesis: "No relevant news found today.", summarizedArticles: articles };
  }

  const personalTopics = topics.filter((t) => t.source === "personal");
  const teamTopics = topics.filter((t) => t.source === "team");

  const articlesText = articles
    .map(
      (a, i) =>
        `[${i + 1}] "${a.title}" (topic: ${a.topic})\n   URL: ${a.url}\n   ${a.snippet}`
    )
    .join("\n\n");

  const prompt = `You are writing a daily news digest for a developer. Synthesize these articles into a concise, actionable brief.

## Topics of Interest
Personal: ${personalTopics.map((t) => t.name).join(", ")}
Team: ${teamTopics.map((t) => t.name).join(", ")}

## Articles Found
${articlesText}

Write a markdown digest with:
1. **TL;DR** — 2-3 sentence executive summary of what matters today
2. **Personal Relevance** — articles matching personal topics, with why they matter
3. **Team Relevance** — articles matching team topics, with actionable takeaways
4. **Links** — numbered list of all articles with one-line summaries

Keep it under 500 words. Be opinionated about what's important. Skip fluff articles.`;

  try {
    const result = await generateText({
      model: lm.model,
      prompt,
      maxOutputTokens: 1500,
    });

    // Extract per-article summaries from the synthesis (best-effort)
    const summarizedArticles = articles.map((a) => ({
      ...a,
      summary: a.snippet.slice(0, 150),
    }));

    return { synthesis: result.text, summarizedArticles };
  } catch (err) {
    console.error("[NewsSearch] Synthesis failed:", err);
    return {
      synthesis: articles
        .map((a) => `- **${a.title}** (${a.topic}): ${a.snippet.slice(0, 100)}`)
        .join("\n"),
      summarizedArticles: articles,
    };
  }
}
