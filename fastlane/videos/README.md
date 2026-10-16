# Store videos

Google Play promotional videos and App Store previews have separate generators.
The Google Play videos animate still screenshots. The iOS previews use recordings
of the native app running on iPhone and iPad simulators, with ordinary cuts and
no device frames or simulated interface animations.

## Google Play promos

Requires Python 3.9+, FFmpeg with libx264 and AAC, and these Python dependencies:

```sh
python3 -m pip install -r scripts/requirements-promo-video.txt
python3 scripts/generate-promo-video.py
```

The generator reads PNGs in `assets/` and writes 20-second, 30 fps landscape and
portrait videos under `android/en-US/`. It does not launch or capture the app.
Fonts come from macOS system fonts, DejaVu Sans, or Pillow's scalable default.
Install FFmpeg on PATH, or set `FFMPEG` to its executable path.

Review still frames without encoding, or render selected targets:

```sh
python3 scripts/generate-promo-video.py --preview-dir /tmp/nori-promo-preview
python3 scripts/generate-promo-video.py --target landscape --target portrait
```

Preview mode writes JPEGs and does not need FFmpeg. Outputs replace existing
files only after a successful encode. Run encoder lifecycle regression checks:

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
```

Published videos:

- [Landscape promo](https://www.youtube.com/watch?v=ER5tvIuwYnw)
- [Portrait promo / Short](https://www.youtube.com/watch?v=jwrhS73qNB4)

Google Play has one video URL per localized listing. Each locale's `video.txt`
uses the portrait promo to match the phone interface; the landscape version
remains available for wider promotional placements.

## App Store previews

The source screen recordings and their edit intervals live in `recordings/`.
Regenerate the iOS previews without rebuilding or re-recording the app:

```sh
python3 scripts/generate-app-previews.py fastlane/videos/recordings/manifest.json
```

Use repeatable `--target iphone-65`, `--target iphone-55`, or `--target ipad`
options for a subset. Each preview contains real-time native app interactions:
browsing lists, searching, adding a tag, changing themes, and batch selection.
The editor trims and concatenates those recordings, scales to the accepted
upload dimensions, and encodes H.264 High Level 4.0 at a 10 Mbps constant video
bitrate, 30 fps, with a silent stereo AAC track configured at 256 kbps / 44.1 kHz.
No screenshot is substituted for a video frame. Every requested output is
encoded and validated before the existing previews are replaced.

The `iphone-55` file uses a separate recording from an iPhone SE simulator with
a 16:9 screen; it is not a stretched recording of a taller iPhone. The iPad
preview likewise comes from a separate iPad recording. The encoder rejects
source recordings whose aspect ratio differs substantially from the target.

### Record a fresh set

You need Xcode, the installed iOS simulator runtime, local Maestro, the app's
JavaScript dependencies, and its generated Expo iOS project with Pods installed.
Use simulators named `Nori Preview …`; the capture and cache scripts reject
other names to protect personal app data. Create and boot a dedicated simulator
before building. For example, set `PREVIEW_DEVICE` to its UDID, then run:

```sh
xcodebuild -workspace ios/Nori.xcworkspace -scheme Nori -configuration Release \
  -sdk iphonesimulator -destination "id=$PREVIEW_DEVICE" \
  -derivedDataPath /tmp/nori-preview-build ONLY_ACTIVE_ARCH=YES CODE_SIGNING_ALLOWED=NO build

ditto /tmp/nori-preview-build/Build/Products/Release-iphonesimulator/Nori.app /tmp/NoriPreview.app
EXPO_PUBLIC_APP_PREVIEW=1 bunx expo export:embed --platform ios \
  --entry-file scripts/app-preview-entry.ts --dev false \
  --bundle-output /tmp/NoriPreview.app/main.jsbundle --assets-dest /tmp/NoriPreview.app

xcrun simctl install "$PREVIEW_DEVICE" /tmp/NoriPreview.app
python3 scripts/seed-app-preview-cache.py "$PREVIEW_DEVICE"
python3 scripts/record-app-preview.py iphone-65 "$PREVIEW_DEVICE"
```

The recording-only entry seeds `assets/native-preview-fixture.json` into local
storage before loading the normal Expo Router entry. It changes sample data and
settings; it does not replace UI components or interaction handlers. It requires
`EXPO_PUBLIC_APP_PREVIEW=1`, and the normal `package.json` entry is unchanged.
Do not distribute this recording build.

Repeat on appropriately sized `Nori Preview …` iPhone SE and iPad simulators
with targets `iphone-55` and `ipad`. `record-app-preview.py` drives
`.maestro/app-preview/showcase.yaml`, records actual simulator pixels, and saves
source movies and estimated clip intervals. The flow's timing screenshots mark
the clips; they are never used to generate video frames. Simulator and host
clocks can drift: inspect the source movie, adjust the intervals to the actual
interactions, and set each manifest entry's `reviewed` field to `true` before
encoding. The encoder refuses unreviewed edits. Clips retain their actual speed.

For another take, `--reset-app /tmp/NoriPreview.app --cache-dir <cache>` resets
only the dedicated simulator app and restores a portable `bookmark-previews`
cache, avoiding network loading during capture. An initial cache can be copied
from that app's Documents directory after running `seed-app-preview-cache.py`.

Uploading and processing assets is separate from App Review approval. Review
all previews before submitting them, and check Apple's current requirements:

- [App preview content guidance](https://developer.apple.com/app-store/app-previews/)
- [App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/)
- [Review guideline 2.3.4](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata)
