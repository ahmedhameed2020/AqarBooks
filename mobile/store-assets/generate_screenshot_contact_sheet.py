"""Build the Arabic Google Play contact sheet from the eight phone screenshots.

The sheet is a review/merchandising convenience: the eight real captures, laid
out in order, with a concise Arabic label **outside** every screenshot. The
pixels inside each screenshot are never altered, framed or annotated - the store
listing itself uses the raw PNGs.

Two deliberate choices:

* Text is drawn by headless Chrome instead of Pillow. This machine's Pillow has
  no libraqm, so it cannot apply the Arabic bidi algorithm or contextual shaping
  and renders Arabic as disconnected, reversed letters; a browser shapes it
  correctly. The eight PNGs are embedded at full resolution and scaled by CSS, so
  nothing is resampled twice on the way to the sheet.
* PNG dimensions come from the IHDR header via `struct`, so this script has
  **no third-party dependency at all**.

Run:
  python store-assets/generate_screenshot_contact_sheet.py

Output: store-assets/screenshots/ar/contact-sheet-ar.png
Exits 0 and prints PASS when the sheet was rendered at the expected size.
"""

from __future__ import annotations

import base64
import os
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHOTS_DIR = HERE / "screenshots" / "ar"
OUTPUT = SHOTS_DIR / "contact-sheet-ar.png"

# Ordered (file name, Arabic label) - the numbering already carries the order.
SHEET = (
    ("01-resident-home.png", "١ · الرئيسية — ساكن"),
    ("02-payments-dues.png", "٢ · المدفوعات والمستحقات"),
    ("03-fawry-payment.png", "٣ · كود الدفع عبر فوري"),
    ("04-visitor-qr-pass.png", "٤ · تصريح زائر برمز QR"),
    ("05-maintenance-request.png", "٥ · تفاصيل طلب الصيانة"),
    ("06-technician-dashboard.png", "٦ · اليوم — فني الصيانة"),
    ("07-gate-scanner.png", "٧ · المسح — البوابة"),
    ("08-manager-dashboard.png", "٨ · الرئيسية — مدير التشغيل"),
)

TITLE = "AqarBooks — لقطات متجر Google Play"
SUBTITLE = "ثماني لقطات فعلية ١٠٨٠×٢٤٠٠ من تطبيق Android — بيانات تجريبية بالكامل"

COLUMNS = 4
SHOT_WIDTH = 440
GAP = 34
MARGIN = 40
HEADER_HEIGHT = 104
LABEL_HEIGHT = 52
BACKGROUND = "#f4f6f9"
INK = "#0f172a"
GREY = "#64748b"
NAVY = "#07425d"
FONT_STACK = (
    "'IBM Plex Sans Arabic','Segoe UI','Arial','Noto Naskh Arabic',"
    "'DejaVu Sans',sans-serif"
)

CHROME_CANDIDATES = (
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
)


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def find_browser() -> str | None:
    for candidate in CHROME_CANDIDATES:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def png_size(path: Path) -> tuple[int, int]:
    """(width, height) straight from the IHDR header - standard library only."""
    with path.open("rb") as handle:
        head = handle.read(24)
    if len(head) < 24 or head[:8] != PNG_SIGNATURE or head[12:16] != b"IHDR":
        raise ValueError("%s is not a PNG with an IHDR header" % path.name)
    width, height = struct.unpack(">II", head[16:24])
    return width, height


