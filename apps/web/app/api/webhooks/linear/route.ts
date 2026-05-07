import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@omnitool/database";

/**
 * Verify a Linear webhook signature (HMAC-SHA256).
 *
 * Linear signs each webhook request body with the webhook's signing secret.
 * The computed HMAC is sent in the `Linear-Signature` header as a raw hex digest.
 */
function verifyLinearSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expectedSignature = createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  const expectedBuf = Buffer.from(expectedSignature, "utf-8");
  const receivedBuf = Buffer.from(signature, "utf-8");

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, receivedBuf);
}

/**
 * Map Linear issue priority (0-4) to OmniTool priority strings.
 * Linear: 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low
 */
function mapLinearPriority(priority: number): string {
  switch (priority) {
    case 1:
      return "URGENT";
    case 2:
      return "HIGH";
    case 3:
      return "MEDIUM";
    case 4:
      return "LOW";
    default:
      return "MEDIUM";
  }
}

/**
 * Map Linear state type to OmniTool issue status.
 * Linear state types: backlog, unstarted, started, completed, cancelled
 */
function mapLinearState(stateType: string): string {
  switch (stateType) {
    case "completed":
      return "CLOSED";
    case "cancelled":
      return "CLOSED";
    case "started":
      return "IN_PROGRESS";
    case "backlog":
    case "unstarted":
    default:
      return "OPEN";
  }
}

interface LinearWebhookPayload {
  action: "create" | "update" | "remove";
  type: string;
  data: Record<string, unknown>;
  url?: string;
  createdAt?: string;
  organizationId?: string;
}

export async function POST(req: Request) {
  // ------------------------------------------------------------------
  // 1. Validate that the webhook secret is configured on the server.
  // ------------------------------------------------------------------
  const secret = process.env.LINEAR_WEBHOOK_SECRET;
  if (!secret) {
    console.error(
      "[Linear Webhook] LINEAR_WEBHOOK_SECRET is not configured. Rejecting request.",
    );
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  // ------------------------------------------------------------------
  // 2. Read and verify the signature BEFORE processing the payload.
  // ------------------------------------------------------------------
  const signatureHeader = req.headers.get("linear-signature");
  if (!signatureHeader) {
    return NextResponse.json(
      { error: "Missing Linear-Signature header" },
      { status: 401 },
    );
  }

  const body = await req.text();

  if (!verifyLinearSignature(body, signatureHeader, secret)) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  // ------------------------------------------------------------------
  // 3. Signature valid -- parse and process the event.
  // ------------------------------------------------------------------
  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(body) as LinearWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, action, data } = payload;

  console.log(
    `[Linear Webhook] type=${type} action=${action} id=${data?.id ?? "unknown"}`,
  );

  // Only handle Issue webhooks for now.
  if (type === "Issue") {
    try {
      await handleIssueWebhook(action, data);
    } catch (err) {
      console.error(`[Linear Webhook] Handler error for Issue.${action}:`, err);
      // Return 200 anyway -- Linear retries on non-2xx and we don't want
      // repeated retries for a processing bug.
    }
  }

  return NextResponse.json({ received: true, type, action });
}

async function handleIssueWebhook(
  action: string,
  data: Record<string, unknown>,
) {
  const linearIssueId = data.id as string | undefined;
  if (!linearIssueId) return;

  // Find matching OmniTool issue by linearIssueId.
  const existingIssue = await prisma.issue.findUnique({
    where: { linearIssueId },
  });

  // Prevent infinite sync loops: if we recently synced this issue from
  // OmniTool to Linear (linearSyncedAt within last 10 seconds), skip
  // the incoming webhook to avoid bouncing updates back and forth.
  if (existingIssue?.linearSyncedAt) {
    const syncedAgo = Date.now() - existingIssue.linearSyncedAt.getTime();
    if (syncedAgo < 10_000) {
      console.log(
        `[Linear Webhook] Skipping Issue.${action} for ${linearIssueId} — synced ${syncedAgo}ms ago`,
      );
      return;
    }
  }

  switch (action) {
    case "create": {
      // We only sync updates for issues that already exist in OmniTool
      // (i.e., were created from OmniTool and pushed to Linear). We do
      // not auto-import new Linear issues -- that would require knowing
      // which project to assign them to.
      if (!existingIssue) {
        console.log(
          `[Linear Webhook] Issue.create for ${linearIssueId} — no matching OmniTool issue, skipping.`,
        );
      }
      break;
    }

    case "update": {
      if (!existingIssue) return;

      const updates: Record<string, unknown> = {};

      if (typeof data.title === "string") {
        updates.title = data.title;
      }
      if (typeof data.description === "string") {
        updates.description = data.description;
      }
      if (typeof data.priority === "number") {
        updates.priority = mapLinearPriority(data.priority as number);
      }

      // Linear sends state as a nested object with { id, name, type, color }
      const stateData = data.state as
        | { type?: string; name?: string }
        | undefined;
      if (stateData?.type) {
        const newStatus = mapLinearState(stateData.type);
        updates.status = newStatus;
        if (newStatus === "CLOSED" && !existingIssue.resolvedAt) {
          updates.resolvedAt = new Date();
        }
        if (newStatus !== "CLOSED" && existingIssue.resolvedAt) {
          updates.resolvedAt = null;
        }
      }

      // Linear identifier (e.g., "ENG-123")
      if (typeof data.identifier === "string") {
        updates.linearIdentifier = data.identifier;
      }

      // Linear team key
      const teamData = data.team as { key?: string } | undefined;
      if (teamData?.key) {
        updates.linearTeamKey = teamData.key;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.issue.update({
          where: { linearIssueId },
          data: {
            ...updates,
            linearSyncedAt: new Date(),
          },
        });
        console.log(
          `[Linear Webhook] Issue.update applied to ${existingIssue.identifier}: ${Object.keys(updates).join(", ")}`,
        );
      }
      break;
    }

    case "remove": {
      if (!existingIssue) return;

      // When a Linear issue is deleted, we mark the OmniTool issue as
      // closed rather than deleting it -- preserves local history.
      await prisma.issue.update({
        where: { linearIssueId },
        data: {
          status: "CLOSED",
          resolvedAt: existingIssue.resolvedAt ?? new Date(),
          linearSyncedAt: new Date(),
        },
      });
      console.log(
        `[Linear Webhook] Issue.remove — closed ${existingIssue.identifier}`,
      );
      break;
    }

    default:
      console.log(`[Linear Webhook] Unhandled Issue action: ${action}`);
  }
}
