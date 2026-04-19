#!/bin/bash
#
# Take screenshots with Maestro and organize them for fastlane frameit.
#
# Usage:
#   ./scripts/maestro-screenshots.sh [platform]
#
# Arguments:
#   platform  - "ios" or "android" (default: auto-detect from running simulator/emulator)
#
# Output structure (frameit-compatible):
#   fastlane/screenshots/ios/en-US/*.png
#   fastlane/screenshots/android/en-US/*.png
#
# After running, use frameit:
#   cd fastlane/screenshots && bundle exec fastlane frameit
#

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLOW="$REPO_ROOT/.maestro/screenshots.yaml"
LOCALE="${LOCALE:-en-US}"

# Add maestro to PATH if installed via curl installer
if [ -d "$HOME/.maestro/bin" ]; then
  export PATH="$HOME/.maestro/bin:$PATH"
fi

if ! command -v maestro &>/dev/null; then
  echo "Error: maestro not found. Install it with:" >&2
  echo "  curl -Ls \"https://get.maestro.mobile.dev\" | bash" >&2
  exit 1
fi

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
    echo "Error: No running simulator or emulator detected." >&2
    echo "Start a simulator/emulator first, or pass 'ios' or 'android' as an argument." >&2
    exit 1
  fi
}

PLATFORM="$(detect_platform "${1:-}")"
DEVICE_NAME="${2:-}"
LOCALE="${LOCALE:-en-US}"

# Standard Fastlane-style directory structure
OUTPUT_DIR="$REPO_ROOT/fastlane/screenshots/$PLATFORM/$LOCALE"

echo "Platform: $PLATFORM"
if [ -n "$DEVICE_NAME" ]; then
  echo "Device:   $DEVICE_NAME"
fi
echo "Output:   $OUTPUT_DIR"
echo ""

mkdir -p "$OUTPUT_DIR"

# If DEVICE_NAME is provided, try to boot it (iOS only for now)
if [ "$PLATFORM" == "ios" ] && [ -n "$DEVICE_NAME" ]; then
  echo "Ensuring device $DEVICE_NAME is booted..."
  DEVICE_ID=$(xcrun simctl list devices | grep "$DEVICE_NAME" | grep -v "unavailable" | head -n 1 | sed -E 's/.*\(([0-9A-F-]+)\).*/\1/')
  if [ -n "$DEVICE_ID" ]; then
    xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
    open -a Simulator --args -CurrentDeviceUDID "$DEVICE_ID"
    # Wait a bit for the simulator to be ready for Maestro
    sleep 2
  else
    echo "Warning: Could not find device ID for '$DEVICE_NAME'. Using current simulator."
  fi
fi

# Clean up any leftover un-prefixed maestro screenshots from previous failed runs
rm -f "$OUTPUT_DIR"/[0-9][0-9]_*.png

# Run Maestro flow
echo "Running Maestro flow..."
cd "$OUTPUT_DIR"
maestro test "$FLOW"

# If DEVICE_NAME is provided, prefix the screenshots to follow Fastlane convention: "Device-Name.png"
if [ -n "$DEVICE_NAME" ]; then
  echo "Prefixing screenshots with device name..."
  for f in [0-9][0-9]_*.png; do
    [ -f "$f" ] || continue
    mv -f "$f" "$DEVICE_NAME-$f"
  done
fi

echo ""
echo "Screenshots saved to: $OUTPUT_DIR"
ls -1 "$OUTPUT_DIR"/*.png 2>/dev/null || echo "(no screenshots found)"
echo ""
echo "Next steps:"
echo "  ./scripts/frame-screenshots.sh $PLATFORM"
