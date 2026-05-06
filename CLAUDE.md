# OmniTool

Internal company app: performance tracking, issue tracking, notes/ideas, integrations, AI agents, team workspaces, and configurable UI settings.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **Desktop**: Tauri v2 native shell in `apps/desktop`
- **Installability**: PWA manifest in `apps/web/app/manifest.ts`
- **UI**: shadcn/ui + Tailwind CSS (`darkMode: class`) + **next-themes** (`ThemeProvider` in `apps/web/app/providers.tsx`)
- **Database**: PostgreSQL (Supabase-hosted) + Prisma 6
- **API**: tRPC v11 (type-safe end-to-end)
- **Auth**: Supabase Auth (`@supabase/ssr`) — email/password sign-in, sign-up, password reset, email verification. User management via Supabase Dashboard.
- **AI**: Vercel AI SDK; **NVIDIA NIM** (OpenAI-compatible, `@ai-sdk/openai`) when `NVIDIA_API_KEY` is set, else **Anthropic** (`@ai-sdk/anthropic`) — resolved in `apps/web/lib/ai/language-model.ts`
- **Sync**: Local-first sync boundary in `packages/sync` with PowerSync-oriented config
- **Monorepo**: Turborepo + pnpm workspaces
- **Hosting**: Vercel (production URL: `https://omnitool-flame.vercel.app`, custom domain: `https://omnitool.reunifylabs.com`)
- **Rate Limiting**: Upstash Redis (`@upstash/ratelimit`) — login, OAuth, API routes

## Project Structure

```
apps/web/                 # Next.js web app, PWA, hosted backend routes
apps/desktop/             # Tauri v2 native desktop wrapper
packages/database/        # Prisma schema + generated client
packages/ui/              # Shared shadcn/ui components
packages/ai/              # AI prompts, tools; `createChatTools({ userId })` for chat route
packages/integrations/    # Third-party provider SDKs, token encryption (AES-256-GCM), token refresh
packages/coding-sessions/ # Coding-agent session scan utilities
packages/shared/          # Types, validators, constants
packages/sync/            # Local-first sync table boundaries and bootstrap types
supabase/                 # Supabase config.toml + migrations (managed via `supabase` CLI)
```

## Commands

When the user says "run" or "run the app", always run `pnpm build:desktop` (production desktop build). This builds the standalone Next.js server, bundles it with the Node.js sidecar, and produces the distributable app. Dev mode (`pnpm dev:desktop`) is too slow for testing — it compiles on-demand via Turbopack. Always use the production build to confirm the real user experience.

```bash
pnpm dev            # Start all dev servers
pnpm dev:web        # Start web app only
pnpm dev:desktop    # Start the native Tauri desktop app
pnpm build          # Build all packages
pnpm build:desktop  # Build the Tauri desktop app
pnpm db:generate    # Generate Prisma client
pnpm db:push        # Push schema to database (no migration file)
pnpm db:migrate     # Run migrations
pnpm db:deploy      # Apply migrations in production
pnpm db:seed        # Seed database
pnpm db:studio      # Open Prisma Studio
pnpm typecheck      # Type-check all packages
```

## Deployment

- **Production**: Vercel, project `omnitool`, team `thomassuent-5734s-projects`
- **Credentials**: `.env.deploy.local` (Vercel token, project/team IDs, Upstash keys)
- **Deploy command** (must use `--cwd` to monorepo root):
  ```bash
  VERCEL_ORG_ID=$VERCEL_TEAM_ID VERCEL_PROJECT_ID=$VERCEL_PROJECT_ID \
    vercel deploy --prod --archive=tgz --token $VERCEL_TOKEN \
    --cwd /path/to/OmniTool
  ```
- **Vercel project root directory**: `apps/web` (set in Vercel dashboard)
- **Build config**: `apps/web/vercel.json` — custom `buildCommand` runs from monorepo root via `cd ../..`
- **Supabase config push**: `supabase config push --project-ref irtrdplptcxvdbzabjri` (auth settings, redirect URLs)

## Auth (Supabase)

