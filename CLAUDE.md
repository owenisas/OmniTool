# OmniTool

Internal company app: performance tracking, issue tracking, notes/ideas, integrations, AI agents, team workspaces, and configurable UI settings.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **Desktop**: Tauri v2 native shell in `apps/desktop`
- **Installability**: PWA manifest in `apps/web/app/manifest.ts`
- **UI**: shadcn/ui + Tailwind CSS (`darkMode: class`) + **next-themes** (`ThemeProvider` in `apps/web/app/providers.tsx`)
- **Database**: PostgreSQL + Prisma 6
- **API**: tRPC v11 (type-safe end-to-end)
- **Auth**: Auth.js v5 (Credentials + JWT)
- **AI**: Vercel AI SDK; **NVIDIA NIM** (OpenAI-compatible, `@ai-sdk/openai`) when `NVIDIA_API_KEY` is set, else **Anthropic** (`@ai-sdk/anthropic`) — resolved in `apps/web/lib/ai/language-model.ts`
- **Sync**: Local-first sync boundary in `packages/sync` with PowerSync-oriented config
- **Monorepo**: Turborepo + pnpm workspaces

## Project Structure

```
apps/web/                 # Next.js web app, PWA, hosted backend routes
apps/desktop/             # Tauri v2 native desktop wrapper
packages/database/        # Prisma schema + generated client
packages/ui/              # Shared shadcn/ui components
packages/ai/              # AI prompts, tools; `createChatTools({ userId })` for chat route
packages/integrations/    # Third-party provider SDKs and token utilities
packages/coding-sessions/ # Coding-agent session scan utilities
packages/shared/          # Types, validators, constants (includes user password-change schema)
packages/sync/            # Local-first sync table boundaries and bootstrap types
```

## Commands

```bash
pnpm dev            # Start all dev servers
pnpm dev:web        # Start web app only
pnpm dev:desktop    # Start the native Tauri desktop app
pnpm build          # Build all packages
pnpm build:desktop  # Build the Tauri desktop app
pnpm db:generate    # Generate Prisma client
pnpm db:push        # Push schema to database
pnpm db:migrate     # Run migrations
pnpm db:deploy      # Apply migrations in production
pnpm db:seed        # Seed database
pnpm db:studio      # Open Prisma Studio
pnpm typecheck      # Type-check all packages
```

## App Targets

- Web/PWA entrypoint: `apps/web`
- PWA manifest: `apps/web/app/manifest.ts`
- PWA icons: `apps/web/public/icon.svg`, `apps/web/public/icon-maskable.svg`, `apps/web/public/apple-touch-icon.svg`
- Desktop manifest: `apps/desktop/src-tauri/tauri.conf.json`
- Desktop app icon: `apps/desktop/src-tauri/icons/icon.png`
- Desktop dev expects the web dev server at `http://localhost:3000`. If port 3000 is already occupied by another app, stop that process before running `pnpm dev:desktop`.
- Desktop release bundles (`pnpm build:desktop`) embed a tiny static redirect shell (`scripts/desktop-before-build.mjs` → `apps/desktop/app-shell`) that opens the **hosted** web app: set `OMNITOOL_DESKTOP_URL` or rely on `NEXT_PUBLIC_OMNITOOL_WEB_URL` / `AUTH_URL`. A full Next static export is not used (API routes, Auth.js, and tRPC require a running server).

## Settings

- **Layout**: `apps/web/app/(dashboard)/settings/layout.tsx` wraps all `/settings/*` pages with `apps/web/components/settings/settings-nav.tsx` (grouped sidebar + mobile select).
- **Routes**: Overview `/settings`; Profile; Security (`user.changePassword`, credential users only — `user.me` exposes `hasPassword`); Team; Notifications (browser `Notification` permission helpers in `apps/web/lib/web-notifications.ts`, UI in `components/notifications/`); Appearance (theme); Integrations; About (`NEXT_PUBLIC_APP_VERSION`).
- **Top bar**: `NotificationBellMenu` for quick permission access (`apps/web/components/layout/topbar.tsx`).

## Database

- Schema: `packages/database/prisma/schema.prisma`
- Datasource provider: PostgreSQL
- Local default URL: `***REMOVED***`
- Must run `pnpm db:generate` after schema changes
- Use `pnpm db:migrate` for local migration authoring
- Use `pnpm db:deploy` for production migration application
- Default admin: admin@omnitool.dev / admin123!

## Local-First Sync

- Sync configuration lives in `packages/sync`
- The current architecture targets PowerSync-style local SQLite to remote PostgreSQL sync
- Synced domains: users, teams, team members, projects, tasks, issues, notes, tags, time entries, performance metrics, labels, comments
- Server-only domains: Auth.js accounts/sessions/tokens, connected integration tokens, AI conversations/messages, GitHub import logs
- Bootstrap route: `apps/web/app/api/sync/token/route.ts`
- Keep secrets, OAuth tokens, integration API keys, webhook secrets, and AI provider keys server-only

## Key Conventions

- Prefer **tRPC** for app APIs (`protectedProcedure`, `teamProtectedProcedure` in `apps/web/trpc/init.ts`). Exceptions include AI chat POST (`apps/web/app/api/ai/chat/route.ts`), coding-session summarize, sync bootstrap, webhooks, and OAuth callbacks.
- UI components from `@omnitool/ui` package
- Validators in `@omnitool/shared/validators` (Zod schemas), including `changePasswordSchema` for security settings
- Import paths use no `.js` extensions (bundler resolution)
- Next.js 15: params are async (use `await params`)
- **Tauri / desktop**: dev uses `TAURI_ENV=1` only for `assetPrefix` when pointing the webview at the dev server; production desktop loads the hosted URL described under App Targets, not a static export of the full app
- Hosted server builds can use `NEXT_OUTPUT=standalone`
- AI chat tools must be created with **`createChatTools({ userId })`** from `@omnitool/ai` so mutations (e.g. issue reporter) are attributed to the signed-in user

## Environment Variables

Authoritative template with comments: **`.env.example`**. Notable keys: `NVIDIA_API_KEY` / `NVIDIA_NIM_*`, `ANTHROPIC_*`, `NEXT_PUBLIC_APP_VERSION`, sync and integration secrets.
