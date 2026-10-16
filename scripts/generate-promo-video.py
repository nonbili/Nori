#!/usr/bin/env python3
"""
Nori App Preview & Google Play Promo Video Generator (v2 — Creative Motion Showcase)

Generates 5 store-compliant promotional videos from live captures of the current Nori UI:
  1. iOS App Store — iPhone 6.5" / 6.7" Portrait (886x1920, 30fps, 20s)
  2. iOS App Store — iPhone 5.5" Portrait (1080x1920, 30fps, 20s)
  3. iOS App Store — iPad Pro Portrait (1200x1600, 30fps, 20s)
  4. Google Play Store — Landscape 16:9 Promo (1920x1080, 30fps, 20s)
  5. Google Play Store — Portrait 9:16 Promo / Shorts (1080x1920, 30fps, 20s)

Features a 5-scene dynamic choreography:
  - Scene 1 (0.0s - 4.0s): Dual-Device Parallax Hero ("Rich Visual Bookmarks")
    Dark Emerald & Light Blue phones in layered depth + zoomed glass callout card
  - Scene 2 (4.0s - 8.0s): Capture & Annotate ("Cover Art, Tags & Notes")
    Bookmark Editor sheet + floating animated #tag pills & note highlight lens
  - Scene 3 (8.0s - 12.0s): Instant Search & Tag Filtering ("Find Anything in Seconds")
    All Bookmarks drawer + magnified search & #tag filter bar callout
  - Scene 4 (12.0s - 16.0s): Live Theme Morph & 3-Device Fan ("Crafted for Your Style")
    Diagonal live theme wipe (Dark Emerald -> Light Blue -> Pure Black AMOLED Violet -> Compact Rose)
    paired with the Appearance customization sheet & glowing accent orbs
  - Scene 5 (16.0s - 20.0s): Batch Organize & Multi-Device Finale ("Your Bookmarks, Reimagined")
    Liquid Glass multi-select mode -> Hero 3-device fan finale with Nori brand badge
"""

import math
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT_DIR / "fastlane" / "videos" / "assets"
OUT_ROOT = ROOT_DIR / "fastlane" / "videos"
ICON_PATH = ROOT_DIR / "assets" / "images" / "icon.png"

FPS = 30
DURATION_SEC = 20.0
TOTAL_FRAMES = int(FPS * DURATION_SEC)  # 600 frames


# ---------------------------------------------------------------------------
# Easing & math helpers
# ---------------------------------------------------------------------------

def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def ease_out_cubic(t: float) -> float:
    t = clamp(t)
    return 1.0 - (1.0 - t) ** 3


def ease_out_expo(t: float) -> float:
    t = clamp(t)
    return 1.0 if t >= 1.0 else 1.0 - pow(2.0, -10.0 * t)


def ease_in_out_cubic(t: float) -> float:
    t = clamp(t)
    if t < 0.5:
        return 4.0 * t * t * t
    return 1.0 - ((-2.0 * t + 2.0) ** 3) / 2.0


def ease_out_back(t: float, overshoot: float = 1.35) -> float:
    t = clamp(t)
    c1 = overshoot
    c3 = c1 + 1.0
    return 1.0 + c3 * pow(t - 1.0, 3) + c1 * pow(t - 1.0, 2)


def smoothstep(edge0: float, edge1: float, x: float) -> float:
    if edge1 == edge0:
        return 0.0
    t = clamp((x - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def lerp_color(
    c1: Tuple[int, int, int], c2: Tuple[int, int, int], t: float
) -> Tuple[int, int, int]:
    t = clamp(t)
    return (
        int(round(c1[0] + (c2[0] - c1[0]) * t)),
        int(round(c1[1] + (c2[1] - c1[1]) * t)),
        int(round(c1[2] + (c2[2] - c1[2]) * t)),
    )


# ---------------------------------------------------------------------------
# Font loading
# ---------------------------------------------------------------------------

FONT_CANDIDATES_BOLD = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
]

FONT_CANDIDATES_REGULAR = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = FONT_CANDIDATES_BOLD if bold else FONT_CANDIDATES_REGULAR
    for path in candidates:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, size=size)
                try:
                    font.set_variation_by_name("Bold" if bold else "Regular")
                except Exception:
                    pass
                return font
            except Exception:
                continue
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# Framed Device & Callout Builders
# ---------------------------------------------------------------------------

def create_rounded_mask(size: Tuple[int, int], radius: int) -> Image.Image:
    w, h = size
    scale = 2
    mask_hi = Image.new("L", (w * scale, h * scale), 0)
    draw = ImageDraw.Draw(mask_hi)
    draw.rounded_rectangle(
        (0, 0, w * scale - 1, h * scale - 1),
        radius=radius * scale,
        fill=255,
    )
    return mask_hi.resize((w, h), Image.Resampling.LANCZOS)


