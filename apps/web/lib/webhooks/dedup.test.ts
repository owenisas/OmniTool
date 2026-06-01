import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the webhook delivery dedup guard (Layer 1).
 *
 * `dedup.ts` constructs its Upstash Redis client at module scope from env
 * vars, so each scenario sets the env BEFORE importing the module and uses
 * `vi.resetModules()` so the singleton re-evaluates. The `@upstash/redis`
 * package is mocked so no network / real Redis is touched — we drive
 * `set` / `del` return values directly to simulate first-vs-duplicate
 * deliveries and Redis errors.
 *
 * Coverage:
 *   - first delivery claims (SET NX returns "OK"  → true)
 *   - duplicate is rejected (SET NX returns null  → false)
 *   - fails open when Redis is unconfigured        → true (no env)
 *   - fails open on a Redis error                  → true
 *   - skips unusable ids (null / "unknown")        → true, no Redis call
 *   - release deletes the claim key
 *   - linearDeliveryKey composite-key behavior
 */

// A controllable mock Redis instance shared across the test file. Each test
// resets its method implementations as needed.
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock("@upstash/redis", () => {
  return {
    Redis: {
      // dedup.ts calls `Redis.fromEnv()`
      fromEnv: () => ({ set: mockSet, del: mockDel }),
    },
  };
});

const REDIS_ENV = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
};

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  mockSet.mockReset();
  mockDel.mockReset();
});

afterEach(() => {
  // Restore env so per-test mutations don't leak.
  process.env = { ...originalEnv };
});

function withRedisEnv() {
  process.env.UPSTASH_REDIS_REST_URL = REDIS_ENV.UPSTASH_REDIS_REST_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = REDIS_ENV.UPSTASH_REDIS_REST_TOKEN;
}

function withoutRedisEnv() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

describe("claimWebhookDelivery", () => {
  it("claims a first-seen delivery (SET NX returns OK → true)", async () => {
    withRedisEnv();
    mockSet.mockResolvedValueOnce("OK");

    const { claimWebhookDelivery } = await import("./dedup");
    const claimed = await claimWebhookDelivery("github", "delivery-abc");

    expect(claimed).toBe(true);
    expect(mockSet).toHaveBeenCalledTimes(1);
    // Verify the NX + EX options are passed (the dedup primitive).
    const [key, value, opts] = mockSet.mock.calls[0];
    expect(key).toBe("omnitool:webhook-dedup:github:delivery-abc");
    expect(value).toBe("1");
    expect(opts).toMatchObject({ nx: true });
    expect(opts.ex).toBeGreaterThan(0);
  });

  it("rejects a duplicate delivery (SET NX returns null → false)", async () => {
    withRedisEnv();
    // null = key already existed → this is a redelivery.
    mockSet.mockResolvedValueOnce(null);

    const { claimWebhookDelivery } = await import("./dedup");
    const claimed = await claimWebhookDelivery("slack", "evt-123");

    expect(claimed).toBe(false);
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it("fails open (true) when Redis is not configured", async () => {
    withoutRedisEnv();

    const { claimWebhookDelivery } = await import("./dedup");
    const claimed = await claimWebhookDelivery("github", "delivery-xyz");

    expect(claimed).toBe(true);
    // No Redis client constructed → set never called.
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("fails open (true) when the Redis call throws", async () => {
    withRedisEnv();
    mockSet.mockRejectedValueOnce(new Error("redis down"));

    const { claimWebhookDelivery } = await import("./dedup");
    const claimed = await claimWebhookDelivery("linear", "wh:Issue:update:1:9");

    expect(claimed).toBe(true);
  });

  it("returns true without hitting Redis for unusable ids", async () => {
    withRedisEnv();

    const { claimWebhookDelivery } = await import("./dedup");
    expect(await claimWebhookDelivery("github", null)).toBe(true);
    expect(await claimWebhookDelivery("github", undefined)).toBe(true);
    expect(await claimWebhookDelivery("github", "unknown")).toBe(true);

    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe("releaseWebhookDelivery", () => {
  it("deletes the claim key when Redis is configured", async () => {
    withRedisEnv();
    mockDel.mockResolvedValueOnce(1);

    const { releaseWebhookDelivery } = await import("./dedup");
    await releaseWebhookDelivery("github", "delivery-abc");

    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith(
      "omnitool:webhook-dedup:github:delivery-abc",
    );
  });

  it("is a no-op for unusable ids and when Redis is unconfigured", async () => {
    withoutRedisEnv();
    const { releaseWebhookDelivery } = await import("./dedup");
    await releaseWebhookDelivery("github", "delivery-abc"); // no Redis
    expect(mockDel).not.toHaveBeenCalled();

    vi.resetModules();
    withRedisEnv();
    const mod = await import("./dedup");
    await mod.releaseWebhookDelivery("github", null); // unusable id
    expect(mockDel).not.toHaveBeenCalled();
  });

  it("swallows Redis errors (fails open)", async () => {
    withRedisEnv();
    mockDel.mockRejectedValueOnce(new Error("redis down"));

    const { releaseWebhookDelivery } = await import("./dedup");
    await expect(
      releaseWebhookDelivery("github", "delivery-abc"),
    ).resolves.toBeUndefined();
  });
});

describe("linearDeliveryKey", () => {
  it("builds a stable composite key from the parts", async () => {
    const { linearDeliveryKey } = await import("./dedup");
    const key = linearDeliveryKey({
      webhookId: "wh1",
      type: "Issue",
      action: "update",
      dataId: "issue-1",
      webhookTimestamp: 1234,
    });
    expect(key).toBe("wh1:Issue:update:issue-1:1234");
  });

  it("returns null when there is no entity id or action", async () => {
    const { linearDeliveryKey } = await import("./dedup");
    expect(
      linearDeliveryKey({ type: "Issue", action: "update", dataId: null }),
    ).toBeNull();
    expect(
      linearDeliveryKey({ type: "Issue", action: null, dataId: "issue-1" }),
    ).toBeNull();
  });

  it("substitutes placeholders for missing optional parts", async () => {
    const { linearDeliveryKey } = await import("./dedup");
    const key = linearDeliveryKey({ action: "create", dataId: "issue-2" });
    expect(key).toBe("nowh:notype:create:issue-2:nots");
  });
});
