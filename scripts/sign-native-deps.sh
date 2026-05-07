#!/usr/bin/env bash
# sign-native-deps.sh — codesign all native binaries (.dylib, .node, .so)
# inside the sidecar resources before Tauri bundles them into the .app.
# Called via tauri.conf.json → bundle.beforeBundleCommand.

set -euo pipefail

IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
if [ -z "$IDENTITY" ]; then
  echo "[sign-native-deps] APPLE_SIGNING_IDENTITY not set, skipping."
  exit 0
fi

RESOURCES_DIR="$(dirname "$0")/../apps/desktop/src-tauri/resources/server"
if [ ! -d "$RESOURCES_DIR" ]; then
  echo "[sign-native-deps] No resources/server directory, skipping."
  exit 0
fi

echo "[sign-native-deps] Signing native binaries with: $IDENTITY"

count=0
while IFS= read -r -d '' file; do
  echo "  Signing: ${file#$RESOURCES_DIR/}"
  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$file"
  count=$((count + 1))
done < <(find "$RESOURCES_DIR" -type f \( -name "*.dylib" -o -name "*.node" -o -name "*.so" \) -print0)

echo "[sign-native-deps] Signed $count binaries."

# --- Sign the NodeSidecar.app bundle ---
SIDECAR="$RESOURCES_DIR/NodeSidecar.app"
if [ -d "$SIDECAR" ]; then
  echo "[sign-native-deps] Re-signing NodeSidecar.app (node binary + bundle)..."
  ENTITLEMENTS="$(dirname "$0")/../apps/desktop/src-tauri/Entitlements.plist"
  # Sign the inner node binary first
  codesign --force --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    --sign "$IDENTITY" \
    "$SIDECAR/Contents/MacOS/node"
  # Then sign the bundle itself
  codesign --force --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS" \
    --sign "$IDENTITY" \
    "$SIDECAR"
  echo "[sign-native-deps] NodeSidecar.app signed."
fi
