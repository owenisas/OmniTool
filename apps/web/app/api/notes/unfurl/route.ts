import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent": "OmniTool/1.0 (Link Preview)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ url, title: parsedUrl.hostname, description: "", favicon: "", image: "" });
    }

    const html = await res.text();

    const title = extractMeta(html, "og:title") || extractMeta(html, "twitter:title") || extractTitle(html) || parsedUrl.hostname;
    const description = extractMeta(html, "og:description") || extractMeta(html, "twitter:description") || extractMeta(html, "description") || "";
    const image = resolveUrl(extractMeta(html, "og:image") || extractMeta(html, "twitter:image") || "", parsedUrl);
    const favicon = resolveUrl(
      extractLink(html, "icon") || extractLink(html, "shortcut icon") || "/favicon.ico",
      parsedUrl,
    );

    return NextResponse.json({ url, title, description: description.slice(0, 300), favicon, image });
  } catch {
    return NextResponse.json({ url: "", title: "", description: "", favicon: "", image: "" });
  }
}

function extractMeta(html: string, name: string): string {
  const propertyPattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRegExp(name)}["'][^>]+content=["']([^"']+)["']`, "i");
  const match = html.match(propertyPattern);
  if (match) return decodeEntities(match[1]!);

  const reversedPattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegExp(name)}["']`, "i");
  const match2 = html.match(reversedPattern);
  return match2 ? decodeEntities(match2[1]!) : "";
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeEntities(match[1]!.trim()) : "";
}

function extractLink(html: string, rel: string): string {
  const pattern = new RegExp(`<link[^>]+rel=["']${escapeRegExp(rel)}["'][^>]+href=["']([^"']+)["']`, "i");
  const match = html.match(pattern);
  if (match) return match[1]!;

  const reversed = new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${escapeRegExp(rel)}["']`, "i");
  const match2 = html.match(reversed);
  return match2 ? match2[1]! : "";
}

function resolveUrl(path: string, base: URL): string {
  if (!path) return "";
  try {
    return new URL(path, base.origin).href;
  } catch {
    return "";
  }
}

function decodeEntities(str: string): string {
  return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
