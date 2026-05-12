import { tool } from "ai";
import { z } from "zod";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const searchWeb = tool({
  description:
    "Search the web for information. Returns results with titles, URLs, and snippets. Use fetchWebPage to read full content of results.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe("Search query"),
    numResults: z
      .number()
      .default(5)
      .describe("Number of results (max 10)"),
  }),
  execute: async ({ query, numResults }) => {
    const clampedResults = Math.min(Math.max(numResults, 1), 10);

    const tavilyKey = process.env.TAVILY_API_KEY;
    const serperKey = process.env.SERPER_API_KEY;

    if (tavilyKey) {
      return await searchWithTavily(query, clampedResults, tavilyKey);
    }

    if (serperKey) {
      return await searchWithSerper(query, clampedResults, serperKey);
    }

    return {
      error:
        "Web search not configured. Set TAVILY_API_KEY or SERPER_API_KEY.",
    };
  },
});

async function searchWithTavily(
  query: string,
  maxResults: number,
  apiKey: string
): Promise<{ results: SearchResult[] } | { error: string }> {
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
      }),
    });

    if (!response.ok) {
      return {
        error: `Tavily API error: HTTP ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();

    const results: SearchResult[] = (data.results ?? []).map(
      (r: any) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? "",
      })
    );

    return { results };
  } catch (err: any) {
    return {
      error: `Tavily search failed: ${err.message ?? String(err)}`,
    };
  }
}

async function searchWithSerper(
  query: string,
  numResults: number,
  apiKey: string
): Promise<{ results: SearchResult[] } | { error: string }> {
  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q: query,
        num: numResults,
      }),
    });

    if (!response.ok) {
      return {
        error: `Serper API error: HTTP ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();

    const organic = data.organic ?? [];

    const results: SearchResult[] = organic.map((r: any) => ({
      title: r.title ?? "",
      url: r.link ?? "",
      snippet: r.snippet ?? "",
    }));

    return { results };
  } catch (err: any) {
    return {
      error: `Serper search failed: ${err.message ?? String(err)}`,
    };
  }
}
