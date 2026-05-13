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

**Always prioritize desktop**: The desktop app bundles a local Next.js sidecar at `localhost:19283` that serves all API routes, tRPC, and OAuth callbacks. Changes to server-side code (middleware, API routes, callbacks) only take effect on the desktop when a **new DMG is built and installed** — deploying to Vercel alone does NOT fix desktop issues. When making changes, always rebuild the desktop DMG first, then deploy to Vercel as a secondary step.

### `pnpm ship:desktop` — full rebuild + reinstall + relaunch

The `ship:desktop` script (in root `package.json`) chains build → mount DMG → replace `/Applications/OmniTool.app` → launch. Use this whenever you need to verify changes in the installed desktop binary.

**Known HTML5 drag-and-drop trap**: Tauri v2 webview intercepts native drag/drop events by default for OS-level file-drop handling. This breaks ProseMirror / BlockNote / @dnd-kit drag (blocks highlight when grabbed but don't move). Fix is in `apps/desktop/src-tauri/src/lib.rs` via `.disable_drag_drop_handler()` on `WebviewWindowBuilder`. If you ever switch to a fresh window builder or re-init the webview, re-apply this call — without it, in-editor drag breaks silently and looks like a CSS issue.

**Known CSP / Tauri IPC trap**: `apps/web/next.config.mjs` ships a `Content-Security-Policy` response header. Tauri plugin calls go through `ipc://localhost/plugin%3A...` URLs (or `http://ipc.localhost` on Windows). If `connect-src` doesn't whitelist `ipc:` + `tauri:` + `http://ipc.localhost`, every plugin invocation is silently blocked: `tauri-plugin-shell` won't open browsers (OAuth signin breaks), `tauri-plugin-notification` permission checks fail, deep-link callbacks stall, etc. Fix is in `next.config.mjs` `securityHeaders.connect-src`. When adding new plugin invocations, this whitelist is already broad enough — but if you ever tighten the CSP or fork it for a stricter route, keep these schemes.

**Known stale-sidecar trap**: the desktop wrapper spawns a Node.js sidecar (`next-server`) that binds **port 19283**. Tauri does NOT kill stale sidecars on app exit. If a previous run's sidecar is still listening on 19283 when you relaunch, the new webview connects to the **OLD** sidecar — you see stale UI even after a fresh build + reinstall. Symptoms: `pnpm ship:desktop` succeeds, `/Applications/OmniTool.app` mtime is fresh, bundled CSS/JS contains your edits, but the running window shows old code.

**Fix when this happens**:
```bash
osascript -e 'quit app "OmniTool"' 2>/dev/null
pkill -f "next-server"            # kill stale sidecar holding port 19283
rm -rf ~/Library/Caches/dev.omnitool.app/WebKit ~/Library/Caches/omnitool-desktop/WebKit
open -a OmniTool
```
Verify with `lsof -iTCP:19283` — the listening node PID should match a child of the just-launched omnitool-desktop. Long-term fix: add a port-claim check in `apps/desktop/src-tauri/src/lib.rs` that kills any process holding 19283 before spawning its own sidecar.

Other gotchas with `ship:desktop`:
- Hardcoded `/Volumes/OmniTool` mount name. If a previous mount left a stale `/Volumes/OmniTool 1`/`2`/`3` entry, the cp step fails. The script now force-detaches `/Volumes/OmniTool*` before mounting; if you bypass the script, run `for v in /Volumes/OmniTool*; do hdiutil detach "$v" -force -quiet; done` first.
- Turbo cache may report `FULL TURBO` and skip the build entirely. To force a real rebuild: `rm -rf apps/web/.next apps/desktop/src-tauri/resources/server .turbo node_modules/.cache/turbo && pnpm ship:desktop`.

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

## Code Signing & Notarization (macOS)

- **Certificate**: `Developer ID Application: Tsz To Suen (3LHSL95J9H)` in login Keychain
- **Team ID**: `3LHSL95J9H`
- **Apple ID**: `thomas.suen1234@icloud.com`
- **Credentials**: `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` in `.env.deploy.local`
- **Entitlements**: `apps/desktop/src-tauri/Entitlements.plist` — JIT, unsigned memory, dyld env vars, disable library validation (needed for Node.js sidecar)
- **Pre-bundle signing**: `scripts/sign-native-deps.sh` runs as `beforeBundleCommand` in `tauri.conf.json`. Signs all `.dylib`, `.node`, `.so` files + `NodeSidecar.app` with Developer ID cert + hardened runtime + secure timestamp. Without this, Apple notarization rejects the embedded sharp/Prisma/Node binaries.
- **Post-build notarization**: `scripts/notarize-dmg.sh` — Tauri's DMG bundler loses code signatures during copy, so this script extracts the `.app` from the DMG, re-signs everything properly (native deps → NodeSidecar → outer app), rebuilds a clean DMG, signs it, submits to `xcrun notarytool`, and staples the ticket. **Do NOT rely on Tauri's built-in notarization** — it creates a zip with `__MACOSX` metadata that Apple rejects.
- **Build + sign + notarize flow**:
  ```bash
  source .env.deploy.local && export APPLE_SIGNING_IDENTITY
  pnpm build:desktop                      # builds + signs (no notarization)
  export APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
  ./scripts/notarize-dmg.sh               # re-sign, notarize, staple
  ```
- **Private key**: `DevIDApplication.key` on Desktop — already imported into Keychain, can be deleted or moved to safe storage.

## Deployment

- **Production**: Vercel, project `omnitool`, team `thomassuent-5734s-projects`
- **Credentials**: `.env.deploy.local` (Vercel token, project/team IDs, Upstash keys, Apple signing keys)
- **Deploy command** (must use `--cwd` to monorepo root):
  ```bash
  VERCEL_ORG_ID=$VERCEL_TEAM_ID VERCEL_PROJECT_ID=$VERCEL_PROJECT_ID \
    vercel deploy --prod --archive=tgz --token $VERCEL_TOKEN \
    --cwd /path/to/OmniTool
  ```
- **Git author restriction**: Vercel team policy requires the git commit author to be a team member. If deploying from a machine where `git config user.email` isn't on the team, create a temp repo with the correct author (see deploy workaround used for `reunifylabs@gmail.com`).
- **Vercel project root directory**: `apps/web` (set in Vercel dashboard)
- **Build config**: `apps/web/vercel.json` — custom `buildCommand` runs from monorepo root via `cd ../..`
- **Cron limitation**: Vercel Hobby plan allows max 1 cron job per day. `handoff-poll` is set to `0 8 * * *` (daily 8am UTC). Upgrade to Pro to restore `*/5 * * * *`.
- **Supabase config push**: `supabase config push --project-ref irtrdplptcxvdbzabjri` (auth settings, redirect URLs)

## Auth (Supabase)

- **Client helpers**: `apps/web/lib/supabase/client.ts` (browser singleton), `server.ts` (server components/routes), `middleware.ts` (edge session refresh), `admin.ts` (service role)
- **Session function**: `apps/web/lib/auth.ts` — `auth()` returns `AppSession | null`. Wrapped in React `cache()` so multiple calls per request (layout, page, tRPC context) share one Supabase + Prisma lookup.
- **JIT user sync**: When a Supabase user signs in but has no Prisma `User` row, `auth()` auto-creates one via `supabaseAuthId` mapping.
- **Middleware**: `apps/web/middleware.ts` → `updateSession()` — uses `getSession()` (local JWT decode, no network call) for redirect decisions. Redirects unauthenticated users to `/login`, authenticated users away from `/login` and `/signup`.
- **Auth pages**: `/login`, `/signup`, `/reset-password`, `/update-password` — all under `apps/web/app/(auth)/`
- **PKCE callback**: `apps/web/app/api/auth/callback/route.ts` — exchanges auth code for session (email confirmation, password reset)
- **Password change**: Settings → Security uses `supabase.auth.updateUser({ password })` directly (no tRPC)
- **Local seed admin**: `admin@omnitool.dev`; set `SEED_ADMIN_PASSWORD` before seeding if a local password hash is needed.

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
- **Desktop OAuth flow**: System browser handles the OAuth dance (Tauri webview stays put). Callback routes detect desktop via `isDesktopOAuthState(state)` — the state param embeds `desktop:{nonce}:{userId}:{HMAC}` so no session cookies are needed. State signing/verification in `apps/web/lib/oauth-state.ts`.
- **Desktop callback completion page**: Instead of raw `omnitool://` redirects (which browsers often block), desktop callbacks return an HTML page (`apps/web/lib/oauth-complete-page.ts`) that auto-attempts the deep link + shows a manual "Open OmniTool" button as fallback. This page also shows connection status (success/error).
- **Middleware whitelist**: OAuth callback routes (`/api/integrations/github/callback`, `/api/integrations/notion/callback`) are whitelisted in `apps/web/lib/supabase/middleware.ts` as public routes — the system browser has no session cookies, so middleware must not redirect these to `/login`. The callback routes handle their own auth (HMAC for desktop, session+CSRF for web).

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

## Notes UX — Notion-aligned design language

OmniTool's Notes surface deliberately mirrors Notion's interaction model. When extending or modifying anything under `apps/web/components/notes/**` or `apps/web/app/(dashboard)/notes/**`, preserve these patterns. Deviations from Notion should be deliberate and documented.

### Layout (note detail: `/notes/[noteId]`)

`apps/web/components/notes/note-block-editor.tsx` defines the canonical stack, top-down:

1. **Parent chip** — `↑ {parent.title}` link, only when `note.parent` exists. Whole chip clickable, opens parent.
2. **Title row** — emoji picker (`NoteEmojiPicker`) + 4xl/5xl bold title `<Input>` (borderless, no shadow, autosaves).
3. **Meta strip** (one row, border-bottom): teamspace badge → `LinkedEntityPill` → `NoteTagEditor` → save status (right-aligned) → Comments trigger → History button.
4. **Editor body** — `<BlockNoteView>` inside `min-h-[480px]` container. **Borderless**: `.bn-editor` background overridden to `transparent` in `apps/web/app/globals.css` so prose flows directly on the page surface (Notion-style). Subpages live INSIDE the editor body as inline `noteEmbed` blocks — no separate panel.
5. **Comments panel + EmbedPicker + history sheet** — slot at the bottom; only mount points, no visual weight.

**Width**: `mx-auto w-full max-w-3xl space-y-5`. Centered prose column matches Notion's default.

### Inline page references — `noteEmbed` block

`apps/web/components/notes/blocks/note-embed-block.tsx` renders Notion's nested-page block exactly:

- **One-line row**: small icon (emoji if `note.emoji` set, else `<FileText>`) + underlined title. Whole row is the link. No "Open" button, no preview card inline.
- **Hover preview popover**: opens after `220ms` hover, closes after `140ms` grace (so the user can move pointer onto the popover content). Popover shows large icon + bold title + first ~280 chars of `contentText`. Implemented with `Popover` controlled by `onMouseEnter`/`onMouseLeave` and matching handlers on `PopoverContent`.
- **Fallback title prop**: when `noteEmbed` is freshly inserted by `/subpage`, the spec passes `title` from the create response so the row renders the correct label before `note.getById` resolves on the new id.

### `/subpage` slash command (Notion's `/page`)

`apps/web/components/notes/ai/slash-items.tsx` registers `/subpage` (aliases: `child`, `page`, `nested`) under the **Embed** group. Selection dispatches `omnitool:create-subpage`. The handler in `note-block-editor.tsx`:

1. Pre-seeds `note.getById` cache for the new child via `utils.note.getById.setData({ id: row.id }, row)` — kills the second roundtrip.
2. Inserts a `noteEmbed` block at the cursor with `{ noteId, title }` props.
3. Captures `editor.document` + `editor.blocksToMarkdownLossy()` synchronously and fires `updateNote.mutate(...)` so the parent persists the inline reference **before** unmount (autosave's 1s debounce would otherwise lose it).
4. `router.push(/notes/${row.id})` — Notion behavior: creating a subpage opens it so the user immediately starts writing.

### Subpages — inline only (no fixed panel)

Notion's nested pages live as inline blocks inside the parent's content. OmniTool follows this exactly: subpages exist as `noteEmbed` blocks within the editor body, freely repositionable like any other block.

**No `NoteRelationsPanel` mounted in the layout.** The component file (`apps/web/components/notes/note-relations-panel.tsx`) is preserved as dead code with full sortable + rename logic in case we want to surface a panel view later (e.g., behind a "Pages inside" expandable). It's NOT imported by `note-block-editor.tsx`.

**How users manage subpages**:

- **Create new + place inline**: `/subpage` slash command at any cursor position → child is created with `parentId = current note` and a `noteEmbed` block is inserted at the cursor. The user is then navigated into the new child. Returning to the parent shows the inline reference at the position they invoked the slash.
- **Reference an existing child or any other note**: `/embed-note` slash → embed picker (cursor-anchored) → pick a note → `noteEmbed` block inserted.
- **Reorder/move within document**: BlockNote's built-in side menu (drag handle on block hover) — left edge of any block. Drag a `noteEmbed` to anywhere in the document, including out of/into other block groups, lists, columns. We don't override this; default BlockNote behavior is the canonical interaction.
- **Rename**: open the child page (click the inline reference) and edit the title there. Title autosaves; the inline `noteEmbed` updates via `note.getById` cache invalidation.
- **Delete the inline reference vs. the child note**: deleting a `noteEmbed` block (Backspace at start, or block menu → Delete) removes ONLY the inline reference. The child note still exists, accessible via the global sidebar tree (`SidebarNoteTree`) and breadcrumb chain. Deleting the child note itself (trash) requires opening it and using the trash action. This mirrors Notion exactly.

**Orphan children** (DB rows where `parentId = current note` but no inline `noteEmbed` references them in the parent's blocks):

- **Auto-migrated on first open**: `note-block-editor.tsx` runs a one-shot effect (guarded by `migratedNoteIdRef` per note id) that detects orphans via `collectNoteEmbedIds(editor.document)` and appends a `noteEmbed` block for each at the end of the document, then triggers autosave. Subsequent opens see the embeds in `note.blocks` so the migration is a no-op.
- The migration is one-shot per session: if the user deletes a migrated embed block, it does NOT re-insert until the user navigates to a different note and back. Predictable, no infinite loops with realtime invalidation.
- Found via global sidebar tree which always shows the full parent→child hierarchy regardless of inline references.
- Can be re-inserted into the document with `/embed-note` → pick the orphan.

### Embed picker — cursor-anchored dropdown

`apps/web/components/notes/blocks/embed-picker.tsx` renders as a non-modal floating panel anchored to the **caret position** (matches the slash menu's anchor exactly), not a Dialog modal:

- `captureCursorPoint()` reads `window.getSelection().getRangeAt(0).getBoundingClientRect()` synchronously inside the `omnitool:open-embed-picker` handler — before React re-renders and focus drifts.
- Position resolution order: cursor rect → block element rect (`[data-id="${blockId}"]`) → viewport-centered.
- Auto-flips above the block if it would clip below the viewport. Right-edge clamps to viewport.
- No backdrop/overlay — the page stays fully visible behind the picker. Click-outside the panel + Escape close it.

### Breadcrumb — always real titles

`apps/web/components/layout/breadcrumbs.tsx` resolves note titles from two sources, in order:

1. `trpc.note.getAncestorChain` (canonical, includes parent chain).
2. `trpc.note.list` cache (already populated for the sidebar tree) — fallback for instant rendering while ancestor query loads.
3. `prettify(seg)` last-resort `#abc123` placeholder.

Never let a raw cuid flash in the breadcrumb — that's the symptom that the cache fallback isn't reading.

### Optimistic UI / cache pre-seed conventions

When a mutation creates a note we'll immediately render or navigate to, **pre-seed the `note.getById` cache** with the response row:

```ts
utils.note.getById.setData({ id: row.id }, row as any)
```

This eliminates the first-paint loading flicker on the new note's detail page and on any inline `noteEmbed` referencing it. Pattern used in:
- `note-block-editor.tsx` `createSubpageMutation.onSuccess`
- `note-relations-panel.tsx` `createNote.onSuccess`

### Drag UX rules

- **Click-vs-drag boundary**: 4px (`PointerSensor.activationConstraint.distance`). Don't lower this — accidental drags ruin click affordances.
- **Optimistic always**: never wait for the server before showing the new ordering. Local mirror state + cache `setData` upfront; server's `onSettled` invalidate reconciles.
- **Server is authoritative for position**: `reindexSiblings` rewrites all sibling positions to a clean 0..n. Don't try to predict the exact final positions client-side; let the refetch fix any drift.
- **Cycle prevention is server-only**: `isAncestorOf` in the `note.move` handler. UI doesn't replicate this check — surfaces an error toast instead and rolls back via invalidate.

### What we've intentionally NOT borrowed from Notion (yet)

- Drag from Subpages panel into editor body (would inline-embed). Out of scope; users use `/subpage` for that.
- Drag in the global sidebar tree or `/notes` page tree.
- Cover images / page banners.
- Toggle (collapsible) blocks at arbitrary depth in editor.
- Database views (table/board/gallery/timeline/calendar) — Notes are documents, not collections in this system.

When extending Notes UX, prefer porting another Notion pattern over inventing a new one. If a Notion behavior conflicts with our domain (teamspaces, integrations, AI), document the deviation in this section.

## Testing pipeline

Five-layer pipeline scoped to what's actually feasible on Apple-Silicon-only macOS (where `tauri-driver` doesn't work). Full doc + commands: **`apps/web/e2e/README.md`**.

- **Layer 1 (unit)** — `pnpm --filter @omnitool/web test`. Vitest. Includes:
  - `lib/**/*.test.ts` — pure helpers (notes parsers, validators).
  - `lib/tauri.test.ts` — Tauri IPC shim against `@tauri-apps/api/mocks`. Catches `openInBrowser` falling back to `window.open`, plugin name typos, etc.
  - `e2e/tests/oauth-mock.test.ts` — verifies the OAuth provider mock harness behaves like GitHub.
- **Layer 2 (OAuth mock harness)** — `apps/web/e2e/harness/oauth-mock.ts`. Local HTTP server impersonating GitHub OAuth endpoints. Used by Playwright integration tests so PR runs are deterministic and don't touch real github.com.
- **Layer 3 (Playwright route smoke)** — `pnpm --filter @omnitool/web test:e2e`. Walks every dashboard route after login. Catches React #418 hydration mismatches, 5xx tRPC responses, broken layout imports.
- **Layer 4 (Playwright integration OAuth)** — same Playwright runner. Drives Connect-GitHub end-to-end against the mock server.
- **Layer 5 (macOS deep-link smoke)** — `pnpm --filter @omnitool/web test:smoke:deeplinks`. AppleScript reads the running Tauri app's webview URL via accessibility tree after `open omnitool://...`. Run pre-release while OmniTool is open. Manual; not in CI.

CI: `.github/workflows/ci.yml`. Two jobs always run (`ci` Vitest + `rust-tests` `cargo test`); `e2e-mac` is opt-in via the `e2e` PR label or runs on push to main.

When adding a new feature that touches an external system (OAuth, deep links, file system, native notification): add a Layer 1 mockIPC test for the JS shim AND a Layer 4 / Layer 5 test for the OS-level behavior. Don't ship without both.

## Database

- Schema: `packages/database/prisma/schema.prisma`
- Datasource provider: PostgreSQL (Supabase)
- Pooled URL (port 6543, `?pgbouncer=true`) for `DATABASE_URL`; direct URL (port 5432) for `DIRECT_URL`
- Must run `pnpm db:generate` after schema changes
- Use `pnpm db:push` for quick schema sync (no migration file)
- Use `pnpm db:migrate` for local migration authoring
- Use `pnpm db:deploy` for production migration application
- Local seed admin: admin@omnitool.dev; set `SEED_ADMIN_PASSWORD` before seeding if a local password hash is needed.
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
