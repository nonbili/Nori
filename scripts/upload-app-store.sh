#!/bin/bash
#
# Build and upload the iOS IPA to App Store Connect with fastlane.
#
# Usage:
#   ./scripts/upload-app-store.sh [ipa_path]
#
# Required App Store Connect API key env:
#   APP_STORE_CONNECT_API_KEY_KEY_ID
#   APP_STORE_CONNECT_API_KEY_ISSUER_ID
#   APP_STORE_CONNECT_API_KEY_KEY_FILEPATH or APP_STORE_CONNECT_API_KEY_KEY
#
# Examples:
#   APP_STORE_CONNECT_API_KEY_KEY_ID=... \
#   APP_STORE_CONNECT_API_KEY_ISSUER_ID=... \
#   APP_STORE_CONNECT_API_KEY_KEY_FILEPATH=~/.appstoreconnect/AuthKey_ABC123.p8 \
#   ./scripts/upload-app-store.sh
#
#   SKIP_BUILD=1 ./scripts/upload-app-store.sh ./ios/build/Nori.ipa
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IPA_PATH="${1:-${IPA_PATH:-$REPO_ROOT/ios/build/Nori.ipa}}"
APP_IDENTIFIER="${IOS_APP_IDENTIFIER:-jp.nonbili.nori}"

if [ -z "${APP_STORE_CONNECT_API_KEY_KEY_ID:-}" ]; then
  echo "Error: APP_STORE_CONNECT_API_KEY_KEY_ID is required." >&2
  exit 1
fi

if [ -z "${APP_STORE_CONNECT_API_KEY_ISSUER_ID:-}" ]; then
  echo "Error: APP_STORE_CONNECT_API_KEY_ISSUER_ID is required." >&2
  exit 1
fi

if [ -z "${APP_STORE_CONNECT_API_KEY_KEY_FILEPATH:-}" ] && [ -z "${APP_STORE_CONNECT_API_KEY_KEY:-${APP_STORE_CONNECT_API_KEY_KEY_CONTENT:-}}" ]; then
  echo "Error: set APP_STORE_CONNECT_API_KEY_KEY_FILEPATH or APP_STORE_CONNECT_API_KEY_KEY." >&2
  exit 1
fi

if [ -n "${APP_STORE_CONNECT_API_KEY_KEY_FILEPATH:-}" ] && [ ! -f "$APP_STORE_CONNECT_API_KEY_KEY_FILEPATH" ]; then
  echo "Error: App Store Connect API key file not found: $APP_STORE_CONNECT_API_KEY_KEY_FILEPATH" >&2
  exit 1
fi

if ! command -v bundle &>/dev/null; then
  echo "Error: bundle not found. Install bundler and run 'bundle install'." >&2
  exit 1
fi

if [ "${PREBUILD:-$([ "${SKIP_BUILD:-0}" = "1" ] && echo 0 || echo 1)}" = "1" ]; then
  echo "Running clean Expo prebuild for iOS..."
  (
    cd "$REPO_ROOT"
    npx expo prebuild --platform ios --clean --no-install
  )
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "Installing CocoaPods dependencies..."
  (
    cd "$REPO_ROOT/ios"
    if bundle exec pod --version &>/dev/null; then
      bundle exec pod install
    else
      pod install
    fi
  )
fi

if [ "${SKIP_BUILD:-0}" = "1" ] && [ ! -f "$IPA_PATH" ]; then
  echo "Error: IPA not found: $IPA_PATH" >&2
  exit 1
fi

echo "Uploading $IPA_PATH to App Store Connect for $APP_IDENTIFIER..."
(
  cd "$REPO_ROOT"
  IOS_APP_IDENTIFIER="$APP_IDENTIFIER" \
  IPA_PATH="$IPA_PATH" \
  IOS_BUILD_BEFORE_UPLOAD="$([ "${SKIP_BUILD:-0}" = "1" ] && echo 0 || echo 1)" \
  bundle exec fastlane ios upload_ipa
)

echo "Done."
