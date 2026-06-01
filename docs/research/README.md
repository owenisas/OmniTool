# OmniTool Research Reports — Index

> Per-topic research reports for OmniTool, verified against the codebase on 2026-05-28.
> Each report grounds its claims in actual source files, benchmarks them against 2025–2026 best practice, and explicitly caveats any refuted or uncertain external claims.

This run covered five topics. For each, a verified research report was written, and the top-pick recommendation was implemented end-to-end. The sections below link the reports, summarize the key findings, list what was implemented this run, and collect the remaining backlog.

## Reports

| # | Topic | Report |
|---|-------|--------|
| 1 | Automation with AI agents (Claude Code / Codex) | [`01-automation-ai-agents.md`](./01-automation-ai-agents.md) |
| 2 | Project management (issues, tasks, performance) | [`02-project-management.md`](./02-project-management.md) |
| 3 | Third-party app integrations | [`03-third-party-integrations.md`](./03-third-party-integrations.md) |
| 4 | UI enhancements | [`04-ui-enhancements.md`](./04-ui-enhancements.md) |
| 5 | Debugging & observability | [`05-debugging-observability.md`](./05-debugging-observability.md) |

Background memo (pre-existing): [`coding-agents-slack-linear-jira-notion.md`](./coding-agents-slack-linear-jira-notion.md).

---

## Key findings by topic

### 1. Automation with AI agents (Claude Code / Codex)

OmniTool has a tool-calling chat backend (non-streaming `generateText`), a 2-tier tool ecosystem, an MCP server exposing ~11 tools via bearer-PAT/SHA-256 auth, an 11-tool coding-session scanner, a daily-summary pipeline, and an `AgentHandoff` lifecycle. Two intake-brief corrections: `apps/web/lib/mcp/tools.ts` is ~495 lines / ~11 tools (not ~3,900 lines / 22 tools), and the chat route uses non-streaming `generateText`.

- **Verified defect:** `apps/web/lib/handoffs/providers/claude-code.ts` was a stub that never submitted to any API and whose `pollClaudeCodeTask` always returned `"running"`, so a `claude-code` handoff could never advance past `SUBMITTED`. The Codex adapter, by contrast, makes a real OpenAI Responses API call.
- Polling runs only daily (8am UTC) due to Vercel Hobby's 1-cron limit.
- The Claude Agent SDK is the documented headless fit. The OpenTelemetry-span claim was **refuted** (SDK `query()` only emits `claude_code.llm_request` spans) and is caveated; the ESAA arXiv id is unverifiable and flagged as pattern-only. Durable-execution options (Vercel Workflows, Trigger.dev, Inngest) are the medium-term substrate.

### 2. Project management (issues, tasks, performance)

A solid type-safe core: Project→Task/Issue with subtask hierarchy (`Task.parentId`), polymorphic Comment/Label, `TimeEntry` start/stop timers, a `PerformanceMetric` store, and an immutable `ActivityEvent` audit log that drives the workflow engine. tRPC routers consistently guard via `assertTeamMembership`.

- Dashboard/performance surface raw counts, not flow metrics (cycle time, throughput, WIP).
- `PerformanceMetric` has **no writer** — metrics are computed ad-hoc on read.
- GitHub/Linear sync is outbound-only fire-and-forget with no inbound webhook.
- GitHub sync helpers and an access-check helper are duplicated inline instead of shared.
- Refuted/caveated: Height shut down Sept 2025 (not a live precedent); velocity/burndown are being superseded by flow + DORA metrics — the report steers toward flow metrics. No WIP-limit or cycle-time field existed on `Task`.

### 3. Third-party app integrations

The integration layer (GitHub, Notion, Slack, Linear) is mature: shared provider registry, AES-256-GCM token encryption, a distributed Redis + in-process refresh lock that avoids burned-refresh-token races, HMAC-signed desktop OAuth state, and timing-safe HMAC verification on all three webhooks. Two code-map claims were stale in OmniTool's favor: the Linear webhook is fully implemented (not a placeholder), and Slack + Linear both have working authorize/callback routes.

- **Real gaps:** webhook reliability — no idempotency/dedup (`x-github-delivery` and Slack `event_id` logged but unused), no durable queue/retry/DLQ, handlers return 200 even on failure (defeating provider retries), no webhook rate limiter. OAuth hardening — no PKCE in the integration flows.
- Caveated refutations: PKCE is mandatory only for public clients (the "all clients / no plain text" rule is OAuth 2.1, not RFC 9700); ephemeral JWKS webhook secrets are emerging, not mainstream (GitHub/Stripe still use static secrets) — explicitly recommended against adopting now.