- **Client helpers**: `apps/web/lib/supabase/client.ts` (browser singleton), `server.ts` (server components/routes), `middleware.ts` (edge session refresh), `admin.ts` (service role)
- **Session function**: `apps/web/lib/auth.ts` — `auth()` returns `AppSession | null`. Wrapped in React `cache()` so multiple calls per request (layout, page, tRPC context) share one Supabase + Prisma lookup.
- **JIT user sync**: When a Supabase user signs in but has no Prisma `User` row, `auth()` auto-creates one via `supabaseAuthId` mapping.
- **Middleware**: `apps/web/middleware.ts` → `updateSession()` — uses `getSession()` (local JWT decode, no network call) for redirect decisions. Redirects unauthenticated users to `/login`, authenticated users away from `/login` and `/signup`.
- **Auth pages**: `/login`, `/signup`, `/reset-password`, `/update-password` — all under `apps/web/app/(auth)/`
- **PKCE callback**: `apps/web/app/api/auth/callback/route.ts` — exchanges auth code for session (email confirmation, password reset)
- **Password change**: Settings → Security uses `supabase.auth.updateUser({ password })` directly (no tRPC)
- **Default admin**: `admin@omnitool.dev` / `admin123!` (Supabase Auth user ID: `e5c387c2-3981-42a4-be64-f13c7d64be64`)

## App Targets

- Web/PWA entrypoint: `apps/web`
- PWA manifest: `apps/web/app/manifest.ts`
- PWA icons: `apps/web/public/icon.svg`, `apps/web/public/icon-maskable.svg`, `apps/web/public/apple-touch-icon.svg`
- Desktop manifest: `apps/desktop/src-tauri/tauri.conf.json`
- Desktop app icon: `apps/desktop/src-tauri/icons/icon.png`
- Desktop dev expects the web dev server at `http://localhost:3000`. If port 3000 is already occupied by another app, stop that process before running `pnpm dev:desktop`.
- Desktop release bundles (`pnpm build:desktop`) embed a tiny static redirect shell (`scripts/desktop-before-build.mjs` → `apps/desktop/app-shell`) that opens the **hosted** web app: set `OMNITOOL_DESKTOP_URL` or rely on `NEXT_PUBLIC_OMNITOOL_WEB_URL` / `AUTH_URL`. A full Next static export is not used (API routes, tRPC require a running server).
- Desktop OAuth flows open in the system browser via `tauri-plugin-shell` (`apps/web/lib/tauri.ts` → `startOAuthFlow()`)

## OAuth Integrations

- **Providers**: GitHub, Notion (Slack and Linear registered but not fully wired)
- **Flow**: Authorize route → CSRF state cookie → provider OAuth → callback route → encrypted token storage
- **Routes**: `apps/web/app/api/integrations/{github,notion}/{authorize,callback}/route.ts`
- **Token storage**: `ConnectedAccount` model — AES-256-GCM encrypted tokens (`packages/integrations/src/lib/encryption.ts`), key from `INTEGRATION_ENCRYPTION_KEY`
- **Token refresh**: `packages/integrations/src/lib/token-refresh.ts` — implemented for GitHub (App tokens) and Linear; mutex lock prevents concurrent refreshes
- **Callback security**: CSRF state verification, session re-validation, `redirect_uri` passed in code exchange, rate limiting (10 req/min per IP)

## Settings

- **Layout**: `apps/web/app/(dashboard)/settings/layout.tsx` wraps all `/settings/*` pages with `apps/web/components/settings/settings-nav.tsx` (grouped sidebar + mobile select).
- **Routes**: Overview `/settings`; Profile; Security (Supabase password change); Team; Notifications (browser `Notification` permission helpers in `apps/web/lib/web-notifications.ts`, UI in `components/notifications/`); Appearance (theme); Integrations; About (`NEXT_PUBLIC_APP_VERSION`).

## Layout Chrome (Topbar / Sidebar)

The dashboard layout (`apps/web/app/(dashboard)/layout.tsx`) renders `Sidebar` (desktop) + `MobileDrawer` (mobile) + `Topbar` + `MobileNav` (bottom tab bar).

### Topbar — `apps/web/components/layout/topbar.tsx`

Stripped-down: hamburger (mobile) + breadcrumb path bar (left, flexes) + `RunningTimer` pill + actions slot (right). No bell, avatar, or sign-out — those moved off the topbar.

