# Promo videos

Requires Python 3.9+ and FFmpeg with the `libx264` and AAC encoders.
Run from the repository root:

```sh
python3 -m venv .venv-promo
. .venv-promo/bin/activate
python3 -m pip install -r scripts/requirements-promo-video.txt
python3 scripts/generate-promo-video.py
```

Install FFmpeg on PATH, or set `FFMPEG` to its executable path. The renderer uses
macOS system fonts when available, then DejaVu Sans, then Pillow's scalable
default font. Fonts affect layout.

Review the opening, five scene midpoints, and closing frame without encoding:

```sh
python3 scripts/generate-promo-video.py --preview-dir /tmp/nori-promo-preview
```

Render selected targets with repeatable `--target` options:

```sh
python3 scripts/generate-promo-video.py --target landscape --target portrait
```

Choices: `iphone-65`, `iphone-55`, `ipad`, `landscape`, and `portrait`. The portrait
target renders the shared 1080×1920 composition and copies it to the Android path.
Preview mode writes JPEGs only and does not need FFmpeg.

The generator reads the committed PNGs in `assets/`; it does not launch the app
or refresh screenshots. It renders four 20-second, 30 fps H.264 videos and copies
the 1080×1920 version to the Android portrait path. Each output replaces its
existing file only after a successful encode or copy. Encoder errors and Python
interrupts preserve the previous video and remove temporary output.

The five scenes cover previews, annotation, search, personalization, and batch
organization. The tablet composition uses tablet captures throughout and shows
list organization in place of personalization, since there is no usable tablet
appearance-sheet capture. Short copy and larger type keep each scene readable;
the opening shows the app immediately and the closing holds through the last frame.

Run encoder lifecycle regression checks:

```sh
python3 -m unittest discover -s scripts -p 'test_*.py'
```

## App Store submission

The files under `ios/` are promotional mockups at App Store preview dimensions,
not submission-ready app previews. They animate still screenshots inside device
frames. Apple calls for device-specific footage captured in the app, showing
content within the app itself. Record actual iPhone and iPad usage and edit
separate previews before submission; changing the encoder settings alone does
not address this.

The renderer uses H.264 High Level 4.0 and CRF 18 for promotional use. Its silent
stereo AAC track uses a 128 kbps encoder setting (actual bitrate is much lower
for silence). Apple's published encoding specifications call for up to High
Level 4.0, a 10–12 Mbps video target, and 256 kbps stereo AAC at 44.1 or 48 kHz.
Check the current requirements when preparing actual previews.

References:

- [Apple app preview content guidance](https://developer.apple.com/app-store/app-previews/)
- [Apple app preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/)
