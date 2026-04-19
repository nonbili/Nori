#!/bin/bash
#
# Frame screenshots with fastlane frameit and organize them for metadata.
#
# Usage:
#   ./scripts/frame-screenshots.sh [platform]
#
# Arguments:
#   platform  - "ios" or "android" (default: auto-detect)
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCALE="${LOCALE:-en-US}"

# Auto-detect platform or use argument
detect_platform() {
  if [ -n "${1:-}" ]; then
    echo "$1"
    return
  fi

  if xcrun simctl list devices booted 2>/dev/null | grep -q "Booted"; then
    echo "ios"
  elif adb devices 2>/dev/null | grep -q "device$"; then
    echo "android"
  else
    echo "android" # Default to android if nothing detected
  fi
}

PLATFORM="$(detect_platform "${1:-}")"
SCREENSHOTS_DIR="$REPO_ROOT/fastlane/screenshots/$PLATFORM/$LOCALE"

if [ ! -d "$SCREENSHOTS_DIR" ]; then
  echo "Error: Screenshots directory not found: $SCREENSHOTS_DIR" >&2
  exit 1
fi

# Copy frameit config and assets from fastlane-config
echo "Preparing frameit configuration..."
cp "$REPO_ROOT/fastlane-config/$PLATFORM/Framefile.json" "$SCREENSHOTS_DIR/"
cp "$REPO_ROOT/fastlane-config/assets/background.jpg" "$SCREENSHOTS_DIR/"
cp "$REPO_ROOT/fastlane-config/assets/Regular.ttf" "$SCREENSHOTS_DIR/"

cd "$SCREENSHOTS_DIR"

echo "Framing screenshots in $SCREENSHOTS_DIR..."
if ! command -v bundle &>/dev/null; then
  echo "Error: bundle not found. Please install bundler and run 'bundle install'." >&2
  exit 1
fi

# Run frameit. It will look for Framefile.json in the current or parent directories.
bundle exec fastlane frameit

echo "Copying framed screenshots to metadata..."

if [ "$PLATFORM" = "android" ]; then
  METADATA_DIR="$REPO_ROOT/fastlane/metadata/android/$LOCALE/images/phoneScreenshots"
else
  METADATA_DIR="$REPO_ROOT/fastlane/metadata/ios/$LOCALE/screenshots"
fi

mkdir -p "$METADATA_DIR"

# Organize framed screenshots.
# Pattern: [Device-Name-]NN_name_framed.png -> [Device-Name-]N.png
for src in *_framed.png; do
  [ -f "$src" ] || continue
  
  # Use regex to capture device prefix and sequence number
  # Pattern: (optional device prefix)-NN_name_framed.png
  if [[ "$src" =~ ^(.*)-([0-9][0-9])_.*_framed\.png$ ]]; then
    device_prefix="${BASH_REMATCH[1]}"
    num_part="${BASH_REMATCH[2]}"
  elif [[ "$src" =~ ^([0-9][0-9])_.*_framed\.png$ ]]; then
    device_prefix=""
    num_part="${BASH_REMATCH[1]}"
  else
    echo "  Skipping unknown filename format: $src"
    continue
  fi

  num="$((10#$num_part))" # Convert to base-10 to strip leading zero
  
  if [ -n "$device_prefix" ]; then
    dest_name="${device_prefix}-${num}.png"
  else
    dest_name="${num}.png"
  fi
  
  cp "$src" "$METADATA_DIR/$dest_name"
  echo "  $src -> $METADATA_DIR/$dest_name"
done

echo "Done!"
