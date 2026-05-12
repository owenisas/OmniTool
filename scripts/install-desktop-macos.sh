#!/usr/bin/env bash
# Build the production Tauri desktop app, install it on macOS, and launch it.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${OMNITOOL_APP_NAME:-OmniTool}"
DEFAULT_INSTALL_DIR="/Applications"
INSTALL_DIR="${OMNITOOL_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
ENV_FILE="${OMNITOOL_SERVER_ENV:-}"
SERVER_PORT="${OMNITOOL_SERVER_PORT:-19283}"
BUILD=1
OPEN_AFTER_INSTALL=1
PROVISION_ENV=1

usage() {
  cat <<USAGE
Usage: $0 [--skip-build] [--no-open] [--env-file path/to/server.env] [--no-env]

Environment:
  OMNITOOL_INSTALL_DIR   Install destination directory. Defaults to /Applications.
  OMNITOOL_SERVER_ENV    Env file to install as desktop server.env. Defaults to .env when present.
  OMNITOOL_SERVER_PORT   Local desktop server port. Defaults to 19283.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --skip-build)
      BUILD=0
      shift
      ;;
    --no-open)
      OPEN_AFTER_INSTALL=0
      shift
      ;;
    --env-file)
      if [[ -z "${2:-}" ]]; then
        echo "[desktop-install] --env-file requires a path." >&2
        exit 1
      fi
      ENV_FILE="$2"
      shift 2
      ;;
    --no-env)
      PROVISION_ENV=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[desktop-install] Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[desktop-install] This installer currently supports macOS only." >&2
  exit 1
fi

if [[ "$BUILD" -eq 1 ]]; then
  (cd "$ROOT_DIR" && pnpm build:desktop)
fi

DMG_DIR="$ROOT_DIR/apps/desktop/src-tauri/target/release/bundle/dmg"

if [[ ! -d "$DMG_DIR" ]]; then
  echo "[desktop-install] No DMG directory found at $DMG_DIR. Run pnpm build:desktop first." >&2
  exit 1
fi

DMG="$(
  find "$DMG_DIR" -maxdepth 1 -type f -name "${APP_NAME}_*.dmg" -print0 2>/dev/null \
    | xargs -0 ls -t 2>/dev/null \
    | head -n 1
)"

if [[ -z "$DMG" || ! -f "$DMG" ]]; then
  echo "[desktop-install] No DMG found in $DMG_DIR. Run pnpm build:desktop first." >&2
  exit 1
fi

echo "[desktop-install] Using DMG: $DMG"

osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1 || true

STALE_PIDS="$(lsof -t -nP -iTCP:"$SERVER_PORT" -sTCP:LISTEN 2>/dev/null | sort -u || true)"
if [[ -n "$STALE_PIDS" ]]; then
  echo "[desktop-install] Stopping stale sidecar listener(s) on port $SERVER_PORT: $STALE_PIDS"
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill "$pid" >/dev/null 2>&1 || true
  done <<< "$STALE_PIDS"
  sleep 1
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    kill -9 "$pid" >/dev/null 2>&1 || true
  done <<< "$(lsof -t -nP -iTCP:"$SERVER_PORT" -sTCP:LISTEN 2>/dev/null | sort -u || true)"
fi

for volume in /Volumes/"$APP_NAME"*; do
  [[ -e "$volume" ]] || continue
  hdiutil detach "$volume" -force -quiet >/dev/null 2>&1 || true
done

MOUNT_POINT="$(
  hdiutil attach "$DMG" -nobrowse -noautoopen -plist \
    | plutil -extract "system-entities".0."mount-point" raw -
)"

cleanup() {
  if [[ -n "${MOUNT_POINT:-}" ]]; then
    hdiutil detach "$MOUNT_POINT" -quiet >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

SOURCE_APP="$MOUNT_POINT/$APP_NAME.app"
if [[ ! -d "$SOURCE_APP" ]]; then
  SOURCE_APP="$(find "$MOUNT_POINT" -maxdepth 1 -type d -name "*.app" | head -n 1)"
fi

if [[ -z "$SOURCE_APP" || ! -d "$SOURCE_APP" ]]; then
  echo "[desktop-install] No .app bundle found inside $DMG." >&2
  exit 1
fi

if [[ "$INSTALL_DIR" == "$DEFAULT_INSTALL_DIR" && ! -w "$DEFAULT_INSTALL_DIR" ]]; then
  INSTALL_DIR="$HOME/Applications"
  echo "[desktop-install] /Applications is not writable; installing to $INSTALL_DIR."
fi

mkdir -p "$INSTALL_DIR"

DEST_APP="$INSTALL_DIR/$APP_NAME.app"
TMP_APP="$INSTALL_DIR/.$APP_NAME.app.installing"

rm -rf "$TMP_APP"
ditto "$SOURCE_APP" "$TMP_APP"
rm -rf "$DEST_APP"
mv "$TMP_APP" "$DEST_APP"

rm -rf \
  "$HOME/Library/Caches/dev.omnitool.app/WebKit" \
  "$HOME/Library/Caches/omnitool-desktop/WebKit"

echo "[desktop-install] Installed $DEST_APP"

if [[ "$PROVISION_ENV" -eq 1 ]]; then
  if [[ -z "$ENV_FILE" && -f "$ROOT_DIR/.env" ]]; then
    ENV_FILE="$ROOT_DIR/.env"
  fi

  if [[ -n "$ENV_FILE" ]]; then
    "$ROOT_DIR/scripts/desktop-install-env.sh" "$ENV_FILE"
  else
    echo "[desktop-install] No server env file installed; pass --env-file or set OMNITOOL_SERVER_ENV."
  fi
fi

if [[ "$OPEN_AFTER_INSTALL" -eq 1 ]]; then
  open "$DEST_APP"
fi
