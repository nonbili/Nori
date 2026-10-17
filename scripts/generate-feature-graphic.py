#!/usr/bin/env python3
"""Generate the Google Play feature graphic (1024x500 RGB PNG) using real Nori assets and Headless Chrome."""

import argparse
import base64
import io
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "fastlane/metadata/android/en-US/images/featureGraphic.png"

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    shutil.which("google-chrome") or "",
    shutil.which("chromium") or "",
]


def find_chrome() -> str:
    env_chrome = os.environ.get("CHROME_BIN")
    if env_chrome and Path(env_chrome).exists():
        return env_chrome
    for candidate in CHROME_CANDIDATES:
        if candidate and Path(candidate).exists():
            return candidate
    raise RuntimeError("Could not find Google Chrome or Chromium for rendering.")


def img_to_data_url(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def extract_assets() -> dict:
    assets_dir = ROOT / "fastlane/videos/assets"
    dark = Image.open(assets_dir / "mobile_01_preview_dark.png").convert("RGBA")
    light = Image.open(assets_dir / "mobile_02_preview_light.png").convert("RGBA")
    drawer = Image.open(assets_dir / "mobile_03_drawer_all.png").convert("RGBA")
    icon_raw = Image.open(ROOT / "assets/images/icon.png").convert("RGBA")

    # Tightly frame the official Nori ribbon N icon so it fills its squircle cleanly
    iw, ih = icon_raw.size
    m = int(round(iw * 0.115))
    icon_cropped = icon_raw.crop((m, m, iw - m, ih - m))

    return {
        "icon": img_to_data_url(icon_cropped),
        # Dark capture Card 1: Zed
        "zed_fav": img_to_data_url(dark.crop((123, 297, 177, 351))),
        "zed_thumb": img_to_data_url(dark.crop((696, 348, 1110, 564))),
        # Dark capture Card 2: Astro
        "astro_fav": img_to_data_url(dark.crop((123, 897, 177, 951))),
        "astro_thumb": img_to_data_url(dark.crop((696, 948, 1110, 1164))),
        # Drawer capture Card 1: Mechanical Watch
        "watch_fav": img_to_data_url(drawer.crop((123, 693, 177, 747))),
        "watch_thumb": img_to_data_url(drawer.crop((696, 744, 1110, 960))),
        # Light capture Card 1 & 2: Linear & Figma
        "linear_fav": img_to_data_url(light.crop((123, 297, 177, 351))),
        "linear_thumb": img_to_data_url(light.crop((696, 348, 1110, 564))),
        "figma_fav": img_to_data_url(light.crop((123, 897, 177, 951))),
        "figma_thumb": img_to_data_url(light.crop((696, 948, 1110, 1164))),
    }


def build_html(assets: dict) -> str:
    sell_svg_dark = """<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.88;flex-shrink:0"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"/></svg>"""
    note_svg_dark = """<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.92;flex-shrink:0"><path d="M3 10h11v2H3v-2zm0-2h11V6H3v2zm0 8h7v-2H3v2zm15.01-3.13l.71-.71c.39-.39 1.02-.39 1.41 0l.71.71c.39.39.39 1.02 0 1.41l-.71.71-2.12-2.12zm-.71.71l-5.3 5.3V21h2.12l5.3-5.3-2.12-2.12z"/></svg>"""
    list_svg = """<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>"""
    search_svg = """<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>"""

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }}
  html, body {{
    width: 1024px;
    height: 500px;
    overflow: hidden;
    background: #050a14;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
    color: #ffffff;
  }}
  .canvas {{
    position: relative;
    width: 1024px;
    height: 500px;
    overflow: hidden;
    background:
      radial-gradient(640px 440px at 74% 50%, rgba(16, 185, 129, 0.30), transparent 70%),
      radial-gradient(540px 400px at 51% 14%, rgba(14, 165, 233, 0.36), transparent 68%),
      radial-gradient(620px 480px at 42% 92%, rgba(37, 99, 235, 0.42), transparent 72%),
      linear-gradient(112deg, #040915 0%, #07142c 38%, #0c244a 70%, #09223c 100%);
  }}

  /* Subtle architectural dot matrix on left/midground */
  .dot-grid {{
    position: absolute;
    inset: 0;
    background-image: radial-gradient(rgba(148, 210, 255, 0.16) 1px, transparent 1px);
    background-size: 22px 22px;
    mask-image: linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 44%, transparent 68%);
    -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 44%, transparent 68%);
    pointer-events: none;
  }}

  /* Flowing Nori Silk Ribbons SVG backdrop */
  .ribbons-svg {{
    position: absolute;
    inset: 0;
    width: 1024px;
    height: 500px;
    pointer-events: none;
  }}

  /* Left editorial column */
  .left-col {{
    position: relative;
    z-index: 10;
    width: 454px;
    height: 500px;
    padding: 46px 0 44px 48px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }}

  .brand-row {{
    display: flex;
    align-items: center;
    gap: 14px;
  }}
  .brand-icon-wrap {{
    width: 56px;
    height: 56px;
    border-radius: 15px;
    background: #ffffff;
    padding: 3px;
    box-shadow:
      0 10px 26px rgba(2, 8, 23, 0.68),
      0 0 0 1.5px rgba(125, 211, 252, 0.72),
      0 0 22px rgba(14, 165, 233, 0.40);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }}
  .brand-icon-wrap img {{
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 12px;
  }}
  .brand-name {{
    font-size: 40px;
    font-weight: 800;
    letter-spacing: -0.032em;
    color: #ffffff;
    line-height: 1;
    filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.45));
  }}
  .brand-badge {{
    margin-left: 2px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5.5px 12px;
    border-radius: 999px;
    background: rgba(12, 28, 54, 0.82);
    border: 1px solid rgba(56, 189, 248, 0.48);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 4px 12px rgba(0, 0, 0, 0.3);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #e0f2fe;
  }}
  .brand-badge-dot {{
    width: 6.5px;
    height: 6.5px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
  }}

  .hero-copy {{
    margin-top: 2px;
  }}
  .headline {{
    font-size: 64px;
    font-weight: 800;
    line-height: 1.02;
    letter-spacing: -0.04em;
    color: #ffffff;
    filter: drop-shadow(0 8px 24px rgba(2, 6, 18, 0.65));
  }}
  .headline-accent {{
    display: block;
    padding-bottom: 0.16em;
    margin-bottom: -0.16em;
    background: linear-gradient(92deg, #ffffff 0%, #7dd3fc 48%, #34d399 98%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }}
  .subheadline {{
    margin-top: 15px;
    font-size: 17px;
    font-weight: 500;
    line-height: 1.44;
    letter-spacing: -0.01em;
    color: #cbd5e1;
    max-width: 386px;
    text-shadow: 0 2px 10px rgba(2, 6, 18, 0.6);
  }}
  .subheadline strong {{
    color: #ffffff;
    font-weight: 650;
  }}

  /* Single-row feature pills at bottom left */
  .feature-pills {{
    display: flex;
    flex-wrap: nowrap;
    gap: 7px;
    align-items: center;
  }}
  .fpill {{
    display: inline-flex;
    align-items: center;
    gap: 5.5px;
    padding: 6.5px 11.5px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 650;
    letter-spacing: -0.01em;
    white-space: nowrap;
    background: rgba(9, 20, 40, 0.88);
    border: 1px solid rgba(125, 211, 252, 0.28);
    color: #f1f5f9;
    box-shadow: 0 4px 12px rgba(2, 6, 18, 0.5);
  }}
  .fpill-active {{
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border-color: rgba(167, 243, 208, 0.65);
    color: #ffffff;
    box-shadow: 0 4px 16px rgba(16, 185, 129, 0.36);
  }}
  .swatch-dots {{
    display: inline-flex;
    align-items: center;
    gap: 3.5px;
  }}
  .sdot {{
    width: 7.5px;
    height: 7.5px;
    border-radius: 50%;
  }}

  /* Right Stage: Multi-Device / Multi-Theme Authentic Nori UI */
  .stage {{
    position: absolute;
    top: 0;
    right: 0;
    width: 556px;
    height: 500px;
    z-index: 5;
  }}

  /* Back-right peeking Light Mode window (shows theme versatility) */
  .ui-window-light {{
    position: absolute;
    top: 34px;
    left: 194px;
    width: 344px;
    height: 488px;
    background: #f3f3ee;
    border-radius: 26px;
    border: 2px solid rgba(147, 197, 253, 0.92);
    box-shadow:
      0 24px 60px rgba(2, 8, 24, 0.75),
      0 0 0 5px rgba(255, 255, 255, 0.14);
    padding: 13px 13px 20px 13px;
    transform: rotate(3.8deg);
    transform-origin: center center;
    opacity: 0.96;
  }}
  .light-chips {{
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    margin-bottom: 12px;
  }}
  .lchip {{
    padding: 5px 11px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    background: #ffffff;
    color: #57534e;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }}
  .lchip.active {{
    background: #2563eb;
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
  }}
  .ldrawer-btn {{
    width: 25px;
    height: 25px;
    border-radius: 50%;
    background: #e5e5e0;
    color: #44403c;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  .lcard-group {{
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
  }}
  .ltab-top {{
    align-self: flex-end;
    margin-right: 10px;
    background: #e5e5e0;
    color: #44403c;
    font-size: 9.5px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 8px 8px 0 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }}
  .lcard {{
    background: #ffffff;
    border-radius: 14px;
    padding: 9px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 2px 6px rgba(20, 24, 40, 0.08);
  }}
  .lcard-body {{
    flex: 1;
    min-width: 0;
  }}
  .ldomain {{
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: #78716c;
    margin-bottom: 3px;
  }}
  .ldomain img {{
    width: 14px;
    height: 14px;
    border-radius: 3px;
  }}
  .ltitle {{
    font-size: 11.5px;
    font-weight: 650;
    color: #1c1917;
    line-height: 1.25;
    margin-bottom: 3px;
  }}
  .ldesc {{
    font-size: 9.5px;
    color: #78716c;
    line-height: 1.3;
  }}
  .lthumb {{
    width: 106px;
    height: 56px;
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid rgba(0,0,0,0.06);
  }}
  .ltab-note {{
    align-self: flex-end;
    margin-right: 10px;
    background: #dbeafe;
    color: #1e40af;
    font-size: 9px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 0 0 8px 8px;
    display: inline-flex;
    align-items: center;
    gap: 3.5px;
  }}

  /* Foreground Hero Dark Window (0deg rotation for razor-sharp subpixel rendering) */
  .ui-window-dark {{
    position: absolute;
    top: 18px;
    left: 6px;
    width: 440px;
    height: 505px;
    background: #0d0c0b;
    border-radius: 28px;
    border: 1.5px solid rgba(56, 189, 248, 0.62);
    box-shadow:
      -18px 24px 64px rgba(1, 5, 16, 0.88),
      0 0 0 5px rgba(15, 23, 42, 0.92),
      0 0 42px rgba(16, 185, 129, 0.24);
    padding: 15px 16px 24px 16px;
    display: flex;
    flex-direction: column;
  }}

  /* Top list chips + search pill */
  .dark-header {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 11px;
  }}
  .dark-chips {{
    display: flex;
    align-items: center;
    gap: 7px;
  }}
  .dchip {{
    padding: 6px 13px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    background: #1c1917;
    color: #a8a29e;
  }}
  .dchip.active {{
    background: #059669;
    color: #ffffff;
    box-shadow: 0 2px 10px rgba(16, 185, 129, 0.35);
  }}
  .dark-actions {{
    display: flex;
    align-items: center;
    gap: 6px;
  }}
  .search-pill {{
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: 999px;
    background: #1c1917;
    border: 1px solid #292524;
    color: #a8a29e;
    font-size: 10.5px;
    font-weight: 500;
  }}
  .drawer-btn {{
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #1c1917;
    color: #e7e5e4;
    display: flex;
    align-items: center;
    justify-content: center;
  }}

  /* Authentic 3-part Nori Bookmark Card (Tag Tab top-right + Card + Note Tab bottom-left) */
  .dcard-group {{
    display: flex;
    flex-direction: column;
    margin-bottom: 10px;
  }}
  .dtab-top {{
    align-self: flex-end;
    margin-right: 14px;
    background: #262320;
    color: #d6d3d1;
    font-size: 10.5px;
    font-weight: 550;
    padding: 3.5px 10px;
    border-radius: 9px 9px 0 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-bottom: none;
  }}
  .dcard {{
    background: #1c1917;
    border-radius: 16px;
    padding: 11px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
  }}
  .dcard-body {{
    flex: 1;
    min-width: 0;
  }}
  .ddomain {{
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #a8a29e;
    margin-bottom: 4px;
  }}
  .ddomain img {{
    width: 16px;
    height: 16px;
    border-radius: 4px;
  }}
  .dtitle {{
    font-size: 13.5px;
    font-weight: 650;
    color: #f5f5f4;
    line-height: 1.24;
    margin-bottom: 4px;
    letter-spacing: -0.01em;
  }}
  .ddesc {{
    font-size: 11px;
    color: #a8a29e;
    line-height: 1.32;
  }}
  .dthumb {{
    width: 142px;
    height: 74px;
    border-radius: 10px;
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }}
  .dtab-note {{
    align-self: flex-start;
    margin-left: 14px;
    background: #07221b;
    color: #d1fae5;
    font-size: 10.5px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 0 0 9px 9px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid rgba(16, 185, 129, 0.25);
    border-top: none;
  }}
</style>
</head>
<body>
  <div class="canvas">
    <div class="dot-grid"></div>

    <!-- Flowing Silk Ribbons inspired by Nori's Ribbon N Icon -->
    <svg class="ribbons-svg" viewBox="0 0 1024 500" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rib1" x1="340" y1="0" x2="720" y2="500" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.52"/>
          <stop offset="50%" stop-color="#2563eb" stop-opacity="0.38"/>
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.45"/>
        </linearGradient>
        <linearGradient id="rib2" x1="180" y1="500" x2="920" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#1d4ed8" stop-opacity="0.38"/>
          <stop offset="55%" stop-color="#0ea5e9" stop-opacity="0.46"/>
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.52"/>
        </linearGradient>
        <linearGradient id="edge1" x1="380" y1="0" x2="540" y2="500" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#bae6fd" stop-opacity="0.88"/>
          <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.58"/>
          <stop offset="100%" stop-color="#34d399" stop-opacity="0.78"/>
        </linearGradient>
        <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>

      <!-- Soft atmospheric ribbon wave 1 -->
      <path d="M415 -40 C345 130, 525 290, 425 540 L650 540 C730 280, 525 120, 615 -40 Z" fill="url(#rib1)" filter="url(#softGlow)"/>
      <!-- Soft atmospheric ribbon wave 2 -->
      <path d="M-40 445 C180 385, 350 505, 590 335 C790 195, 910 235, 1060 115 L1060 540 L-40 540 Z" fill="url(#rib2)" filter="url(#softGlow)"/>

      <!-- Crisp geometric silk ribbon crest lines -->
      <path d="M442 -20 C372 145, 532 295, 436 520" stroke="url(#edge1)" stroke-width="2.4" stroke-opacity="0.78"/>
      <path d="M-20 458 C190 398, 355 496, 575 348" stroke="url(#edge1)" stroke-width="1.8" stroke-opacity="0.55"/>
    </svg>

    <!-- LEFT EDITORIAL COLUMN -->
    <div class="left-col">
      <div class="brand-row">
        <div class="brand-icon-wrap">
          <img src="{assets['icon']}" alt="Nori">
        </div>
        <span class="brand-name">Nori</span>
        <span class="brand-badge">
          <span class="brand-badge-dot"></span>
          Visual Bookmarks
        </span>
      </div>

      <div class="hero-copy">
        <h1 class="headline">
          Links worth
          <span class="headline-accent">keeping.</span>
        </h1>
        <p class="subheadline">
          Save with <strong>rich cover previews</strong>, <strong>#tags</strong>, and <strong>personal notes</strong> — organized in custom lists.
        </p>
      </div>

      <div class="feature-pills">
        <span class="fpill fpill-active">✦ Previews</span>
        <span class="fpill">{sell_svg_dark} #tags &amp; lists</span>
        <span class="fpill">{note_svg_dark} Notes</span>
        <span class="fpill">
          <span class="swatch-dots">
            <span class="sdot" style="background:#10b981"></span>
            <span class="sdot" style="background:#3b82f6"></span>
            <span class="sdot" style="background:#a855f7"></span>
            <span class="sdot" style="background:#f43f5e"></span>
          </span>
          Themes
        </span>
      </div>
    </div>

    <!-- RIGHT STAGE: Layered Light + Dark Real Nori UI -->
    <div class="stage">
      <!-- Back-right peeking Light Mode Window -->
      <div class="ui-window-light">
        <div class="light-chips">
          <span class="lchip">Dev &amp; Web</span>
          <span class="lchip active">Design</span>
          <span class="ldrawer-btn">{list_svg}</span>
        </div>

        <div class="lcard-group">
          <div class="ltab-top">{sell_svg_dark} design, craft</div>
          <div class="lcard">
            <div class="lcard-body">
              <div class="ldomain"><img src="{assets['linear_fav']}"> linear.app</div>
              <div class="ltitle">Linear Method</div>
              <div class="ldesc">Practices for building</div>
            </div>
            <img class="lthumb" src="{assets['linear_thumb']}">
          </div>
          <div class="ltab-note">{note_svg_dark} UI polish</div>
        </div>

        <div class="lcard-group">
          <div class="ltab-top">{sell_svg_dark} tokens, ui</div>
          <div class="lcard">
            <div class="lcard-body">
              <div class="ldomain"><img src="{assets['figma_fav']}"> figma.com</div>
              <div class="ltitle">Figma Shortcut</div>
              <div class="ldesc">Design &amp; craft stories</div>
            </div>
            <img class="lthumb" src="{assets['figma_thumb']}">
          </div>
          <div class="ltab-note">{note_svg_dark} Design tokens</div>
        </div>
      </div>

      <!-- Foreground Hero Dark Mode Window -->
      <div class="ui-window-dark">
        <div class="dark-header">
          <div class="dark-chips">
            <span class="dchip active">Dev &amp; Web</span>
            <span class="dchip">Design</span>
            <span class="dchip">Reading</span>
          </div>
          <div class="dark-actions">
            <span class="search-pill">{search_svg} Search</span>
            <span class="drawer-btn">{list_svg}</span>
          </div>
        </div>

        <!-- Card 1: Zed (with top-right Tag Tab + bottom-left Note Tab) -->
        <div class="dcard-group">
          <div class="dtab-top">{sell_svg_dark} rust, editor, tools</div>
          <div class="dcard">
            <div class="dcard-body">
              <div class="ddomain"><img src="{assets['zed_fav']}"> zed.dev</div>
              <div class="dtitle">Zed — High-performance multiplayer code editor</div>
              <div class="ddesc">Fast, collaborative code editor from the creators of Atom and Tree-sitter.</div>
            </div>
            <img class="dthumb" src="{assets['zed_thumb']}">
          </div>
          <div class="dtab-note">{note_svg_dark} GPU-accelerated editor built in Rust with Tree-sitter</div>
        </div>

        <!-- Card 2: Astro (with top-right Tag Tab + bottom-left Note Tab) -->
        <div class="dcard-group">
          <div class="dtab-top">{sell_svg_dark} web, islands, perf</div>
          <div class="dcard">
            <div class="dcard-body">
              <div class="ddomain"><img src="{assets['astro_fav']}"> astro.build</div>
              <div class="dtitle">The Astro Blog — Content-driven web framework</div>
              <div class="ddesc">Islands architecture deep dives, Server Islands, and ecosystem news.</div>
            </div>
            <img class="dthumb" src="{assets['astro_thumb']}">
          </div>
          <div class="dtab-note">{note_svg_dark} Server Islands and zero-JS-by-default architecture</div>
        </div>

        <!-- Card 3: Mechanical Watch peeking at bottom -->
        <div class="dcard-group">
          <div class="dtab-top">{sell_svg_dark} 3d, interactive</div>
          <div class="dcard">
            <div class="dcard-body">
              <div class="ddomain"><img src="{assets['watch_fav']}"> ciechanow.ski</div>
              <div class="dtitle">Mechanical Watch — Bartosz Ciechanowski</div>
              <div class="ddesc">Interactive 3D breakdown of gears and escapement...</div>
            </div>
            <img class="dthumb" src="{assets['watch_thumb']}">
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
"""


def render_feature_graphic() -> Image.Image:
    chrome = find_chrome()
    assets = extract_assets()
    html = build_html(assets)

    with tempfile.TemporaryDirectory(prefix="nori-fg-") as tmpdir:
        html_path = Path(tmpdir) / "feature.html"
        raw_png = Path(tmpdir) / "raw.png"
        profile_dir = Path(tmpdir) / "chrome-profile"
        html_path.write_text(html, encoding="utf-8")

        subprocess.run(
            [
                chrome,
                "--headless=new",
                f"--user-data-dir={profile_dir}",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-gpu",
                "--hide-scrollbars",
                "--window-size=1024,500",
                "--force-device-scale-factor=3",
                f"--screenshot={raw_png}",
                html_path.as_uri(),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        rendered = Image.open(raw_png).convert("RGB")
        if rendered.size != (1024, 500):
            rendered = rendered.resize((1024, 500), Image.Resampling.LANCZOS)
        return rendered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output PNG path.")
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    img = render_feature_graphic()
    img.save(args.output, format="PNG", optimize=True)
    print(f"Saved {args.output} ({img.size[0]}x{img.size[1]} {img.mode})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