### 4. UI enhancements

A mature, cohesive shadcn/ui + Radix design system with `next-themes` dark mode and a Notion-aligned Notes editor.

- Refuted: the focus-ring contrast claim (`button.tsx` uses `focus-visible:ring-2 ring-ring` at full opacity, not `ring-ring/50`; the 3:1 figure is WCAG AAA, not AA). `onOpenAutoFocus` exists in 6 source files (not 1).
- **Real gaps:** zero `aria-invalid`/`aria-describedby` in source, no app-wide `prefers-reduced-motion` media query in `globals.css` (only `page-transition.tsx` honored it), Suspense used only in login, `useTransition` in only 2 source components. No `framer-motion` dependency present.

### 5. Debugging & observability

Strong 5-layer E2E test pipeline and two always-on CI jobs, but thin runtime observability. No `instrumentation.ts`, no error-tracking/OTel/PostHog/Pino dependency, no production source maps, ad-hoc per-route error handling.

- Nuances vs. source material: the app already implements liveness/readiness split (`/api/ready` = pure liveness, `/api/health` = `SELECT 1` DB check) — only naming differs from `/livez`+`/readyz`. Next.js is 15.5.18, so `onRequestError` and Turbopack source-map upload are available today. The Pino "5-10x faster than Winston" claim is uncertain (official benchmarks ~2.3–2.5x) and caveated. PostHog-as-Sentry-alternative is caveated as conditional.
- Fire-and-forget error swallowing confirmed in `lib/activity/emit.ts` (`.catch(()=>{})`) and `lib/workflows/engine.ts`; desktop `lib.rs` uses ~18 raw `eprintln!`/`println!` with no `tauri-plugin-log`.

---

## Implemented this run

Each topic's top-pick recommendation was implemented. All changes typecheck clean on the web app.

### 1. Replace Claude Code handoff stub with a real headless Agent SDK run

Fixed the verified defect where a `claude-code` handoff could never complete. Rewrote `apps/web/lib/handoffs/providers/claude-code.ts` to run headlessly via `@anthropic-ai/claude-agent-sdk`'s `query()` (fire-and-forget submit, in-process `runStore` for poll results, graceful degradation when `ANTHROPIC_API_KEY` is unset or the SDK is not installed). Extended the `claude-code` branch of `apps/web/app/api/cron/handoff-poll/route.ts` to match the codex branch (`handoff.completed` event, `failed`→REJECTED, `running`→IN_PROGRESS). Added the SDK dependency to `apps/web/package.json`.

- Files: `apps/web/lib/handoffs/providers/claude-code.ts`, `apps/web/app/api/cron/handoff-poll/route.ts`, `apps/web/package.json`

### 2. Cycle-time tracking (add `Task.firstStartedAt`)

Implemented cycle-time (flow) tracking end-to-end, additive and low-risk. Added a nullable `firstStartedAt` column to the `Task` model; added an idempotent stamp-on-first-IN_PROGRESS rule to `task.update` and `task.move`; added avg/median cycle-time aggregation to `performance.getDashboardStats`; added a fifth "Cycle time (median)" stat card to the performance page (with empty state). Ran `pnpm db:generate` (codegen only).

- Files: `packages/database/prisma/schema.prisma`, `apps/web/trpc/routers/task.ts`, `apps/web/trpc/routers/performance.ts`, `apps/web/app/(dashboard)/performance/performance-page-client.tsx`

### 3. Webhook idempotency/dedup

Added a shared dedup guard (`apps/web/lib/webhooks/dedup.ts`) using the Upstash Redis `SET NX EX` primitive proven in `token-refresh.ts` (24h TTL, fail-open when Redis is absent). Wired it into all three webhook routes after signature verification and before any non-idempotent work: GitHub keys on `x-github-delivery`, Slack on `event_id`, Linear on a composite key (`webhookId:type:action:dataId:webhookTimestamp`). Closes the duplicate-processing gap from at-least-once provider redeliveries.

- Files: `apps/web/lib/webhooks/dedup.ts`, `apps/web/app/api/webhooks/github/route.ts`, `apps/web/app/api/webhooks/slack/route.ts`, `apps/web/app/api/webhooks/linear/route.ts`

### 4. Global `prefers-reduced-motion` guard

