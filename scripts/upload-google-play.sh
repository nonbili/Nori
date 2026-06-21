#!/bin/bash
#
# Build and upload the Android release bundle to Google Play with fastlane.
#
# Usage:
#   ./scripts/upload-google-play.sh [track] [aab_path]
#
# Examples:
#   GOOGLE_PLAY_JSON_KEY=/path/to/service-account.json ./scripts/upload-google-play.sh
#   SKIP_BUILD=1 GOOGLE_PLAY_JSON_KEY=/path/to/service-account.json ./scripts/upload-google-play.sh production ./android/app/build/outputs/bundle/release/app-release.aab
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TRACK="${1:-${GOOGLE_PLAY_TRACK:-production}}"
AAB_PATH="${2:-${AAB_PATH:-$REPO_ROOT/android/app/build/outputs/bundle/release/app-release.aab}}"
PACKAGE_NAME="${ANDROID_PACKAGE_NAME:-jp.nonbili.nori}"
JSON_KEY="${GOOGLE_PLAY_JSON_KEY:-${SUPPLY_JSON_KEY:-}}"
VERSION_CODE="$(cd "$REPO_ROOT" && node -p "require('./package.json').versionCode")"
ANDROID_CHANGELOG="${GOOGLE_PLAY_CHANGELOG:-$REPO_ROOT/fastlane/metadata/android/en-US/changelogs/${VERSION_CODE}04.txt}"

if [ -z "$JSON_KEY" ] && [ -z "${GOOGLE_PLAY_JSON_KEY_DATA:-${SUPPLY_JSON_KEY_DATA:-}}" ]; then
  echo "Error: set GOOGLE_PLAY_JSON_KEY or SUPPLY_JSON_KEY to your Google Play service account JSON path." >&2
  echo "       You may also set GOOGLE_PLAY_JSON_KEY_DATA or SUPPLY_JSON_KEY_DATA for JSON content." >&2
  exit 1
fi

if [ -n "$JSON_KEY" ] && [ ! -f "$JSON_KEY" ]; then
  echo "Error: Google Play service account JSON not found: $JSON_KEY" >&2
  exit 1
fi

if ! command -v bundle &>/dev/null; then
  echo "Error: bundle not found. Install bundler and run 'bundle install'." >&2
  exit 1
fi

if [ "${GOOGLE_PLAY_UPLOAD_CHANGELOGS:-1}" != "0" ] && [ ! -f "$ANDROID_CHANGELOG" ]; then
  echo "Error: Android changelog not found: $ANDROID_CHANGELOG" >&2
  echo "       Expected the current versionCode changelog at fastlane/metadata/android/en-US/changelogs/${VERSION_CODE}04.txt." >&2
  exit 1
fi

if [ "${GOOGLE_PLAY_UPLOAD_CHANGELOGS:-1}" != "0" ]; then
  echo "Using Google Play changelog $ANDROID_CHANGELOG"
fi

if [ "${PREBUILD:-$([ "${SKIP_BUILD:-0}" = "1" ] && echo 0 || echo 1)}" = "1" ]; then
  echo "Running clean Expo prebuild for Android with Google Play signing config..."
  (
    cd "$REPO_ROOT"
    GOOGLE_PLAY_BUILD=1 npx expo prebuild --platform android --clean --no-install
  )
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  gradle_args=()
  for name in NB_UPLOAD_STORE_FILE NB_UPLOAD_STORE_PASSWORD NB_UPLOAD_KEY_ALIAS NB_UPLOAD_KEY_PASSWORD; do
    if [ -n "${!name:-}" ]; then
      gradle_args+=("-P$name=${!name}")
    fi
  done

  echo "Building Android release bundle..."
  (
    cd "$REPO_ROOT/android"
    if [ "${#gradle_args[@]}" -gt 0 ]; then
      GOOGLE_PLAY_BUILD=1 ./gradlew bundleRelease "${gradle_args[@]}"
    else
      GOOGLE_PLAY_BUILD=1 ./gradlew bundleRelease
    fi
  )
fi

if [ ! -f "$AAB_PATH" ]; then
  echo "Error: AAB not found: $AAB_PATH" >&2
  exit 1
fi

echo "Uploading $AAB_PATH to Google Play track '$TRACK' for $PACKAGE_NAME..."
(
  cd "$REPO_ROOT"
  ANDROID_PACKAGE_NAME="$PACKAGE_NAME" \
  AAB_PATH="$AAB_PATH" \
  GOOGLE_PLAY_TRACK="$TRACK" \
  GOOGLE_PLAY_UPLOAD_CHANGELOGS="${GOOGLE_PLAY_UPLOAD_CHANGELOGS:-1}" \
  bundle exec fastlane android upload_aab
)

echo "Done."