def build_html(thumbs: list[tuple[str, str, str, int, int]], width: int, height: int) -> str:
    cells = []
    for name, label, data_uri, shot_width, shot_height in thumbs:
        cells.append(
            '<figure class="cell">'
            '<img src="%s" width="%d" height="%d" alt="%s">'
            "<figcaption>%s</figcaption>"
            "</figure>" % (data_uri, shot_width, shot_height, name, label)
        )
    return """<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: %(bg)s; }
  body {
    width: %(width)dpx; height: %(height)dpx; overflow: hidden;
    font-family: %(font)s; color: %(ink)s;
    padding: %(margin)dpx;
  }
  header { height: %(header)dpx; }
  h1 { font-size: 44px; font-weight: 700; color: %(navy)s; }
  p { font-size: 22px; color: %(grey)s; margin-top: 8px; }
  .grid {
    display: grid; grid-template-columns: repeat(%(columns)d, %(shot)dpx);
    column-gap: %(gap)dpx; row-gap: %(gap)dpx;
  }
  .cell { display: flex; flex-direction: column; }
  /* The screenshot is placed raw: no border, no overlay, no crop. */
  .cell img { display: block; }
  /* The label sits under the screenshot, never on top of it. */
  figcaption {
    height: %(label)dpx; display: flex; align-items: center;
    font-size: 24px; font-weight: 600; color: %(ink)s;
  }
</style>
</head>
<body>
<header><h1>%(title)s</h1><p>%(subtitle)s</p></header>
<div class="grid">%(cells)s</div>
</body>
</html>
""" % {
        "bg": BACKGROUND,
        "width": width,
        "height": height,
        "margin": MARGIN,
        "header": HEADER_HEIGHT,
        "navy": NAVY,
        "grey": GREY,
        "ink": INK,
        "font": FONT_STACK,
        "columns": COLUMNS,
        "shot": SHOT_WIDTH,
        "gap": GAP,
        "label": LABEL_HEIGHT,
        "title": TITLE,
        "subtitle": SUBTITLE,
        "cells": "\n".join(cells),
    }


def main() -> int:
    missing = [name for name, _ in SHEET if not (SHOTS_DIR / name).is_file()]
    if missing:
        print("FAIL: missing screenshots: %s" % ", ".join(missing))
        return 1

    browser = find_browser()
    if browser is None:
        print(
            "FAIL: no Chrome/Edge binary found to render Arabic text. "
            "Install one, or shape the labels with a Pillow build that has libraqm."
        )
        return 1

    thumbs: list[tuple[str, str, str, int, int]] = []
    for name, label in SHEET:
        path = SHOTS_DIR / name
        source_width, source_height = png_size(path)
        shot_height = round(source_height * SHOT_WIDTH / source_width)
        data = base64.b64encode(path.read_bytes()).decode("ascii")
        thumbs.append(
            (name, label, "data:image/png;base64,%s" % data, SHOT_WIDTH, shot_height)
        )

    rows = (len(thumbs) + COLUMNS - 1) // COLUMNS
    shot_height = thumbs[0][4]
    width = MARGIN * 2 + COLUMNS * SHOT_WIDTH + (COLUMNS - 1) * GAP
    height = (
        MARGIN * 2
        + HEADER_HEIGHT
        + rows * (shot_height + LABEL_HEIGHT)
        + (rows - 1) * GAP
    )

    with tempfile.TemporaryDirectory(prefix="aqar-sheet-") as tmp:
        html_path = Path(tmp) / "contact-sheet.html"
        html_path.write_text(build_html(thumbs, width, height), encoding="utf-8")
        command = [
            browser,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=1",
            "--default-background-color=00000000",
            "--window-size=%d,%d" % (width, height),
            "--screenshot=%s" % OUTPUT,
            html_path.as_uri(),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            print("FAIL: %s exited %d" % (Path(browser).name, result.returncode))
            print((result.stderr or result.stdout or "").strip()[:800])
            return 1

    if not OUTPUT.is_file():
        print("FAIL: the browser produced no file at %s" % OUTPUT)
        return 1

    got = png_size(OUTPUT)
    if got != (width, height):
        print("FAIL: sheet is %dx%d, expected %dx%d" % (got[0], got[1], width, height))
        return 1

    print(
        "wrote %s (%dx%d, %d screenshots at %dx%d, rendered by %s)"
        % (OUTPUT, width, height, len(thumbs), SHOT_WIDTH, shot_height, Path(browser).name)
    )
    print(
        "labels are outside the screenshots; the paste is raw "
        "(no frame, overlay or crop inside any capture)"
    )
    print("PASS: contact sheet built from the eight real captures")
    return 0


if __name__ == "__main__":
    sys.exit(main())
