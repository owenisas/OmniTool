# Debugging & Observability

## 1. Summary

OmniTool has a **strong testing/validation posture** but a **thin runtime observability posture**. The 5-layer E2E pipeline (Vitest units, OAuth mock harness, Playwright route + integration smoke, macOS deep-link smoke) plus a two-job-always-on CI workflow catch regressions well before release. What is missing is everything that helps after code is shipped: there is no centralized error capture, no distributed tracing, no source maps in production builds, no structured/aggregatable logging, and no client-side error reporting. Error handling today is **ad-hoc per route**, errors in fire-and-forget paths (activity emit, workflow triggers) are swallowed to `console.error`, and the Node sidecar + Rust shell emit unstructured `console.error`/`eprintln!` text that cannot be correlated across the stack.

Next.js 15.5 (the version in use, `apps/web/package.json` → `"next": "^15.5.18"`) ships the `onRequestError` instrumentation hook and Turbopack source-map upload, both of which OmniTool can adopt with minimal surface area. Because PostHog tooling is available in this environment and there is no analytics vendor wired yet, PostHog is a natural single-vendor home for both product analytics and error tracking — though for deep performance/APM tracing Sentry remains the stronger option.

The highest-leverage, lowest-risk first step is a **`apps/web/instrumentation.ts` with an `onRequestError` hook plus a tiny structured server logger**, which consolidates the currently-scattered error handling without changing any business logic.

---

## 2. Current State in OmniTool

### Testing & validation (strong)

- **5-layer E2E pipeline** under `apps/web/e2e/` (documented in `apps/web/e2e/README.md`):
  - Layer 1 — Vitest units: `apps/web/lib/**/*.test.ts`, `apps/web/trpc/**/*.test.ts`, plus the Tauri IPC shim test (`apps/web/lib/tauri.test.ts`) using `@tauri-apps/api/mocks`.
  - Layer 2 — OAuth mock harness: `apps/web/e2e/harness/oauth-mock.ts` (local HTTP server impersonating GitHub OAuth).
  - Layer 3 — Playwright route smoke: `apps/web/e2e/playwright/tests/smoke.spec.ts` (walks dashboard routes, catches hydration mismatches / 5xx / pageerrors).
  - Layer 4 — Playwright OAuth integration: `apps/web/e2e/playwright/tests/integration-oauth.spec.ts`.
  - Layer 5 — macOS deep-link smoke: `apps/web/e2e/scripts/smoke-deeplinks.sh` (manual, pre-release).
- **CI/CD** (`.github/workflows/ci.yml`): `ci` job (lint, typecheck, build, Vitest) and `rust-tests` job (`cargo test`) always run; a `migration-drift` advisory job; an `e2e-mac` job (`runs-on: macos-14`) gated by the `e2e` PR label or pushes to main, with Playwright artifact upload.

### Error handling (partial, ad-hoc)

- **tRPC** (`apps/web/trpc/init.ts`): `TRPCError` for `UNAUTHORIZED` (`protectedProcedure`), `FORBIDDEN` (`assertTeamMembership`), `PRECONDITION_FAILED` (`teamProtectedProcedure` with no team), and `TOO_MANY_REQUESTS` (`noteProcedure` reads at 600/min, `noteMutationProcedure` at 120/min via Upstash). No tRPC error-formatter, no error logging middleware — errors propagate to the client untraced.
- **API routes**: handled per-route, no shared handler. `apps/web/app/api/ai/chat/route.ts` returns 401 / 429 / 503 / 400 / 404 / 500 via `NextResponse.json` with a top-level `try/catch`.
- **Health probes**:
  - `apps/web/app/api/ready/route.ts` — pure liveness, no DB. Used by the Tauri sidecar to confirm the server is up.
  - `apps/web/app/api/health/route.ts` — readiness with a `SELECT 1` DB check, env-var presence booleans, and DB latency; returns 503 on failure. Diagnostics gated behind `OMNITOOL_HEALTH_DIAGNOSTICS=1` in prod. This is effectively already a `/readyz`.
