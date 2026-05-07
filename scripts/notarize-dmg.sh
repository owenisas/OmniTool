#!/usr/bin/env bash
# notarize-dmg.sh — re-sign the .app inside the Tauri DMG, rebuild, notarize, staple.
# Tauri's DMG bundler loses code signatures during copy. This script fixes that.
#
# Usage: ./scripts/notarize-dmg.sh
# Requires: APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID

set -euo pipefail

IDENTITY="${APPLE_SIGNING_IDENTITY:?Set APPLE_SIGNING_IDENTITY}"
APPLE_ID="${APPLE_ID:?Set APPLE_ID}"
APPLE_PASSWORD="${APPLE_PASSWORD:?Set APPLE_PASSWORD}"
APPLE_TEAM_ID="${APPLE_TEAM_ID:?Set APPLE_TEAM_ID}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUNDLE_DIR="$ROOT_DIR/apps/desktop/src-tauri/target/release/bundle"
DMG_DIR="$BUNDLE_DIR/dmg"
ENTITLEMENTS="$ROOT_DIR/apps/desktop/src-tauri/Entitlements.plist"

DMG_FILE="$(ls "$DMG_DIR"/OmniTool_*.dmg 2>/dev/null | head -1)"
if [ -z "$DMG_FILE" ]; then
  echo "ERROR: No DMG found in $DMG_DIR"
  exit 1
fi
DMG_NAME="$(basename "$DMG_FILE")"

echo "=== OmniTool Notarization ==="
echo "DMG: $DMG_FILE"
echo "Identity: $IDENTITY"
echo ""

# --- Step 1: Extract .app from DMG ---
echo "[1/6] Extracting .app from DMG..."
WORK_DIR="$(mktemp -d)"
trap 'hdiutil detach "$MOUNT_POINT" -force -quiet 2>/dev/null; rm -rf "$WORK_DIR"' EXIT

# Detach any stale mounts
for v in /Volumes/OmniTool*; do
  hdiutil detach "$v" -force -quiet 2>/dev/null || true
done

hdiutil attach "$DMG_FILE" -nobrowse -readonly -mountpoint /Volumes/OmniTool 2>/dev/null
MOUNT_POINT="/Volumes/OmniTool"
echo "  Mounted at: $MOUNT_POINT"

# Use ditto to preserve everything
ditto "$MOUNT_POINT/OmniTool.app" "$WORK_DIR/OmniTool.app"
hdiutil detach "$MOUNT_POINT" -force -quiet 2>/dev/null
echo "  Extracted to: $WORK_DIR/OmniTool.app"

# --- Step 2: Sign all native binaries inside the .app ---
echo "[2/6] Signing native binaries inside .app..."
count=0
while IFS= read -r -d '' file; do
  echo "  Signing: ${file#$WORK_DIR/OmniTool.app/}"
  codesign --force --options runtime --timestamp \
    --sign "$IDENTITY" "$file"
  count=$((count + 1))
done < <(find "$WORK_DIR/OmniTool.app" -type f \( -name "*.dylib" -o -name "*.node" -o -name "*.so" \) -print0)
echo "  Signed $count native binaries."

# --- Step 3: Sign NodeSidecar.app ---
echo "[3/6] Signing NodeSidecar.app..."
SIDECAR="$WORK_DIR/OmniTool.app/Contents/Resources/resources/server/NodeSidecar.app"
if [ -d "$SIDECAR" ]; then
  codesign --force --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    --sign "$IDENTITY" \
    "$SIDECAR/Contents/MacOS/node"
  codesign --force --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    --sign "$IDENTITY" \
    "$SIDECAR"
  echo "  NodeSidecar.app signed."
else
  echo "  WARNING: NodeSidecar.app not found."
fi

# --- Step 4: Sign the outer OmniTool.app ---
echo "[4/6] Signing OmniTool.app..."
codesign --force --options runtime --timestamp \
  --entitlements "$ENTITLEMENTS" \
  --sign "$IDENTITY" \
  "$WORK_DIR/OmniTool.app/Contents/MacOS/omnitool-desktop"
codesign --force --options runtime --timestamp \
  --entitlements "$ENTITLEMENTS" \
  --sign "$IDENTITY" \
  "$WORK_DIR/OmniTool.app"

# Verify
echo "  Verifying..."
codesign --verify --deep --strict --verbose=2 "$WORK_DIR/OmniTool.app" 2>&1 && echo "  ✓ Signature valid" || {
  echo "  ✗ Signature verification FAILED"
  codesign --verify --deep --strict --verbose=2 "$WORK_DIR/OmniTool.app" 2>&1
  exit 1
}

# --- Step 5: Rebuild DMG ---
echo "[5/6] Rebuilding DMG..."
STAGING="$WORK_DIR/dmg-staging"
mkdir -p "$STAGING"
cp -R "$WORK_DIR/OmniTool.app" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

NEW_DMG="$WORK_DIR/$DMG_NAME"
hdiutil create -volname "OmniTool" -srcfolder "$STAGING" \
  -ov -format UDZO "$NEW_DMG"

# Sign the DMG itself
codesign --force --timestamp --sign "$IDENTITY" "$NEW_DMG"
echo "  DMG rebuilt and signed."

# Replace original
cp -f "$NEW_DMG" "$DMG_FILE"
echo "  Replaced: $DMG_FILE"

# --- Step 6: Notarize + Staple ---
echo "[6/6] Submitting for notarization..."
xcrun notarytool submit "$DMG_FILE" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

echo ""
echo "Stapling notarization ticket..."
# Retry stapling up to 6 times (CDN propagation)
for i in 1 2 3 4 5 6; do
  if xcrun stapler staple "$DMG_FILE" 2>&1 | grep -q "The staple and validate action worked"; then
    echo "✓ Stapled successfully."
    break
  fi
  echo "  Staple attempt $i failed, waiting 15s for CDN propagation..."
  sleep 15
done

echo ""
echo "=== Done ==="
echo "Signed + notarized DMG: $DMG_FILE"
