import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiLimiter } from "@/lib/rate-limit";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET = "note-attachments";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB post-compression cap

const ALLOWED_PREFIXES = ["image/", "video/", "audio/"] as const;
const ALLOWED_EXACT = new Set([
  "application/pdf",
  "application/octet-stream",
]);

function isAllowedMime(mime: string): boolean {
  if (ALLOWED_EXACT.has(mime)) return true;
  return ALLOWED_PREFIXES.some((p) => mime.startsWith(p));
}

function extensionFor(name: string, contentType: string): string {
  const dot = name.lastIndexOf(".");
  if (dot !== -1 && dot < name.length - 1) {
    return name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  // Fallback: derive a sensible extension from the MIME type.
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/svg+xml") return "svg";
  if (contentType === "application/pdf") return "pdf";
  const slash = contentType.indexOf("/");
  if (slash !== -1) {
    return contentType.slice(slash + 1).replace(/[^a-z0-9]/g, "") || "bin";
  }
  return "bin";
}

function yearMonthKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (apiLimiter) {
    const { success, reset } = await apiLimiter.limit(
      `note-upload:${session.user.id}`,
    );
    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Too many uploads. Please slow down." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const fileEntry = form.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field" },
      { status: 400 },
    );
  }

  if (fileEntry.size === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (fileEntry.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${MAX_BYTES} bytes` },
      { status: 413 },
    );
  }

  const contentType = fileEntry.type || "application/octet-stream";
  if (!isAllowedMime(contentType)) {
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType}` },
      { status: 415 },
    );
  }

  const ext = extensionFor(fileEntry.name, contentType);
  const id = crypto.randomUUID();
  const key = `${session.user.id}/${yearMonthKey()}/${id}.${ext}`;

  const buffer = Buffer.from(await fileEntry.arrayBuffer());

  const supabase = createSupabaseAdmin();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    });

  if (uploadError) {
    console.error("[notes/upload] storage error", uploadError);
    return NextResponse.json(
      { error: "Failed to store attachment" },
      { status: 500 },
    );
  }

  const { data: publicData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(key);

  return NextResponse.json({ url: publicData.publicUrl });
}
