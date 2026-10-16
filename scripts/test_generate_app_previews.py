"""Verify that idle simulator frames cannot overrun preview edit points."""

import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'app_previews', Path(__file__).with_name('generate-app-previews.py')
)
previews = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previews)


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Requires FFmpeg')
class RecordedPreviewTests(unittest.TestCase):
    def test_long_idle_frames_respect_cuts_and_keep_every_scene(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            colors = [(255, 0, 0), (0, 0, 255), (0, 255, 0)]
            timeline = []
            for index, color in enumerate(colors):
                frame = root / f'{index}.ppm'
                frame.write_bytes(b'P6\n120 160\n255\n' + bytes(color) * (120 * 160))
                # Each frame holds for ten seconds, as an idle simulator can.
                timeline.extend([f"file '{frame}'", 'duration 10'])
            timeline.append(f"file '{frame}'")
            (root / 'frames.txt').write_text('\n'.join(timeline) + '\n')
            recording = root / 'recording.mp4'
            subprocess.run([
                'ffmpeg', '-v', 'error', '-f', 'concat', '-safe', '0',
                '-i', str(root / 'frames.txt'), '-fps_mode', 'vfr',
                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(recording),
            ], check=True)
            output = root / 'preview.mp4'
            with patch.dict(previews.TARGETS, {'ipad': (120, 160, output.name)}):
                previews.render('ipad', recording, [[2, 7], [12, 17], [22, 27]], output, 'ffmpeg')
            for second, expected_channel in [(2.5, 0), (7.5, 2), (12.5, 1)]:
                pixel = subprocess.check_output([
                    'ffmpeg', '-v', 'error', '-i', str(output), '-ss', str(second),
                    '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24',
                    '-f', 'rawvideo', '-',
                ])
                self.assertGreater(pixel[expected_channel], 200)
                self.assertLess(max(value for i, value in enumerate(pixel) if i != expected_channel), 50)


if __name__ == '__main__':
    unittest.main()
