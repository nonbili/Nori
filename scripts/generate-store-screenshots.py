#!/usr/bin/env python3
"""Render English store screenshots from the populated UI captures used in promo videos."""

import argparse
import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("promo", Path(__file__).with_name("generate-promo-video.py"))
promo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(promo)

PANELS = [
    (scene["badge"], scene["title"], scene["subtitle"], capture, scene["accent1"], scene["accent2"])
    for scene, capture in zip(promo.SCENES, ("dark", "editor", "drawer", "appearance", "selection"))
]

CAPTURES = {
    "phone": {
        "dark": "mobile_01_preview_dark.png",
        "editor": "mobile_04_editor_sheet.png",
        "drawer": "mobile_03_drawer_all.png",
        "appearance": "mobile_07_appearance_sheet.png",
        "selection": "mobile_05_selection_mode.png",
    },
    "tablet": {
        "dark": "ipad_01_preview_dark.png",
        "editor": "ipad_03_editor_sheet.png",
        "drawer": "ipad_02_drawer_all.png",
        # The existing iPad appearance capture shows the Design list, not a settings sheet.
        "appearance": "ipad_04_appearance_sheet.png",
        "selection": "ipad_05_selection_mode.png",
    },
}

TARGETS = {
    "android": (1080, 2340, "phone", "fastlane/metadata/android/en-US/images/phoneScreenshots", "{number}.png"),
    "iphone": (1242, 2688, "phone", "fastlane/metadata/ios/en-US/screenshots", "iPhone 11 Pro Max-{number}.png"),
    "ipad": (2048, 2732, "tablet", "fastlane/metadata/ios/en-US/screenshots", "iPad Pro 12.9-inch-{number}.png"),
}


def centered_text(draw, text, y, font, width, color, spacing=8):
    box = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="center")
    draw.multiline_text(
        ((width - (box[2] - box[0])) / 2 - box[0], y - box[1]),
        text, font=font, fill=color, spacing=spacing, align="center",
    )
    return y + box[3] - box[1]


def fit_font(text, size, width, bold=False):
    draw = ImageDraw.Draw(Image.new("RGB", (1, 1)))
    while size > 12:
        font = promo.load_font(size, bold=bold)
        box = draw.multiline_textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= width:
            return font
        size -= 1
    return promo.load_font(size, bold=bold)


def frame_capture(capture, bounds, accent):
    """Fit the complete capture with a thin neutral frame, preserving its aspect ratio."""
    bezel = max(8, round(bounds[0] * 0.012))
    screen = ImageOps.contain(capture.convert("RGB"), (bounds[0] - bezel * 2, bounds[1] - bezel * 2), Image.Resampling.LANCZOS)
    radius = round(screen.width * 0.045)
    frame = Image.new("RGBA", (screen.width + bezel * 2, screen.height + bezel * 2))
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), radius=radius + bezel,
                           fill=(18, 22, 28), outline=(*accent, 150), width=2)
    frame.paste(screen, (bezel, bezel), promo.create_rounded_mask(screen.size, radius))
    return frame


def render_panel(size, kind, panel, capture, icon):
    w, h = size
    badge, title, subtitle, _, accent1, accent2 = panel
    canvas = promo.make_background(w, h, 2.0, accent1, accent2)
    draw = ImageDraw.Draw(canvas)

    # Compact Nori brand row; feature label remains secondary to the headline.
    brand_font = promo.load_font(round(w * 0.025), bold=True)
    brand_text = f"Nori  •  {badge}"
    box = draw.textbbox((0, 0), brand_text, font=brand_font)
    icon_size = round(w * 0.041)
    gap = round(w * 0.013)
    row_width = icon_size + gap + box[2] - box[0]
    left = (w - row_width) // 2
    brand_y = round(h * 0.037)
    icon_small = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    canvas.paste(icon_small, (left, brand_y), promo.create_rounded_mask(icon_small.size, round(icon_size * 0.24)))
    draw.text((left + icon_size + gap - box[0], brand_y + (icon_size - (box[3] - box[1])) / 2 - box[1]),
              brand_text, font=brand_font, fill=(225, 241, 238))

    title_font = fit_font(title, round(w * 0.080), w * 0.90, bold=True)
    title_bottom = centered_text(draw, title, round(h * 0.083), title_font, w, (255, 255, 255), round(w * 0.008))
    subtitle_font = fit_font(subtitle, round(w * 0.032), w * 0.88)
    subtitle_bottom = centered_text(draw, subtitle, title_bottom + round(h * 0.015), subtitle_font, w, (201, 213, 224))

    stage_top = max(round(h * 0.245), subtitle_bottom + round(h * 0.025))
    stage_bottom = round(h * 0.961)
    frame = frame_capture(capture, (round(w * (0.90 if kind == "tablet" else 0.88)), stage_bottom - stage_top), accent1)
    canvas.alpha_composite(frame, ((w - frame.width) // 2, stage_top + (stage_bottom - stage_top - frame.height) // 2))
    return canvas.convert("RGB")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", action="append", choices=TARGETS, help="Select targets; default: all.")
    parser.add_argument("--output-root", type=Path, default=ROOT, help="Write the metadata tree under this directory.")
    parser.add_argument("--contact-sheet", type=Path, help="Also write a small visual index of the generated set.")
    args = parser.parse_args()
    assets = ROOT / "fastlane/videos/assets"
    captures = {kind: {key: Image.open(assets / filename).convert("RGB") for key, filename in files.items()}
                for kind, files in CAPTURES.items()}
    icon = Image.open(ROOT / "assets/images/icon.png").convert("RGBA")
    tiles = []
    for target in dict.fromkeys(args.target or TARGETS):
        w, h, kind, directory, filename = TARGETS[target]
        output_dir = args.output_root / directory
        output_dir.mkdir(parents=True, exist_ok=True)
        for number, panel in enumerate(PANELS, 1):
            if kind == "tablet" and number == 4:
                panel = ("Room to organize", "Make space\nfor ideas.", "Separate work, reading, and inspiration.", *panel[3:])
            image = render_panel((w, h), kind, panel, captures[kind][panel[3]], icon)
            output = output_dir / filename.format(number=number)
            image.save(output, optimize=True)
            print(output)
            tile = Image.new("RGB", (270, 610), "#10151d")
            thumb = ImageOps.contain(image, (260, 580), Image.Resampling.LANCZOS)
            tile.paste(thumb, ((270 - thumb.width) // 2, 25))
            ImageDraw.Draw(tile).text((8, 6), f"{target} / {number}", fill="white")
            tiles.append(tile)
    if args.contact_sheet:
        sheet = Image.new("RGB", (270 * 5, 610 * ((len(tiles) + 4) // 5)), "#10151d")
        for i, tile in enumerate(tiles):
            sheet.paste(tile, ((i % 5) * 270, (i // 5) * 610))
        args.contact_sheet.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(args.contact_sheet)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
