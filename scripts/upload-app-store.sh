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
APP_VERSION="$(cd "$REPO_ROOT" && node -p "require('./package.json').version")"
BUILD_NUMBER="$(cd "$REPO_ROOT" && node -p "require('./package.json').buildNumber")"
VERSION_CODE="$(cd "$REPO_ROOT" && node -p "require('./package.json').versionCode")"
ANDROID_CHANGELOG="${IOS_CHANGELOG_SOURCE:-$REPO_ROOT/fastlane/metadata/android/en-US/changelogs/${VERSION_CODE}04.txt}"
IOS_RELEASE_NOTES_PATH="${IOS_RELEASE_NOTES_PATH:-$REPO_ROOT/fastlane/metadata/ios/en-US/release_notes.txt}"

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

if [ ! -f "$ANDROID_CHANGELOG" ]; then
  echo "Error: Android changelog not found: $ANDROID_CHANGELOG" >&2
  echo "       Expected the current versionCode changelog at fastlane/metadata/android/en-US/changelogs/${VERSION_CODE}04.txt." >&2
  exit 1
fi

mkdir -p "$(dirname "$IOS_RELEASE_NOTES_PATH")"
cp "$ANDROID_CHANGELOG" "$IOS_RELEASE_NOTES_PATH"
echo "Using release notes from $ANDROID_CHANGELOG"

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

if [ "${IOS_SKIP_BINARY_UPLOAD:-0}" != "1" ] && [ "${SKIP_BUILD:-0}" = "1" ] && [ ! -f "$IPA_PATH" ]; then
  echo "Error: IPA not found: $IPA_PATH" >&2
  exit 1
fi

if [ "${IOS_SKIP_BINARY_UPLOAD:-0}" = "1" ]; then
  echo "Submitting existing App Store Connect build $APP_VERSION ($BUILD_NUMBER) for $APP_IDENTIFIER..."
else
  echo "Uploading $IPA_PATH to App Store Connect for $APP_IDENTIFIER..."
fi
(
  cd "$REPO_ROOT"
  IOS_APP_IDENTIFIER="$APP_IDENTIFIER" \
  IOS_APP_VERSION="$APP_VERSION" \
  IOS_BUILD_NUMBER="$BUILD_NUMBER" \
  IPA_PATH="$IPA_PATH" \
  IOS_RELEASE_NOTES_PATH="$IOS_RELEASE_NOTES_PATH" \
  IOS_BUILD_BEFORE_UPLOAD="$([ "${SKIP_BUILD:-0}" = "1" ] && echo 0 || echo 1)" \
  bundle exec fastlane ios upload_ipa
)

echo "Done."
