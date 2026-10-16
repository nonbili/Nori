#!/usr/bin/env python3
"""Cache bookmark cover images on a dedicated recording simulator before launch."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
import subprocess
import time
import urllib.request

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent


def record_name(key):
    first, second = 2166136261, 5381
    for char in key:
        first = ((first ^ ord(char)) * 16777619) & 0xFFFFFFFF
        second = ((second * 33) ^ ord(char)) & 0xFFFFFFFF
    return f"{first:x}-{second:x}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("device", help="UDID of a simulator named Nori Preview …")
    args = parser.parse_args()
    devices = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "-j"]))
    device = next(d for group in devices["devices"].values() for d in group if d["udid"] == args.device)
    if not device["name"].startswith("Nori Preview "):
        parser.error("Use a dedicated Nori Preview simulator; personal app data must be preserved.")
    container = Path(subprocess.check_output([
        "xcrun", "simctl", "get_app_container", args.device, "jp.nonbili.nori", "data",
    ], text=True).strip())
    directory = container / "Documents" / "bookmark-previews"
    directory.mkdir(parents=True, exist_ok=True)
    fixture = json.loads((ROOT / "fastlane/videos/assets/native-preview-fixture.json").read_text())
    now = int(time.time() * 1000)

    def cache(bookmark):
        key = "page-image:" + bookmark["url"]
        base = record_name(key)
        image_file = ""
        image_url = bookmark.get("imageUrl", "")
        if image_url:
            try:
                request = urllib.request.Request(image_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(request, timeout=25) as response:
                    data = response.read(5 * 1024 * 1024 + 1)
                if len(data) > 5 * 1024 * 1024:
                    raise ValueError("Cover image exceeds cache size limit")
                image = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
                image.thumbnail((900, 900), Image.Resampling.LANCZOS)
                image_file = f"{base}-{now}.jpg"
                image.save(directory / image_file, quality=90)
            except Exception as error:
                print(f"Cover unavailable for {bookmark['url']}: {type(error).__name__}", flush=True)
        record = {"key": key, "preview": {
            "description": bookmark.get("description", ""),
            "imageUrl": image_url, "savedAt": now,
        }, "imageFile": image_file}
        (directory / f"{base}.json").write_text(json.dumps(record))
        return bool(image_file)

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(cache, fixture["bookmarks"]))
    print(f"Prepared {len(results)} native preview records, including {sum(results)} covers, on {device['name']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