def build_framed_device(
    screen_img: Image.Image,
    target_screen_w: int,
    target_screen_h: int,
    is_tablet: bool = False,
    accent_rgb: Tuple[int, int, int] = (16, 185, 129),
) -> Image.Image:
    """
    Wraps a screenshot inside a sleek metallic bezel with rounded screen corners,
    subtle glass edge rim, and soft ambient drop shadow.
    """
    screen = screen_img.convert("RGBA").resize(
        (target_screen_w, target_screen_h), Image.Resampling.LANCZOS
    )

    bezel = max(8, int(round(target_screen_w * (0.028 if is_tablet else 0.032))))
    corner_r = int(round(target_screen_w * (0.048 if is_tablet else 0.095)))
    outer_r = corner_r + bezel

    body_w = target_screen_w + bezel * 2
    body_h = target_screen_h + bezel * 2

    pad = int(round(max(body_w, body_h) * 0.075))
    canvas_w = body_w + pad * 2
    canvas_h = body_h + pad * 2

    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))

    # Colored ambient underglow + deep drop shadow
    shadow = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    shadow_offset_y = int(round(pad * 0.22))
    sdraw.rounded_rectangle(
        (
            pad + 2,
            pad + shadow_offset_y,
            pad + body_w - 2,
            pad + body_h + shadow_offset_y - 2,
        ),
        radius=outer_r,
        fill=(0, 0, 0, 175),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(10, int(pad * 0.36))))
    canvas = Image.alpha_composite(canvas, shadow)

    # Metallic titanium chassis
    body = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(body)
    bdraw.rounded_rectangle(
        (pad, pad, pad + body_w - 1, pad + body_h - 1),
        radius=outer_r,
        fill=(24, 26, 33, 255),
        outline=(92, 100, 118, 220),
        width=max(2, bezel // 5),
    )
    bdraw.rounded_rectangle(
        (pad + 3, pad + 3, pad + body_w - 4, pad + body_h - 4),
        radius=max(4, outer_r - 3),
        outline=(accent_rgb[0], accent_rgb[1], accent_rgb[2], 70),
        width=1,
    )
    canvas = Image.alpha_composite(canvas, body)

    # Rounded screen
    screen_mask = create_rounded_mask((target_screen_w, target_screen_h), corner_r)
    screen_With_alpha = Image.new("RGBA", (target_screen_w, target_screen_h), (0, 0, 0, 0))
    screen_With_alpha.paste(screen, (0, 0), screen_mask)

    # Subtle diagonal glass sheen
    gloss = Image.new("RGBA", (target_screen_w, target_screen_h), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(gloss)
    gdraw.polygon(
        [
            (0, 0),
            (int(target_screen_w * 0.62), 0),
            (int(target_screen_w * 0.22), target_screen_h),
            (0, target_screen_h),
        ],
        fill=(255, 255, 255, 8),
    )
    gloss_masked = Image.new("RGBA", (target_screen_w, target_screen_h), (0, 0, 0, 0))
    gloss_masked.paste(gloss, (0, 0), screen_mask)
    screen_With_alpha = Image.alpha_composite(screen_With_alpha, gloss_masked)

    canvas.alpha_composite(screen_With_alpha, dest=(pad + bezel, pad + bezel))

    # Home indicator pill at bottom
    indicator = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(indicator)
    ind_w = int(round(target_screen_w * (0.24 if is_tablet else 0.34)))
    ind_h = max(4, int(round(target_screen_h * 0.0055)))
    ind_x = pad + bezel + (target_screen_w - ind_w) // 2
    ind_y = pad + bezel + target_screen_h - int(round(target_screen_h * 0.015))
    idraw.rounded_rectangle(
        (ind_x, ind_y, ind_x + ind_w, ind_y + ind_h),
        radius=ind_h // 2,
        fill=(255, 255, 255, 115),
    )
    canvas = Image.alpha_composite(canvas, indicator)
    return canvas


def build_zoom_callout_card(
    source_img: Image.Image,
    crop_box_norm: Tuple[float, float, float, float],
    target_w: int,
    accent_rgb: Tuple[int, int, int],
    label: Optional[str] = None,
) -> Image.Image:
    """
    Crops a feature region from a retina UI screenshot (e.g. a rich bookmark card
    with cover art + note tab, or the tag filter bar, or the liquid glass toolbar)
    and wraps it in a floating glass elevation card with glowing accent border.
    """
    sw, sh = source_img.size
    x0 = int(round(crop_box_norm[0] * sw))
    y0 = int(round(crop_box_norm[1] * sh))
    x1 = int(round(crop_box_norm[2] * sw))
    y1 = int(round(crop_box_norm[3] * sh))
    cropped = source_img.crop((x0, y0, x1, y1)).convert("RGBA")

    aspect = (y1 - y0) / max(1, (x1 - x0))
    target_h = int(round(target_w * aspect))
    cropped = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)

    corner_r = max(14, int(round(min(target_w, target_h) * 0.14)))
    pad = max(18, int(round(target_w * 0.07)))
    label_h = int(round(target_w * 0.095)) if label else 0

    cw = target_w + pad * 2
    ch = target_h + pad * 2 + label_h
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))

    # Drop shadow
    shd = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shd)
    sdraw.rounded_rectangle(
        (pad, pad + label_h + 6, pad + target_w, pad + label_h + target_h + 6),
        radius=corner_r,
        fill=(0, 0, 0, 185),
    )
    shd = shd.filter(ImageFilter.GaussianBlur(radius=max(8, pad // 2)))
    card = Image.alpha_composite(card, shd)

    # Masked crop
    mask = create_rounded_mask((target_w, target_h), corner_r)
    inner = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    inner.paste(cropped, (0, 0), mask)
    card.alpha_composite(inner, dest=(pad, pad + label_h))

    # Glowing border around cropped card
    bdr = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    bdraw = ImageDraw.Draw(bdr)
    bdraw.rounded_rectangle(
        (pad - 1, pad + label_h - 1, pad + target_w + 1, pad + label_h + target_h + 1),
        radius=corner_r + 1,
        outline=(accent_rgb[0], accent_rgb[1], accent_rgb[2], 215),
        width=2,
    )

    if label:
        font = load_font(max(13, int(round(target_w * 0.043))), bold=True)
        bbox = bdraw.textbbox((0, 0), label, font=font)
        cap_box = bdraw.textbbox((0, 0), "H", font=font)
        tw = bbox[2] - bbox[0]
        cap_h = cap_box[3] - cap_box[1]
        pill_w = tw + 28
        pill_h = cap_h + 20
        px = pad + 8
        py = max(4, pad + label_h - pill_h - 6)
        bdraw.rounded_rectangle(
            (px, py, px + pill_w, py + pill_h),
            radius=pill_h // 2,
            fill=(16, 20, 28, 235),
            outline=(accent_rgb[0], accent_rgb[1], accent_rgb[2], 200),
            width=2,
        )
        tx = px + (pill_w - tw) / 2.0 - bbox[0]
        ty = py + (pill_h - cap_h) / 2.0 - cap_box[1]
        bdraw.text(
            (tx, ty),
            label,
            font=font,
            fill=(245, 250, 255, 255),
        )

    card = Image.alpha_composite(card, bdr)
    return card


def build_floating_pill(
    text: str,
    accent_rgb: Tuple[int, int, int],
    font_size: int = 22,
    filled: bool = False,
) -> Image.Image:
    font = load_font(font_size, bold=True)
    dummy = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    bbox = dummy.textbbox((0, 0), text, font=font)
    cap_box = dummy.textbbox((0, 0), "H", font=font)
    tw = bbox[2] - bbox[0]
    cap_h = cap_box[3] - cap_box[1]

    pad_x = int(round(font_size * 0.85))
    pad_y = int(round(font_size * 0.55))
    pw = tw + pad_x * 2
    ph = cap_h + pad_y * 2
    margin = 14

    img = Image.new("RGBA", (pw + margin * 2, ph + margin * 2), (0, 0, 0, 0))
    shd = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shd)
    sdraw.rounded_rectangle(
        (margin, margin + 4, margin + pw, margin + ph + 4),
        radius=ph // 2,
        fill=(0, 0, 0, 140),
    )
    shd = shd.filter(ImageFilter.GaussianBlur(radius=6))
    img = Image.alpha_composite(img, shd)

    draw = ImageDraw.Draw(img)
    bg_fill = (
        (accent_rgb[0], accent_rgb[1], accent_rgb[2], 235)
        if filled
        else (18, 22, 32, 230)
    )
    border_col = (
        (255, 255, 255, 190)
        if filled
        else (accent_rgb[0], accent_rgb[1], accent_rgb[2], 220)
    )
    draw.rounded_rectangle(
        (margin, margin, margin + pw, margin + ph),
        radius=ph // 2,
        fill=bg_fill,
        outline=border_col,
        width=2,
    )
    tx = margin + (pw - tw) / 2.0 - bbox[0]
    ty = margin + (ph - cap_h) / 2.0 - cap_box[1]
    draw.text(
        (tx, ty),
        text,
        font=font,
        fill=(255, 255, 255, 255),
    )
    return img


# ---------------------------------------------------------------------------
# Dynamic Background Generator
# ---------------------------------------------------------------------------

def make_background(
    width: int,
    height: int,
    t_global: float,
    accent1: Tuple[int, int, int],
    accent2: Tuple[int, int, int],
) -> Image.Image:
    """
    Renders a rich dark atmospheric background with drifting aurora mesh glows
    and subtle architectural dot-grid texture.
    """
    scale = 4
    sw = max(32, width // scale)
    sh = max(32, height // scale)

    y_norm = np.linspace(0.0, 1.0, sh, dtype=np.float32)[:, None]
    x_norm = np.linspace(0.0, 1.0, sw, dtype=np.float32)[None, :]

    # Deep obsidian base
    r = 7.0 + 7.0 * (1.0 - y_norm)
    g = 9.0 + 10.0 * (1.0 - y_norm)
    b = 15.0 + 16.0 * (1.0 - y_norm)

    # Drifting primary aurora orb
    cx1 = 0.25 + 0.22 * math.sin(t_global * 0.55)
    cy1 = 0.24 + 0.14 * math.cos(t_global * 0.42)
    d1_sq = (x_norm - cx1) ** 2 + ((y_norm - cy1) * (height / width)) ** 2
    glow1 = np.exp(-d1_sq / 0.16) * 0.34

    # Drifting secondary aurora orb
    cx2 = 0.76 + 0.18 * math.cos(t_global * 0.48 + 1.1)
    cy2 = 0.72 + 0.15 * math.sin(t_global * 0.38 + 0.6)
    d2_sq = (x_norm - cx2) ** 2 + ((y_norm - cy2) * (height / width)) ** 2
    glow2 = np.exp(-d2_sq / 0.20) * 0.28

    r = np.clip(r + glow1 * accent1[0] + glow2 * accent2[0], 0, 255)
    g = np.clip(g + glow1 * accent1[1] + glow2 * accent2[1], 0, 255)
    b = np.clip(b + glow1 * accent1[2] + glow2 * accent2[2], 0, 255)

    arr = np.stack([r, g, b], axis=-1).astype(np.uint8)
    bg = Image.fromarray(arr).resize(
        (width, height), Image.Resampling.BICUBIC
    )
    return bg.convert("RGBA")


# ---------------------------------------------------------------------------
# Transform & Composite Helper
# ---------------------------------------------------------------------------

def paste_transformed(
    canvas: Image.Image,
    sprite: Image.Image,
    center_xy: Tuple[float, float],
    scale: float = 1.0,
    angle_deg: float = 0.0,
    opacity: float = 1.0,
) -> None:
    if opacity <= 0.01 or scale <= 0.02:
        return

    w, h = sprite.size
    new_w = max(2, int(round(w * scale)))
    new_h = max(2, int(round(h * scale)))
    img = sprite.resize((new_w, new_h), Image.Resampling.BICUBIC)

    if abs(angle_deg) > 0.08:
        img = img.rotate(angle_deg, resample=Image.Resampling.BICUBIC, expand=True)

    if opacity < 0.995:
        r, g, b, a = img.split()
        a = a.point(lambda p: int(round(p * clamp(opacity))))
        img = Image.merge("RGBA", (r, g, b, a))

    px = int(round(center_xy[0] - img.width / 2.0))
    py = int(round(center_xy[1] - img.height / 2.0))
    canvas.alpha_composite(img, dest=(px, py))


def blend_diagonal_wipe(
    img_a: Image.Image,
    img_b: Image.Image,
    progress: float,
    accent_rgb: Tuple[int, int, int],
) -> Image.Image:
    """
    Blends two framed device images with a sleek diagonal laser-wipe transition.
    """
    p = clamp(progress)
    if p <= 0.005:
        return img_a
    if p >= 0.995:
        return img_b

    w, h = img_a.size
    # Create diagonal mask at 1/2 resolution for speed
    mw, mh = max(16, w // 2), max(16, h // 2)
    yy = np.linspace(0.0, 1.0, mh, dtype=np.float32)[:, None]
    xx = np.linspace(0.0, 1.0, mw, dtype=np.float32)[None, :]
    diag = (xx * 0.75 + yy * 0.25)
    edge = lerp(-0.12, 1.12, p)
    feather = 0.045
    alpha_norm = np.clip((edge - diag) / feather, 0.0, 1.0)
    mask = Image.fromarray((alpha_norm * 255).astype(np.uint8)).resize(
        (w, h), Image.Resampling.BILINEAR
    )

    out = Image.composite(img_b, img_a, mask)
    return out


# ---------------------------------------------------------------------------
# Scene Definitions & Copy
# ---------------------------------------------------------------------------

SCENES = [
    {
        "badge": "Visual Bookmarking",
        "title": "Rich Previews\n& Notes",
        "subtitle": "Save links with cover art, hanging notes, and liquid glass navigation.",
        "accent1": (16, 185, 129),   # Emerald
        "accent2": (59, 130, 246),   # Cobalt Blue
    },
    {
        "badge": "Capture & Annotate",
        "title": "Cover Art, Tags\n& Context",
        "subtitle": "Pick cover images or page screenshots, tag topics, and attach personal notes.",
        "accent1": (20, 184, 166),   # Teal
        "accent2": (16, 185, 129),   # Emerald
    },
    {
        "badge": "Instant Recall",
        "title": "Find Anything\nin Seconds",
        "subtitle": "Slide up the All Bookmarks drawer to filter by #tags, lists, or full-text search.",
        "accent1": (56, 189, 248),   # Sky
        "accent2": (99, 102, 241),   # Indigo
    },
    {
        "badge": "Crafted for Your Style",
        "title": "Themes, Accents\n& Pure AMOLED",
        "subtitle": "Switch live between Dark, Light, Pure Black AMOLED, Compact view, and 11 accents.",
        "accent1": (168, 85, 247),   # Violet
        "accent2": (244, 63, 94),    # Rose
    },
    {
        "badge": "Effortless Control",
        "title": "Nori — Bookmarks,\nReimagined",
        "subtitle": "Batch organize with the liquid glass toolbar and sync across all your devices.",
        "accent1": (16, 185, 129),   # Emerald
        "accent2": (139, 92, 246),   # Violet
    },
]


# ---------------------------------------------------------------------------
# Typography & HUD Overlay Renderer
# ---------------------------------------------------------------------------

def draw_scene_copy(
    canvas: Image.Image,
    scene: Dict,
    scene_t: float,
    scene_idx: int,
    is_landscape: bool,
    icon_img: Image.Image,
) -> None:
    w, h = canvas.size
    enter_p = ease_out_cubic(scene_t / 0.55)
    exit_p = 1.0 - ease_in_out_cubic((scene_t - 3.45) / 0.55) if scene_t > 3.45 else 1.0
    alpha_mult = clamp(enter_p * exit_p)
    slide_y = int(round((1.0 - enter_p) * 26 - (1.0 - exit_p) * 18))

    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    accent = scene["accent1"]

    if is_landscape:
        left_x = int(round(w * 0.065))
        top_y = int(round(h * 0.16)) + slide_y
        max_text_w = int(round(w * 0.40))

        # Brand row
        icon_sz = int(round(h * 0.068))
        icon_resized = icon_img.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        icon_mask = create_rounded_mask((icon_sz, icon_sz), int(icon_sz * 0.24))
        layer.paste(icon_resized, (left_x, top_y), icon_mask)

        brand_font = load_font(int(round(h * 0.036)), bold=True)
        bb_brand = draw.textbbox((0, 0), "Nori", font=brand_font)
        cap_brand = draw.textbbox((0, 0), "H", font=brand_font)
        cap_h_brand = cap_brand[3] - cap_brand[1]
        draw.text(
            (left_x + icon_sz + 16 - bb_brand[0], top_y + (icon_sz - cap_h_brand) / 2.0 - cap_brand[1]),
            "Nori",
            font=brand_font,
            fill=(255, 255, 255, int(245 * alpha_mult)),
        )

        # Badge pill
        badge_y = top_y + icon_sz + int(round(h * 0.045))
        badge_font = load_font(int(round(h * 0.022)), bold=True)
        badge_text = scene["badge"]
        bb = draw.textbbox((0, 0), badge_text, font=badge_font)
        cap_b = draw.textbbox((0, 0), "H", font=badge_font)
        tw_b = bb[2] - bb[0]
        cap_h_b = cap_b[3] - cap_b[1]
        bw = tw_b + 32
        bh = cap_h_b + 20
        draw.rounded_rectangle(
            (left_x, badge_y, left_x + bw, badge_y + bh),
            radius=bh // 2,
            fill=(accent[0], accent[1], accent[2], int(42 * alpha_mult)),
            outline=(accent[0], accent[1], accent[2], int(210 * alpha_mult)),
            width=2,
        )
        draw.text(
            (left_x + (bw - tw_b) / 2.0 - bb[0], badge_y + (bh - cap_h_b) / 2.0 - cap_b[1]),
            badge_text,
            font=badge_font,
            fill=(235, 252, 245, int(255 * alpha_mult)),
        )

        # Title
        title_font = load_font(int(round(h * 0.068)), bold=True)
        title_y = badge_y + bh + int(round(h * 0.028))
        draw.multiline_text(
            (left_x, title_y),
            scene["title"],
            font=title_font,
            fill=(255, 255, 255, int(255 * alpha_mult)),
            spacing=int(round(h * 0.010)),
        )
        tb = draw.multiline_textbbox(
            (left_x, title_y),
            scene["title"],
            font=title_font,
            spacing=int(round(h * 0.010)),
        )

        # Subtitle wrapped
        sub_font = load_font(int(round(h * 0.027)), bold=False)
        sub_y = tb[3] + int(round(h * 0.026))
        words = scene["subtitle"].split()
        lines: List[str] = []
        cur = ""
        for word in words:
            test = f"{cur} {word}".strip()
            wbox = draw.textbbox((0, 0), test, font=sub_font)
            if wbox[2] - wbox[0] <= max_text_w or not cur:
                cur = test
            else:
                lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        draw.multiline_text(
            (left_x, sub_y),
            "\n".join(lines),
            font=sub_font,
            fill=(186, 196, 214, int(235 * alpha_mult)),
            spacing=8,
        )

        # Scene progress dots
        dots_y = int(round(h * 0.86))
        dot_x = left_x
        for i in range(len(SCENES)):
            is_cur = i == scene_idx
            dw = 38 if is_cur else 10
            col = (
                (accent[0], accent[1], accent[2], 245)
                if is_cur
                else (255, 255, 255, 70)
            )
            draw.rounded_rectangle(
                (dot_x, dots_y, dot_x + dw, dots_y + 10),
                radius=5,
                fill=col,
            )
            dot_x += dw + 10
    else:
        # Portrait header layout
        cx = w // 2
        top_y = int(round(h * 0.042)) + slide_y

        # Brand + Badge row
        badge_font = load_font(max(16, int(round(w * 0.024))), bold=True)
        badge_text = f"Nori  •  {scene['badge']}"
        bb = draw.textbbox((0, 0), badge_text, font=badge_font)
        cap_b = draw.textbbox((0, 0), "H", font=badge_font)
        tw_badge = bb[2] - bb[0]
        cap_h_badge = cap_b[3] - cap_b[1]
        bh = cap_h_badge + 24

        icon_sz = bh - 10
        pad_left = 6
        gap = 12
        pad_right = 18
        total_pill_w = pad_left + icon_sz + gap + tw_badge + pad_right
        px = cx - total_pill_w // 2

        draw.rounded_rectangle(
            (px, top_y, px + total_pill_w, top_y + bh),
            radius=bh // 2,
            fill=(16, 20, 30, int(215 * alpha_mult)),
            outline=(accent[0], accent[1], accent[2], int(210 * alpha_mult)),
            width=2,
        )
        icon_resized = icon_img.resize((icon_sz, icon_sz), Image.Resampling.LANCZOS)
        icon_mask = create_rounded_mask((icon_sz, icon_sz), icon_sz // 2)
        layer.paste(icon_resized, (px + pad_left, top_y + (bh - icon_sz) // 2), icon_mask)

        tx_badge = px + pad_left + icon_sz + gap - bb[0]
        ty_badge = top_y + (bh - cap_h_badge) / 2.0 - cap_b[1]
        draw.text(
            (tx_badge, ty_badge),
            badge_text,
            font=badge_font,
            fill=(240, 252, 248, int(255 * alpha_mult)),
        )

        # Headline
        title_font = load_font(max(32, int(round(w * 0.060))), bold=True)
        title_single = scene["title"].replace("\n", " ")
        tb = draw.textbbox((0, 0), title_single, font=title_font)
        if (tb[2] - tb[0]) <= w * 0.90:
            title_to_draw = title_single
        else:
            title_to_draw = scene["title"]

        title_y = top_y + bh + int(round(h * 0.014))
        tb_multi = draw.multiline_textbbox(
            (0, 0), title_to_draw, font=title_font, align="center", spacing=6
        )
        tw = tb_multi[2] - tb_multi[0]
        draw.multiline_text(
            (cx - tw // 2, title_y),
            title_to_draw,
            font=title_font,
            fill=(255, 255, 255, int(255 * alpha_mult)),
            align="center",
            spacing=6,
        )

        # Subtitle
        sub_font = load_font(max(18, int(round(w * 0.028))), bold=False)
        sub_y = title_y + (tb_multi[3] - tb_multi[1]) + int(round(h * 0.010))
        max_sub_w = int(round(w * 0.84))
        words = scene["subtitle"].split()
        lines = []
        cur = ""
        for word in words:
            test = f"{cur} {word}".strip()
            wbox = draw.textbbox((0, 0), test, font=sub_font)
            if wbox[2] - wbox[0] <= max_sub_w or not cur:
                cur = test
            else:
                lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        sub_text = "\n".join(lines)
        sb = draw.multiline_textbbox((0, 0), sub_text, font=sub_font, align="center", spacing=4)
        sw = sb[2] - sb[0]
        draw.multiline_text(
            (cx - sw // 2, sub_y),
            sub_text,
            font=sub_font,
            fill=(190, 200, 218, int(235 * alpha_mult)),
            align="center",
            spacing=4,
        )

        # Progress pills at bottom
        dots_y = int(round(h * 0.962))
        total_dots_w = (len(SCENES) - 1) * 10 + 36 + (len(SCENES) - 1) * 10
        dot_x = cx - total_dots_w // 2
        for i in range(len(SCENES)):
            is_cur = i == scene_idx
            dw = 36 if is_cur else 10
            col = (
                (accent[0], accent[1], accent[2], 245)
                if is_cur
                else (255, 255, 255, 70)
            )
            draw.rounded_rectangle(
                (dot_x, dots_y, dot_x + dw, dots_y + 8),
                radius=4,
                fill=col,
            )
            dot_x += dw + 10

    canvas.alpha_composite(layer)


# ---------------------------------------------------------------------------
# Target Video Renderers
# ---------------------------------------------------------------------------

def render_video_target(
    name: str,
    width: int,
    height: int,
    device_kind: str,  # "phone" or "tablet"
    out_path: Path,
    raw_screens: Dict[str, Image.Image],
    icon_img: Image.Image,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    is_landscape = width > height
    is_tablet = device_kind == "tablet"

    # Compute ideal base screen size for the hero device
    if is_landscape:
        base_screen_h = int(round(height * 0.76))
        base_screen_w = int(round(base_screen_h * (393.0 / 852.0)))
    elif is_tablet:
        base_screen_h = int(round(height * 0.68))
        base_screen_w = int(round(base_screen_h * (682.0 / 910.0)))
    else:
        base_screen_h = int(round(height * 0.68))
        base_screen_w = int(round(base_screen_h * (393.0 / 852.0)))
        if base_screen_w > int(width * 0.78):
            base_screen_w = int(round(width * 0.78))
            base_screen_h = int(round(base_screen_w * (852.0 / 393.0)))

    print(f"[{name}] Pre-building framed devices & callout cards ({width}x{height})...")

    # Pre-build framed devices
    if is_tablet:
        dev_dark = build_framed_device(
            raw_screens["ipad_dark"], base_screen_w, base_screen_h, True, (16, 185, 129)
        )
        dev_light = build_framed_device(
            raw_screens["mobile_light"],
            int(base_screen_w * 0.62),
            int(base_screen_w * 0.62 * (852.0 / 393.0)),
            False,
            (59, 130, 246),
        )
        dev_drawer = build_framed_device(
            raw_screens["ipad_drawer"], base_screen_w, base_screen_h, True, (56, 189, 248)
        )
        dev_editor = build_framed_device(
            raw_screens["ipad_editor"], base_screen_w, base_screen_h, True, (20, 184, 166)
        )
        dev_appearance = build_framed_device(
            raw_screens["ipad_appearance"], base_screen_w, base_screen_h, True, (168, 85, 247)
        )
        dev_selection = build_framed_device(
            raw_screens["ipad_selection"], base_screen_w, base_screen_h, True, (16, 185, 129)
        )
        dev_amoled = build_framed_device(
            raw_screens["mobile_amoled"],
            int(base_screen_w * 0.62),
            int(base_screen_w * 0.62 * (852.0 / 393.0)),
            False,
            (168, 85, 247),
        )
        dev_compact = build_framed_device(
            raw_screens["mobile_compact"],
            int(base_screen_w * 0.62),
            int(base_screen_w * 0.62 * (852.0 / 393.0)),
            False,
            (244, 63, 94),
        )
    else:
        dev_dark = build_framed_device(
            raw_screens["mobile_dark"], base_screen_w, base_screen_h, False, (16, 185, 129)
        )
        dev_light = build_framed_device(
            raw_screens["mobile_light"], base_screen_w, base_screen_h, False, (59, 130, 246)
        )
        dev_drawer = build_framed_device(
            raw_screens["mobile_drawer"], base_screen_w, base_screen_h, False, (56, 189, 248)
        )
        dev_editor = build_framed_device(
            raw_screens["mobile_editor"], base_screen_w, base_screen_h, False, (20, 184, 166)
        )
        dev_appearance = build_framed_device(
            raw_screens["mobile_appearance"], base_screen_w, base_screen_h, False, (168, 85, 247)
        )
        dev_selection = build_framed_device(
            raw_screens["mobile_selection"], base_screen_w, base_screen_h, False, (16, 185, 129)
        )
        dev_amoled = build_framed_device(
            raw_screens["mobile_amoled"], base_screen_w, base_screen_h, False, (168, 85, 247)
        )
        dev_compact = build_framed_device(
            raw_screens["mobile_compact"], base_screen_w, base_screen_h, False, (244, 63, 94)
        )

    # Pre-build floating zoom callout cards from mobile retina captures
    callout_w = int(round(base_screen_w * 0.86))
    # 1. Claude rich card + cover art + hanging note tab
    callout_claude_card = build_zoom_callout_card(
        raw_screens["mobile_dark"],
        (0.04, 0.088, 0.96, 0.318),
        callout_w,
        (16, 185, 129),
        label="Cover Art + Hanging Note",
    )
    # 2. Editor preview image toggle + preview card
    callout_editor_preview = build_zoom_callout_card(
        raw_screens["mobile_editor"],
        (0.07, 0.285, 0.92, 0.608),
        callout_w,
        (20, 184, 166),
        label="Cover Image or Screenshot",
    )
    # 3. Drawer search + #tags filter bar
    callout_drawer_tags = build_zoom_callout_card(
        raw_screens["mobile_drawer"],
        (0.04, 0.022, 0.96, 0.235),
        callout_w,
        (56, 189, 248),
        label="Instant Search & #Tag Filters",
    )
    # 4. Appearance accent swatch palette
    callout_accents = build_zoom_callout_card(
        raw_screens["mobile_appearance"],
        (0.06, 0.468, 0.94, 0.678),
        callout_w,
        (168, 85, 247),
        label="11 Accent Colors & Custom Picker",
    )
    # 5. Liquid glass selection toolbar at bottom
    callout_toolbar = build_zoom_callout_card(
        raw_screens["mobile_selection"],
        (0.03, 0.908, 0.97, 0.992),
        callout_w,
        (16, 185, 129),
        label="Liquid Glass Batch Actions",
    )

    # Floating tag pills for Scene 2
    pill_font_sz = max(16, int(round(base_screen_w * 0.045)))
    pill_ai = build_floating_pill("# design", (16, 185, 129), pill_font_sz, filled=True)
    pill_agents = build_floating_pill("# tokens", (20, 184, 166), pill_font_sz, filled=False)
    pill_coding = build_floating_pill("# ui", (59, 130, 246), pill_font_sz, filled=False)

    # Center coordinates for the device stage
    if is_landscape:
        stage_cx = width * 0.71
        stage_cy = height * 0.53
    else:
        stage_cx = width * 0.50
        stage_cy = height * 0.585

    # Launch ffmpeg pipe
    ffmpeg_cmd = [
        "/opt/homebrew/bin/ffmpeg",
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-s",
        f"{width}x{height}",
        "-pix_fmt",
        "rgba",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-level",
        "4.1",
        "-r",
        str(FPS),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-shortest",
        "-movflags",
        "+faststart",
        str(out_path),
    ]

    proc = subprocess.Popen(
        ffmpeg_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )

    assert proc.stdin is not None

    for frame_idx in range(TOTAL_FRAMES):
        t = frame_idx / float(FPS)  # 0.0 .. 20.0
        scene_idx = min(4, int(t // 4.0))
        scene_t = t - scene_idx * 4.0  # 0.0 .. 4.0 within current scene
        scene = SCENES[scene_idx]

        # Smoothly interpolate background colors across scene boundaries
        next_idx = min(4, scene_idx + 1)
        blend_bg = smoothstep(3.3, 4.0, scene_t)
        ac1 = lerp_color(scene["accent1"], SCENES[next_idx]["accent1"], blend_bg)
        ac2 = lerp_color(scene["accent2"], SCENES[next_idx]["accent2"], blend_bg)

        canvas = make_background(width, height, t, ac1, ac2)

        # Gentle continuous float
        float_y = math.sin(t * 2.2) * (height * 0.006)
        float_rot = math.cos(t * 1.6) * 0.65

        # -------------------------------------------------------------------
        # SCENE 0 (0.0s - 4.0s): Dual-Device Parallax Hero + Card Callout
        # -------------------------------------------------------------------
        if scene_idx == 0:
            enter = ease_out_back(scene_t / 0.85, overshoot=1.18)
            exit_p = smoothstep(3.45, 4.0, scene_t)

            # Secondary Light Mode phone fanned behind to the right
            sec_x = stage_cx + base_screen_w * lerp(0.45, 0.28, enter) + exit_p * 80
            sec_y = stage_cy + float_y * 0.7 + lerp(120, -10, enter)
            paste_transformed(
                canvas,
                dev_light,
                (sec_x, sec_y),
                scale=lerp(0.65, 0.84, enter) * (1.0 - exit_p * 0.15),
                angle_deg=lerp(16.0, 8.5, enter) + float_rot * 0.5,
                opacity=clamp(enter * (1.0 - exit_p)),
            )

            # Primary Dark Emerald device in foreground left
            pri_x = stage_cx - base_screen_w * lerp(0.32, 0.14, enter) - exit_p * 60
            pri_y = stage_cy + float_y + lerp(140, 12, enter)
            paste_transformed(
                canvas,
                dev_dark,
                (pri_x, pri_y),
                scale=lerp(0.75, 0.94, enter) * (1.0 - exit_p * 0.12),
                angle_deg=lerp(-12.0, -4.5, enter) + float_rot,
                opacity=clamp(enter * (1.0 - exit_p)),
            )

            # Pop-out zoomed Claude bookmark card with hanging note tab
            card_enter = ease_out_back((scene_t - 0.55) / 0.65, overshoot=1.25)
            if card_enter > 0.01:
                card_x = stage_cx + base_screen_w * 0.08
                card_y = stage_cy + base_screen_h * 0.25 + math.sin(t * 3.0) * 6
                paste_transformed(
                    canvas,
                    callout_claude_card,
                    (card_x, card_y),
                    scale=lerp(0.5, 1.0, card_enter) * (1.0 - exit_p * 0.25),
                    angle_deg=lerp(-6.0, -1.5, card_enter),
                    opacity=clamp(card_enter * (1.0 - exit_p)),
                )

        # -------------------------------------------------------------------
        # SCENE 1 (4.0s - 8.0s): Capture & Annotate (Editor Sheet + Floating Tags)
        # -------------------------------------------------------------------
        elif scene_idx == 1:
            enter = ease_out_back(scene_t / 0.75, overshoot=1.15)
            exit_p = smoothstep(3.45, 4.0, scene_t)

            # Background faded home screen
            paste_transformed(
                canvas,
                dev_dark,
                (stage_cx - base_screen_w * 0.26, stage_cy + 16),
                scale=0.78,
                angle_deg=-9.0,
                opacity=0.38 * clamp(enter * (1.0 - exit_p)),
            )

            # Foreground Bookmark Editor device
            ed_x = stage_cx + base_screen_w * 0.04
            ed_y = stage_cy + float_y + lerp(130, 8, enter) - exit_p * 90
            paste_transformed(
                canvas,
                dev_editor,
                (ed_x, ed_y),
                scale=lerp(0.80, 0.96, enter),
                angle_deg=lerp(8.0, 2.0, enter) + float_rot,
                opacity=clamp(enter * (1.0 - exit_p)),
            )

            # Zoomed Preview Image selector callout
            c_enter = ease_out_back((scene_t - 0.50) / 0.65, overshoot=1.2)
            if c_enter > 0.01:
                paste_transformed(
                    canvas,
                    callout_editor_preview,
                    (stage_cx - base_screen_w * 0.08, stage_cy + base_screen_h * 0.18 + float_y * 1.2),
                    scale=lerp(0.6, 0.96, c_enter) * (1.0 - exit_p * 0.2),
                    angle_deg=-2.5,
                    opacity=clamp(c_enter * (1.0 - exit_p)),
                )

            # Floating animated tag pills orbiting the device
            pills = [
                (pill_ai, -0.44, -0.26, 0.35, -7.0),
                (pill_agents, 0.44, -0.18, 0.50, 6.5),
                (pill_coding, 0.42, 0.04, 0.65, -4.5),
            ]
            for pill_img, ox, oy, delay, rot in pills:
                p_in = ease_out_back((scene_t - delay) / 0.55, overshoot=1.35)
                if p_in > 0.01:
                    bob = math.sin(t * 3.4 + delay * 4.0) * 7.0
                    px = stage_cx + base_screen_w * ox
                    py = stage_cy + base_screen_h * oy + bob
                    paste_transformed(
                        canvas,
                        pill_img,
                        (px, py),
                        scale=lerp(0.4, 1.0, p_in) * (1.0 - exit_p * 0.3),
                        angle_deg=rot,
                        opacity=clamp(p_in * (1.0 - exit_p)),
                    )

        # -------------------------------------------------------------------
        # SCENE 2 (8.0s - 12.0s): Instant Search & Tag Filtering (All Bookmarks Drawer)
        # -------------------------------------------------------------------
        elif scene_idx == 2:
            enter = ease_out_expo(scene_t / 0.70)
            exit_p = smoothstep(3.45, 4.0, scene_t)

            # Secondary Compact Rose view phone in background right
            paste_transformed(
                canvas,
                dev_compact,
                (stage_cx + base_screen_w * 0.30, stage_cy + 14),
                scale=0.80,
                angle_deg=9.5,
                opacity=0.52 * clamp(enter * (1.0 - exit_p)),
            )

            # Primary All Bookmarks Drawer sliding up smoothly
            dr_x = stage_cx - base_screen_w * 0.06
            dr_y = stage_cy + float_y + lerp(160, 6, enter)
            paste_transformed(
                canvas,
                dev_drawer,
                (dr_x, dr_y),
                scale=lerp(0.84, 0.96, enter) * (1.0 - exit_p * 0.12),
                angle_deg=lerp(-7.0, -2.0, enter) + float_rot,
                opacity=clamp(enter * (1.0 - exit_p)),
            )

            # Magnified Search + #Tag Filter bar lens floating across top-front of phone
            lens_in = ease_out_back((scene_t - 0.45) / 0.65, overshoot=1.22)
            if lens_in > 0.01:
                lx = stage_cx + base_screen_w * 0.05
                ly = stage_cy - base_screen_h * 0.18 + math.cos(t * 2.8) * 6
                paste_transformed(
                    canvas,
                    callout_drawer_tags,
                    (lx, ly),
                    scale=lerp(0.55, 1.04, lens_in) * (1.0 - exit_p * 0.2),
                    angle_deg=1.5,
                    opacity=clamp(lens_in * (1.0 - exit_p)),
                )

        # -------------------------------------------------------------------
        # SCENE 3 (12.0s - 16.0s): Live Theme Morph & Appearance Customization
        # -------------------------------------------------------------------
        elif scene_idx == 3:
            enter = ease_out_back(scene_t / 0.75, overshoot=1.15)
            exit_p = smoothstep(3.45, 4.0, scene_t)

            # Left background phone: Appearance Customization Sheet
            app_x = stage_cx - base_screen_w * lerp(0.42, 0.25, enter)
            app_y = stage_cy + float_y * 0.8 + 14
            paste_transformed(
                canvas,
                dev_appearance,
                (app_x, app_y),
                scale=lerp(0.70, 0.84, enter) * (1.0 - exit_p * 0.15),
                angle_deg=-8.5 + float_rot * 0.5,
                opacity=clamp(enter * 0.92 * (1.0 - exit_p)),
            )

            # Right foreground phone: Live diagonal theme-morphing device!
            # Morphs: Dark Emerald -> Light Blue (0.6s..1.4s) -> Pure Black AMOLED Violet (1.7s..2.5s) -> Compact Rose (2.7s..3.3s)
            if not is_tablet:
                w1 = smoothstep(0.55, 1.25, scene_t)
                w2 = smoothstep(1.55, 2.25, scene_t)
                w3 = smoothstep(2.55, 3.20, scene_t)
                morphed = blend_diagonal_wipe(dev_dark, dev_light, w1, (59, 130, 246))
                morphed = blend_diagonal_wipe(morphed, dev_amoled, w2, (168, 85, 247))
                morphed = blend_diagonal_wipe(morphed, dev_compact, w3, (244, 63, 94))
            else:
                morphed = dev_appearance

            morph_x = stage_cx + base_screen_w * lerp(0.32, 0.16, enter)
            morph_y = stage_cy + float_y + 4
            paste_transformed(
                canvas,
                morphed,
                (morph_x, morph_y),
                scale=lerp(0.78, 0.94, enter) * (1.0 - exit_p * 0.12),
                angle_deg=4.5 + float_rot,
                opacity=clamp(enter * (1.0 - exit_p)),
            )

            # Floating 11 Accent Color Swatches callout card at bottom
            sw_in = ease_out_back((scene_t - 0.50) / 0.65, overshoot=1.22)
            if sw_in > 0.01:
                paste_transformed(
                    canvas,
                    callout_accents,
                    (stage_cx - base_screen_w * 0.04, stage_cy + base_screen_h * 0.27 + float_y),
                    scale=lerp(0.55, 0.98, sw_in) * (1.0 - exit_p * 0.2),
                    angle_deg=-1.8,
                    opacity=clamp(sw_in * (1.0 - exit_p)),
                )

        # -------------------------------------------------------------------
        # SCENE 4 (16.0s - 20.0s): Batch Selection Mode & 3-Device Hero Finale
        # -------------------------------------------------------------------
        else:
            enter = ease_out_back(scene_t / 0.75, overshoot=1.16)
            finale_morph = smoothstep(1.85, 2.65, scene_t)

            # Left wing phone (AMOLED Violet) fans out during finale
            left_wing_x = stage_cx - base_screen_w * lerp(0.12, 0.34, finale_morph)
            left_wing_y = stage_cy + 22 + float_y * 0.7
            paste_transformed(
                canvas,
                dev_amoled,
                (left_wing_x, left_wing_y),
                scale=lerp(0.70, 0.80, finale_morph),
                angle_deg=lerp(-4.0, -12.5, finale_morph),
                opacity=clamp(enter * lerp(0.35, 0.90, finale_morph)),
            )

            # Right wing phone (Light Blue) fans out during finale
            right_wing_x = stage_cx + base_screen_w * lerp(0.12, 0.34, finale_morph)
            right_wing_y = stage_cy + 22 + float_y * 0.7
            paste_transformed(
                canvas,
                dev_light,
                (right_wing_x, right_wing_y),
                scale=lerp(0.70, 0.80, finale_morph),
                angle_deg=lerp(4.0, 12.5, finale_morph),
                opacity=clamp(enter * lerp(0.35, 0.90, finale_morph)),
            )

            # Center hero phone transitions from Multi-Select Edit Mode -> Rich Dark Home for finale
            center_dev = (
                blend_diagonal_wipe(dev_selection, dev_dark, finale_morph, (16, 185, 129))
                if not is_tablet
                else dev_selection
            )
            paste_transformed(
                canvas,
                center_dev,
                (stage_cx - base_screen_w * lerp(0.04, 0.0, finale_morph), stage_cy + float_y),
                scale=lerp(0.82, 0.95, enter),
                angle_deg=lerp(2.5, 0.0, finale_morph) + float_rot * 0.5,
                opacity=clamp(enter),
            )

            # Liquid Glass Batch Toolbar callout card (visible in first half of Scene 5)
            tb_in = ease_out_back((scene_t - 0.35) / 0.55, overshoot=1.25)
            tb_out = 1.0 - smoothstep(1.95, 2.55, scene_t)
            if tb_in * tb_out > 0.01:
                tb_x = stage_cx + base_screen_w * lerp(0.14, 0.04, tb_in)
                tb_y = stage_cy + base_screen_h * lerp(0.45, 0.412, tb_in) + float_y * 1.15
                paste_transformed(
                    canvas,
                    callout_toolbar,
                    (tb_x, tb_y),
                    scale=lerp(0.70, 1.18, tb_in) * (0.85 + 0.15 * tb_out),
                    angle_deg=lerp(-9.5, -3.8, tb_in),
                    opacity=clamp(tb_in * tb_out),
                )

        # Draw headline, badge, and progress bar
        draw_scene_copy(canvas, scene, scene_t, scene_idx, is_landscape, icon_img)

        proc.stdin.write(canvas.tobytes())

    proc.stdin.close()
    stderr_bytes = proc.stderr.read() if proc.stderr else b""
    ret = proc.wait()
    if ret != 0:
        raise RuntimeError(
            f"ffmpeg failed for {name} (exit {ret}):\n{stderr_bytes.decode('utf-8', errors='replace')}"
        )
    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"✓ Rendered {name} -> {out_path.relative_to(ROOT_DIR)} ({size_mb:.2f} MB)")


def main() -> int:
    required_files = {
        "mobile_dark": ASSETS_DIR / "mobile_01_preview_dark.png",
        "mobile_light": ASSETS_DIR / "mobile_02_preview_light.png",
        "mobile_drawer": ASSETS_DIR / "mobile_03_drawer_all.png",
        "mobile_editor": ASSETS_DIR / "mobile_04_editor_sheet.png",
        "mobile_selection": ASSETS_DIR / "mobile_05_selection_mode.png",
        "mobile_appearance": ASSETS_DIR / "mobile_07_appearance_sheet.png",
        "mobile_amoled": ASSETS_DIR / "mobile_08_amoled_violet.png",
        "mobile_compact": ASSETS_DIR / "mobile_09_compact_rose.png",
        "ipad_dark": ASSETS_DIR / "ipad_01_preview_dark.png",
        "ipad_drawer": ASSETS_DIR / "ipad_02_drawer_all.png",
        "ipad_editor": ASSETS_DIR / "ipad_03_editor_sheet.png",
        "ipad_appearance": ASSETS_DIR / "ipad_04_appearance_sheet.png",
        "ipad_selection": ASSETS_DIR / "ipad_05_selection_mode.png",
    }

    missing = [str(p) for p in required_files.values() if not p.exists()]
    if missing:
        print("Missing UI capture assets:", missing, file=sys.stderr)
        return 1

    raw_screens = {k: Image.open(p).convert("RGBA") for k, p in required_files.items()}
    icon_img = Image.open(ICON_PATH).convert("RGBA")

    targets = [
        (
            "iOS App Preview — iPhone 6.5\" (886x1920)",
            886,
            1920,
            "phone",
            OUT_ROOT / "ios" / "en-US" / "app-preview-iphone-65-886x1920.mp4",
        ),
        (
            "iOS App Preview — iPhone 5.5\" (1080x1920)",
            1080,
            1920,
            "phone",
            OUT_ROOT / "ios" / "en-US" / "app-preview-iphone-55-1080x1920.mp4",
        ),
        (
            "iOS App Preview — iPad Pro (1200x1600)",
            1200,
            1600,
            "tablet",
            OUT_ROOT / "ios" / "en-US" / "app-preview-ipad-1200x1600.mp4",
        ),
        (
            "Google Play Promo — Landscape 16:9 (1920x1080)",
            1920,
            1080,
            "phone",
            OUT_ROOT / "android" / "en-US" / "promo-landscape-1920x1080.mp4",
        ),
    ]

    for name, w, h, kind, path in targets:
        render_video_target(name, w, h, kind, path, raw_screens, icon_img)

    # Copy 1080x1920 portrait video to Android portrait target as well
    ios_1080 = OUT_ROOT / "ios" / "en-US" / "app-preview-iphone-55-1080x1920.mp4"
    android_portrait = OUT_ROOT / "android" / "en-US" / "promo-portrait-1080x1920.mp4"
    android_portrait.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ios_1080, android_portrait)
    print(f"✓ Copied {android_portrait.relative_to(ROOT_DIR)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
