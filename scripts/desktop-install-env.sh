#!/usr/bin/env bash
# Provision the OmniTool desktop sidecar env file at the user-config path
# the Rust loader checks first (`app_config_dir()/server.env`).
#
# Usage:
#   scripts/desktop-install-env.sh path/to/server.env
#
# This avoids shipping secrets inside the DMG. Production builds strip the
# bundled `server.env`; the desktop sidecar reads from the user-config path
# instead. Run this once per machine after distributing the DMG.
#
# Tauri identifier: `dev.omnitool.app` (from tauri.conf.json).
set -euo pipefail

SRC="${1:-}"
if [[ -z "$SRC" ]]; then
  cat >&2 <<USAGE
Usage: $0 path/to/server.env

Copies the given env file to the per-user OmniTool config directory so the
desktop sidecar can load it on launch. The file MUST contain at least:
  - DATABASE_URL
  - DIRECT_URL
  - INTEGRATION_ENCRYPTION_KEY
  - AUTH_SECRET
  - SUPABASE_SERVICE_ROLE_KEY
  - GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
  - NOTION_CLIENT_ID, NOTION_CLIENT_SECRET
  - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
USAGE
  exit 1
fi

if [[ ! -f "$SRC" ]]; then
  echo "[desktop-install-env] Source file not found: $SRC" >&2
  exit 1
fi

OS="$(uname -s)"
case "$OS" in
  Darwin)
    DEST_DIR="$HOME/Library/Application Support/dev.omnitool.app"
    ;;
  Linux)
    DEST_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/dev.omnitool.app"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    DEST_DIR="${APPDATA:-$HOME/AppData/Roaming}/dev.omnitool.app"
    ;;
  *)
    echo "[desktop-install-env] Unsupported OS: $OS" >&2
    exit 1
    ;;
esac

DEST="$DEST_DIR/server.env"

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"
chmod 600 "$DEST"

echo "[desktop-install-env] Installed env file at $DEST"
echo "[desktop-install-env] Permissions set to 600 (owner read/write only)."
echo "[desktop-install-env] Restart OmniTool for changes to take effect."
