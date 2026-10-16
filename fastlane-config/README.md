# Fastlane Screenshot & Upload Automation

This directory contains the Fastlane configuration and native test files for organizing and uploading automated screenshots on Android and iOS.

## Overview

Because this is an Expo project, the `android/` and `ios/` directories are dynamically generated. To ensure our Fastlane configurations are preserved, they are stored here and injected into the native projects during `npx expo prebuild` using custom Expo Config Plugins.

### Files
- `android/`: Fastlane and Frameit configuration for Android.
- `ios/`: Fastlane and Frameit configuration for iOS.
- `assets/`: Shared assets for framing (e.g., fonts).

## Current store screenshot set

The English metadata screenshots use populated UI captures shared with the promo
videos. Generate five panels for Android phones, iPhones, and iPads:

```sh
python3 -m pip install -r scripts/requirements-promo-video.txt
python3 scripts/generate-store-screenshots.py --contact-sheet /tmp/nori-screenshots.jpg
```

This writes PNGs directly into `fastlane/metadata/`, preserving the existing
1080×2340 Android, 1242×2688 iPhone, and 2048×2732 iPad sizes and device filenames.
It uses the current promo copy and colors with a complete, undistorted UI capture
inside a thin neutral frame. iPad panel four shows lists, since its existing
appearance capture does not contain a settings sheet.

For a review without changing metadata files:

```sh
python3 scripts/generate-store-screenshots.py --output-root /tmp/nori-review --contact-sheet /tmp/nori-screenshots.jpg
```

Use repeatable `--target android`, `--target iphone`, or `--target ipad` to render
a subset. Source PNG mappings live in `scripts/generate-store-screenshots.py`;
replace the corresponding captures in `fastlane/videos/assets/` when refreshing
the app content. This command composes existing captures; it does not boot a
device or capture the app. No native rebuild, Ruby gems, or FFmpeg is needed.

The Maestro and Frameit workflow below is the older capture pipeline. Its flow
and feature copy predate the current UI; update and validate them before using
it to replace this curated set.

## Setup

1. **Install Dependencies**:
   Ensure you have the required Ruby gems installed:
   ```bash
   bundle install
   ```

2. **Prebuild**:
   Run the Expo prebuild to generate the native directories and inject the configuration:
   ```bash
   npx expo prebuild
   ```

## Capturing Screenshots (Maestro)

We use [Maestro](https://maestro.mobile.dev/) for cross-platform screenshot automation.

### Running Screenshots
```bash
# Capture screenshots for the currently running simulator/emulator
./scripts/maestro-screenshots.sh
```

Screenshots are saved to `fastlane/screenshots/` and organized by platform and locale.

## Framing Screenshots

Use Fastlane's `frameit` to wrap screenshots in device models.

```bash
./scripts/frame-screenshots.sh [ios|android]
```

## Configuration

Update the files in `fastlane-config/` with your specific credentials:
- `fastlane-config/android/Appfile`: JSON key file and package name.
- `fastlane-config/ios/Appfile`: Apple ID and Team IDs.

---

## Uploading Screenshots to App Stores

You can upload the generated screenshots directly to Google Play and App Store Connect using Fastlane. Ensure your `Appfile` credentials are fully configured before uploading.

### Android (Google Play Store)

Make sure `json_key_file` is set in `fastlane-config/android/Appfile`.

```bash
cd android
bundle exec fastlane upload_screenshots
```

### iOS (App Store Connect)

Make sure `apple_id`, `itc_team_id`, and `team_id` are set in `fastlane-config/ios/Appfile`.

```bash
cd ios
bundle exec fastlane upload_screenshots
```
