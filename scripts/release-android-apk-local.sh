#!/usr/bin/env bash
set -euo pipefail
# Build Android APK locally and upload to GitHub Release.
# Usage: bash scripts/release-android-apk-local.sh [tag]
# If no tag is given, the latest git tag is used.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-}"

cd "$REPO_ROOT"

if [ -z "$TAG" ]; then
  TAG="$(git describe --tags --abbrev=0 2>/dev/null || echo "")"
fi

if [ -z "$TAG" ]; then
  echo "No tag found. Pass one explicitly: bash scripts/release-android-apk-local.sh v0.1.93"
  exit 1
fi

echo "==> Building APK for $TAG"

echo "==> Building client dependencies..."
npm run build:client

echo "==> Prebuilding Android project..."
cd packages/app
npx cross-env APP_VARIANT=production expo prebuild --platform android --non-interactive

echo "==> Assembling release APK..."
cd android
./gradlew assembleRelease

APK_PATH="app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
  echo "ERROR: APK not found at $APK_PATH"
  exit 1
fi

cd "$REPO_ROOT"
ASSET_NAME="paseo-${TAG}-android.apk"
echo "==> Uploading $ASSET_NAME to GitHub Release $TAG..."
gh release upload "$TAG" "packages/app/android/$APK_PATH" --clobber --repo ByteTrue/paseo

echo "==> Done. APK uploaded: $ASSET_NAME"