- **Background tasks** (`apps/web/lib/background-tasks/run.ts`): wraps async work, stores `{ id, label, status, result, error, startedAt }` in a Zustand store (`store.ts`), fires `sonner` toasts, and logs `onSuccess`/`onError` cleanup failures to `console.error`. Errors are stored as plain string messages.
- **Fire-and-forget swallowing**: `apps/web/lib/activity/emit.ts` catches and `console.error`s emission failures; `matchAndTriggerWorkflows(...).catch(() => {})` and `executeWorkflowRun(run.id).catch(console.error)` discard or only console-log failures.
- **Workflow engine** (`apps/web/lib/workflows/engine.ts`): step errors are returned as output `error` fields rather than thrown; run-level errors set status `failed` and persist the message to the DB. Per-step persistence enables resume on failure (the closest thing to durable observability in the app today).

### Desktop sidecar & Rust shell logging

- `apps/desktop/src-tauri/src/lib.rs` uses raw `eprintln!`/`println!` (≈18 call sites) for node-binary resolution, server-dir resolution, port reclaim (`reclaim_port_if_stuck`), startup timing, `wait_for_server_ready` polling of `/api/ready`, navigation, external-URL opens, and deep-link events. No `tracing` crate, **no `tauri-plugin-log`** in `apps/desktop/src-tauri/Cargo.toml`, no file rotation, no log levels — logs are lost once the terminal closes (a problem for installed-DMG debugging).

### Database logging

- `packages/database/src/index.ts`: `PrismaClient` with `log: ["query","error","warn"]` in dev, `["error"]` in prod. No OpenTelemetry tracing, no slow-query capture, no query correlation.

### Net gaps

- No `apps/web/instrumentation.ts` (confirmed absent).
- No error-tracking, OTel, Pino/Winston, or PostHog dependency in `apps/web/package.json` or the root `package.json` (confirmed absent).
- No source maps in production builds — minified prod stack traces are unreadable.
- No client-side error capture (React error boundaries report nothing externally).

---

## 3. Findings & Best Practices

> Each finding below was independently verified. Items marked **uncertain** are caveated; nothing in the verified set was outright **refuted**.

- **Next.js `onRequestError` hook (instrumentation.ts) — confirmed (0.95).** Introduced in Next.js 15.0, it captures server-side errors from Server Components, Route Handlers, Server Actions, and middleware. **Caveat from verification:** it captures errors the Next.js server itself surfaces, not literally every application-wide error — React may process some Server Component render errors before the hook sees them, and client-side errors are out of scope. Pair it with client-side error boundaries / client capture for full coverage. ([Next.js instrumentation reference](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation))

