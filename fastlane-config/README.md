# Fastlane Screenshot & Upload Automation

This directory contains the Fastlane configuration and native test files for organizing and uploading automated screenshots on Android and iOS.

## Overview

Because this is an Expo project, the `android/` and `ios/` directories are dynamically generated. To ensure our Fastlane configurations are preserved, they are stored here and injected into the native projects during `npx expo prebuild` using custom Expo Config Plugins.

### Files
- `android/`: Fastlane and Frameit configuration for Android.
- `ios/`: Fastlane and Frameit configuration for iOS.
- `assets/`: Shared assets for framing (e.g., fonts).

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
