# Third-party app integrations

Research report on OmniTool's third-party integration surface (GitHub, Notion, Slack, Linear): OAuth, token storage/refresh, webhooks, and provider operations. Findings are benchmarked against 2025–2026 OAuth security (RFC 9700) and webhook reliability best practice, with refuted/uncertain claims explicitly caveated.

---

## 1. Summary

OmniTool has a mature, well-factored integration layer: a shared provider registry, AES-256-GCM token encryption, a distributed (Redis + in-process) refresh lock that correctly prevents the "burned refresh token" race, signed desktop OAuth state via HMAC, and signature-verified webhooks for all three webhook providers (GitHub, Slack, Linear). Several code-map claims are now stale in OmniTool's favor: the **Linear webhook is fully implemented** (not a placeholder), and **Slack and Linear both have working authorize + callback routes** (not merely "registered").

The gaps that matter are concentrated in two areas:

1. **Webhook reliability.** Processing is synchronous/best-effort (return 200, swallow errors, fire-and-forget for Slack). There is **no idempotency/dedup** (the GitHub `x-github-delivery` id and Slack `event_id` are logged but never used to suppress duplicates), **no durable queue / retry / dead-letter** path, and **no webhook-specific rate limiting**. Providers guarantee at-least-once delivery and retry on non-2xx, so duplicate and replayed deliveries will reach handlers that perform non-idempotent work (e.g. emitting activity events, issue upserts).

2. **OAuth hardening for the desktop/native flow.** The integration OAuth flows do not use PKCE anywhere (grep for `code_challenge`/`code_verifier`/`S256` finds only the unrelated PowerSync JWT signer). RFC 9700 makes PKCE **mandatory for public clients** (native/desktop, SPAs) and recommended for confidential clients. OmniTool's desktop flow runs through a server sidecar that holds the client secret, so it is technically a confidential client, but the authorize request originates from a public surface (system browser) — adding PKCE is the cheapest defense-in-depth here.

Slack timestamp-replay protection (±5 min) is correctly implemented; GitHub and Linear webhooks have **no timestamp/replay window**. HMAC comparisons across all handlers correctly use `crypto.timingSafeEqual`.

---

## 2. Current State in OmniTool — with concrete file references

### Core token + provider infrastructure

- **Encryption** — `packages/integrations/src/lib/encryption.ts`: AES-256-GCM, format `iv:authTag:ciphertext` (all hex), key from `INTEGRATION_ENCRYPTION_KEY` (hex). 16-byte IV per encrypt, GCM auth tag verified on decrypt.
- **Token refresh** — `packages/integrations/src/lib/token-refresh.ts`: `refreshTokenIfNeeded(userId, provider)` refreshes 5 minutes before expiry. Distributed lock = Upstash Redis `SET NX EX 30s` (`acquireRedisLock`) + per-process `Promise` map (`inProcessLocks`) coalescing. Losers `waitForRedisLockRelease` (25s timeout, 100ms poll) then re-read the DB. Refresh implemented for `GITHUB` (`refreshGitHub`, JSON body) and `LINEAR` (`refreshLinear`, form-encoded body); all other providers throw "reconnect required". New refresh token is stored only if the provider returns one (rotation is reactive, line 116–117).
- **Provider registry** — `packages/integrations/src/lib/registry.ts`: configs for GITHUB, NOTION, SLACK, LINEAR (scopes, auth/token URLs, client id/secret env names). `applyBaseUrlOverrides()` lets tests reroute upstream URLs via `*_OAUTH_BASE_URL` / `*_API_BASE_URL`. Slack scopes now include `app_mentions:read`, `im:history/read/write` (Phase 3 interactive bot).

### OAuth flow (web + desktop)

- **Authorize routes** — `apps/web/app/api/integrations/{github,notion,slack,linear}/authorize/route.ts`. GitHub example (`github/authorize/route.ts`): rate-limited via `oauthLimiter` (10/min per IP), requires `auth()` session. Web flow uses `crypto.randomBytes(16)` state + httpOnly `*-oauth-state` cookie (10 min); desktop flow uses `signDesktopOAuthState(userId)` and returns `{ url }` JSON for system-browser launch.
- **Callback routes** — `apps/web/app/api/integrations/{github,notion,slack,linear}/callback/route.ts`. GitHub example (`github/callback/route.ts`): branches on `isDesktopOAuthState(state)`; desktop verifies HMAC state, web re-validates session + compares state cookie; exchanges code (passing `redirect_uri`), encrypts and upserts `ConnectedAccount`, fetches provider profile, merges placeholder users from GitHub org import, returns `desktopOAuthCompletePage()` (desktop) or redirect (web).
- **Desktop state signing** — `apps/web/lib/oauth-state.ts`: state = `desktop:{nonce}:{userId}:{hmac}`, HMAC-SHA256 over `{nonce}:{userId}` keyed by `AUTH_SECRET`, verified with `timingSafeEqual`. `isDesktopServer()` keys off `AUTH_URL` containing `localhost:19283`.
- **Post-OAuth page** — `apps/web/lib/oauth-complete-page.ts`: HTML that auto-attempts `omnitool://oauth-complete?...` deep link + manual "Open OmniTool" button.
- **Note:** no PKCE in any of these flows (no `code_challenge` on authorize, no `code_verifier` on token exchange).