Added a global `@media (prefers-reduced-motion: reduce)` block to `apps/web/app/globals.css` that neutralizes animation/transition durations app-wide (WCAG 2.3.3), targeting `*`, `*::before`, `*::after` with `0.01ms` durations (so JS `animationend`/`transitionend` listeners still fire), capped iteration count, and `scroll-behavior: auto`. App-wide backstop complementing the existing per-component `motion-reduce:animate-none`.

- Files: `apps/web/app/globals.css`

### 5. `instrumentation.ts` with `onRequestError` hook + structured server logger

Added a dependency-free structured logger (`apps/web/lib/observability/logger.ts`) and a Next.js `instrumentation.ts` implementing `register()` and the native `onRequestError` hook, both routing through a single `forward()` choke-point for a future PostHog/OTel step. Replaced previously-swallowed fire-and-forget error paths with scoped logger calls in `lib/activity/emit.ts`, `lib/workflows/engine.ts`, and `lib/workflows/scheduler.ts`. Additive; no control-flow changes.

- Files: `apps/web/lib/observability/logger.ts`, `apps/web/instrumentation.ts`, `apps/web/lib/activity/emit.ts`, `apps/web/lib/workflows/engine.ts`, `apps/web/lib/workflows/scheduler.ts`

---

## Remaining backlog

### Required follow-ups (activation steps for what was shipped)

- **Topic 1:** Run `pnpm install` to fetch `@anthropic-ai/claude-agent-sdk`; set `ANTHROPIC_API_KEY` in the desktop sidecar / Vercel env to activate real runs.
- **Topic 2:** Run `pnpm db:push` to apply the new `firstStartedAt` column to Supabase Postgres (intentionally skipped; required before `getDashboardStats` works at runtime).

### Automation with AI agents

- Add agent-run observability via SDK `PreToolUse`/`PostToolUse`/`Stop` hooks emitting structured activity events (`run-events.ts`).
- Add an on-demand `/api/handoffs/[id]/poll` route reusing `pollClaudeCodeTask` to remove daily-cron latency.
- Add a Layer 1 unit test for the claude-code provider (mock the SDK `query()` async iterable) once the dependency is installed.
- (High risk/large) Move runs onto a durable execution runtime so they survive deploys/restarts instead of the in-process `runStore`.

### Project management

- Surface cycle time as a persisted `PerformanceMetric` (CYCLE_TIME) via a planned daily cron snapshot so trends persist.
- Add throughput (DONE/week) and current WIP (IN_PROGRESS+IN_REVIEW count) to the dashboard to complete the flow-metrics set.
- Add an integration test for the stamp rule and the median/avg math.

### Third-party integrations

- Add a Layer 1 Vitest unit test for `claimWebhookDelivery` (dedup hit/miss + fail-open).
- Add a webhook-specific rate limiter (per-source-IP sliding window mirroring `oauthLimiter`).
- (Medium risk) Correct retry semantics — return non-2xx on transient handler errors (now safe given dedup).
- Queue-first webhook processing (enqueue+ack → idempotent worker → DLQ) via QStash or pg-boss.
- Optional durable `WebhookDelivery` Prisma table if dedup history beyond the 24h Redis TTL is needed.

### UI enhancements

- Add `aria-invalid` / `aria-describedby` support to form primitives (`input.tsx`, `textarea.tsx`, `select.tsx`).
- Introduce a shared `IconButton` wrapper and migrate icon-only call-sites for enforced accessible names.
- (Medium risk) Add granular Suspense boundaries / `loading.tsx` to heavy dashboard routes.
- (Medium risk) Wrap non-urgent heavy updates (search filtering, team switching) in `startTransition`.
- Upgrade dialog `onOpenAutoFocus` handlers from `preventDefault()` to focusing a meaningful element.
- (Optional) Add custom animation tokens (stagger, blur-fade) for richer micro-interactions.

### Debugging & observability

- Enable production source-map upload in `apps/web/next.config.mjs` (prerequisite for readable prod stack traces).
- (Medium risk) Wire PostHog client+server error tracking by extending `logger.forward()` and `instrumentation.ts`.
- Add `@vercel/otel` + per-procedure tRPC span middleware in `trpc/init.ts` after an error backend is live.
- Enable Prisma OpenTelemetry spans (schema preview flag + `@prisma/instrumentation`).
- Adopt `tauri-plugin-log` for desktop `lib.rs` `eprintln`/`println` sites + capture Node sidecar stdout/stderr.
- Add `/livez` + `/readyz` aliases and enable Upstash rate-limit analytics.
- (Optional) Migrate the remaining ~58 ad-hoc `console.error` call-sites to `createLogger()`.
