/**
 * Shared types for GitHub webhook event handling.
 */

export interface WebhookContext {
  event: string;
  deliveryId: string;
}

export type WebhookHandler = (
  payload: Record<string, unknown>,
  ctx: WebhookContext
) => Promise<void>;
