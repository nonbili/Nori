# Google Play feature graphic

Asset: `fastlane/metadata/android/en-US/images/featureGraphic.png`

Generated reproducibly by `scripts/generate-feature-graphic.py`, which renders
the banner at 3× DPR via Headless Chrome (`3072×1500`) and downscales with
Lanczos resampling to `1024×500` as a 24-bit RGB PNG without alpha:

```sh
python3 scripts/generate-feature-graphic.py
```

The composition uses Nori's actual cover previews and favicons from
`fastlane/videos/assets/`, the official `assets/images/icon.png` brand mark, and
Nori's three-part bookmark card layout (top-right tag tab, horizontal preview
card, and bottom-left personal note tab) across both Dark Emerald and Light
Cobalt themes.

Suggested alt text: “Nori — Links worth keeping. Save with rich cover previews, #tags, and personal notes, organized in custom lists.”

Upload the PNG in Play Console → Grow users → Store presence → Main store
listing → English (United States) → Graphics → Feature graphic. Save and submit
the listing changes through the console's publishing flow. Check other
localized listings for explicit old feature graphic overrides and replace
those too if present. This file being in the repository does not update Play.

The release AAB lane skips images. The screenshot lane includes images but
skips metadata (including `video.txt`); it also uploads screenshots. Use the
console to replace just the feature graphic.
