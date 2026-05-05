import { tool } from "ai";
import { z } from "zod";
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";

export const fetchWebPage = tool({
  description:
    "Fetch a web page and extract its readable text content. Use for summarizing articles, reading docs, or researching topics.",
  parameters: z.object({
    url: z.string().url().describe("The URL to fetch"),
    maxLength: z
      .number()
      .default(15000)
      .describe("Max character length of extracted content"),
  }),
  execute: async ({ url, maxLength }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; OmniTool/1.0; +https://omnitool.reunifylabs.com)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { error: `Request timed out after 10 seconds for URL: ${url}` };
      }
      return { error: `Failed to fetch URL: ${err.message ?? String(err)}` };
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return {
        error: `HTTP ${response.status} ${response.statusText} for URL: ${url}`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml")
    ) {
      return {
        error: `URL does not return HTML content (Content-Type: ${contentType})`,
      };
    }

    const html = await response.text();

    const { document } = parseHTML(html);

    const reader = new Readability(document as any);
    const article = reader.parse();

    if (!article || !article.textContent) {
      return {
        error: "Could not extract readable content from the page",
        url,
      };
    }

    const content = article.textContent.trim().slice(0, maxLength);
    const excerpt = article.excerpt ?? content.slice(0, 200);

    return {
      title: article.title ?? "",
      content,
      url,
      excerpt,
    };
  },
});
