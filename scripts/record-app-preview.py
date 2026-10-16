#!/usr/bin/env python3
"""Record real app interactions on a dedicated iOS simulator using Maestro."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
SCENES = ("browse", "search", "annotate", "themes", "batch")


def simctl(*args, **kwargs):
    return subprocess.run(["xcrun", "simctl", *args], check=True, **kwargs)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", choices=("iphone-65", "iphone-55", "ipad"))
    parser.add_argument("device", help="UDID of a dedicated Nori Preview simulator")
    parser.add_argument("--reset-app", type=Path, help="Install this recording-only .app with fresh demo data")
    parser.add_argument("--cache-dir", type=Path, help="Portable bookmark-previews cache to restore after reset")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "fastlane/videos/recordings")
    args = parser.parse_args()
    devices = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "-j"]))
    device = next(d for group in devices["devices"].values() for d in group if d["udid"] == args.device)
    if not device["name"].startswith("Nori Preview "):
        parser.error("Use a dedicated Nori Preview simulator to preserve personal app data")
    # Local XCTest drivers share a TCP port. Keep only one recording simulator
    # booted so the automation cannot connect to another device's driver.
    for group in devices["devices"].values():
        for other in group:
            if other["udid"] != args.device and other["name"].startswith("Nori Preview ") and other["state"] == "Booted":
                simctl("shutdown", other["udid"])
    if device["state"] != "Booted":
        simctl("boot", args.device)
        simctl("bootstatus", args.device, "-b", stdout=subprocess.DEVNULL)
    if args.reset_app:
        if not args.cache_dir or not args.cache_dir.is_dir():
            parser.error("--reset-app requires --cache-dir with the prepared cover cache")
        subprocess.run(["xcrun", "simctl", "uninstall", args.device, "jp.nonbili.nori"], capture_output=True)
        simctl("install", args.device, str(args.reset_app))
        container = Path(subprocess.check_output([
            "xcrun", "simctl", "get_app_container", args.device, "jp.nonbili.nori", "data",
        ], text=True).strip())
        shutil.copytree(args.cache_dir, container / "Documents/bookmark-previews", dirs_exist_ok=True)
    simctl("status_bar", args.device, "override", "--time", "9:41", "--dataNetwork", "wifi",
           "--wifiMode", "active", "--wifiBars", "3", "--batteryState", "charged", "--batteryLevel", "100")
    simctl("launch", args.device, "jp.nonbili.nori")
    # Initialize the local XCTest driver before starting the recording.
    subprocess.run(["maestro", "--udid", args.device, "hierarchy", "--compact"],
                   check=True, stdout=subprocess.DEVNULL)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="nori-recording-") as work:
        work = Path(work)
        movie = work / "capture.mov"
        log_path = work / "recorder.log"
        with log_path.open("w") as log:
            recorder = subprocess.Popen([
                "xcrun", "simctl", "io", args.device, "recordVideo", "--codec=h264", str(movie),
            ], stdout=log, stderr=subprocess.STDOUT)
            try:
                deadline = time.monotonic() + 30
                while "Recording started" not in log_path.read_text():
                    if recorder.poll() is not None or time.monotonic() > deadline:
                        raise RuntimeError("Simulator recording did not start: " + log_path.read_text())
                    time.sleep(0.1)
                started = time.time()
                print(f"Recording native interactions on {device['name']}", flush=True)
                drawer_back = "4%,4%" if args.target == "ipad" else "10%,8%"
                subprocess.run([
                    "maestro", "--udid", args.device, "test", "--no-reinstall-driver",
                    "-e", f"MARKER_DIR={work}", "-e", f"DRAWER_BACK_POINT={drawer_back}",
                    str(ROOT / ".maestro/app-preview/showcase.yaml"),
                ], check=True)
                # Allow the simulator video delivery queue to catch up with the
                # final selection state before stopping the recorder.
                time.sleep(6)
            finally:
                if recorder.poll() is None:
                    recorder.send_signal(signal.SIGINT)
                try:
                    recorder.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    recorder.kill()
                    recorder.wait()
                    raise RuntimeError("Simulator did not finish saving its recording")
        if recorder.returncode != 0:
            raise RuntimeError("Simulator recording failed: " + log_path.read_text())
        source = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_format", "-of", "json", str(movie),
        ]))
        recorded_seconds = float(source["format"]["duration"])
        # Display recording and host clocks can differ slightly. These intervals
        # are starting points for the required visual review of the edit.
        clock_scale = recorded_seconds / (time.time() - started)
        segments = []
        for scene in SCENES:
            begin = ((work / f"{scene}-start.png").stat().st_mtime - started) * clock_scale
            end = ((work / f"{scene}-end.png").stat().st_mtime - started) * clock_scale - 0.1
            start = max(begin, end - 5.0)
            if end - start < 2.5:
                raise RuntimeError(f"Recorded {scene} interval is too short")
            segments.append([round(start, 3), round(end, 3)])
        review_dir = Path(tempfile.gettempdir()) / f"nori-preview-markers-{args.target}"
        review_dir.mkdir(parents=True, exist_ok=True)
        for image in work.glob("*.png"):
            shutil.copy2(image, review_dir / image.name)
        output = args.output_dir / f"{args.target}.mp4"
        # Remux the actual simulator recording; do not synthesize any frames.
        with tempfile.TemporaryDirectory(prefix=".capture-", dir=args.output_dir) as staging:
            staged = Path(staging) / output.name
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(movie),
                            "-c", "copy", "-movflags", "+faststart", str(staged)], check=True)
            staged.replace(output)
        manifest_path = args.output_dir / "manifest.json"
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
        manifest[args.target] = {
            "recording": output.name, "device": device["name"],
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "app_version": json.loads((ROOT / "package.json").read_text())["version"],
            "scenes": list(SCENES), "segments": segments, "reviewed": False,
        }
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"Saved actual screen recording: {output}", flush=True)
        print(f"Clip intervals: {segments}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
