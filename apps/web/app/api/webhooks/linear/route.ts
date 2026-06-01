import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@omnitool/database";
import { emitActivityEvent } from "@/lib/activity/emit";
import {
  claimWebhookDelivery,
  linearDeliveryKey,
  releaseWebhookDelivery,
} from "@/lib/webhooks/dedup";
import { enforceWebhookRateLimit } from "@/lib/webhooks/rate-limit";

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
  // Linear has no single delivery-id header; it includes the webhook's id and
  // a per-delivery `webhookTimestamp` in the payload, which we combine into a
  // composite dedup key.
  webhookId?: string;
  webhookTimestamp?: number;
}

export async function POST(req: Request) {
  // ------------------------------------------------------------------
  // 0. Per-source rate limit. Clips Linear retry storms / loops before we
  //    spend CPU on signature verification or DB work. Fails open (no Redis).
  // ------------------------------------------------------------------
  const limited = await enforceWebhookRateLimit("linear", req);
  if (limited) return limited;

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

  // ------------------------------------------------------------------
  // 3a. Idempotency guard. Linear delivers at-least-once and retries on
  //     non-2xx. It sends no single delivery-id header, so we derive a
  //     composite key from webhookId + type + action + entity id + the
  //     ENTITY's updatedAt. The entity timestamp is stable across retries of
  //     the same event (so retries collapse) but differs between distinct
  //     updates (so they stay separate). NOTE: we deliberately do NOT use
  //     payload.webhookTimestamp — that changes on every retry and would defeat
  //     dedup entirely.
  // ------------------------------------------------------------------
  const deliveryKey = linearDeliveryKey({
    webhookId: payload.webhookId,
    type,
    action,
    dataId: typeof data?.id === "string" ? data.id : null,
    updatedAt:
      data && typeof (data as { updatedAt?: unknown }).updatedAt === "string"
        ? (data as { updatedAt: string }).updatedAt
        : null,
  });
  const firstDelivery = await claimWebhookDelivery("linear", deliveryKey);
  if (!firstDelivery) {
    console.log(
      `[Linear Webhook] Duplicate delivery (${deliveryKey}) — already processed, skipping.`,
    );
    return NextResponse.json({ received: true, type, action, duplicate: true });
  }

  // Handle Issue + Comment webhooks. Each handler also emits an activity
  // event so workflow templates can trigger off Linear changes.
  // (Phase 1a: subjectType reuses "issue" — no Prisma migration needed.)
  //
  // On a transient handler failure we now return non-2xx so Linear retries.
  // Because we claimed the delivery above, we must first RELEASE that claim,
  // otherwise the retry (same composite key) would be deduped away and the
  // event silently dropped. Releasing + 500 = the redelivery re-claims and
  // re-runs the work that didn't complete (handlers do absolute-state writes
  // / upserts, so re-running is idempotent).
  try {
    if (type === "Issue") {
      await handleIssueWebhook(action, data);
    } else if (type === "Comment") {
      await handleCommentWebhook(action, data);
    }
  } catch (err) {
    console.error(`[Linear Webhook] Handler error for ${type}.${action}:`, err);
    await releaseWebhookDelivery("linear", deliveryKey);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 },
    );
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

      // Emit engine event regardless — workflow templates can react to any
      // Linear issue creation, not just ones already linked to an OmniTool
      // issue.
      await emitActivityEvent({
        type: "linear.issue.created",
        actorType: "integration",
        subjectType: "issue",
        subjectId: linearIssueId,
        payload: {
          ...data,
          omnitoolIssueId: existingIssue?.id ?? null,
        },
      });
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

      // Emit a more specific event when status transitioned to a closed
      // state, plus the generic "updated" event. Assignee changes also get
      // their own event so workflow templates can target them precisely.
      const isNowClosed =
        stateData?.type === "completed" || stateData?.type === "cancelled";
      if (isNowClosed) {
        await emitActivityEvent({
          type: "linear.issue.closed",
          actorType: "integration",
          subjectType: "issue",
          subjectId: linearIssueId,
          payload: {
            ...data,
            omnitoolIssueId: existingIssue.id,
          },
        });
      }
      if (Object.prototype.hasOwnProperty.call(data, "assigneeId")) {
        await emitActivityEvent({
          type: "linear.issue.assigned",
          actorType: "integration",
          subjectType: "issue",
          subjectId: linearIssueId,
          payload: {
            ...data,
            omnitoolIssueId: existingIssue.id,
          },
        });
      }
      await emitActivityEvent({
        type: "linear.issue.updated",
        actorType: "integration",
        subjectType: "issue",
        subjectId: linearIssueId,
        payload: {
          ...data,
          omnitoolIssueId: existingIssue.id,
        },
      });
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
      await emitActivityEvent({
        type: "linear.issue.closed",
        actorType: "integration",
        subjectType: "issue",
        subjectId: linearIssueId,
        payload: {
          ...data,
          omnitoolIssueId: existingIssue.id,
          removed: true,
        },
      });
      break;
    }

    default:
      console.log(`[Linear Webhook] Unhandled Issue action: ${action}`);
  }
}

async function handleCommentWebhook(
  action: string,
  data: Record<string, unknown>,
) {
  if (action !== "create") return;

  const issueRef = data.issue as { id?: string } | undefined;
  const linearIssueId = issueRef?.id;
  if (!linearIssueId) return;

  const existingIssue = await prisma.issue.findUnique({
    where: { linearIssueId },
  });

  await emitActivityEvent({
    type: "linear.issue.commented",
    actorType: "integration",
    subjectType: "issue",
    subjectId: linearIssueId,
    payload: {
      ...data,
      omnitoolIssueId: existingIssue?.id ?? null,
    },
  });
}
