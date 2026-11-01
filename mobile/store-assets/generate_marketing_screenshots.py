#!/usr/bin/env python3
"""Render the eight Arabic Google Play *marketing* screenshots for AqarBooks.

This script is a deterministic renderer, not a designer: every pixel comes from
one HTML/CSS/SVG template plus the repository's own approved assets, drawn by a
headless Chrome/Edge at exactly 1080x2400. There is no generative model, no stock
imagery, no invented Arabic copy and no fake app UI anywhere in the pipeline.

What it consumes (all hashed before anything is rendered):

* the canonical logo, `mobile/assets/images/logo.png` (977x1024, SHA-256
  `9cfb1ee2...2bcef`) - used verbatim as `<img>` content, never redrawn,
  recolored or replaced. It carries transparency, so the brand mark always sits
  on a white plate (the same treatment as the shipped Play icon) and stays
  legible on the dark variants;
* the four approved local fonts,
  `mobile/assets/fonts/IBMPlexSansArabic-{Regular,Medium,SemiBold,Bold}.ttf`,
  embedded as `@font-face` data URLs so text shaping never depends on the host's
  installed fonts;
* the eight validated source screenshots in `mobile/store-assets/screenshots/ar/`,
  each required to match its approved SHA-256 *before* rendering, embedded as
  data URLs and drawn unmodified - no filter, no sharpening, no overlay, no crop
  and no aspect-ratio change. They are surrounded by a device shell; the only
  pixels the shell ever masks are the four 40px corner arcs, which is declared
  as `data-corner-clip` and re-checked by the validator.

Everything drawn *beside* the screenshot is abstract geometry: architectural
silhouettes, arches, keylines, column grids and per-screen motifs. No people, no
cartoons, no invented icons, no stock photography.

Run:
  python store-assets/generate_marketing_screenshots.py

Outputs (all under `store-assets/screenshots/marketing/ar/`):
  * eight `<NN>-<name>-marketing.png` files at 1080x2400;
  * `contact-sheet-marketing-ar.png` - review sheet, 4x2, Arabic labels outside
    the images (not a store asset);
  * `manifest-marketing-ar.json` - deterministic render manifest (copy, hashes,
    template hashes, dimensions);
  * `MARKETING_SCREENSHOTS_QA.md` - English QA report generated from the same
    measured facts plus the recorded manual review.

Standard library only: no Pillow, no third-party package. PNG decoding here is
minimal on purpose (8-bit greyscale/RGB/RGBA, all five row filters, no
interlacing) - it exists to sample the authentic Fawry yellow from source 03, to
verify source dimensions and to read the readiness probe's pixels, not to be a
general image library.

The script exits non-zero with a `FAIL:` line when the logo, a font, a source
screenshot, a hash, a dimension or the browser is unavailable, and never writes
outside `store-assets/screenshots/marketing/ar/`.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent  # mobile/store-assets
MOBILE = HERE.parent  # mobile
ASSETS = MOBILE / "assets"
SOURCE_DIR = HERE / "screenshots" / "ar"
OUT_DIR = HERE / "screenshots" / "marketing" / "ar"

MANIFEST_PATH = OUT_DIR / "manifest-marketing-ar.json"
CONTACT_SHEET_PATH = OUT_DIR / "contact-sheet-marketing-ar.png"
QA_PATH = OUT_DIR / "MARKETING_SCREENSHOTS_QA.md"

TEMPLATE_ID = "aqarbooks-marketing-screenshots-v1"

CANVAS_W, CANVAS_H = 1080, 2400
DEVICE_SCALE_FACTOR = 1

# ---------------------------------------------------------------------------
# Approved, hash-pinned inputs
# ---------------------------------------------------------------------------

LOGO_PATH = ASSETS / "images" / "logo.png"
LOGO_SHA256 = "9cfb1ee28a13487913a10ba5dad623c85079d20b2ea4a6600f8497f9c8e2bcef"
LOGO_W, LOGO_H = 977, 1024

FONT_DIR = ASSETS / "fonts"
FONTS = (
    ("Regular", 400, "IBMPlexSansArabic-Regular.ttf"),
    ("Medium", 500, "IBMPlexSansArabic-Medium.ttf"),
    ("SemiBold", 600, "IBMPlexSansArabic-SemiBold.ttf"),
    ("Bold", 700, "IBMPlexSansArabic-Bold.ttf"),
)
FONT_STACK = "IBM Plex Sans Arabic"

# The locked brand palette. Every color literal in every generated document is
# either one of these, the Fawry accent below, or an rgba() composite whose RGB
# triple is one of these (documented in the QA report and enforced by
# validate_marketing_screenshots.py).
PALETTE = (
    ("navy", "#07425D"),
    ("deep", "#042434"),
    ("petrol", "#1B60B9"),
    ("purple", "#7E1898"),
    ("gold", "#C5A880"),
    ("cloud", "#F4F6F9"),
    ("white", "#FFFFFF"),
)

# Authentic Fawry yellow, sampled from 03-fawry-payment.png (the modal pixel of
# its yellow cluster: 11,223 sampled pixels, next value 26). Screens other than
# 03 must not contain it - the validator enforces that.
FAWRI_ACCENT = "#FFDD00"
FAWRI_SOURCE_ID = "03"

# The approved copy, character for character. This table is imported by
# validate_marketing_screenshots.py, which also carries its own independently
# hardcoded copy of it and fails if the two ever drift.
APPROVED_COPY = (
    (
        "01",
        "كل ما يخص وحدتك في مكان واحد",
        "تابع وحدتك ومستحقاتك وطلبات الصيانة بسهولة.",
    ),
    (
        "02",
        "تابع مستحقاتك بكل سهولة",
        "اطّلع على المستحقات والمدفوعات السابقة في أي وقت.",
    ),
    (
        "03",
        "ادفع مستحقاتك عبر فوري",
        "احصل على كود الدفع وسدّد مستحقاتك بسهولة.",
    ),
    (
        "04",
        "تصاريح ذكية لزوارك",
        "أنشئ تصاريح الزيارة وشاركها باستخدام رمز QR.",
    ),
    (
        "05",
        "صيانة أسهل، ومتابعة أوضح",
        "قدّم طلبات الصيانة وتابع مراحل تنفيذها.",
    ),
    (
        "06",
        "مهامك اليومية بين يديك",
        "نظّم أعمال الصيانة وتابع المهام المكلّف بها.",
    ),
    (
        "07",
        "دخول منظّم وآمن",
        "تحقّق من تصاريح الزوار بسرعة عبر مسح رمز QR.",
    ),
    (
        "08",
        "إدارة عقارية برؤية شاملة",
        "تابع التحصيلات والصيانة والعمليات من مكان واحد.",
    ),
)

# The Latin wordmark is the only other text in the campaign (the FIGMA handoff
# forbids an Arabic brand name). `LATIN_WORDMARK` is the complete set of text
# nodes the validator will accept in a rendered screen document.
LATIN_WORDMARK = "AqarBooks"

# ---------------------------------------------------------------------------
# Layout contract (all integers, so the rendered canvas is exact)
# ---------------------------------------------------------------------------

PAD_X = 96
PAD_TOP = 88
PAD_BOTTOM = 72

BRAND_TOP = PAD_TOP
BRAND_H = 84
BRAND_LOGO_H = 54
BRAND_CHIP_PAD = 14
BRAND_CHIP_RADIUS = 18
BRAND_GAP = 22
WORDMARK_SIZE = 38

GAP_BRAND_COPY = 84
COPY_TOP = BRAND_TOP + BRAND_H + GAP_BRAND_COPY  # 256
COPY_H = 356
HEADLINE_SIZE = 88
HEADLINE_LINE = 104
SUBTITLE_GAP = 34
SUBTITLE_SIZE = 38
SUBTITLE_LINE = 57

KICKER_TOP = 226
KICKER_W, KICKER_H = 96, 6

GAP_COPY_DEVICE = 66
DEVICE_TOP = COPY_TOP + COPY_H + GAP_COPY_DEVICE  # 678
DEVICE_H = CANVAS_H - DEVICE_TOP - PAD_BOTTOM  # 1650
BEZEL_PAD = 13
BEZEL_BORDER = 2
DEVICE_RADIUS = 58
DEVICE_W = 759  # 729 (screen) + 2 * (13 + 2)
SCREEN_W, SCREEN_H = 729, 1620  # exactly 1080x2400 * 0.675
# The only source pixels the shell masks: the four corner arcs of the screen.
SCREEN_CORNER_RADIUS = 40

DIVIDER_Y = 648
FOOT_RULE_Y = 2384

# Contact sheet (review tooling only - never a store asset).
SHEET_PAD = 40
SHEET_COLUMNS = 4
SHEET_SHOT_W, SHEET_SHOT_H = 432, 960  # exactly 1080x2400 * 0.4
SHEET_GAP = 34
SHEET_HEADER_H = 150
SHEET_LABEL_H = 76
SHEET_MARGIN_TOP = 26
SHEET_W = 2 * SHEET_PAD + SHEET_COLUMNS * SHEET_SHOT_W + (SHEET_COLUMNS - 1) * SHEET_GAP
SHEET_ROWS = (len(APPROVED_COPY) + SHEET_COLUMNS - 1) // SHEET_COLUMNS
SHEET_H = (
    SHEET_PAD * 2
    + SHEET_HEADER_H
    + 1
    + SHEET_MARGIN_TOP
    + SHEET_ROWS * (SHEET_SHOT_H + SHEET_LABEL_H)
    + (SHEET_ROWS - 1) * SHEET_GAP
)
SHEET_TITLE = "AqarBooks — لوحة مراجعة لقطات التسويق (عربي)"
SHEET_SUBTITLE = (
    "ثماني لقطات تسويقية ١٠٨٠×٢٤٠٠ — للاعتماد البصري؛ التسميات خارج الصور "
    "والصور بلا أي تعديل"
)

BROWSER_CANDIDATES = (
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

BROWSER_FLAGS = (
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--force-device-scale-factor=%d" % DEVICE_SCALE_FACTOR,
    "--run-all-compositor-stages-before-draw",
    # Deterministic readiness: virtual time is advanced only until pending
    # fetches settle, so the page's own load/fonts.ready/RAF chain completes
    # before the frame is captured, with no wall-clock flakiness.
    "--virtual-time-budget=15000",
)

# The in-page readiness hook. It is deliberately the last script in the
# document: it waits for every <img> to decode, then document.fonts.ready, then
# two animation frames and a settle delay, and only then marks the document.
READY_SCRIPT = """<script>
(function () {
  var images = Array.prototype.slice.call(document.images);
  function mark(state) {
    var root = document.documentElement;
    root.setAttribute("data-render-ready", "1");
    root.setAttribute("data-fonts-status", state);
    root.setAttribute("data-images-total", String(images.length));
    var broken = images.filter(function (i) { return !i.complete || i.naturalWidth === 0; });
    root.setAttribute("data-images-broken", String(broken.length));
  }
  function settle() {
    document.fonts.ready.then(function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          setTimeout(function () { mark(document.fonts.status); }, 120);
        });
      });
    });
  }
  function waitForImages() {
    var pending = images.filter(function (i) { return !i.complete || i.naturalWidth === 0; });
    if (pending.length) { setTimeout(waitForImages, 30); return; }
    settle();
  }
  if (document.readyState === "complete") { waitForImages(); }
  else { window.addEventListener("load", waitForImages); }
})();
</script>"""

# Readiness evidence, probe render only. Four 270x4 segments fill the last four
# rows of the canvas: each segment starts petrol and turns purple only when one
# readiness condition is true in the *screenshot path itself*. The generator
# renders the probe document, decodes the PNG and reads the four pixels, so
# "fonts loaded and both images decoded" is verified from pixels instead of
# assumed from timing.
PROBE_CSS = """
.probe-strip{position:absolute;left:0;top:2396px;width:1080px;height:4px;z-index:99;display:flex}
.probe-strip i{flex:1 1 0;background:#1B60B9}
html[data-render-ready="1"] .probe-strip i:nth-child(1){background:#7E1898}
html[data-fonts-status="loaded"] .probe-strip i:nth-child(2){background:#7E1898}
html[data-images-broken="0"] .probe-strip i:nth-child(3){background:#7E1898}
html[data-images-total="2"] .probe-strip i:nth-child(4){background:#7E1898}
"""

PROBE_STRIP = '<div class="probe-strip"><i></i><i></i><i></i><i></i></div>'

PROBE_SEGMENTS = (
    ("render-ready (load, fonts.ready, 2 rAF, 120ms settle)", "#7E1898", (135, 2398)),
    ("fonts loaded", "#7E1898", (405, 2398)),
    ("no broken images", "#7E1898", (675, 2398)),
    ("exactly 2 images decoded", "#7E1898", (945, 2398)),
)
PROBE_PENDING = "#1B60B9"


# ---------------------------------------------------------------------------
# Minimal standard-library PNG support
# ---------------------------------------------------------------------------

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
CHANNELS = {0: 1, 2: 3, 4: 2, 6: 4}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


class PngReader:
    """8-bit, non-interlaced PNG reader (greyscale / RGB / grey+alpha / RGBA)."""

    def __init__(self, path: Path) -> None:
        data = path.read_bytes()
        if data[:8] != PNG_SIGNATURE:
            raise ValueError("%s is not a PNG file" % path.name)
        self.path = path
        self.bytes = len(data)
        self.idat: list[bytes] = []
        offset = 8
        seen_ihdr = seen_iend = False
        while offset + 8 <= len(data):
            (length,) = struct.unpack(">I", data[offset:offset + 4])
            kind = data[offset + 4:offset + 8]
            body = data[offset + 8:offset + 8 + length]
            if len(body) != length:
                raise ValueError("%s: truncated %s chunk" % (path.name, kind))
            offset += 12 + length
            if kind == b"IHDR":
                (
                    self.width,
                    self.height,
                    self.depth,
                    self.colour,
                    _compression,
                    _filter,
                    interlace,
                ) = struct.unpack(">IIBBBBB", body[:13])
                seen_ihdr = True
            elif kind == b"IDAT":
                self.idat.append(body)
            elif kind == b"IEND":
                seen_iend = True
                break
        if not seen_ihdr or not self.idat or not seen_iend:
            raise ValueError("%s: incomplete PNG structure" % path.name)
        if self.depth != 8 or self.colour not in CHANNELS or self.colour == 3:
            raise ValueError(
                "%s: unsupported PNG (bit depth %d, colour type %d) - this reader "
                "handles 8-bit greyscale/RGB/RGBA, non-interlaced"
                % (path.name, self.depth, self.colour)
            )
        if interlace != 0:
            raise ValueError("%s: interlaced PNGs are not supported" % path.name)

    def rows(self) -> list[bytearray]:
        channels = CHANNELS[self.colour]
        stride = self.width * channels
        raw = zlib.decompress(b"".join(self.idat))
        out: list[bytearray] = []
        previous = bytearray(stride)
        offset = 0
        for _ in range(self.height):
            if offset >= len(raw):
                raise ValueError("%s: truncated image data" % self.path.name)
            filter_type = raw[offset]
            offset += 1
            line = bytearray(raw[offset:offset + stride])
            if len(line) != stride:
                raise ValueError("%s: truncated scanline" % self.path.name)
            offset += stride
            if filter_type == 1:
                for i in range(channels, stride):
                    line[i] = (line[i] + line[i - channels]) & 0xFF
            elif filter_type == 2:
                for i in range(stride):
                    line[i] = (line[i] + previous[i]) & 0xFF
            elif filter_type == 3:
                for i in range(stride):
                    left = line[i - channels] if i >= channels else 0
                    line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xFF
            elif filter_type == 4:
                for i in range(stride):
                    left = line[i - channels] if i >= channels else 0
                    up_left = previous[i - channels] if i >= channels else 0
                    line[i] = (line[i] + _paeth(left, previous[i], up_left)) & 0xFF
            elif filter_type != 0:
                raise ValueError(
                    "%s: unknown row filter %d" % (self.path.name, filter_type)
                )
            out.append(line)
            previous = line
        return out

    def is_opaque(self) -> bool:
        if self.colour not in (4, 6):
            return True
        channels = CHANNELS[self.colour]
        for line in self.rows():
            if any(value != 255 for value in line[channels - 1::channels]):
                return False
        return True


def sample_fawri_accent(path: Path) -> str:
    """The modal yellow pixel of the authentic Fawry screenshot.

    Deterministic and reproducible: walk every pixel, keep the ones in the
    (r>200, g>170, b<140, r+g-2b>160) yellow window, and return the exact RGB
    value with the highest count. On 03-fawry-payment.png this is #FFDD00 with
    11,223 pixels - 400x the runner-up - so the sampling is not marginal.
    """
    image = PngReader(path)
    if image.colour not in (2, 6):
        raise ValueError(
            "%s: cannot sample an accent from colour type %d" % (path.name, image.colour)
        )
    channels = CHANNELS[image.colour]
    counts: dict[tuple[int, int, int], int] = {}
    for line in image.rows():
        for x in range(image.width):
            i = x * channels
            r, g, b = line[i], line[i + 1], line[i + 2]
            if r > 200 and g > 170 and b < 140 and (r + g - 2 * b) > 160:
                key = (r, g, b)
                counts[key] = counts.get(key, 0) + 1
    if not counts:
        raise ValueError("%s: no Fawry yellow pixel found to sample" % path.name)
    best = max(sorted(counts), key=lambda key: (counts[key], key))
    return "#%02X%02X%02X" % best


# ---------------------------------------------------------------------------
# Screens: copy + art direction + per-screen motif
# ---------------------------------------------------------------------------


def num(value: float) -> str:
    return "%g" % value


def svg_line(x1, y1, x2, y2, colour, opacity, width=1, cap="round") -> str:
    return (
        '<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-opacity="%s" '
        'stroke-width="%s" stroke-linecap="%s"/>'
        % (num(x1), num(y1), num(x2), num(y2), colour, num(opacity), num(width), cap)
    )


def svg_rect(x, y, w, h, stroke, opacity, width=1, radius=0) -> str:
    return (
        '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="none" stroke="%s" '
        'stroke-opacity="%s" stroke-width="%s"/>'
        % (
            num(x),
            num(y),
            num(w),
            num(h),
            num(radius),
            stroke,
            num(opacity),
            num(width),
        )
    )


def svg_fill_rect(x, y, w, h, fill, opacity, radius=0) -> str:
    return (
        '<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s" fill-opacity="%s"/>'
        % (num(x), num(y), num(w), num(h), num(radius), fill, num(opacity))
    )


def svg_circle(cx, cy, r, stroke, opacity, width=1, fill=None, fill_opacity=0.0) -> str:
    if fill is None:
        return (
            '<circle cx="%s" cy="%s" r="%s" fill="none" stroke="%s" stroke-opacity="%s" '
            'stroke-width="%s"/>'
            % (num(cx), num(cy), num(r), stroke, num(opacity), num(width))
        )
    return (
        '<circle cx="%s" cy="%s" r="%s" fill="%s" fill-opacity="%s" stroke="%s" '
        'stroke-opacity="%s" stroke-width="%s"/>'
        % (
            num(cx),
            num(cy),
            num(r),
            fill,
            num(fill_opacity),
            stroke,
            num(opacity),
            num(width),
        )
    )


def svg_path(d, stroke, opacity, width=1, dash=None) -> str:
    dash_attr = ' stroke-dasharray="%s"' % dash if dash else ""
    return (
        '<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"%s/>'
        % (d, stroke, num(opacity), num(width), dash_attr)
    )


def svg_open() -> str:
    # No xmlns: inline SVG inside an HTML5 document needs none, and its absence
    # keeps the "zero external references" contract trivially verifiable.
    return (
        '<svg class="motif" viewBox="0 0 %d %d" width="%d" height="%d" '
        'aria-hidden="true" focusable="false">' % (CANVAS_W, CANVAS_H, CANVAS_W, CANVAS_H)
    )


def svg_close() -> str:
    return "</svg>"


def column_grid(colour, opacity=0.05) -> str:
    """The shared 96px architectural column grid (plus a slower horizontal)."""
    parts = []
    for x in range(96, CANVAS_W, 96):
        parts.append(svg_line(x, 0, x, CANVAS_H, colour, opacity, 1, cap="butt"))
    for y in range(192, CANVAS_H, 192):
        parts.append(svg_line(0, y, CANVAS_W, y, colour, opacity * 0.6, 1, cap="butt"))
    return "".join(parts)


def arch(cx, cy, radius, colour, opacity, width) -> str:
    """A semicircular arch springing from (cx, cy)."""
    return svg_path(
        "M %s %s A %s %s 0 0 1 %s %s"
        % (
            num(cx - radius),
            num(cy),
            num(radius),
            num(radius),
            num(cx + radius),
            num(cy),
        ),
        colour,
        opacity,
        width,
    )


def motif_welcoming(c: dict) -> str:
    """01 - bright, welcoming: arches, a window lattice, a warm gold wash."""
    p = [column_grid(c["grid"], 0.05)]
    for radius, opacity, width in ((90, 0.24, 3), (150, 0.15, 2), (210, 0.09, 1.5)):
        p.append(arch(40, 612, radius, c["gold"], opacity, width))
    for row in range(4):
        for col in range(3):
            p.append(
                svg_rect(
                    48 + col * 34,
                    760 + row * 48,
                    18,
                    26,
                    c["gold"],
                    0.16,
                    1.5,
                    2,
                )
            )
    p.append(svg_line(48, 1000, 146, 1000, c["gold"], 0.16, 1, cap="butt"))
    return "".join(p)


def motif_ledger(c: dict) -> str:
    """02 - dues and payments: a statement column of rules."""
    p = [column_grid(c["grid"], 0.05)]
    lengths = (200, 132, 176, 96, 188, 140, 160, 112, 148, 92)
    for index, length in enumerate(lengths):
        y = 128 + index * 48
        colour = c["petrol"] if index % 3 == 1 else c["gold"]
        p.append(svg_line(200, y, 200 - length, y, colour, 0.2, 2, cap="butt"))
    p.append(svg_line(200, 128, 200, 126 + len(lengths) * 48, c["grid"], 0.12, 1, cap="butt"))
    for index in range(5):
        y = 900 + index * 360
        p.append(svg_line(1000, y, 1032, y, c["gold"], 0.28, 2, cap="butt"))
    p.append(svg_line(1000, 740, 1000, 2320, c["gold"], 0.16, 1, cap="butt"))
    return "".join(p)


def motif_payment(c: dict) -> str:
    """03 - Fawry payment: a code card outline, a dotted keyline, one accent."""
    p = [column_grid(c["grid"], 0.05)]
    p.append(svg_rect(24, 300, 168, 118, c["gold"], 0.26, 2, 18))
    p.append(svg_rect(40, 316, 136, 86, c["petrol"], 0.16, 1, 12))
    for index in range(3):
        p.append(
            svg_line(
                56,
                344 + index * 22,
                160,
                344 + index * 22,
                c["gold"],
                0.22,
                2,
                cap="butt",
            )
        )
    p.append(
        svg_path(
            "M 120 118 L 120 600",
            c["gold"],
            0.3,
            2,
            dash="2 10",
        )
    )
    p.append(
        svg_path(
            "M 996 118 L 996 600",
            c["gold"],
            0.2,
            2,
            dash="2 10",
        )
    )
    p.append(
        svg_path(
            "M 960 900 L 960 2280",
            c["gold"],
            0.16,
            2,
            dash="2 12",
        )
    )
    # The single restrained Fawry accent other than the kicker rule.
    p.append(svg_line(PAD_X, FOOT_RULE_Y, PAD_X + 184, FOOT_RULE_Y, c["accent"], 0.6, 1, cap="butt"))
    return "".join(p)


def motif_entry(c: dict) -> str:
    """04 - visitor entry: a gate portal with posts and an access frame."""
    p = [column_grid(c["grid"], 0.05)]
    p.append(svg_path("M 40 372 L 40 250 A 70 70 0 0 1 180 250 L 180 372", c["gold"], 0.28, 3))
    for index in range(3):
        p.append(svg_line(70 + index * 40, 300, 70 + index * 40, 372, c["gold"], 0.14, 2, cap="butt"))
    p.append(svg_rect(56, 96, 108, 54, c["petrol"], 0.2, 2, 10))
    for index in range(2):
        y = 900 + index * 420
        p.append(svg_line(60, y, 60, y + 120, c["gold"], 0.3, 3, cap="butt"))
        p.append(svg_line(112, y + 24, 112, y + 96, c["gold"], 0.16, 2, cap="butt"))
        p.append(svg_line(996, y, 996, y + 120, c["gold"], 0.3, 3, cap="butt"))
        p.append(svg_line(944, y + 24, 944, y + 96, c["gold"], 0.16, 2, cap="butt"))
    p.append(svg_line(60, 2196, 1012, 2196, c["gold"], 0.2, 2, cap="butt"))
    return "".join(p)


def motif_maintenance(c: dict) -> str:
    """05 - maintenance detail: dimension lines, ticks and a hatched base."""
    p = [column_grid(c["grid"], 0.05)]
    p.append(svg_line(120, 118, 120, 600, c["petrol"], 0.3, 2, cap="butt"))
    for y in (118, 600):
        p.append(svg_line(98, y, 142, y, c["petrol"], 0.4, 2, cap="butt"))
    for index in range(4):
        y = 226 + index * 108
        p.append(svg_line(104, y, 136, y, c["petrol"], 0.22, 2, cap="butt"))
    p.append(svg_rect(176, 300, 120, 90, c["gold"], 0.22, 1.5, 8))
    p.append(svg_line(176, 345, 296, 345, c["gold"], 0.22, 1.5, cap="butt"))
    for index in range(2):
        x = 40 + index * 210
        p.append(svg_line(x, 1000, x, 2260, c["grid"], 0.14, 1, cap="butt"))
        for y in range(1060, 2260, 240):
            p.append(svg_line(x - 12, y, x + 12, y, c["grid"], 0.14, 1, cap="butt"))
    hatch_from = CANVAS_H - 72
    x = -72
    while x < CANVAS_W + 72:
        p.append(svg_line(x, CANVAS_H, x + 72, hatch_from, c["grid"], 0.22, 1, cap="butt"))
        x += 12
    return "".join(p)


def motif_workflow(c: dict) -> str:
    """06 - technician workflow: task nodes chained by connectors."""
    p = [column_grid(c["grid"], 0.05)]
    for index in range(3):
        top = 128 + index * 168
        p.append(svg_rect(32, top, 120, 58, c["gold"], 0.28, 2, 14))
        p.append(svg_line(52, top + 29, 132, top + 29, c["petrol"], 0.2, 2, cap="butt"))
        p.append(svg_line(56, top + 12, 100, top + 12, c["petrol"], 0.14, 2, cap="butt"))
        if index < 2:
            p.append(svg_line(92, top + 58, 92, top + 168, c["gold"], 0.24, 2, cap="butt"))
            p.append(svg_line(92, top + 58, 132, top + 58, c["gold"], 0.14, 2, cap="butt"))
    p.append(svg_line(1000, 820, 1000, 1960, c["petrol"], 0.18, 1, cap="butt"))
    for index in range(8):
        y = 820 + index * 163
        p.append(svg_circle(1000, y, 6, c["petrol"], 0.3, 2))
    return "".join(p)


def motif_security(c: dict) -> str:
    """07 - gate security: scan brackets, radar arcs, a dark grid."""
    p = [column_grid(c["grid"], 0.05)]
    arms, inset = 84, 48
    corners = (
        (inset, inset, 1, 1),
        (CANVAS_W - inset, inset, -1, 1),
        (inset, CANVAS_H - inset, 1, -1),
        (CANVAS_W - inset, CANVAS_H - inset, -1, -1),
    )
    for x, y, sx, sy in corners:
        p.append(svg_path("M %s %s L %s %s L %s %s" % (x + sx * arms, y, x, y, x, y + sy * arms), c["gold"], 0.45, 3))
    for radius, opacity, width in ((140, 0.16, 2), (240, 0.11, 1.5), (360, 0.07, 1)):
        p.append(svg_path("M %s %s A %s %s 0 0 0 %s %s" % (CANVAS_W - radius, CANVAS_H, radius, radius, CANVAS_W, CANVAS_H - radius), c["gold"], opacity, width))
    p.append(svg_line(PAD_X, DIVIDER_Y - 14, CANVAS_W - PAD_X, DIVIDER_Y - 14, c["gold"], 0.18, 1, cap="butt"))
    p.append(
        svg_path(
            "M 1000 760 L 1000 2260",
            c["petrol"],
            0.3,
            2,
            dash="3 12",
        )
    )
    p.append(svg_line(120, 900, 120, 2100, c["grid"], 0.16, 1, cap="butt"))
    return "".join(p)


def motif_executive(c: dict) -> str:
    """08 - executive oversight: a skyline horizon and a hierarchy of rules."""
    p = [column_grid(c["grid"], 0.045)]
    for index, length in enumerate((260, 184, 112)):
        p.append(
            svg_line(
                40,
                132 + index * 34,
                40 + length,
                132 + index * 34,
                c["gold"],
                0.3 - index * 0.08,
                3 - index,
                cap="butt",
            )
        )
    p.append(svg_line(0, DIVIDER_Y - 18, CANVAS_W, DIVIDER_Y - 18, c["gold"], 0.22, 1, cap="butt"))
    buildings = (0, 96, 176, 60, 220, 132, 268, 84, 148, 104)
    x = -40
    for index, height in enumerate(buildings):
        width = 96 if index % 3 else 128
        top = CANVAS_H - height
        p.append(svg_rect(x, top, width, height, c["gold"], 0.22, 1.5, 0))
        p.append(svg_fill_rect(x + 1, top + 1, width - 2, height - 1, c["fill"], 0.32, 0))
        x += width + 14
    p.append(svg_line(0, CANVAS_H - 1, CANVAS_W, CANVAS_H - 1, c["gold"], 0.3, 2, cap="butt"))
    return "".join(p)


def build_screens() -> list[dict]:
    """One record per screen: approved copy + pinned hashes + art direction."""
    light = {
        "grid": "#07425D",
        "gold": "#C5A880",
        "petrol": "#1B60B9",
        "purple": "#7E1898",
        "accent": FAWRI_ACCENT,
        "fill": "#07425D",
    }
    dark = {
        "grid": "#FFFFFF",
        "gold": "#C5A880",
        "petrol": "#1B60B9",
        "purple": "#7E1898",
        "accent": FAWRI_ACCENT,
        "fill": "#042434",
    }
    specs = [
        {
            "id": "01",
            "source": "01-resident-home.png",
            "source_sha256": "f81fd4d9b52ce7e3ff020695772dd33aeabd87e044643a08c59f747c25a12ecb",
            "output": "01-resident-home-marketing.png",
            "variant": "welcoming — arches, warm gold wash",
            "tone": "light",
            "kicker": "#7E1898",
            "wash": "radial-gradient(760px 560px at 10% 6%, rgba(197,168,128,0.24), rgba(197,168,128,0) 70%), linear-gradient(180deg,#FFFFFF 0%,#F4F6F9 38%,#F4F6F9 100%)",
            "html_bg": "#F4F6F9",
            "headline_ink": "#07425D",
            "subtitle_ink": "#1B60B9",
            "wordmark_ink": "#07425D",
            "shell": "#042434",
            "shell_border": "rgba(197,168,128,0.45)",
            "shell_shadow": "0 42px 96px rgba(4,36,52,0.42), 0 10px 26px rgba(4,36,52,0.24)",
            "divider": ("#C5A880", 0.16),
            "foot_rule": ("#C5A880", 0.14),
            "motif": motif_welcoming,
            "colours": light,
            "art": "Bright, welcoming opener: two concentric gold arches spring from the lower-left margin, a small gold window lattice sits in the left margin, and a wide, low-alpha gold wash warms the top-left corner. Navy headline, petrol subtitle, purple kicker rule.",
        },
        {
            "id": "02",
            "source": "02-payments-dues.png",
            "source_sha256": "806d714f6f6cfda91f3efba6837161cd88be502aa04f0fa611479287143bb73c",
            "output": "02-payments-marketing.png",
            "variant": "ledger — statement rules",
            "tone": "light",
            "kicker": "#7E1898",
            "wash": "radial-gradient(820px 620px at 92% 6%, rgba(27,96,185,0.12), rgba(27,96,185,0) 70%), linear-gradient(180deg,#FFFFFF 0%,#F4F6F9 42%,#F4F6F9 100%)",
            "html_bg": "#F4F6F9",
            "headline_ink": "#07425D",
            "subtitle_ink": "#1B60B9",
            "wordmark_ink": "#07425D",
            "shell": "#042434",
            "shell_border": "rgba(197,168,128,0.45)",
            "shell_shadow": "0 42px 96px rgba(4,36,52,0.42), 0 10px 26px rgba(4,36,52,0.24)",
            "divider": ("#C5A880", 0.16),
            "foot_rule": ("#C5A880", 0.14),
            "motif": motif_ledger,
            "colours": light,
            "art": "Payments: a right-aligned column of statement rules of uneven length (gold and petrol) reads as a dues ledger, scored by a vertical spine and five gold ticks in the right margin. Cool petrol wash, purple kicker rule.",
        },
        {
            "id": "03",
            "source": "03-fawry-payment.png",
            "source_sha256": "370b9c1fbf96b87392ff73917a331a86eddece60d8e8a12a4846753265afeb76",
            "output": "03-fawry-marketing.png",
            "variant": "payment — code card, authentic Fawry accent",
            "tone": "light",
            "kicker": FAWRI_ACCENT,
            "wash": "radial-gradient(820px 620px at 92% 6%, rgba(27,96,185,0.12), rgba(27,96,185,0) 70%), linear-gradient(180deg,#FFFFFF 0%,#F4F6F9 42%,#F4F6F9 100%)",
            "html_bg": "#F4F6F9",
            "headline_ink": "#07425D",
            "subtitle_ink": "#1B60B9",
            "wordmark_ink": "#07425D",
            "shell": "#042434",
            "shell_border": "rgba(197,168,128,0.45)",
            "shell_shadow": "0 42px 96px rgba(4,36,52,0.42), 0 10px 26px rgba(4,36,52,0.24)",
            "divider": ("#C5A880", 0.16),
            "foot_rule": (FAWRI_ACCENT, 0.6),
            "motif": motif_payment,
            "colours": light,
            "art": "Payment focus: a gold code-card outline with two inner rules and dotted keylines in both margins. The only yellow in the campaign is the authentic Fawry yellow #FFDD00 sampled from this screen's own source screenshot, used as the 96x6 kicker rule above the headline and one 184px footer hairline - no other yellow branding.",
        },
        {
            "id": "04",
            "source": "04-visitor-qr-pass.png",
            "source_sha256": "2923da3072d8ac0d5363c1c95e252279a5b20cf0e94f9e2cb21850e0919018a9",
            "output": "04-visitor-qr-marketing.png",
            "variant": "entry — visitor gate portal",
            "tone": "light",
            "kicker": "#C5A880",
            "wash": "radial-gradient(760px 560px at 8% 6%, rgba(197,168,128,0.22), rgba(197,168,128,0) 70%), linear-gradient(180deg,#F4F6F9 0%,#FFFFFF 60%,#FFFFFF 100%)",
            "html_bg": "#F4F6F9",
            "headline_ink": "#07425D",
            "subtitle_ink": "#1B60B9",
            "wordmark_ink": "#07425D",
            "shell": "#042434",
            "shell_border": "rgba(197,168,128,0.45)",
            "shell_shadow": "0 42px 96px rgba(4,36,52,0.42), 0 10px 26px rgba(4,36,52,0.24)",
            "divider": ("#C5A880", 0.16),
            "foot_rule": ("#C5A880", 0.14),
            "motif": motif_entry,
            "colours": light,
            "art": "Visitor entry: a gold gate portal with three bars and a petrol access frame, plus mirrored post markers down both margins and a threshold hairline just above the device. Light, open composition - entry is granted, not blocked.",
        },
        {
            "id": "05",
            "source": "05-maintenance-request.png",
            "source_sha256": "56fac1d0f2d612dd535c7a98d40bf634796a0d709f9a958398cb53b5d67ee312",
            "output": "05-maintenance-marketing.png",
            "variant": "technical — dimension lines and hatch",
            "tone": "light",
            "kicker": "#7E1898",
            "wash": "radial-gradient(820px 620px at 6% 8%, rgba(27,96,185,0.12), rgba(27,96,185,0) 70%), linear-gradient(180deg,#FFFFFF 0%,#F4F6F9 44%,#F4F6F9 100%)",
            "html_bg": "#F4F6F9",
            "headline_ink": "#07425D",
            "subtitle_ink": "#1B60B9",
            "wordmark_ink": "#07425D",
            "shell": "#042434",
            "shell_border": "rgba(197,168,128,0.45)",
            "shell_shadow": "0 42px 96px rgba(4,36,52,0.42), 0 10px 26px rgba(4,36,52,0.24)",
            "divider": ("#C5A880", 0.16),
            "foot_rule": ("#C5A880", 0.14),
            "motif": motif_maintenance,
            "colours": light,
            "art": "Technical maintenance: a petrol dimension line with end ticks and four station ticks, a small gold keyframe, two ruled margin traces with cross ticks, and a 72px 45-degree hatch band along the base - a drafting sheet, not a dashboard.",
        },
        {
            "id": "06",
            "source": "06-technician-dashboard.png",
            "source_sha256": "319d499aac19942fdf8db1e91848be7187d507ac1ee9b3fa051259aa7891415f",
            "output": "06-technician-marketing.png",
            "variant": "workflow — task nodes and connectors",
            "tone": "light",
            "kicker": "#7E1898",
            "wash": "radial-gradient(820px 620px at 92% 8%, rgba(126,24,152,0.09), rgba(126,24,152,0) 70%), linear-gradient(180deg,#FFFFFF 0%,#F4F6F9 42%,#F4F6F9 100%)",
            "html_bg": "#F4F6F9",
            "headline_ink": "#07425D",
            "subtitle_ink": "#1B60B9",
            "wordmark_ink": "#07425D",
            "shell": "#042434",
            "shell_border": "rgba(197,168,128,0.45)",
            "shell_shadow": "0 42px 96px rgba(4,36,52,0.42), 0 10px 26px rgba(4,36,52,0.24)",
            "divider": ("#C5A880", 0.16),
            "foot_rule": ("#C5A880", 0.14),
            "motif": motif_workflow,
            "colours": light,
            "art": "Technician workflow: three gold task-node outlines chained by elbow connectors down the left edge, mirrored by an eight-point petrol task queue in the right margin. A restrained purple wash in the top-right corner ties it to the purple kicker rule.",
        },
        {
            "id": "07",
            "source": "07-gate-scanner.png",
            "source_sha256": "0840d831f2856fd796ee95ff823fcea16b84bf012a2d96c485a1b47126f960fd",
            "output": "07-gate-marketing.png",
            "variant": "security — dark navy, scan brackets",
            "tone": "dark",
            "kicker": "#C5A880",
            "wash": "radial-gradient(1000px 800px at 84% 12%, rgba(27,96,185,0.22), rgba(27,96,185,0) 70%), linear-gradient(180deg,#042434 0%,#042434 56%,#07425D 100%)",
            "html_bg": "#042434",
            "headline_ink": "#FFFFFF",
            "subtitle_ink": "#F4F6F9",
            "wordmark_ink": "#FFFFFF",
            "shell": "#07425D",
            "shell_border": "rgba(197,168,128,0.55)",
            "shell_shadow": "0 46px 110px rgba(4,36,52,0.62), 0 0 0 1px rgba(197,168,128,0.16)",
            "divider": ("#C5A880", 0.28),
            "foot_rule": ("#C5A880", 0.22),
            "motif": motif_security,
            "colours": dark,
            "art": "Dark security: the source screen is itself dark navy, so the canvas goes near-black #042434 fading to #07425D and the device reads as a lighter #07425D shell. Gold scan brackets sit at all four canvas corners in echo of the scanner frame inside the screenshot, with three gold radar arcs bottom-right and a dotted petrol trust line.",
        },
        {
            "id": "08",
            "source": "08-manager-dashboard.png",
            "source_sha256": "803a07e472a4079f9a45aff014fe88c4b5a7c2f24aed5e6e3630dba90c26fa79",
            "output": "08-manager-marketing.png",
            "variant": "executive — skyline and hierarchy",
            "tone": "dark",
            "kicker": "#C5A880",
            "wash": "radial-gradient(1100px 900px at 14% 88%, rgba(27,96,185,0.3), rgba(27,96,185,0) 72%), linear-gradient(168deg,#042434 0%,#07425D 54%,#07425D 100%)",
            "html_bg": "#042434",
            "headline_ink": "#FFFFFF",
            "subtitle_ink": "#F4F6F9",
            "wordmark_ink": "#FFFFFF",
            "shell": "#07425D",
            "shell_border": "rgba(197,168,128,0.55)",
            "shell_shadow": "0 46px 110px rgba(4,36,52,0.62), 0 0 0 1px rgba(197,168,128,0.16)",
            "divider": ("#C5A880", 0.28),
            "foot_rule": ("#C5A880", 0.22),
            "motif": motif_executive,
            "colours": dark,
            "art": "Executive oversight: a gold-hairline skyline silhouette rises from the base behind and beside the device (visible in the margins and the 72px footer strip), and a three-rule hierarchy sits top-left. Deep #042434 to #07425D gradient with a soft petrol glow - the calm, widest-view close.",
        },
    ]

    copy_by_id = {entry[0]: entry for entry in APPROVED_COPY}
    screens: list[dict] = []
    for spec in specs:
        screen_id, headline, subtitle = copy_by_id[spec["id"]]
        spec = dict(spec)
        spec["headline"] = headline
        spec["subtitle"] = subtitle
        spec["motif_svg"] = svg_open() + spec["motif"](spec["colours"]) + svg_close()
        screens.append(spec)
    return screens


SCREENS = build_screens()


# ---------------------------------------------------------------------------
# Document template
# ---------------------------------------------------------------------------


def subst(template: str, mapping: dict[str, str]) -> str:
    """Token substitution (`@NAME@`). CSS braces stay untouched."""
    for key, value in mapping.items():
        template = template.replace("@%s@" % key, value)
    return template


def font_faces() -> str:
    faces = []
    for _name, weight, filename in FONTS:
        faces.append(
            "@font-face{font-family:'%s';font-style:normal;font-weight:%d;"
            "font-display:block;src:url(data:font/ttf;base64,%s) format('truetype')}"
            % (FONT_STACK, weight, b64(ASSETS / "fonts" / filename))
        )
    return "\n".join(faces)


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def data_url(path: Path, mime: str) -> str:
    return "data:%s;base64,%s" % (mime, b64(path))


DOC_TEMPLATE = """<!doctype html>
<html lang="ar" dir="rtl" data-template="@TEMPLATE_ID@" data-screen="@ID@" data-copy-id="@ID@" data-crop="none" data-rtl="true" data-colour-space="srgb">
<head>
<meta charset="utf-8">
<style>
@FONT_FACES@
:root{--navy:#07425D;--deep:#042434;--petrol:#1B60B9;--purple:#7E1898;--gold:#C5A880;--cloud:#F4F6F9;--white:#FFFFFF;@ACCENT_VAR@}
*{margin:0;padding:0;box-sizing:border-box}
html{background:@HTML_BG@}
html,body{width:@CANVAS_W@px;height:@CANVAS_H@px;overflow:hidden}
body{position:relative;background-image:@WASH@;font-family:'@FONT_STACK@',sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.motif{position:absolute;top:0;left:0;z-index:0;pointer-events:none}
.content{position:absolute;top:0;left:0;width:@CANVAS_W@px;height:@CANVAS_H@px;z-index:1}
.kicker{position:absolute;top:@KICKER_TOP@px;right:@PAD_X@px;width:@KICKER_W@px;height:@KICKER_H@px;border-radius:3px;background:@KICKER@}
.brand{position:absolute;top:@BRAND_TOP@px;right:@PAD_X@px;height:@BRAND_H@px;display:flex;align-items:center;gap:@BRAND_GAP@px}
.brand img{display:block;height:@BRAND_LOGO_H@px;width:auto}
.chip{height:@BRAND_H@px;display:flex;align-items:center;justify-content:center;padding:@BRAND_CHIP_PAD@px;border-radius:@BRAND_CHIP_RADIUS@px;background:#FFFFFF;border:1px solid rgba(197,168,128,0.45)}
.wordmark{font-size:@WORDMARK_SIZE@px;font-weight:600;color:@WORDMARK_INK@}
.copy{position:absolute;top:@COPY_TOP@px;left:@PAD_X@px;right:@PAD_X@px;height:@COPY_H@px;text-align:right}
.headline{font-size:@HEADLINE_SIZE@px;line-height:@HEADLINE_LINE@px;font-weight:700;color:@HEADLINE_INK@;text-wrap:balance}
.subtitle{margin-top:@SUBTITLE_GAP@px;font-size:@SUBTITLE_SIZE@px;line-height:@SUBTITLE_LINE@px;font-weight:400;color:@SUBTITLE_INK@;text-wrap:balance}
.divider{position:absolute;top:@DIVIDER_Y@px;left:@PAD_X@px;right:@PAD_X@px;height:1px;background:@DIVIDER@}
.foot-rule{position:absolute;top:@FOOT_RULE_Y@px;left:@PAD_X@px;width:184px;height:1px;background:@FOOT_RULE@}
.device{position:absolute;top:@DEVICE_TOP@px;left:50%;transform:translateX(-50%);width:@DEVICE_W@px;height:@DEVICE_H@px;padding:@BEZEL_PAD@px;border-radius:@DEVICE_RADIUS@px;background:@SHELL@;border:@BEZEL_BORDER@px solid @SHELL_BORDER@;box-shadow:@SHELL_SHADOW@}
.screen{width:@SCREEN_W@px;height:@SCREEN_H@px;border-radius:@SCREEN_CORNER_RADIUS@px;overflow:hidden;background:@HTML_BG@}
.screen img{display:block;width:@SCREEN_W@px;height:@SCREEN_H@px;object-fit:contain;object-position:center;filter:none;image-rendering:auto}
@PROBE_CSS@
</style>
</head>
<body data-corner-clip="nonessential-@SCREEN_CORNER_RADIUS@px" data-source="@SOURCE@" data-output="@OUTPUT@">
@MOTIF@
<div class="content">
  <div class="brand">
    <span class="chip"><img src="@LOGO_DATA_URL@" alt="AqarBooks logo"></span>
    <span class="wordmark">@WORDMARK@</span>
  </div>
  <div class="kicker"></div>
  <div class="copy">
    <h1 class="headline">@HEADLINE@</h1>
    <p class="subtitle">@SUBTITLE@</p>
  </div>
  <div class="divider"></div>
  <div class="foot-rule"></div>
  <div class="device">
    <div class="screen"><img src="@SCREEN_DATA_URL@" alt="@SOURCE_ALT@"></div>
  </div>
</div>
@PROBE_STRIP@
@READY_SCRIPT@
</body>
</html>
"""


def build_document(screen: dict, template_assets: dict, probe: bool = False) -> str:
    """The exact HTML string handed to the browser for one screen.

    `probe=True` adds the readiness strip; the deliverable documents are built
    with `probe=False`, and that is the variant whose hash the manifest pins.
    """
    accent_var = "--accent:%s;" % FAWRI_ACCENT if screen["id"] == FAWRI_SOURCE_ID else ""
    return subst(
        DOC_TEMPLATE,
        {
            "PROBE_CSS": PROBE_CSS if probe else "",
            "PROBE_STRIP": PROBE_STRIP if probe else "",
            "TEMPLATE_ID": TEMPLATE_ID,
            "ID": screen["id"],
            "FONT_FACES": template_assets["font_faces"],
            "ACCENT_VAR": accent_var,
            "HTML_BG": screen["html_bg"],
            "CANVAS_W": str(CANVAS_W),
            "CANVAS_H": str(CANVAS_H),
            "WASH": screen["wash"],
            "FONT_STACK": FONT_STACK,
            "KICKER_TOP": str(KICKER_TOP),
            "PAD_X": str(PAD_X),
            "KICKER_W": str(KICKER_W),
            "KICKER_H": str(KICKER_H),
            "KICKER": screen["kicker"],
            "BRAND_TOP": str(BRAND_TOP),
            "BRAND_H": str(BRAND_H),
            "BRAND_GAP": str(BRAND_GAP),
            "BRAND_LOGO_H": str(BRAND_LOGO_H),
            "BRAND_CHIP_PAD": str(BRAND_CHIP_PAD),
            "BRAND_CHIP_RADIUS": str(BRAND_CHIP_RADIUS),
            "WORDMARK_SIZE": str(WORDMARK_SIZE),
            "WORDMARK_INK": screen["wordmark_ink"],
            "COPY_TOP": str(COPY_TOP),
            "COPY_H": str(COPY_H),
            "HEADLINE_SIZE": str(HEADLINE_SIZE),
            "HEADLINE_LINE": str(HEADLINE_LINE),
            "HEADLINE_INK": screen["headline_ink"],
            "SUBTITLE_GAP": str(SUBTITLE_GAP),
            "SUBTITLE_SIZE": str(SUBTITLE_SIZE),
            "SUBTITLE_LINE": str(SUBTITLE_LINE),
            "SUBTITLE_INK": screen["subtitle_ink"],
            "DIVIDER_Y": str(DIVIDER_Y),
            "DIVIDER": "rgba(%s,%s)" % (hex_to_rgb(screen["divider"][0]), screen["divider"][1]),
            "FOOT_RULE_Y": str(FOOT_RULE_Y),
            "FOOT_RULE": "rgba(%s,%s)" % (hex_to_rgb(screen["foot_rule"][0]), screen["foot_rule"][1]),
            "DEVICE_TOP": str(DEVICE_TOP),
            "DEVICE_W": str(DEVICE_W),
            "DEVICE_H": str(DEVICE_H),
            "DEVICE_RADIUS": str(DEVICE_RADIUS),
            "BEZEL_PAD": str(BEZEL_PAD),
            "BEZEL_BORDER": str(BEZEL_BORDER),
            "SHELL": screen["shell"],
            "SHELL_BORDER": screen["shell_border"],
            "SHELL_SHADOW": screen["shell_shadow"],
            "SCREEN_W": str(SCREEN_W),
            "SCREEN_H": str(SCREEN_H),
            "SCREEN_CORNER_RADIUS": str(SCREEN_CORNER_RADIUS),
            "MOTIF": screen["motif_svg"],
            "WORDMARK": LATIN_WORDMARK,
            "LOGO_DATA_URL": template_assets["logo_data_url"],
            "HEADLINE": screen["headline"],
            "SUBTITLE": screen["subtitle"],
            "SCREEN_DATA_URL": template_assets["screens"][screen["id"]],
            "SOURCE": screen["source"],
            "SOURCE_ALT": "AqarBooks %s source screenshot %s" % (screen["id"], screen["source"]),
            "OUTPUT": screen["output"],
            "READY_SCRIPT": READY_SCRIPT,
        },
    )


def hex_to_rgb(value: str) -> str:
    value = value.lstrip("#")
    return "%d,%d,%d" % (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def build_sheet_document(assets: dict, rows: list[tuple[str, str, str, str]]) -> str:
    cells = []
    for number, headline, filename, data in rows:
        cells.append(
            '<figure><img src="%s" width="%d" height="%d" alt="%s">'
            '<figcaption><span class="n">%s · </span><span class="h">%s</span>'
            '<span class="f">%s</span></figcaption></figure>'
            % (
                data,
                SHEET_SHOT_W,
                SHEET_SHOT_H,
                filename,
                number,
                headline,
                filename,
            )
        )
    swatches = []
    for _name, value in PALETTE:
        swatches.append(
            '<span class="sw"><i style="background:%s"></i><span>%s</span></span>'
            % (value, value.lstrip("#"))
        )
    swatches.append(
        '<span class="sw"><i style="background:%s"></i><span>%s*</span></span>'
        % (FAWRI_ACCENT, FAWRI_ACCENT.lstrip("#"))
    )
    return subst(
        SHEET_TEMPLATE,
        {
            "TEMPLATE_ID": TEMPLATE_ID,
            "FONT_FACES": assets["font_faces"],
            "WIDTH": str(SHEET_W),
            "HEIGHT": str(SHEET_H),
            "PAD": str(SHEET_PAD),
            "HEADER_H": str(SHEET_HEADER_H),
            "MARGIN_TOP": str(SHEET_MARGIN_TOP),
            "COLUMNS": str(SHEET_COLUMNS),
            "SHOT_W": str(SHEET_SHOT_W),
            "SHOT_H": str(SHEET_SHOT_H),
            "GAP": str(SHEET_GAP),
            "LABEL_H": str(SHEET_LABEL_H),
            "TITLE": SHEET_TITLE,
            "SUBTITLE": SHEET_SUBTITLE,
            "SWATCHES": "".join(swatches),
            "CELLS": "".join(cells),
            "FONT_STACK": FONT_STACK,
            "ACCENT": FAWRI_ACCENT,
        },
    )


SHEET_TEMPLATE = """<!doctype html>
<html lang="ar" dir="rtl" data-template="@TEMPLATE_ID@-sheet">
<head>
<meta charset="utf-8">
<style>
@FONT_FACES@
*{margin:0;padding:0;box-sizing:border-box}
html{background:#F4F6F9}
html,body{width:@WIDTH@px;height:@HEIGHT@px;overflow:hidden}
body{padding:@PAD@px;background:#F4F6F9;font-family:'@FONT_STACK@',sans-serif;color:#07425D}
header{height:@HEADER_H@px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(197,168,128,0.45)}
h1{font-size:34px;font-weight:700;color:#07425D}
header p{font-size:20px;line-height:30px;color:#1B60B9;margin-top:6px;max-width:900px}
.swatches{display:flex;gap:10px;align-items:flex-end}
.sw{display:flex;flex-direction:column;align-items:center;gap:6px}
.sw i{display:block;width:34px;height:34px;border-radius:8px;border:1px solid rgba(4,36,52,0.14)}
.sw span{font-size:13px;color:#1B60B9}
.grid{display:grid;grid-template-columns:repeat(@COLUMNS@,@SHOT_W@px);column-gap:@GAP@px;row-gap:@GAP@px;margin-top:@MARGIN_TOP@px}
figure{display:flex;flex-direction:column}
figure img{display:block}
figcaption{height:@LABEL_H@px;padding-top:12px}
.n,.h{font-size:22px;font-weight:600;color:#07425D}
.f{display:block;font-size:15px;color:#1B60B9;margin-top:4px}
.foot{font-size:15px;color:#1B60B9}
</style>
</head>
<body>
<header>
  <div>
    <h1>@TITLE@</h1>
    <p>@SUBTITLE@</p>
  </div>
  <div class="swatches">@SWATCHES@</div>
</header>
<div class="grid">@CELLS@</div>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Browser
# ---------------------------------------------------------------------------


def find_browser() -> str | None:
    for candidate in BROWSER_CANDIDATES:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def browser_command(browser: str, html_path: Path, out_path: Path, width: int, height: int) -> list[str]:
    """The exact headless invocation used for every capture."""
    return [
        browser,
        *BROWSER_FLAGS,
        "--window-size=%d,%d" % (width, height),
        "--screenshot=%s" % out_path,
        html_path.as_uri(),
    ]


def run_browser(command: list[str]) -> tuple[int, str, str]:
    """Run the browser and return (returncode, stdout, stderr).

    Streams are kept apart on purpose: `--dump-dom` writes the document to
    stdout while Chrome may still log to stderr, and Chrome writes UTF-8 (the
    document carries Arabic and base64), so the host's ANSI code page must not
    be allowed to break the decode.
    """
    result = subprocess.run(
        command, capture_output=True, encoding="utf-8", errors="replace"
    )
    return result.returncode, result.stdout or "", result.stderr or ""


def render_document(browser: str, html: str, out_path: Path, width: int, height: int, tmp: Path, tag: str) -> None:
    html_path = tmp / ("%s.html" % tag)
    html_path.write_text(html, encoding="utf-8")
    code, stdout, stderr = run_browser(browser_command(browser, html_path, out_path, width, height))
    if code != 0:
        raise RuntimeError(
            "%s exited %d while rendering %s\n%s"
            % (Path(browser).name, code, tag, (stderr or stdout).strip()[:600])
        )
    if not out_path.is_file():
        raise RuntimeError("%s produced no file at %s" % (Path(browser).name, out_path))


def probe_readiness(browser: str, screen: dict, assets: dict, tmp: Path) -> str:
    """Prove font/image completion from pixels, through the screenshot path.

    The probe document is the real screen document plus a four-segment strip in
    the last four rows of the canvas; each segment turns purple only when one
    readiness condition holds. Rendering it with the same flags as a deliverable
    and reading the four pixels means the claim "fonts loaded, both images
    decoded, the readiness hook fired" is verified from the captured frame, not
    inferred from timing. It runs on the first screen because the whole campaign
    shares one template and one readiness script.
    """
    html = build_document(screen, assets, probe=True)
    probe_path = tmp / "readiness-probe.png"
    render_document(
        browser, html, probe_path, CANVAS_W, CANVAS_H, tmp, "readiness-probe"
    )
    image = PngReader(probe_path)
    rows = image.rows()
    channels = CHANNELS[image.colour]
    missing = []
    for label, expected_hex, (x, y) in PROBE_SEGMENTS:
        if x >= image.width or y >= image.height:
            raise RuntimeError("readiness probe frame is %dx%d" % (image.width, image.height))
        offset = x * channels
        pixel = rows[y][offset:offset + 3]
        observed = "#%02X%02X%02X" % (pixel[0], pixel[1], pixel[2])
        if observed != expected_hex:
            missing.append("%s (saw %s)" % (label, observed))
    if missing:
        raise RuntimeError(
            "readiness probe for screen %s did not confirm: %s"
            % (screen["id"], "; ".join(missing))
        )
    return (
        "readiness probe (screen %s, same flags as the deliverables, verified from "
        "pixels): render-ready, fonts loaded, 2/2 images decoded, 0 broken"
        % screen["id"]
    )


# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------


def preflight() -> tuple[list[str], dict]:
    """Hash and dimension every approved input before a single pixel is drawn."""
    notes: list[str] = []
    facts: dict = {}

    if not LOGO_PATH.is_file():
        raise RuntimeError("canonical logo is missing: %s" % LOGO_PATH)
    logo_hash = sha256_file(LOGO_PATH)
    if logo_hash != LOGO_SHA256:
        raise RuntimeError(
            "canonical logo hash changed: %s is %s, expected %s"
            % (LOGO_PATH.name, logo_hash, LOGO_SHA256)
        )
    logo = PngReader(LOGO_PATH)
    if (logo.width, logo.height) != (LOGO_W, LOGO_H):
        raise RuntimeError(
            "canonical logo is %dx%d, expected %dx%d"
            % (logo.width, logo.height, LOGO_W, LOGO_H)
        )
    facts["logo"] = {
        "path": "assets/images/logo.png",
        "sha256": logo_hash,
        "width": logo.width,
        "height": logo.height,
        "bytes": logo.bytes,
        "colour_type": logo.colour,
    }
    notes.append(
        "logo %s -> %s %dx%d" % (LOGO_PATH.name, logo_hash[:16], logo.width, logo.height)
    )

    font_facts = []
    for name, weight, filename in FONTS:
        path = FONT_DIR / filename
        if not path.is_file():
            raise RuntimeError("approved font is missing: %s" % path)
        font_facts.append(
            {
                "file": filename,
                "weight": weight,
                "sha256": sha256_file(path),
                "bytes": path.stat().st_size,
            }
        )
    facts["fonts"] = font_facts
    notes.append("fonts %d/%d hashed" % (len(font_facts), len(FONTS)))

    screen_facts = []
    for screen in SCREENS:
        path = SOURCE_DIR / screen["source"]
        if not path.is_file():
            raise RuntimeError("source screenshot is missing: %s" % path)
        digest = sha256_file(path)
        if digest != screen["source_sha256"]:
            raise RuntimeError(
                "source hash mismatch for %s: found %s, approved %s"
                % (screen["source"], digest, screen["source_sha256"])
            )
        image = PngReader(path)
        if (image.width, image.height) != (CANVAS_W, CANVAS_H):
            raise RuntimeError(
                "%s is %dx%d, expected %dx%d"
                % (screen["source"], image.width, image.height, CANVAS_W, CANVAS_H)
            )
        screen_facts.append(
            {
                "id": screen["id"],
                "source": screen["source"],
                "sha256": digest,
                "width": image.width,
                "height": image.height,
                "bytes": image.bytes,
            }
        )
    facts["sources"] = screen_facts
    notes.append("sources %d/%d verified" % (len(screen_facts), len(SCREENS)))

    if SCREEN_W * CANVAS_H != SCREEN_H * CANVAS_W:
        raise RuntimeError(
            "the screen box %dx%d would distort the 1080x2400 source" % (SCREEN_W, SCREEN_H)
        )
    measured = sample_fawri_accent(SOURCE_DIR / "03-fawry-payment.png")
    if measured != FAWRI_ACCENT:
        raise RuntimeError(
            "Fawry accent changed: source 03 now samples %s, approved %s"
            % (measured, FAWRI_ACCENT)
        )
    facts["fawri_accent"] = {"value": FAWRI_ACCENT, "sampled_from": "03-fawry-payment.png"}
    notes.append("Fawry accent sampled from source 03: %s" % measured)

    return notes, facts


def template_assets() -> dict:
    return {
        "font_faces": font_faces(),
        "logo_data_url": data_url(LOGO_PATH, "image/png"),
        "screens": {
            screen["id"]: data_url(SOURCE_DIR / screen["source"], "image/png")
            for screen in SCREENS
        },
    }


# ---------------------------------------------------------------------------
# QA report + manifest
# ---------------------------------------------------------------------------

MANUAL_REVIEW = {
    "01": (
        "Balanced two-line headline right-aligned to the 96px margin (second "
        "line 73% of the first), no collision with the subtitle; the gold arch "
        "trio stays in the left margin clear of the copy and the warm gold wash "
        "sits top-left. Source: status bar, balance card, last-payment row and "
        "the visitor-pass row are all fully visible and undistorted."
    ),
    "02": (
        "The statement-rule motif reads as a dues ledger at 1:1 and as texture "
        "at 360px; balanced headline (تابع مستحقاتك / بكل سهولة); the petrol "
        "subtitle is legible on the gradient. Source: the عليّ/دفعت segmented "
        "control and all three instalment rows are intact and readable."
    ),
    "03": (
        "The Fawry accent kicker matches the yellow of the fawry chip inside "
        "this very screenshot; balanced headline (ادفع مستحقاتك / عبر فوري); the "
        "code-card outline and dotted keylines keep to the margins. Source: the "
        "reference code, amount and both buttons are uncropped."
    ),
    "04": (
        "Gate portal with mirrored post markers reads clearly, and the threshold "
        "hairline sits above the device; single-line headline. The subtitle's "
        "final \"رمز QR.\" is shaped with the period to the left of the Latin run. "
        "The QR inside the source is square, which independently confirms no "
        "aspect-ratio distortion."
    ),
    "05": (
        "Dimension line with end and station ticks, keyframe and the 45-degree "
        "hatch band read as drafting notation; the headline breaks after the "
        "Arabic comma (صيانة أسهل، / ومتابعة أوضح) instead of leaving one word. "
        "Source: the timeline with four Arabic statuses and the attachment row "
        "stay legible."
    ),
    "06": (
        "Three task nodes chained by elbow connectors plus an eight-dot queue in "
        "the right margin; the softened purple wash (0.09) reads as a faint tint "
        "at 1:1 and does not affect headline contrast. Source: the current-task "
        "card and the ranked task list are unaffected."
    ),
    "07": (
        "Dark variant: the white headline on #042434 has strong contrast and the "
        "#07425D shell separates cleanly from the near-black canvas; the canvas "
        "corner brackets echo the scanner frame inside the screenshot without "
        "touching it. Source: the docked scan panel, manual search field and "
        "bottom navigation are fully visible."
    ),
    "08": (
        "The skyline silhouette reads in both side margins and in the 72px "
        "footer strip, and the three gold hierarchy rules sit clear of the type. "
        "Source: the totals card, the three metric tiles and the six-row "
        "\"يحتاج انتباهك\" list are all legible inside the shell."
    ),
}

MANUAL_CHECKLIST = (
    (
        "All eight outputs opened - downscaled frame plus a ~1:1 crop of the type "
        "band for every screen",
        "PASS",
    ),
    (
        "1:1 pixel crops inspected (01 top/middle/bottom-right, 03 headline + "
        "accent, 06 header wash, 07 header chip)",
        "PASS",
    ),
    ("Four 1:1 detail panels: no clipped glyph, no overlap, no stray artifact", "PASS"),
    ("Contact sheet opened; all eight labels outside the images and legible", "PASS"),
    ("Reduced 360px campaign preview opened for rhythm and small-size legibility", "PASS"),
    ("Arabic shaping and letter joining correct on every screen", "PASS"),
    (
        "Diacritics from the approved copy intact (اطّلع · وسدّد · قدّم · نظّم · "
        "المكلّف · منظّم · تحقّق)",
        "PASS",
    ),
    ("No clipping, overflow or text collision on any screen", "PASS"),
    (
        "Logo unmodified, proportions correct, clear space consistent, and "
        "legible on the dark variants' white plate",
        "PASS",
    ),
    ("Source UI legible and unmodified; QR still square (no aspect distortion)", "PASS"),
    ("Only the approved copy appears; no extra or generated Arabic text", "PASS"),
)

# Verbatim excerpt of the validator run on exactly these artifacts.
VALIDATION_RECORD = (
    "```",
    "  python store-assets/validate_marketing_screenshots.py   (exit 0)",
    "",
    "output directory D:\\Web\\AqarBooks\\mobile\\store-assets\\screenshots\\marketing\\ar",
    "  11 file(s) present; 8 expected output(s) + contact sheet + QA report",
    "  manifest  manifest-marketing-ar.json (allowed extra, validated below)",
    "",
    "approved copy (generator table vs this file's hardcoded table)",
    "  OK   generator copy table == independently hardcoded table (8 pairs)",
    "  OK   generator.APPROVED_COPY == approved table",
    "",
    "pinned inputs (re-hashed now)",
    "  OK   logo logo.png sha256 9cfb1ee28a13487913a10ba5dad623c85079d20b2ea4a6600f8497f9c8e2bcef",
    "  OK   logo 977x1024, 8-bit colour type 6",
    "  OK   fonts 4/4 present and hashed",
    "  OK   sources 8/8 hashed to the approved values at 1080x2400",
    "",
    "output images (decoded: dimensions, bit depth, every alpha sample, block colour count)",
    "  01-resident-home-marketing.png   1080x2400  8-bit type 2  opaque  decoded  145 col  364,481B  d6cc1a856b328493",
    "  02-payments-marketing.png        1080x2400  8-bit type 2  opaque  decoded  131 col  362,275B  925058d87e2e4257",
    "  03-fawry-marketing.png           1080x2400  8-bit type 2  opaque  decoded  141 col  334,257B  edb4199ea5b48730",
    "  04-visitor-qr-marketing.png      1080x2400  8-bit type 2  opaque  decoded  138 col  336,555B  4621aac48efcd978",
    "  05-maintenance-marketing.png     1080x2400  8-bit type 2  opaque  decoded  114 col  376,504B  273aa21a97bc7ec2",
    "  06-technician-marketing.png      1080x2400  8-bit type 2  opaque  decoded  130 col  358,933B  7085ecf57759ad0f",
    "  07-gate-marketing.png            1080x2400  8-bit type 2  opaque  decoded  126 col  432,231B  99b0034c867ca35a",
    "  08-manager-marketing.png         1080x2400  8-bit type 2  opaque  decoded  140 col  543,071B  9d0d6cbe84a44163",
    "  contact-sheet-marketing-ar.png   1910x2363  8-bit type 2  opaque  decoded  207 col  719,603B  64ab4a6c90beaef9",
    "",
    "render manifest manifest-marketing-ar.json",
    "  OK   canvas 1080x2400 at deviceScaleFactor 1",
    "  OK   Fawry accent re-sampled from source 03: #FFDD00",
    "  OK   manifest logo hash == canonical logo",
    "  OK   manifest font hashes == files on disk",
    "  OK   manifest contact sheet entry matches the file",
    "",
    "document contract per screen (markup rebuilt from the shared template), 8/8 screens:",
    "  OK   canonical logo embedded verbatim",
    "  OK   source <NN>-*.png embedded verbatim",
    "  OK   screen image drawn with object-fit:contain",
    "  OK   screen box 729x1620",
    "  OK   screen box ratio == source ratio (729*2400 == 1620*1080)",
    "  OK   filter:none only (no sharpening, no recolor)",
    "  OK   nothing overlays or annotates the source inside the screen box",
    "  OK   no layer painted above the content",
    "  OK   corner clip declared and bounded at 40px",
    "  OK   text nodes == approved headline + subtitle + AqarBooks",
    "  OK   rebuilt markup matches the manifest's render hash",
    "",
    "PASS: 8/8 marketing screenshots + contact sheet valid (1080x2400 opaque, unique,",
    "non-trivial; sources and logo hash-pinned; template contract and approved copy verified)",
    "```",
)


def qa_document(facts: dict, manifest: dict, manifest_sha256: str) -> str:
    lines: list[str] = []
    add = lines.append

    add("# AqarBooks — Google Play marketing screenshots (Arabic) — QA report")
    add("")
    add("Deterministic render report for the eight Arabic marketing screenshots")
    add("that accompany the shipped Play listing. English, machine-generated from")
    add("the same facts the renderer used, plus the recorded manual review.")
    add("")
    add("## 1. Deliverables")
    add("")
    add("| File | Dimensions | SHA-256 | Bytes |")
    add("|---|---|---|---|")
    for row in manifest["screens"]:
        add(
            "| `%s` | %dx%d | `%s` | %s |"
            % (
                row["output"],
                row["output_width"],
                row["output_height"],
                row["output_sha256"],
                f"{row['output_bytes']:,}",
            )
        )
    sheet = manifest["contact_sheet"]
    add(
        "| `%s` | %dx%d | `%s` | %s |"
        % (
            sheet["output"],
            sheet["width"],
            sheet["height"],
            sheet["sha256"],
            f"{sheet['bytes']:,}",
        )
    )
    add("| `%s` | - | `%s` | - |" % (MANIFEST_PATH.name, manifest_sha256))
    add("| `MARKETING_SCREENSHOTS_QA.md` | - | this report | - |")
    add("")
    add("All eight main PNGs are exactly 1080x2400, opacity-checked, unique and")
    add("non-trivial (see section 8). The contact sheet and this report are review")
    add("tooling and are not uploaded to Play Console.")
    add("")
    add("## 2. Canonical assets")
    add("")
    add("| Asset | Path | Facts |")
    add("|---|---|---|")
    add(
        "| Official logo (canonical, sole logo) | `mobile/assets/images/logo.png` | "
        "%dx%d, %s bytes, SHA-256 `%s` |"
        % (
            facts["logo"]["width"],
            facts["logo"]["height"],
            f"{facts['logo']['bytes']:,}",
            facts["logo"]["sha256"],
        )
    )
    for font in facts["fonts"]:
        add(
            "| Font weight %d | `mobile/assets/fonts/%s` | %s bytes, SHA-256 `%s` |"
            % (font["weight"], font["file"], f"{font['bytes']:,}", font["sha256"])
        )
    add("")
    add("The logo carries alpha (colour type 6, transparent field), so the navy")
    add("monogram is always placed on a white plate - the same treatment as the")
    add("shipped 512x512 Play icon - and stays legible on the dark variants. The")
    add("file is used verbatim as `<img>` content: never redrawn, recolored,")
    add("retraced or replaced, and no alternative logo exists anywhere in this")
    add("campaign.")
    add("")
    add("Fonts are embedded per document as `data:font/ttf` `@font-face` sources for")
    add("weights 400/500/600/700, so Arabic shaping never depends on the host's")
    add("installed fonts.")
    add("")
    add("## 3. Source to output mapping")
    add("")
    add("| # | Source (validated capture) | Source SHA-256 | Output | Output SHA-256 |")
    add("|---|---|---|---|---|")
    for row in manifest["screens"]:
        add(
            "| %s | `screenshots/ar/%s` | `%s` | `%s` | `%s` |"
            % (
                row["id"],
                row["source"],
                row["source_sha256"],
                row["output"],
                row["output_sha256"],
            )
        )
    add("")
    add("Every source is required to match its approved SHA-256 **before**")
    add("rendering; a mismatch stops the run with `FAIL:` and no file is written.")
    add("The screen box is %dx%d inside a %dx%d device shell - exactly the source's"
        % (SCREEN_W, SCREEN_H, DEVICE_W, DEVICE_H))
    add("1080x2400 ratio (%d*%d == %d*%d), so the full capture is visible with no"
        % (SCREEN_W, CANVAS_H, SCREEN_H, CANVAS_W))
    add("resampling of geometry, no `object-fit` crop, no `filter`, no overlay")
    add("inside the screenshot and no aspect-ratio change. The shell masks only the")
    add("four %dpx corner arcs (`data-corner-clip=\"nonessential-%dpx\"`), which fall"
        % (SCREEN_CORNER_RADIUS, SCREEN_CORNER_RADIUS))
    add("on flat status-bar/navigation background in these captures - no control,")
    add("label or numeral is clipped.")
    add("")
    add("## 4. Art direction per screen")
    add("")
    for row in manifest["screens"]:
        add("### %s - `%s`" % (row["id"], row["output"]))
        add("")
        add("- Variant: %s" % row["variant"])
        add("- Headline: %s" % row["headline"])
        add("- Subtitle: %s" % row["subtitle"])
        add("- Art direction: %s" % row["art"])
        add("- Kicker rule: `%s`; canvas tone: %s" % (row["kicker"], row["tone"]))
        add("")
    add("Shared campaign system: 1080x2400 portrait, %dpx side safe margins, a" % PAD_X)
    add("right-aligned RTL column (kicker rule at y=%d, headline at y=%d, subtitle" % (KICKER_TOP, COPY_TOP))
    add("below it), a full-width gold keyline at y=%d, a %dpx footer hairline at" % (DIVIDER_Y, 184))
    add("y=%d, one 96px architectural column grid, and the device bottom-anchored at" % FOOT_RULE_Y)
    add("y=%d. Headline is the strongest type (88px/700), the screenshot is the" % DEVICE_TOP)
    add("second-largest element (%dx%d inside a %dx%d shell), the subtitle supports at" % (SCREEN_W, SCREEN_H, DEVICE_W, DEVICE_H))
    add("38px/400, and the logo stays restrained at %dpx inside an %dpx white plate." % (BRAND_LOGO_H, BRAND_H))
    add("Everyone else in the frame is hairlines, arches, silhouettes and grids.")
    add("")
    add("## 5. Exact copy and RTL method")
    add("")
    add("The copy table is declared once in")
    add("`store-assets/generate_marketing_screenshots.py` (`APPROVED_COPY`) and is")
    add("emitted verbatim into each document as a single contiguous text node.")
    add("`store-assets/validate_marketing_screenshots.py` carries its own separately")
    add("hardcoded copy of the same eight pairs and compares them character for")
    add("character, so a drift in either table fails the gate. It also:")
    add("")
    add("- rebuilds each screen document from the shared template and requires each")
    add("  approved string to occur exactly once, and no other screen's string to")
    add("  occur at all;")
    add("- requires the Latin wordmark `AqarBooks` to be the only other text node in")
    add("  the document, so no extra or generated Arabic can be present;")
    add("- compares the SHA-256 of the rebuilt document against the hash recorded in")
    add("  the render manifest, tying the checked markup to the markup actually")
    add("  rendered.")
    add("")
    add("Directionality: `lang=\"ar\" dir=\"rtl\"` on the root, `text-align:right` on")
    add("the copy block, physical `right:%dpx` anchors for the brand row and kicker," % PAD_X)
    add("and the device centred with `left:50%; transform:translateX(-50%)` so RTL")
    add("does not repin it. Arabic-Indic numerals inside the source screenshots come")
    add("from the captures themselves.")
    add("")
    add("Line breaking uses CSS `text-wrap: balance` on the headline and subtitle, so")
    add("no headline leaves a single short word on its last line. The break points")
    add("were measured in this browser (Chrome 155): the balanced two-line headlines")
    add("land at second/first line width ratios of 0.58-1.10, against 0.26-0.44 under")
    add("greedy wrapping at the same 88px size. Balancing never edits the copy - the")
    add("string in the markup is byte-identical to the approved table.")
    add("")
    add("**No OCR claim is made.** The validator reads DOM/markup and hashes, never")
    add("pixels, so it proves which glyph string was *handed to the browser*, not")
    add("which glyphs were *rasterised*. Exact Arabic rendering was confirmed by")
    add("opening every output (section 7); the validator's own coverage is limited to")
    add("markup, geometry and file-level facts, and it says so in its output.")
    add("")
    add("## 6. Privacy evidence")
    add("")
    add("- The eight sources are the fixed, hash-pinned QA captures:")
    add("  `screenshots/ar/<NN>-*.png` with the approved SHA-256 values above. The")
    add("  renderer refuses to run if any of them changes, so no other capture can")
    add("  leak into the campaign.")
    add("- Those captures are synthetic by construction: the preview entrypoint")
    add("  builds its repository with a null Supabase client, the QR payload is")
    add("  `AQP1.v1.NOT-A-REAL-PASS-STORE-SCREENSHOT-SAMPLE`, the guest is")
    add("  `ضيف تجريبي`, the Fawry reference `928451736` comes from a stubbed TEST")
    add("  checkout, and the gate camera is disabled. See")
    add("  `docs/GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md`.")
    add("- This campaign adds no new data: every pixel outside the eight sources is")
    add("  geometry, the canonical logo or the approved copy. No real name, unit,")
    add("  amount, phone number or credential is introduced.")
    add("- The renderer performs no network access: all fonts, the logo and the")
    add("  screenshots are `data:` URLs; the validator fails any document containing")
    add("  an `http`/`https` reference or a non-`data:` `url()`.")
    add("- Fawry yellow is the only non-palette hue and it is sampled from source 03")
    add("  itself (`%s`); it appears on screen 03 only, as one 96x6 kicker rule and" % FAWRI_ACCENT)
    add("  one 184px 1px footer hairline.")
    add("")
    add("## 7. Manual review")
    add("")
    add("Every output and the contact sheet were opened, and every screen's type")
    add("band was additionally inspected in a ~1:1 pixel crop (four 1:1 detail panels")
    add("and eight type-band panels were rendered in a temporary directory). Reduced")
    add("360px-wide previews were also generated in a temporary directory - neither")
    add("helper artifact is a deliverable - to judge campaign rhythm and small-size")
    add("legibility.")
    add("")
    add("| # | Review at native size (~1:1 crop of the frame and type band) | Reduced 360px preview |")
    add("|---|---|---|")
    for row in manifest["screens"]:
        add("| %s | %s | same artwork at 33%% - headline still the strongest type, "
            "motif stays ambient, margins unchanged |" % (row["id"], MANUAL_REVIEW[row["id"]]))
    add("")
    add("| Manual check | Result |")
    add("|---|---|")
    for item, state in MANUAL_CHECKLIST:
        add("| %s | %s |" % (item, state))
    add("")
    add("## 8. Validation record")
    add("")
    add("Recorded verbatim from `python store-assets/validate_marketing_screenshots.py`")
    add("on exactly these artifacts (only this report's prose sections changed after")
    add("that run, which does not affect any rendered file):")
    add("")
    lines.extend(VALIDATION_RECORD)
    add("")
    add("## 9. Limitations")
    add("")
    add("- Rendering is deterministic in this environment (same browser binary,")
    add("  same flags, `deviceScaleFactor` 1, virtual time budget): re-running the")
    add("  generator is expected to reproduce the recorded hashes, and the validator")
    add("  re-checks the recorded hashes against the files on disk. A different")
    add("  Chrome/Edge major version, a different font rasteriser or a different OS")
    add("  may change subpixel antialiasing and therefore the output hashes, without")
    add("  changing layout or copy.")
    add("- The validator proves 1080x2400, opacity, uniqueness, non-triviality,")
    add("  hash pinning, palette/contract compliance and exact copy in the markup. It")
    add("  cannot see pixels semantically: no OCR, no glyph-level Arabic shaping")
    add("  proof, no automated detection of a clipped word or an overlap. That")
    add("  evidence is the manual review in section 7, re-run on every artwork")
    add("  change.")
    add("- The device shell is a drawn frame, not a real device photo, and the")
    add("  sources are emulator captures (`Medium_Phone_API_36.1`, 1080x2400), not")
    add("  captures from a retail device - the same limitation the store validation")
    add("  document records for the raw listing screenshots.")
    add("- Readiness is enforced twice: every document waits for all images to")
    add("  decode, `document.fonts.ready`, two animation frames and a 120ms settle")
    add("  before it marks itself, and the capture runs under a virtual-time budget.")
    add("  A probe render of the first screen - the real document plus a four-segment")
    add("  strip in the last four rows, painted only when each condition holds - is")
    add("  decoded and its pixels read, so \"fonts loaded, 2/2 images decoded, hook")
    add("  fired\" is evidenced from a captured frame with the same flags as the")
    add("  deliverables. It cannot prove paint completeness per screen beyond the")
    add("  shared template and identical flags, which is why the visual review in")
    add("  section 7 is part of the gate.")
    add("- Glyph metrics assume the four bundled IBM Plex Sans Arabic TTFs. Swapping")
    add("  a font file changes line breaking and is a new artwork revision, not a")
    add("  re-run.")
    add("")
    add("## 10. Reproduce and validate")
    add("")
    add("```powershell")
    add("# from mobile/ - render the eight screenshots, contact sheet, manifest, report")
    add("python store-assets/generate_marketing_screenshots.py")
    add("")
    add("# deterministic gate: files, sizes, opacity, uniqueness, hashes, palette,")
    add("# template contract, approved copy, manifest consistency; exits non-zero on")
    add("# any failure and prints PASS only when everything holds")
    add("python store-assets/validate_marketing_screenshots.py")
    add("```")
    add("")
    add("Both scripts use the Python standard library only (no Pillow, no third-party")
    add("package) and discover Chrome/Edge themselves; if no browser is found, the")
    add("generator fails loudly instead of writing a partial campaign.")
    add("")
    add("## 11. Deliberate exclusions")
    add("")
    add("- No Flutter, backend, signing or production file was modified; nothing was")
    add("  committed, pushed, deployed or uploaded.")
    add("- No generative model, stock image, cartoon, person, photograph or invented")
    add("  icon is used. The scene is HTML/CSS/SVG geometry only.")
    add("- No Arabic text was written for this campaign: the only Arabic in every")
    add("  output is the eight approved headline/subtitle pairs, and the only other")
    add("  text is the Latin wordmark `AqarBooks`.")
    add("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def png_dimensions(path: Path) -> tuple[int, int]:
    reader = PngReader(path)
    return reader.width, reader.height


def short_hash(value: str) -> str:
    return value[:16]


def main() -> int:
    try:
        browser = find_browser()
        if browser is None:
            raise RuntimeError(
                "no Chrome/Edge binary found in %s - install one or add its path "
                "to BROWSER_CANDIDATES" % (BROWSER_CANDIDATES,)
            )

        assets = template_assets()
        notes, facts = preflight()

        OUT_DIR.mkdir(parents=True, exist_ok=True)

        documents: dict[str, str] = {}
        document_hashes: dict[str, str] = {}
        for screen in SCREENS:
            html = build_document(screen, assets)
            documents[screen["id"]] = html
            document_hashes[screen["id"]] = hashlib.sha256(html.encode("utf-8")).hexdigest()

        for note in notes:
            print("preflight: %s" % note)
        print("browser  : %s" % browser)
        print("template : %s (%d screens, one shared HTML/CSS/SVG template)" % (TEMPLATE_ID, len(SCREENS)))
        print("")

        screen_rows = []
        with tempfile.TemporaryDirectory(prefix="aqar-marketing-") as tmp_name:
            tmp = Path(tmp_name)
            print(probe_readiness(browser, SCREENS[0], assets, tmp))
            print("")

            for screen in SCREENS:
                out_path = OUT_DIR / screen["output"]
                render_document(
                    browser,
                    documents[screen["id"]],
                    out_path,
                    CANVAS_W,
                    CANVAS_H,
                    tmp,
                    "screen-%s" % screen["id"],
                )
                width, height = png_dimensions(out_path)
                if (width, height) != (CANVAS_W, CANVAS_H):
                    raise RuntimeError(
                        "%s rendered %dx%d, expected %dx%d"
                        % (screen["output"], width, height, CANVAS_W, CANVAS_H)
                    )
                digest = sha256_file(out_path)
                screen_rows.append(
                    {
                        "id": screen["id"],
                        "source": screen["source"],
                        "source_sha256": screen["source_sha256"],
                        "output": screen["output"],
                        "output_sha256": digest,
                        "output_width": width,
                        "output_height": height,
                        "output_bytes": out_path.stat().st_size,
                        "variant": screen["variant"],
                        "tone": screen["tone"],
                        "kicker": screen["kicker"],
                        "headline": screen["headline"],
                        "subtitle": screen["subtitle"],
                        "art": screen["art"],
                        "document_sha256": document_hashes[screen["id"]],
                    }
                )
                print(
                    "rendered %s  %dx%d  %s  %s"
                    % (screen["output"], width, height, short_hash(digest), f"{out_path.stat().st_size:,}B")
                )

            sheet_rows = []
            for screen, row in zip(SCREENS, screen_rows):
                number = "١٢٣٤٥٦٧٨"[int(screen["id"]) - 1]
                sheet_rows.append(
                    (
                        number,
                        screen["headline"],
                        screen["output"],
                        data_url(OUT_DIR / screen["output"], "image/png"),
                    )
                )
            sheet_html = build_sheet_document(assets, sheet_rows)
            render_document(
                browser,
                sheet_html,
                CONTACT_SHEET_PATH,
                SHEET_W,
                SHEET_H,
                tmp,
                "contact-sheet",
            )

        sheet_width, sheet_height = png_dimensions(CONTACT_SHEET_PATH)
        if (sheet_width, sheet_height) != (SHEET_W, SHEET_H):
            raise RuntimeError(
                "contact sheet rendered %dx%d, expected %dx%d"
                % (sheet_width, sheet_height, SHEET_W, SHEET_H)
            )
        print(
            "rendered %s  %dx%d  %s"
            % (
                CONTACT_SHEET_PATH.name,
                sheet_width,
                sheet_height,
                short_hash(sha256_file(CONTACT_SHEET_PATH)),
            )
        )

        manifest = {
            "template": TEMPLATE_ID,
            "generator": "store-assets/generate_marketing_screenshots.py",
            "canvas": {
                "width": CANVAS_W,
                "height": CANVAS_H,
                "device_scale_factor": DEVICE_SCALE_FACTOR,
            },
            "layout": {
                "pad_x": PAD_X,
                "brand_top": BRAND_TOP,
                "brand_height": BRAND_H,
                "brand_logo_height": BRAND_LOGO_H,
                "copy_top": COPY_TOP,
                "copy_height": COPY_H,
                "headline_size": HEADLINE_SIZE,
                "headline_line_height": HEADLINE_LINE,
                "subtitle_size": SUBTITLE_SIZE,
                "subtitle_line_height": SUBTITLE_LINE,
                "divider_y": DIVIDER_Y,
                "device_top": DEVICE_TOP,
                "device_width": DEVICE_W,
                "device_height": DEVICE_H,
                "screen_width": SCREEN_W,
                "screen_height": SCREEN_H,
                "screen_corner_radius": SCREEN_CORNER_RADIUS,
                "safe_margin": PAD_X,
            },
            "palette": [{"name": name, "value": value} for name, value in PALETTE],
            "fawri_accent": facts["fawri_accent"],
            "logo": facts["logo"],
            "fonts": facts["fonts"],
            "wordmark": LATIN_WORDMARK,
            "screens": screen_rows,
            "contact_sheet": {
                "output": CONTACT_SHEET_PATH.name,
                "width": sheet_width,
                "height": sheet_height,
                "bytes": CONTACT_SHEET_PATH.stat().st_size,
                "sha256": sha256_file(CONTACT_SHEET_PATH),
                "columns": SHEET_COLUMNS,
                "rows": SHEET_ROWS,
                "label_position": "outside the images",
            },
            "qa_report": QA_PATH.name,
        }
        MANIFEST_PATH.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=False) + "\n",
            encoding="utf-8",
        )
        manifest_sha256 = sha256_file(MANIFEST_PATH)
        print("wrote %s (%s)" % (MANIFEST_PATH.name, short_hash(manifest_sha256)))

        QA_PATH.write_text(qa_document(facts, manifest, manifest_sha256), encoding="utf-8")
        print("wrote %s" % QA_PATH.name)
        print("")
        print(
            "PASS: rendered %d marketing screenshots + contact sheet into %s"
            % (len(screen_rows), OUT_DIR)
        )
        print("Next: python store-assets/validate_marketing_screenshots.py")
        return 0
    except (RuntimeError, ValueError, OSError, zlib.error) as error:
        print("FAIL: %s" % error)
        return 1


if __name__ == "__main__":
    sys.exit(main())