- **OpenTelemetry via `@vercel/otel` — confirmed (0.92).** The vendor-neutral standard for Next.js, initialized in `instrumentation.ts`; emits spans for routes, fetches, RSC requests, and middleware without lock-in, and lets you swap backends later. ([Next.js OpenTelemetry guide](https://nextjs.org/docs/app/guides/open-telemetry))

- **PostHog error tracking via `onRequestError` + client exception autocapture — confirmed (0.78).** Technical setup is fully confirmed. **Caveat:** the "recommended alternative to Sentry" framing is conditional — PostHog is the better fit when you want error tracking unified with analytics/replay/flags (which OmniTool would get for free, since no analytics vendor is wired and PostHog tooling is available here); Sentry remains stronger for sophisticated performance tracing/APM. Some build-compatibility issues with PostHog source-map upload on Next.js 15.3/15.4 have been reported, so validate the build before relying on it. ([PostHog Next.js error tracking](https://posthog.com/docs/error-tracking/installation/nextjs), [PostHog vs Sentry](https://posthog.com/blog/posthog-vs-sentry))

- **Sentry source maps for readable prod traces — confirmed (0.92).** Production builds need source-map upload for symbolicated stack traces; Next.js 15+ with Turbopack uploads after build completes (requires `@sentry/nextjs@10.13.0+`); client maps are deleted post-upload for security, server maps retained for runtime symbolication. Applies regardless of vendor: **OmniTool currently ships no source maps, so any prod error is effectively undebuggable.** ([Sentry Next.js source maps docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/))

- **Structured logging with Pino — uncertain (0.72) on the speed claim.** The "5–10x faster than Winston" number is **not supported** by official benchmarks, which show roughly **2.3–2.5x** for standard operations (occasionally ~7x in narrow configs). Treat the headline multiplier as marketing. What *is* confirmed and is the actionable part: JSON output with consistent metadata (timestamps, PIDs) and child loggers for context propagation are standard, well-documented patterns worth adopting. ([Pino benchmarks](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md))

- **`tauri-plugin-log` for unified Rust+JS desktop logging — confirmed (from material).** Provides configurable targets (terminal, file, webview), rotation limits, and filtering — directly addresses the lost-logs problem in installed DMGs where there is no terminal. ([Tauri Log plugin](https://v2.tauri.app/plugin/logging/))

- **Prisma OpenTelemetry tracing — confirmed (from material), with prerequisites.** Requires a schema preview flag plus `@prisma/instrumentation`; without both, queries emit no spans. Use sampling on high-traffic paths. Lets tRPC + DB latency show up as child spans under request traces. ([Prisma OTel tracing](https://www.prisma.io/docs/orm/prisma-client/observability-and-logging/opentelemetry-tracing))

- **Server Actions lack automatic OTel spans — confirmed (from material).** They must be wrapped (e.g. `Sentry.withServerActionInstrumentation()` or equivalent) to emit traces and preserve trace continuity across the client→server boundary. OmniTool leans mostly on tRPC rather than Server Actions, so this is lower priority here, but applies anywhere actions are used.

- **tRPC end-to-end OpenTelemetry — confirmed (from material).** A shared tracing package initialized via `instrumentation.ts` can emit a span per tRPC procedure, giving frontend→RPC→DB visibility. Fits OmniTool's monorepo shape (`packages/*` + `apps/web/trpc`). ([tRPC + OTel guide](https://oneuptime.com/blog/post/2026-02-06-trpc-end-to-end-opentelemetry-typescript/view))

- **Tauri Node-sidecar error propagation — confirmed (from material).** Localhost HTTP (what OmniTool does) is recommended, but the docs flag process-lifecycle and error-propagation challenges. OmniTool already has port-reclaim + a `/api/ready` health poll; the gap is bidirectional error signaling and capturing sidecar stdout/stderr durably. ([Tauri Node sidecar](https://v2.tauri.app/learn/sidecar-nodejs/))

- **Upstash rate-limit analytics — confirmed (from material).** Enabling the analytics dashboard surfaces consumption patterns and limit-exhaustion alerts for OmniTool's existing Upstash limiters. ([Upstash rate-limit dashboard](https://upstash.com/blog/ratelimit-dashboard))

- **Liveness vs readiness probe separation — confirmed (from material).** Liveness checks app health only; readiness includes downstream (DB) and should fail before shutdown to drain traffic; `/livez` + `/readyz` is the conventional naming. **OmniTool already implements this split in substance** — `/api/ready` is liveness (no DB) and `/api/health` is readiness (DB `SELECT 1`); only the naming differs from convention. ([Node.js health checks](https://dev.to/axiom_agent/nodejs-health-checks-readiness-probes-in-production-39bi))

---

## 4. Recommendations Mapped to OmniTool

1. **Add `apps/web/instrumentation.ts` with `onRequestError` + a structured server logger.** Capture server-side errors centrally and emit them as JSON (with a request id, route, and timestamp) instead of relying on per-route `try/catch` + `console.error`. This is the single consolidation point Next.js gives us; it touches no business logic. Route the captured error to a small `apps/web/lib/observability/logger.ts` (thin Pino or even `console.*` JSON wrapper to start) so the swallowed paths in `lib/activity/emit.ts` and `lib/workflows/engine.ts` can log through the same channel.

2. **Wire client + server error tracking through PostHog.** Since no analytics vendor is wired and PostHog tooling is available, use PostHog for exception autocapture (client) and forward `onRequestError` payloads (server). One vendor for analytics + errors + replay; revisit Sentry only if/when deep APM tracing becomes a need. Validate the production build given the reported 15.3/15.4 source-map-upload caveat.

3. **Enable production source maps.** Without them every minified prod stack trace is noise. Whichever vendor is chosen, turn on source-map upload (Turbopack post-build) so the captured errors are actually debuggable. Delete client maps post-upload; keep server maps for runtime symbolication.

4. **Adopt `tauri-plugin-log` in `apps/desktop`.** Replace the ~18 raw `eprintln!`/`println!` sites in `src-tauri/src/lib.rs` with leveled `log::` calls routed to a rotating file target, so installed-DMG debugging no longer depends on a terminal. Also capture the Node sidecar's stdout/stderr into the same file so sidecar startup failures are recoverable post-mortem.

5. **Add OTel (`@vercel/otel`) + a tRPC span middleware, then Prisma OTel spans.** Layer in distributed tracing after error tracking lands: initialize `@vercel/otel` in `instrumentation.ts`, add a tRPC middleware that opens a span per procedure (natural home in `apps/web/trpc/init.ts`), and enable Prisma's OTel preview flag for DB-level spans. Sampled, vendor-neutral.

6. **Rename/alias health probes to convention and add Upstash analytics.** Optionally expose `/livez` (alias of `/api/ready`) and `/readyz` (alias of `/api/health`) for standard tooling; enable Upstash rate-limit analytics on the existing limiters for traffic-pattern visibility. Low value relative to 1–4; do last.

---

## 5. Prioritized Implementation Plan

| Item | Files | Risk | Effort | Rationale |
|------|-------|------|--------|-----------|
| `instrumentation.ts` + `onRequestError` + structured server logger | `apps/web/instrumentation.ts` (new), `apps/web/lib/observability/logger.ts` (new), `apps/web/lib/activity/emit.ts`, `apps/web/lib/workflows/engine.ts` | low | M | Single Next.js-native consolidation point for server errors; no business-logic change; gives the swallowed fire-and-forget paths a real log channel. |
| Production source-map upload | `apps/web/next.config.mjs`, build/CI config | low | S | Prerequisite for any error tracking to be debuggable; minified prod traces are currently unreadable. |
| PostHog client + server error tracking | `apps/web/instrumentation.ts`, `apps/web/app/providers.tsx`, `apps/web/package.json` | medium | M | Single vendor for analytics + errors + replay; PostHog tooling available; validate against 15.3/15.4 source-map caveat. |
| `tauri-plugin-log` for desktop + sidecar | `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/tauri.conf.json` | medium | M | Installed-DMG logs currently vanish with the terminal; rotating file target makes sidecar failures recoverable post-mortem. |
| `@vercel/otel` + tRPC span middleware | `apps/web/instrumentation.ts`, `apps/web/trpc/init.ts`, `apps/web/package.json` | medium | L | Distributed tracing across web→RPC; vendor-neutral; do after error tracking lands. |
| Prisma OTel spans | `packages/database/prisma/schema.prisma`, `packages/database/src/index.ts` | medium | M | DB-level spans under request traces; needs schema preview flag + `@prisma/instrumentation`; sample on hot paths. |
| `/livez` + `/readyz` aliases + Upstash analytics | `apps/web/app/api/livez/route.ts`, `apps/web/app/api/readyz/route.ts` (new), Upstash config | low | S | Convention alignment + rate-limit visibility; lowest marginal value, do last. |

---

## Top Pick (implement now)

**Add `apps/web/instrumentation.ts` with an `onRequestError` hook plus a small structured server logger.** It is **low risk** (additive, business-logic-untouched), well-scoped, and Next.js-native (15.5 is already in use). It immediately stops the per-route `console.error` scatter and the swallowed fire-and-forget errors in `lib/activity/emit.ts` and `lib/workflows/engine.ts` from being invisible, and it becomes the single insertion point that every later step (PostHog forwarding, OTel) plugs into.
