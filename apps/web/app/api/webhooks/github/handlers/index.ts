import type { WebhookHandler } from "./types";
import { handlePullRequest } from "./pull-request";
import { handlePush } from "./push";
import { handleIssues } from "./issues";

/**
 * Map of GitHub event names to their handler functions.
 * Unhandled events are silently acknowledged (200 OK).
 */
export const webhookHandlers: Record<string, WebhookHandler> = {
  pull_request: handlePullRequest,
  push: handlePush,
  issues: handleIssues,
};
