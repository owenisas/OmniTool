import { auth } from "@/lib/auth";
import { applySyncUploadBatch } from "@/lib/powersync/apply-upload-batch";
import { apiLimiter } from "@/lib/rate-limit";
import { z } from "zod";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  operations: z
    .array(
      z.object({
        op: z.enum(["PUT", "PATCH", "DELETE"]),
        table: z.string(),
        id: z.string(),
        data: z.record(z.unknown()).optional(),
      }),
    )
    .max(500, "Maximum 500 operations per batch"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 100 req/min per user
  if (apiLimiter) {
    const { success } = await apiLimiter.limit(`sync-upload:${session.user.id}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 },
      );
    }
  }

  if (!process.env.POWERSYNC_URL?.trim()) {
    return NextResponse.json({ error: "PowerSync not configured" }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    await applySyncUploadBatch(session.user.id as string, parsed.data.operations);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    const status =
      msg === "READONLY_TABLE" || msg === "FORBIDDEN"
        ? 403
        : msg === "NOT_FOUND"
          ? 404
          : msg === "BAD_DATA" || msg === "UNSUPPORTED_TABLE"
            ? 400
            : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}