### Database schema (`packages/database/prisma/schema.prisma`)

- `ConnectedAccount` (line 469): unique `[userId, provider]`; `encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiry`, `scopes`, `metadata`, `providerAccountId`.
- `GitHubImportLog` (line 522): org-import status/counts/errors.
- `SlackNotificationConfig` (line 907) and `SlackTeamInstall` (line 929): per-workspace bot token + per-team channel event subscriptions.
- No `WebhookEvent` / `ProcessedWebhook` / idempotency table exists.

### Webhooks

- **GitHub** — `apps/web/app/api/webhooks/github/route.ts`: HMAC-SHA256 over raw body, `x-hub-signature-256`, `timingSafeEqual`. Rejects when secret unset. Dispatches to `handlers/` (push, pull-request, issues). On handler error, logs and **still returns 200** (to stop GitHub retries). `x-github-delivery` is logged only.
- **Slack** — `apps/web/app/api/webhooks/slack/route.ts`: `v0:{ts}:{body}` HMAC, `x-slack-signature`, `timingSafeEqual`, **±5-min replay window**. Handles `url_verification` challenge, then `event_callback` → `app_mention`/`message` dispatched fire-and-forget to `handleSlackMention` (`lib/slack/mention-handler.ts`), skipping bot/edited messages. `event_id` logged only.
- **Linear** — `apps/web/app/api/webhooks/linear/route.ts`: **fully implemented** (code map's "placeholder" is stale). HMAC-SHA256 over raw body, `linear-signature`, `timingSafeEqual`. Handles `Issue` create/update/remove (status/priority/state mapping, closes OmniTool issue on remove) and `Comment` create; emits `emitActivityEvent(...)` for workflow templates. Has a 10-second `linearSyncedAt` echo-suppression guard to avoid sync loops — but no general dedup. No timestamp/replay window.

### tRPC + UI

- **Router** — `apps/web/trpc/routers/integration.ts`: `listConnected`, `disconnect` (line 1097+), `github.*` (listOrgs/listRepos/previewImport/executeImport, line 198+), `notion.*` (listPages/previewImport/importPages/recleanImported, line 709+). Notion import relinks `notion://page/{id}` → `/notes/{omniId}`.
- **UI** — `apps/web/app/(dashboard)/settings/integrations/page.tsx`, `apps/web/components/integrations/{github,notion}-import-dialog.tsx`.

### Rate limiting

- `apps/web/lib/rate-limit.ts`: `loginLimiter` (5/min), `oauthLimiter` (10/min), `apiLimiter` (100/min), note read/write limiters. **No webhook limiter.** OAuth authorize routes use `oauthLimiter`; webhook routes use none.

---

## 3. Findings & Best Practices

### OAuth 2.0 / PKCE (RFC 9700)

- **PKCE is mandatory for public clients, recommended for confidential clients** ([RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)). The aggregated source originally claimed PKCE is "mandatory for all client types" and that plain text is prohibited — both **refuted**. RFC 9700 requires PKCE for public clients (native/desktop, SPAs), *recommends* it for confidential clients, and does *not* prohibit the `plain` method (`S256` is a SHOULD). The blanket "all clients / no plain text" rule belongs to **OAuth 2.1**, a separate spec. Net for OmniTool: PKCE is recommended (defense-in-depth), and if added, use `S256`.
- **PKCE downgrade-attack prevention is required** ([RFC 9700](https://datatracker.ietf.org/doc/html/rfc9700)) — **confirmed (0.99)**. The authorization server "must reject token requests containing a `code_verifier` if no `code_challenge` was present in the authorization request." This is enforced by the *provider* (GitHub/Notion/Linear/Slack), not OmniTool, but it is the reason a half-finished PKCE rollout (verifier sent without challenge) can silently break.
- **Public-client refresh tokens must be sender-constrained (DPoP/mTLS) OR use rotation** ([RFC 9700 §2.2.2](https://www.rfc-editor.org/rfc/rfc9700)) — **confirmed (0.92)**. OmniTool satisfies the disjunction's rotation arm reactively: it stores rotated refresh tokens when providers send them (`token-refresh.ts:116`) but does not implement DPoP/mTLS or proactively invalidate old tokens. Practically acceptable for a confidential-client architecture; the explicit gap is that there is no sender-constraint binding.

### Webhook security

- **Timing-safe HMAC over raw bytes before parsing** ([hooklistener.com](https://www.hooklistener.com/learn/webhook-security-fundamentals)) — OmniTool **already complies** for all three webhooks: each reads `await req.text()` and verifies with `timingSafeEqual` before `JSON.parse`.
- **Timestamp validation (reject > 5 min) + per-source rate limiting** ([hooklistener.com](https://www.hooklistener.com/learn/webhook-security-fundamentals)). OmniTool: Slack has the ±5-min window; **GitHub and Linear do not** (those protocols don't send a standalone timestamp header, so replay protection there must come from delivery-id dedup instead). No webhook is rate-limited.
- **Ephemeral signing secrets via JWKS** ([dev.to](https://dev.to/digital_trubador/webhook-security-best-practices-for-production-2025-2026-384n)) — **refuted (0.88) / do not adopt now.** Verification found this is an emerging research recommendation, *not* mainstream practice: GitHub and Stripe still use long-lived static webhook secrets as of mid-2026. OmniTool's static env-based secrets are in line with the dominant providers. Treat ephemeral signing as future-watch, not a current gap.

### Webhook reliability & delivery semantics

- **At-least-once + idempotent processing keyed on delivery/event id** ([hookdeck.com](https://hookdeck.com/webhooks/guides/webhook-delivery-guarantees)). Exactly-once is impossible (FLP); providers retry, so handlers must dedup and prefer absolute-state writes. OmniTool **lacks idempotency**: `x-github-delivery` and Slack `event_id` are logged, never checked. Linear's 10s echo guard is loop-prevention, not dedup.
- **Queue-first architecture: fast ack → durable queue → async worker → idempotent processing → DLQ** ([hookdeck.com](https://hookdeck.com/blog/webhooks-at-scale)). OmniTool processing is synchronous (or fire-and-forget for Slack). No durable queue. A worker crash between ack and completion silently drops the event with no retry.
- **Retry with exponential backoff + jitter, cap ~1h, then DLQ** ([webhookstream.com](https://webhookstream.com/blog/webhook-retry-strategies-and-exponential-backoff-explained)). OmniTool has no retry logic of its own; it relies entirely on the provider's retry, which it then *defeats* by always returning 200 even on handler failure.

### Provider-specific (from research; provider docs not independently re-fetched here)

- **Linear**: GraphQL limits ~1,500 req/hr (API key) / 500 req/hr (OAuth); webhooks preferred over polling; no GraphQL subscriptions in SDK ([linear.app/developers/graphql](https://linear.app/developers/graphql)). Refresh: `POST https://api.linear.app/oauth/token`, `grant_type=refresh_token` ([linear.app/developers/oauth-2-0-authentication](https://linear.app/developers/oauth-2-0-authentication)) — matches OmniTool's `refreshLinear`. Linear ships a `LinearWebhookClient.verify()` helper ([linear.app/developers/sdk-webhooks](https://linear.app/developers/sdk-webhooks)); OmniTool hand-rolls the equivalent HMAC check (fine, but the SDK helper would reduce drift risk).
- **Slack**: `xoxb-` bot tokens are workspace-scoped and don't expire on a timer ([docs.slack.dev/authentication/tokens](https://docs.slack.dev/authentication/tokens/)); least-privilege scopes + signing-secret verification + ~90-day rotation recommended ([api.slack-gov.com](https://api.slack-gov.com/authentication/best-practices)). OmniTool's `SlackTeamInstall` per-workspace model fits this; multi-workspace token *routing* (selecting the right bot token per `team_id` at send time) should be reviewed when scaling beyond one workspace. (Verification on the Slack claims was truncated in the source material — treat the workspace-scoping detail as high-confidence vendor doc, the rotation cadence as advisory.)

---

## 4. Recommendations mapped to OmniTool

1. **Add webhook idempotency/dedup.** New `WebhookEvent` table (or a Redis `SET NX EX` keyed on `provider:deliveryId`) checked at the top of each webhook handler before doing work. Use `x-github-delivery` (GitHub), `event_id` (Slack), and a derived `{type}:{data.id}:{action}:{createdAt}` key (Linear, which lacks a delivery id). This is the single highest-value, lowest-risk fix and directly closes the at-least-once duplicate-processing gap. Files: `apps/web/app/api/webhooks/{github,slack,linear}/route.ts`, optional `schema.prisma`.
2. **Stop returning 200 on transient handler failures (or move work behind a queue).** Today every handler error returns 200, permanently defeating provider retries. Either (a) introduce a durable queue (Upstash QStash fits the existing Upstash dependency, or `pg-boss` on the existing Postgres) so the route just enqueues + acks, with an idempotent async worker + DLQ; or (b) at minimum distinguish transient vs permanent errors and return non-2xx on transient ones so the provider retries. (a) is the correct long-term shape per the queue-first best practice.
3. **Add a webhook rate limiter.** A dedicated `webhookLimiter` in `lib/rate-limit.ts` (per source IP, generous sliding window) defends against retry storms and accidental loops. Low risk; mirrors the existing `oauthLimiter` pattern.
4. **Add PKCE (`S256`) to the OAuth authorize/callback flows.** Generate `code_verifier`, store it alongside the state (cookie for web; in the signed desktop state payload or a short-lived server store for desktop), send `code_challenge` + `code_challenge_method=S256` on authorize, send `code_verifier` on token exchange. Defense-in-depth for the desktop public surface and aligns with RFC 9700's recommendation for confidential clients. Roll out per-provider (start with GitHub/Linear which document PKCE support); never send a verifier without first sending a challenge (downgrade-protection).
5. **Add a Linear/GitHub replay window via dedup.** Since neither protocol sends a standalone timestamp, replay protection is achieved through #1 (dedup) rather than a time window. Document this so it isn't re-flagged.
6. **Reuse Linear's `LinearWebhookClient.verify()`** instead of the hand-rolled HMAC in `webhooks/linear/route.ts` to reduce signature-scheme drift if Linear changes it. Low priority.
7. **Do NOT pursue ephemeral/JWKS webhook secrets** at this time — refuted as mainstream; static secrets match GitHub/Stripe. Track as future-watch only.

---

## 5. Prioritized Implementation Plan

| Item | Files | Risk | Effort | Rationale |
|------|-------|------|--------|-----------|
| Webhook idempotency/dedup (Redis `SET NX EX` keyed on delivery/event id; Linear derives a composite key) | `apps/web/app/api/webhooks/{github,slack,linear}/route.ts`; optionally `packages/database/prisma/schema.prisma` (`WebhookEvent`) | low | M | Providers deliver at-least-once and retry; OmniTool currently re-processes duplicates (double activity events, redundant upserts). Highest value, isolated change; Upstash Redis already wired. |
| Webhook-specific rate limiter | `apps/web/lib/rate-limit.ts`; `apps/web/app/api/webhooks/{github,slack,linear}/route.ts` | low | S | Defends against retry storms / accidental loops; mirrors existing `oauthLimiter`. |
| Correct retry semantics: return non-2xx on transient handler errors (interim before queue) | `apps/web/app/api/webhooks/{github,slack,linear}/route.ts` | medium | S | Today 200-on-error defeats provider retries, silently dropping events. Needs idempotency (item 1) shipped first so retries are safe. |
| Queue-first webhook processing (enqueue+ack → idempotent worker → DLQ) via QStash or pg-boss | new `apps/web/lib/webhooks/queue.ts` + worker route; webhook routes; `schema.prisma` (DLQ table) | medium | L | Correct long-term reliability shape; decouples ack from processing. Larger surface; do after dedup + rate limit land. |
| Add PKCE (`S256`) to OAuth flows, per-provider | `apps/web/app/api/integrations/*/authorize/route.ts`, `*/callback/route.ts`, `apps/web/lib/oauth-state.ts` | medium | M | RFC 9700 defense-in-depth for desktop/public surface; must store verifier with state and never send verifier without challenge (downgrade protection). Per-provider rollout. |
| Reuse `LinearWebhookClient.verify()` for Linear signature | `apps/web/app/api/webhooks/linear/route.ts`; `packages/integrations/src/providers/linear.ts` | low | S | Reduces drift if Linear changes its signing scheme; SDK already a dependency. |
| Multi-workspace Slack bot-token routing review | `packages/integrations/src/providers/slack.ts`; `apps/web/app/api/webhooks/slack/route.ts` | low | M | `SlackTeamInstall` is per-workspace; confirm send-time token lookup keys off `team_id` before scaling past one workspace. |

---

## Top pick (immediate, low-risk, well-scoped)

**Webhook idempotency/dedup.** It is low risk, self-contained, uses the already-wired Upstash Redis client (same `SET NX EX` primitive proven in `token-refresh.ts`), and directly closes the most impactful gap: providers deliver at-least-once and retry on non-2xx, so the current handlers re-run non-idempotent work (duplicate `emitActivityEvent` calls, redundant issue upserts) on every redelivery. A guard that checks `provider:deliveryId` (GitHub `x-github-delivery`, Slack `event_id`, Linear composite `{type}:{data.id}:{action}:{createdAt}`) at the top of each route, recording the id with a TTL, makes processing safely repeatable and is a prerequisite for fixing retry semantics later.
