#!/usr/bin/env python3
"""Edit recorded iOS app interactions into full-screen App Store preview videos."""

import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
TARGETS = {
    "iphone-65": (886, 1920, "app-preview-iphone-65-886x1920.mp4"),
    "iphone-55": (1080, 1920, "app-preview-iphone-55-1080x1920.mp4"),
    "ipad": (1200, 1600, "app-preview-ipad-1200x1600.mp4"),
}


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path),
    ]))


def render(target, recording, segments, output, ffmpeg):
    width, height, _ = TARGETS[target]
    metadata = probe(recording)
    source_duration = float(metadata["format"]["duration"])
    source_video = next(s for s in metadata["streams"] if s["codec_type"] == "video")
    source_aspect = source_video["width"] / source_video["height"]
    if abs(source_aspect / (width / height) - 1) > 0.01:
        raise ValueError(f"{target} needs a matching device recording; source aspect ratio differs by more than 1%")
    duration = 0.0
    for start, end in segments:
        if not (0 <= start < end <= source_duration):
            raise ValueError(f"Invalid recording interval {start}..{end} for {recording}")
        duration += end - start
    if not 15 <= duration <= 30:
        raise ValueError(f"Preview duration must be 15–30 seconds, got {duration:.2f}")

    count = len(segments)
    labels = "".join(f"[source{i}]" for i in range(count))
    # Normalize the simulator's variable frame durations before trimming.
    # Otherwise a long idle frame can extend a clip past its requested end.
    filters = [f"[0:v]fps=30,split={count}{labels}"]
    for i, (start, end) in enumerate(segments):
        filters.append(
            f"[source{i}]trim=start={start}:end={end},setpts=PTS-STARTPTS,"
            f"scale={width}:{height}:force_original_aspect_ratio=increase:flags=lanczos,"
            f"crop={width}:{height},setsar=1,format=yuv420p[clip{i}]"
        )
    filters.append("".join(f"[clip{i}]" for i in range(count)) + f"concat=n={count}:v=1:a=0[video]")
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(recording), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-filter_complex", ";".join(filters), "-map", "[video]", "-map", "1:a",
        "-c:v", "libx264", "-preset", "medium", "-profile:v", "high", "-level:v", "4.0",
        "-pix_fmt", "yuv420p", "-b:v", "10M", "-minrate", "10M", "-maxrate", "10M",
        "-bufsize", "20M", "-x264-params", "nal-hrd=cbr:filler=1",
        "-c:a", "aac", "-b:a", "256k", "-ar", "44100", "-ac", "2",
        "-t", f"{duration:.6f}", "-movflags", "+faststart", str(output),
    ], check=True)
    result = probe(output)
    video = next(s for s in result["streams"] if s["codec_type"] == "video")
    audio = next(s for s in result["streams"] if s["codec_type"] == "audio")
    if (video["width"], video["height"], video["level"]) != (width, height, 40):
        raise RuntimeError(f"Unexpected output video format for {target}")
    if video["r_frame_rate"] != "30/1" or audio["channels"] != 2:
        raise RuntimeError(f"Unexpected frame rate or audio format for {target}")
    if abs(float(video["duration"]) - duration) > 1 / 30 + 0.001:
        raise RuntimeError(f"Unexpected output duration for {target}")
    print(f"{target}: {width}×{height}, {float(video['duration']):.2f}s, H.264 Level 4.0", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path, help="JSON with source recordings and real-time clip intervals")
    parser.add_argument("--target", action="append", choices=TARGETS)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "fastlane/videos/ios/en-US")
    args = parser.parse_args()
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not shutil.which("ffprobe"):
        parser.error("Install FFmpeg and ffprobe on PATH")
    manifest = json.loads(args.manifest.read_text())
    args.output_dir.mkdir(parents=True, exist_ok=True)
    targets = list(dict.fromkeys(args.target or TARGETS))
    # Prepare and validate every requested output before replacing any previous video.
    with tempfile.TemporaryDirectory(prefix=".previews-", dir=args.output_dir) as staging:
        for target in targets:
            entry = manifest[target]
            if entry.get("reviewed") is not True:
                raise ValueError(f"Review the source footage and edit intervals for {target}, then set reviewed to true")
            recording = (args.manifest.parent / entry["recording"]).resolve()
            render(target, recording, entry["segments"], Path(staging) / TARGETS[target][2], ffmpeg)
        for target in targets:
            name = TARGETS[target][2]
            (Path(staging) / name).replace(args.output_dir / name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
