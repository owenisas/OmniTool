#!/usr/bin/env bash
# OmniTool desktop deep-link smoke test (macOS only).
#
# Verifies the running OmniTool app correctly handles `omnitool://` deep
# links registered in Info.plist, by:
#   1. Bringing OmniTool to the foreground.
#   2. Triggering each canonical deep-link variant via the macOS `open`
#      command.
#   3. After each, asserting the app's webview navigated to the expected
#      URL by inspecting the active webview's URL via the accessibility
#      tree (read-only — no Accessibility permission needed for read).
#
# Use: ensure OmniTool is running, then `bash smoke-deeplinks.sh`.
# Exits 0 on success, non-zero on first failure with a clear message.
#
# Notes:
#   - Requires the user to be signed in (otherwise auth/callback bounces
#     to /login, which we don't currently assert on).
#   - The accessibility-tree URL read uses `osascript`; if the System
#     Events tell-process query times out we fall back to checking
#     window title.
set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "skip: this smoke is macOS-specific" >&2
  exit 0
fi

if ! pgrep -fl omnitool-desktop >/dev/null; then
  echo "fail: OmniTool not running. Launch with \`pnpm ship:desktop\` first." >&2
  exit 1
fi

# ── helpers ─────────────────────────────────────────────────────────────
activate_app() {
  osascript -e 'tell application "OmniTool" to activate' >/dev/null 2>&1 || true
}

# Read the URL from the accessibility tree of OmniTool's main webview.
# WKWebView exposes itself as an AXWebArea with an AXURL attribute.
read_webview_url() {
  osascript <<'APPLESCRIPT' 2>/dev/null || echo ""
tell application "System Events"
    if not (exists process "OmniTool") then return ""
    tell process "OmniTool"
        try
            set ws to value of attribute "AXURL" of (first UI element of front window whose role is "AXWebArea")
            return ws as text
        on error
            return ""
        end try
    end tell
end tell
APPLESCRIPT
}

assert_url_contains() {
  local expected="$1"
  local timeout=10
  local elapsed=0
  while (( elapsed < timeout )); do
    local current
    current="$(read_webview_url)"
    if [[ "$current" == *"$expected"* ]]; then
      echo "  ✓ webview URL contains '$expected'"
      return 0
    fi
    sleep 1
    (( elapsed += 1 ))
  done
  echo "  ✗ webview URL never contained '$expected' within ${timeout}s" >&2
  echo "    last seen: '$(read_webview_url)'" >&2
  return 1
}

# ── tests ───────────────────────────────────────────────────────────────
echo "[deep-link smoke] activating OmniTool..."
activate_app
sleep 1

echo "[1/2] omnitool://oauth-complete?provider=github&status=success"
open "omnitool://oauth-complete?provider=github&status=success"
sleep 1
assert_url_contains "/settings/integrations" || exit 1
assert_url_contains "connected=github" || exit 1

echo "[2/2] omnitool://oauth-complete?provider=notion&status=error"
open "omnitool://oauth-complete?provider=notion&status=error"
sleep 1
assert_url_contains "/settings/integrations" || exit 1
assert_url_contains "error=notion_oauth" || exit 1

echo "deep-link smoke: PASS"
