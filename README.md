# OmniTool

OmniTool is an internal company app for performance tracking, issue tracking, notes and ideas, integrations, AI agents, and team workspaces.

Installable targets:

- **`apps/web`**: Next.js 15 web app, PWA, and hosted API backend.
- **`apps/desktop`**: Tauri v2 native desktop shell (loads the web UI).

## Features (high level)

- **Dashboard**: Overview stats, due-soon tasks, recent notes, shortcuts (including My Work and My Tasks).
- **Work tracking**: Projects (Kanban), cross-team issues and notes lists, performance charts, optional timers on task cards.
- **Settings**: Nested layout with sidebar navigation — profile, **security (change password)** for credential users, team, **notifications** (browser permission), **appearance** (light / dark / system via `next-themes`), integrations (GitHub live; others planned), about (build label via `NEXT_PUBLIC_APP_VERSION`).
- **AI chat**: Server-side tool calling against company data; supports **NVIDIA NIM** (OpenAI-compatible API) when `NVIDIA_API_KEY` is set, otherwise **Anthropic** when `ANTHROPIC_API_KEY` is set. Coding-session summaries use the same provider resolution.
- **Notifications**: Request **browser notification** permission from the top bar or Settings → Notifications (local notifications only; push subscriptions are not implemented yet).

## Stack

- Next.js 15 App Router + React 19
- Tauri v2 (desktop)
- shadcn/ui + Tailwind CSS (`darkMode: class`) + **next-themes**
- PostgreSQL + Prisma 6
- tRPC v11
- Auth.js v5 (Credentials + JWT session)
- Vercel AI SDK + **NVIDIA NIM (OpenAI-compatible)** and/or **Anthropic**
- Turborepo + pnpm workspaces
- Local-first sync boundary (PowerSync-oriented contract in `packages/sync`)

## Workspace

```text
apps/web/                Next.js app, PWA manifest, API routes, tRPC routers
apps/desktop/            Tauri v2 desktop wrapper
packages/database/       Prisma schema and generated client
packages/ui/             Shared shadcn/ui components
packages/shared/         Types, constants, Zod validators
packages/sync/           Sync boundaries, conflict policies, bootstrap contract
packages/ai/             AI prompts, tools, agent configs (runtime tools bound per user)
packages/integrations/   Provider helpers and token utilities
packages/coding-sessions/ Local coding-agent session scanning utilities
```

## Setup

Install dependencies:

```bash
pnpm install
```

Create `.env` from `.env.example` and configure at least:

```bash
DATABASE_URL=***REMOVED***
AUTH_SECRET=***REMOVED***
AUTH_URL="http://localhost:3000"
```

Optional but commonly needed:

- **AI**: `NVIDIA_API_KEY` (+ optional `NVIDIA_NIM_BASE_URL`, `NVIDIA_NIM_MODEL`) and/or `ANTHROPIC_API_KEY` — see comments in `.env.example`.
- **GitHub integrations**: `INTEGRATION_ENCRYPTION_KEY` and GitHub OAuth/App variables as listed in `.env.example`.
- **About screen / CI**: `NEXT_PUBLIC_APP_VERSION` for a visible build label.

Generate Prisma client and apply schema:

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed
```

Default admin login:

```text
admin@omnitool.dev / admin123!
```

## Running the apps

```bash
pnpm dev:web       # Web app only
pnpm dev:desktop   # Tauri (expects web at http://localhost:3000)
pnpm dev           # All workspace dev tasks (see turbo.json)
```

Ensure port **3000** is free for desktop dev, or Tauri may attach to the wrong server.

## Building

```bash
pnpm build
pnpm build:desktop    # Static web export + Tauri bundle (TAURI_ENV=1)
```

Hosted Node deployments often use:

```bash
NEXT_OUTPUT=standalone
```

## PWA

- Manifest: [`apps/web/app/manifest.ts`](apps/web/app/manifest.ts)
- Icons: [`apps/web/public/icon.svg`](apps/web/public/icon.svg), [`icon-maskable.svg`](apps/web/public/icon-maskable.svg), [`apple-touch-icon.svg`](apps/web/public/apple-touch-icon.svg)
- Root metadata: [`apps/web/app/layout.tsx`](apps/web/app/layout.tsx)

Browser notifications require a **secure context** (HTTPS or localhost); users grant permission in-app.

## Desktop

- Manifest: [`apps/desktop/src-tauri/tauri.conf.json`](apps/desktop/src-tauri/tauri.conf.json)
- Icon: [`apps/desktop/src-tauri/icons/icon.png`](apps/desktop/src-tauri/icons/icon.png)
- Product name: OmniTool · Bundle id: `dev.omnitool.app`

## Backend (apps/web)

| Area | Location |
|------|----------|
| tRPC | [`apps/web/app/api/trpc/[trpc]/route.ts`](apps/web/app/api/trpc/[trpc]/route.ts) |
| Context / auth | [`apps/web/trpc/init.ts`](apps/web/trpc/init.ts) |
| Routers | [`apps/web/trpc/routers/`](apps/web/trpc/routers/) |
| Auth.js | [`apps/web/lib/auth.ts`](apps/web/lib/auth.ts) |
| AI provider resolution | [`apps/web/lib/ai/language-model.ts`](apps/web/lib/ai/language-model.ts) |
| AI chat (tools + LLM) | [`apps/web/app/api/ai/chat/route.ts`](apps/web/app/api/ai/chat/route.ts) |
| Coding session summarize | [`apps/web/app/api/coding-sessions/summarize/route.ts`](apps/web/app/api/coding-sessions/summarize/route.ts) |
| Sync bootstrap | [`apps/web/app/api/sync/token/route.ts`](apps/web/app/api/sync/token/route.ts) |
| Webhooks / OAuth callbacks | Hosted-only routes under `app/api/` |

Prisma datasource is PostgreSQL (`packages/database/prisma/schema.prisma`). Use `pnpm db:migrate` locally and `pnpm db:deploy` in production.

### AI providers

- Prefer **NVIDIA NIM**: OpenAI-compatible chat at `NVIDIA_NIM_BASE_URL` (default integrates gateway `/v1`), model id `NVIDIA_NIM_MODEL`.
- Fallback **Anthropic** when no NVIDIA key is configured.
- Do **not** expose provider API keys to the client; configuration stays server-side only.

### Settings routes

All live under **`/settings`** with a shared layout and [`apps/web/components/settings/settings-nav.tsx`](apps/web/components/settings/settings-nav.tsx):

`/settings` (overview), `/settings/profile`, `/settings/security`, `/settings/team`, `/settings/notifications`, `/settings/appearance`, `/settings/integrations`, `/settings/about`.

## Local-first sync

Contract: [`packages/sync/src/index.ts`](packages/sync/src/index.ts)

Bootstrap: [`apps/web/app/api/sync/token/route.ts`](apps/web/app/api/sync/token/route.ts) returns user, active team, optional PowerSync URL, table lists.

Never ship OAuth secrets, integration tokens, webhook secrets, or AI keys to sync clients.

## Validation

```bash
pnpm db:generate
pnpm typecheck
pnpm build
pnpm build:desktop
```

Verify PWA installability in browser DevTools; verify desktop with `pnpm dev:desktop` and `pnpm build:desktop`.