- **Breadcrumbs** (`apps/web/components/layout/breadcrumbs.tsx`): auto-derived from `usePathname()`. Uses a `LABELS` map (segment → friendly name) and a `prettify()` fallback. Dynamic IDs (long alphanumeric / cuid-shaped) render as `#abc123` short hashes. **When you add a new top-level route or rename a segment, update the `LABELS` map**, otherwise the crumb falls back to Title-Cased segment text. To show a real entity title in place of an id (e.g. note title for `/notes/[noteId]`), the page must inject its own breadcrumbs — currently not wired; auto-hashing is the default.
- **Actions slot**: `<div id="topbar-slot-actions">` in the topbar is a portal target. Pages inject buttons via `<TopbarSlot target="actions">{...}</TopbarSlot>` from `apps/web/components/layout/topbar-slot.tsx`. **When adding a new page-level primary action (e.g. "+ New X"), prefer rendering it through `TopbarSlot` instead of inside the page body** so it lives in the same place across all routes. Example wired in `apps/web/app/(dashboard)/notes/notes-page-client.tsx` — "New note" button.
- **Sign out**: lives in `apps/web/components/layout/sign-out-button.tsx`, rendered at the bottom of `Sidebar` (rail/expanded variants) and `MobileDrawer` (drawer variant). Calls `createSupabaseBrowserClient().auth.signOut()` then `window.location.href = "/login"`.
- **Notifications**: full UI lives at `/settings/notifications` (`NotificationPermissionPanel` from `apps/web/components/notifications/notification-permission-panel.tsx`). The old `NotificationBellMenu` was removed; the panel component is unchanged and reusable.

### Sidebar — `apps/web/components/layout/sidebar.tsx`

- **Nav definition**: `navSections` (top sections) + `bottomNav` (Profile, Settings) are exported. `MobileDrawer` re-imports them. **When adding a new dashboard route, add an entry to the matching section in `navSections`** (or `bottomNav` for account-y items).
- **Auto-collapse rule**: `shouldAutoCollapse(pathname)` in `apps/web/components/layout/sidebar-context.tsx`. Currently matches `/^\/notes(\/.*)?$/` so notes get full editor width. **To add focus-mode auto-collapse for another route, extend the regex** (e.g. union with `/agents/chat`). User can override the rule per-page via the chevron toggle; the override resets on next pathname change.
- **Width transition**: outer `<aside>` uses `transition-[width] duration-300 ease-in-out`. Inner content swaps between rail and expanded markup based on `renderRail`; the swap itself is instant (only width is animated).

## Database

- Schema: `packages/database/prisma/schema.prisma`
- Datasource provider: PostgreSQL (Supabase)
- Pooled URL (port 6543, `?pgbouncer=true`) for `DATABASE_URL`; direct URL (port 5432) for `DIRECT_URL`
- Must run `pnpm db:generate` after schema changes
- Use `pnpm db:push` for quick schema sync (no migration file)
- Use `pnpm db:migrate` for local migration authoring
- Use `pnpm db:deploy` for production migration application
- Default admin: admin@omnitool.dev / admin123!
- User model has `supabaseAuthId` (unique) linking to Supabase Auth. `passwordHash` column is deprecated (kept for migration safety).

### Supabase CLI

This project uses the **Supabase CLI** (`supabase`) alongside Prisma. Split:

- **Schema (tables, columns, indexes, FKs)** → Prisma. Run `pnpm db:push` after editing `packages/database/prisma/schema.prisma`. Pushes directly to the Supabase Postgres at `aws-1-us-east-1.pooler.supabase.com:5432` (DIRECT_URL).
- **Auth + redirect URLs + project config** → Supabase CLI. Edit `supabase/config.toml`, then push:
  ```bash
  supabase config push --project-ref irtrdplptcxvdbzabjri
  ```
- **Auth migrations / SQL beyond the Prisma model** → `supabase/migrations/*.sql` (managed via `supabase migration new <name>` + `supabase db push`).
- **Local dev stack** → `supabase start` boots a local Postgres + GoTrue if you want offline dev. Not required for normal app dev (we point at the hosted Supabase).

Recipe for any schema change:
1. Edit `packages/database/prisma/schema.prisma`
2. `pnpm db:generate` — regenerate Prisma client
3. `pnpm db:push` — apply to Supabase Postgres
4. (Only if changing auth flows / redirect URLs) `supabase config push --project-ref irtrdplptcxvdbzabjri`

