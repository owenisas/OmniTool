# OmniTool E2E pipeline

Five layers of testing, ranked by ROI:

1. **Vitest unit tests** (`lib/**/*.test.ts`) — pure-Node helpers + Tauri IPC shim via `@tauri-apps/api/mocks`.
2. **OAuth-mock harness** (`e2e/harness/oauth-mock.ts`) — local HTTP server impersonating GitHub's OAuth endpoints. Drives PR-time tests for the integration callback flow without touching real GitHub.
3. **Playwright route smoke** (`e2e/playwright/tests/smoke.spec.ts`) — logs in once and walks every dashboard route, asserting no `pageerror` / 5xx / hard fails. Catches hydration mismatches, broken tRPC procedures, missing env regressions.
4. **Playwright integration OAuth** (`e2e/playwright/tests/integration-oauth.spec.ts`) — exercises Connect-GitHub end-to-end against the mock server.
5. **macOS deep-link smoke** (`e2e/scripts/smoke-deeplinks.sh`) — manual / pre-release. Verifies the running Tauri app correctly handles `omnitool://` URLs by reading the webview URL via the macOS accessibility tree.

## Running locally

```bash
# Layer 1+2 (unit + harness, fast)
pnpm --filter @omnitool/web test

# Layer 3+4 (Playwright; needs the sidecar OR `pnpm dev:web` running)
pnpm --filter @omnitool/web test:e2e:install   # one-time browser fetch
pnpm --filter @omnitool/web test:e2e

# Layer 5 (macOS deep-links, run while OmniTool is open)
pnpm ship:desktop
pnpm --filter @omnitool/web test:smoke:deeplinks
```

## What each layer catches

| Layer | Bug class examples |
|-------|--------------------|
| 1 | `openInBrowser` silently using `window.open` instead of the shell plugin; typo'd plugin command names; wrong arg shape |
| 2 | `oauth-mock` itself + provider response shape (catches drift if GitHub changes the access_token JSON) |
| 3 | React #418 hydration mismatch; 500s from broken tRPC routes; missing layout component imports |
| 4 | The full integration callback chain — authorize → token exchange → user fetch → connectedAccount upsert → redirect |
| 5 | Tauri deep-link plugin registration; `omnitool://` scheme handler routing the webview correctly; the regression where the integrations page's local listener wasn't mounted globally |

## Why no Tauri-driver

`tauri-driver` officially doesn't support macOS as of 2025 ([tauri#7068](https://github.com/tauri-apps/tauri/issues/7068)). Apple Silicon is our only target, so we don't even attempt the WebDriver path — Layer 1 + Layer 5 cover Tauri-specific behavior between them.

If we eventually need full webview-DOM E2E inside the Tauri shell on macOS, the community options are:

- [`tauri-webdriver-automation`](https://lib.rs/crates/tauri-webdriver-automation) — in-app WebDriver server enabled in debug builds
- [Tauri-WebDriver for WKWebView](https://danielraffel.me/2026/02/14/i-built-a-webdriver-for-wkwebview-tauri-apps-on-macos/) — independent driver crate

Neither is wired in yet; revisit when route smoke + deep-link scripts stop catching enough.

## CI

`.github/workflows/ci.yml`:

- **`ci`** job — Ubuntu, every push/PR. Lint + typecheck + build + Vitest.
- **`rust-tests`** job — Ubuntu, every push/PR. `cargo test --lib` for the Tauri shell helpers.
- **`e2e-mac`** job — `macos-14`, gated on `e2e` PR label or main pushes. Builds the standalone sidecar, runs Playwright suites against it, uploads `playwright-report/` on failure.

Required CI secrets for `e2e-mac`:
- `E2E_DATABASE_URL` — Postgres for the sidecar (typically a dedicated test DB)
- `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` — test project
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` — pre-seeded admin user

## Adding a new test

- **Unit / shim**: create `lib/<area>.test.ts` (or `e2e/tests/<thing>.test.ts` for harness-driven units). Vitest auto-discovers via `vitest.config.ts`.
- **Playwright route flow**: add a `*.spec.ts` under `e2e/playwright/tests/`.
- **Rust helper**: add a `#[cfg(test)] mod tests` block in the relevant Rust file. `cargo test --lib` picks it up.
- **OS-level smoke**: add a function to `e2e/scripts/smoke-deeplinks.sh` (or a sibling script). Document in this README.
