#!/usr/bin/env bash
# Build the OmniTool macOS DMG with code signing (and notarization when Apple creds are set).
#
# Prerequisites (Developer Account):
# 1. Install a "Developer ID Application" certificate (NOT "Apple Distribution").
#    Apple Distribution is for Mac App Store; DMGs for direct download need Developer ID.
#    Xcode → Settings → Accounts → Manage Certificates → + → Developer ID Application.
# 2. Export before running:
#      export APPLE_SIGNING_IDENTITY='Developer ID Application: Your Name (TEAMID)'
#      security find-identity -v -p codesigning
# 3. Notarization (required for other Macs to open without right-click / System Settings):
#      export APPLE_ID='you@example.com'
#      export APPLE_PASSWORD='abcd-abcd-abcd-abcd'   # generate at appleid.apple.com
#      export APPLE_TEAM_ID='XXXXXXXXXX'
#
# Then from repo root:
#   ./scripts/build-desktop-macos-signed.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "APPLE_SIGNING_IDENTITY is not set. Valid Developer ID signing identities:" >&2
  security find-identity -v -p codesigning >&2 || true
  echo "" >&2
  echo "Export APPLE_SIGNING_IDENTITY to the full name of your Developer ID Application certificate." >&2
  exit 1
fi

pnpm build:desktop