## Local-First Sync

- Sync configuration lives in `packages/sync`
- The current architecture targets PowerSync-style local SQLite to remote PostgreSQL sync
- Synced domains: users, teams, team members, projects, tasks, issues, notes, tags, time entries, performance metrics, labels, comments
- Server-only domains: connected integration tokens, AI conversations/messages, GitHub import logs
- Bootstrap route: `apps/web/app/api/sync/token/route.ts`
- Keep secrets, OAuth tokens, integration API keys, webhook secrets, and AI provider keys server-only

## Background Tasks (long-running operations)

**Rule**: any operation > ~3s (imports, summaries, batch ops, AI generations beyond chat stream) MUST run as a background task. Never block the UI behind a modal spinner.

- **Store**: `apps/web/lib/background-tasks/store.ts` — Zustand `{ id, label, status, result, error, startedAt }`. Actions: `start/update/finish/fail/dismiss/clearCompleted`. Auto-prune 5min, cap 50.
- **Runner**: `apps/web/lib/background-tasks/run.ts` — `runBackgroundTask({ id, label, work, successToast, href?, onViewResult?, onSuccess?, onError? })`. Returns the work promise.
- **UI**: `apps/web/components/layout/background-tasks-indicator.tsx` mounted in `Topbar` — pill w/ spinner+count, popover w/ elapsed time + dismiss + "View →".
- **Toasts**: `sonner` mounted in `apps/web/app/providers.tsx`. Runner fires success/error toasts automatically.

**Pattern for new long-running flows**:
1. Click handler queues `runBackgroundTask({ work: () => mutation.mutateAsync(...) })`
2. Close the dialog/UI immediately — do NOT `await` the mutation in the handler
3. Pass `successToast` (string or fn of result) and either `href` (navigate target) or `onViewResult` (custom callback, e.g. reopen dialog with cached result)
4. Put React Query `utils.x.invalidate()` calls inside `onSuccess` of the runner, not the dialog

**Existing examples**: Notion import (`notion-import-dialog.tsx`), GitHub import (`github-import-dialog.tsx`), Daily code summary (`daily-summary-dialog.tsx`). Mirror this pattern when adding new flows.

**Known limits**: refresh during task = lose UI feedback (server still completes); no real-time progress %; single tab only.

## Key Conventions

- Prefer **tRPC** for app APIs (`protectedProcedure`, `teamProtectedProcedure` in `apps/web/trpc/init.ts`). Exceptions include AI chat POST (`apps/web/app/api/ai/chat/route.ts`), coding-session summarize, sync bootstrap, webhooks, and OAuth callbacks.
- UI components from `@omnitool/ui` package
- Validators in `@omnitool/shared/validators` (Zod schemas)
- Import paths use no `.js` extensions (bundler resolution)
- Next.js 15: params are async (use `await params`)
- **Tauri / desktop**: dev uses `TAURI_ENV=1` only for `assetPrefix` when pointing the webview at the dev server; production desktop loads the hosted URL described under App Targets, not a static export of the full app
- Hosted server builds can use `NEXT_OUTPUT=standalone`
- AI chat tools must be created with **`createChatTools({ userId })`** from `@omnitool/ai` so mutations (e.g. issue reporter) are attributed to the signed-in user
- `auth()` is wrapped in React `cache()` — safe to call multiple times per request without redundant API calls

## Environment Variables

Authoritative template with comments: **`.env.example`**. Key variables:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin operations (server-only) |
| `DATABASE_URL` | Supabase pooled PostgreSQL connection |
| `DIRECT_URL` | Supabase direct PostgreSQL (for migrations) |
| `INTEGRATION_ENCRYPTION_KEY` | AES-256-GCM key for OAuth token encryption |
| `GITHUB_CLIENT_ID` / `SECRET` | GitHub OAuth App credentials |
| `NOTION_CLIENT_ID` / `SECRET` | Notion integration credentials |
| `UPSTASH_REDIS_REST_URL` / `TOKEN` | Rate limiting (optional, graceful fallback) |
| `NVIDIA_API_KEY` / `ANTHROPIC_API_KEY` | AI provider keys |
| `AUTH_URL` | Base URL for OAuth callback construction |
| `NEXT_PUBLIC_APP_VERSION` | Shown in Settings → About |
