"""Validate the eight Arabic Google Play phone screenshots.

Deterministic, offline checks over exactly the eight numbered PNGs captured
from the Android emulator (never the contact sheet):

  * the directory holds exactly those eight files - nothing extra, none missing;
  * each is a real PNG (signature + valid IHDR, IDAT chunks that zlib-decode to
    exactly one scanline set) at 1080x2400, portrait;
  * each is 8-bit and fully opaque - the alpha channel is decoded and inspected
    pixel by pixel, so a colour type that merely *carries* alpha cannot pass;
  * each carries real rendered content: after box-averaging to a coarse grid, the
    number of distinct quantised colours must clear a floor, so a blank or
    single-fill frame cannot pass;
  * each clears a minimum file size;
  * all eight are byte-distinct (no accidental duplicate capture).

It also scans the repository-owned preview sources that produce those captures
and fails if they contain anything that looks like a production Supabase URL or
key. It cannot read the pixels semantically: it makes no OCR or
"no loading spinner" claim - that evidence lives in
`docs/GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md`, from manually opening each file.

Standard library only - no Pillow. Run with any Python 3.8+:
  python store-assets/validate_play_screenshots.py
An optional first argument overrides the screenshots directory (used by the
tests); it defaults to `store-assets/screenshots/ar`.
Exits 0 and prints PASS when all eight are valid, 1 otherwise.
"""

from __future__ import annotations

import hashlib
import re
import struct
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHOTS_DIR = HERE / "screenshots" / "ar"

WIDTH, HEIGHT = 1080, 2400

# Calibrated against the real captures: they land between 72 KB and 200 KB, and
# box-averaging to an 8x8 grid exposes 77-112 distinct quantised colours, while a
# blank or single-fill frame collapses to 1-3 and a few KB. The colour floor is
# set just above what a solid frame can produce - it exists to catch "blank", not
# to judge contrast; MIN_BYTES carries the rest.
MIN_BYTES = 50_000
MIN_DISTINCT_COLOURS = 24
CONTENT_BLOCK = 8  # box-average side, in pixels
COLOUR_BITS = 4  # per channel, after averaging

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
COLOUR_TYPE_NAMES = {
    0: "greyscale",
    2: "truecolour",
    3: "indexed",
    4: "greyscale+alpha",
    6: "truecolour+alpha",
}
# samples per pixel, by colour type (bit depth 8)
CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}

# The exact, ordered set of store phone screenshots.
EXPECTED = (
    "01-resident-home.png",
    "02-payments-dues.png",
    "03-fawry-payment.png",
    "04-visitor-qr-pass.png",
    "05-maintenance-request.png",
    "06-technician-dashboard.png",
    "07-gate-scanner.png",
    "08-manager-dashboard.png",
)

# The one file in that directory which is legitimately not a phone screenshot:
# the review/merchandising contact sheet built from the eight by
# generate_screenshot_contact_sheet.py. It is ignored, not accepted as a
# substitute -- any other extra PNG still fails the run.
DERIVED = {"contact-sheet-ar.png"}

# The capture surface must stay synthetic and credential-free: only the
# dev-only preview entrypoints are relevant, because they are the ones that can
# bake a key into a capture.
PREVIEW_SOURCES = ("preview_main.dart",)
PREVIEW_SOURCE_GLOB = "*preview*.dart"

SUPABASE_URL_RE = re.compile(r"https://[a-z0-9-]+\.supabase\.(co|in)\b")
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
KEY_ASSIGN_RE = re.compile(
    r"(SUPABASE_URL|SUPABASE_ANON_KEY|SERVICE_ROLE_KEY|anonKey|serviceKey)"
    r"\s*[:=]\s*(['\"])(?P<value>.*?)\2"
)


def sha256(path: Path) -> str:
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


def unfilter(raw: bytes, width: int, height: int, bpp: int) -> list[bytearray]:
    """Reconstruct scanlines from zlib-filtered PNG image data.

    Standard PNG row filters (None/Sub/Up/Average/Paeth). Returns `height`
    bytearrays of `width * bpp` bytes each.
    """
    stride = width * bpp
    rows: list[bytearray] = []
    previous = bytearray(stride)
    offset = 0
    for _ in range(height):
        if offset >= len(raw):
            raise ValueError("truncated image data")
        filter_type = raw[offset]
        offset += 1
        line = bytearray(raw[offset:offset + stride])
        if len(line) != stride:
            raise ValueError("truncated scanline")
        offset += stride
        if filter_type == 0:
            pass
        elif filter_type == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif filter_type == 2:
            for i in range(stride):
                line[i] = (line[i] + previous[i]) & 0xFF
        elif filter_type == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xFF
        elif filter_type == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                up_left = previous[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(left, previous[i], up_left)) & 0xFF
        else:
            raise ValueError("unknown row filter %d" % filter_type)
        rows.append(line)
        previous = line
    if offset != len(raw):
        raise ValueError("trailing bytes after the last scanline")
    return rows


class PngImage:
    """A decoded 8-bit PNG, parsed with the standard library only."""

    def __init__(self, path: Path) -> None:
        data = path.read_bytes()
        if data[:8] != PNG_SIGNATURE:
            raise ValueError("not a PNG file (bad signature)")
        self.bytes = len(data)
        self.idat_parts: list[bytes] = []
        self.width = self.height = self.depth = self.colour = 0
        self.palette_alpha: bytes | None = None
        offset = 8
        seen_ihdr = False
        seen_iend = False
        while offset + 8 <= len(data):
            (length,) = struct.unpack(">I", data[offset:offset + 4])
            kind = data[offset + 4:offset + 8]
            body = data[offset + 8:offset + 8 + length]
            if len(body) != length:
                raise ValueError("truncated %s chunk" % kind.decode("latin-1"))
            offset += 12 + length  # length + type + body + CRC
            if kind == b"IHDR":
                self.width, self.height, self.depth, self.colour = struct.unpack(
                    ">IIBB", body[:10]
                )
                seen_ihdr = True
            elif kind == b"PLTE":
                self.palette = body
            elif kind == b"tRNS":
                self.palette_alpha = body
            elif kind == b"IDAT":
                self.idat_parts.append(body)
            elif kind == b"IEND":
                seen_iend = True
                break

        if not seen_ihdr:
            raise ValueError("missing IHDR chunk")
        if not self.idat_parts:
            raise ValueError("missing IDAT chunk")
        if not seen_iend:
            raise ValueError("missing IEND chunk")
        if self.depth != 8 or self.colour not in CHANNELS:
            raise ValueError(
                "unsupported PNG: %d-bit colour type %d" % (self.depth, self.colour)
            )
        self.colour_name = COLOUR_TYPE_NAMES.get(self.colour, "unknown")

    def decode(self) -> list[bytearray]:
        raw = zlib.decompress(b"".join(self.idat_parts))
        rows = unfilter(raw, self.width, self.height, CHANNELS[self.colour])
        if self.colour == 3:
            if not hasattr(self, "palette"):
                raise ValueError("indexed PNG without a PLTE chunk")
            palette = self.palette
            rgba = bytearray()
            for line in rows:
                for index in line:
                    base = index * 3
                    if base + 3 > len(palette):
                        raise ValueError("palette index out of range")
                    rgba += palette[base:base + 3]
                    rgba.append(
                        self.palette_alpha[index]
                        if self.palette_alpha and index < len(self.palette_alpha)
                        else 255
                    )
            rows = [rgba[i:i + self.width * 4] for i in range(0, len(rgba), self.width * 4)]
        return rows


class ShotFacts:
    """Everything this validator knows about one capture."""

    def __init__(self, path: Path) -> None:
        image = PngImage(path)
        rows = image.decode()
        self.width, self.height = image.width, image.height
        self.depth, self.colour = image.depth, image.colour
        self.colour_name = image.colour_name
        self.bytes = image.bytes
        self.sha256 = sha256(path)

        # Opacity is inspected, not assumed: walk the decoded alpha samples (and
        # a tRNS palette) and require every one to be fully opaque. An image
        # whose colour type merely carries alpha still fails if a pixel is not.
        alpha_min, alpha_max = 255, -1
        samples = CHANNELS[image.colour] if image.colour != 3 else 4
        opaque_type = image.colour in (4, 6)
        for row in rows:
            if opaque_type:
                start = samples - 1
                for value in row[start::samples]:
                    if value < alpha_min:
                        alpha_min = value
                    if value > alpha_max:
                        alpha_max = value
        if image.palette_alpha is not None and image.colour == 3:
            for value in image.palette_alpha:
                if value < alpha_min:
                    alpha_min = value
                if value > alpha_max:
                    alpha_max = value
        if not opaque_type and image.palette_alpha is None:
            alpha_min = alpha_max = 255  # no alpha information to inspect
        self.alpha_range = (alpha_min, alpha_max)
        self.opaque = alpha_min == 255 and alpha_max == 255

        self.distinct_colours = self._distinct_colours(rows, image.colour)

    def _distinct_colours(self, rows: list[bytearray], colour: int) -> int:
        """Distinct colours after box-averaging blocks of CONTENT_BLOCK pixels.

        Deterministic, order-independent and cheap: the image is averaged into
        blocks (every other pixel of every other row, which still averages the
        whole block), each channel is quantised to COLOUR_BITS, and the unique
        triples are counted. Rendered text and icons keep many distinct blocks;
        a blank or single-fill frame collapses to one or a few.
        """
        block = CONTENT_BLOCK
        samples = CHANNELS[colour] if colour != 3 else 4
        mask = 0xFF << (8 - COLOUR_BITS)
        seen: set[tuple[int, int, int]] = set()
        for by in range(0, self.height, block):
            for bx in range(0, self.width, block):
                r = g = b = count = 0
                for y in range(by, min(by + block, self.height), 2):
                    line = rows[y]
                    for x in range(bx, min(bx + block, self.width), 2):
                        i = x * samples
                        if colour in (2, 3, 6):
                            r += line[i]
                            g += line[i + 1]
                            b += line[i + 2]
                        else:  # greyscale, or greyscale+alpha
                            value = line[i]
                            r += value
                            g += value
                            b += value
                        count += 1
                if not count:
                    continue
                seen.add(
                    ((r // count) & mask, (g // count) & mask, (b // count) & mask)
                )
        return len(seen)


def preview_sources() -> list[Path]:
    """The dev-only preview entrypoints under `lib/` that drive the captures."""
    lib = HERE.parent / "lib"
    found: list[Path] = []
    for name in PREVIEW_SOURCES:
        path = lib / name
        if path.is_file():
            found.append(path)
    for path in sorted(lib.glob(PREVIEW_SOURCE_GLOB)):
        if path not in found:
            found.append(path)
    return found


def source_evidence() -> tuple[list[str], list[str], bool]:
    """Scan the preview sources the captures come from.

    Returns (report lines, failures, scanned_anything).
    """
    report: list[str] = []
    failures: list[str] = []
    sources = preview_sources()
    scanned = bool(sources)

    for path in sources:
        rel = path.relative_to(HERE.parent.parent).as_posix()
        report.append("scanned %s" % rel)
        text = path.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), start=1):
            for match in SUPABASE_URL_RE.finditer(line):
                failures.append(
                    "%s:%d: production Supabase URL in a preview source: %s"
                    % (rel, number, match.group(0))
                )
            if JWT_RE.search(line):
                failures.append(
                    "%s:%d: JWT-shaped literal in a preview source" % (rel, number)
                )
            for match in KEY_ASSIGN_RE.finditer(line):
                value = match.group("value").strip()
                if value:
                    failures.append(
                        "%s:%d: %s is assigned the literal %r"
                        % (rel, number, match.group(1), value[:16])
                    )

    preview = HERE.parent / "lib" / "preview_main.dart"
    if preview.is_file():
        text = preview.read_text(encoding="utf-8")
        for marker, note in (
            ("super(null)", "repository is constructed with a null Supabase client"),
            ("debugShowCheckedModeBanner: false", "debug banner disabled"),
            (
                "gateCameraEnabledProvider.overrideWithValue(false)",
                "gate camera disabled for captures",
            ),
            ("Locale('ar')", "Arabic locale, RTL"),
        ):
            found = marker in text
            report.append("  %s %s" % ("OK  " if found else "MISS", note))
            if not found:
                failures.append("preview_main.dart no longer contains: %s" % marker)

    if not scanned:
        failures.append("no preview source files were found to scan")
    return report, failures, scanned


def validate(name: str) -> tuple[list[str], list[str], str | None]:
    report: list[str] = []
    failures: list[str] = []
    path = SHOTS_DIR / name
    if not path.is_file():
        return report, ["%s: file is missing" % name], None

    try:
        facts = ShotFacts(path)
    except (ValueError, OSError, zlib.error) as error:
        return report, ["%s: %s" % (name, error)], None

    report.append("%s" % name)
    report.append(
        "  dimensions      %dx%d (expected %dx%d)"
        % (facts.width, facts.height, WIDTH, HEIGHT)
    )
    report.append(
        "  PNG             %d-bit %s (colour type %d), decoded"
        % (facts.depth, facts.colour_name, facts.colour)
    )
    report.append(
        "  opaque          %s (alpha range %d..%d, every pixel inspected)"
        % ("yes" if facts.opaque else "NO", facts.alpha_range[0], facts.alpha_range[1])
    )
    report.append("  file size       %s bytes" % f"{facts.bytes:,}")
    report.append(
        "  distinct colours %s in %dx%d blocks (min %d)"
        % (
            f"{facts.distinct_colours:,}",
            CONTENT_BLOCK,
            CONTENT_BLOCK,
            MIN_DISTINCT_COLOURS,
        )
    )
    report.append("  sha256          %s" % facts.sha256)

    if facts.width != WIDTH or facts.height != HEIGHT:
        failures.append(
            "%s: is %dx%d, expected %dx%d" % (name, facts.width, facts.height, WIDTH, HEIGHT)
        )
    if facts.height <= facts.width:
        failures.append("%s: is not portrait (%dx%d)" % (name, facts.width, facts.height))
    if facts.depth != 8:
        failures.append("%s: bit depth is %d, expected 8" % (name, facts.depth))
    if not facts.opaque:
        failures.append(
            "%s: has transparent pixels (alpha range %d..%d)"
            % (name, facts.alpha_range[0], facts.alpha_range[1])
        )
    if facts.bytes < MIN_BYTES:
        failures.append(
            "%s: only %d bytes, expected at least %d" % (name, facts.bytes, MIN_BYTES)
        )
    if facts.distinct_colours < MIN_DISTINCT_COLOURS:
        failures.append(
            "%s: only %d distinct colours in %dx%d blocks - looks blank, not a "
            "rendered screen" % (name, facts.distinct_colours, CONTENT_BLOCK, CONTENT_BLOCK)
        )
    return report, failures, facts.sha256


def main() -> int:
    global SHOTS_DIR
    if len(sys.argv) > 1:
        SHOTS_DIR = Path(sys.argv[1]).resolve()

    reports: list[str] = []
    failures: list[str] = []

    if not SHOTS_DIR.is_dir():
        print("FAIL: %s does not exist" % SHOTS_DIR)
        return 1

    present = tuple(sorted(p.name for p in SHOTS_DIR.glob("*.png")))
    shots = tuple(n for n in present if n not in DERIVED)
    print("screenshots directory %s" % SHOTS_DIR)
    print("  expected %d, found %d (%d derived file(s) ignored)"
          % (len(EXPECTED), len(shots), len(present) - len(shots)))
    unexpected = [n for n in shots if n not in EXPECTED]
    missing = [n for n in EXPECTED if n not in present]
    for name in missing:
        failures.append("%s: missing" % name)
    for name in unexpected:
        failures.append("%s: unexpected file in the phone screenshots directory" % name)

    digests: dict[str, str] = {}
    print("")
    for name in EXPECTED:
        report, found, digest = validate(name)
        reports.extend(report)
        failures.extend(found)
        if digest:
            digests[name] = digest
    print("\n".join(reports))

    duplicates: dict[str, list[str]] = {}
    for name, digest in digests.items():
        duplicates.setdefault(digest, []).append(name)
    for digest, names in duplicates.items():
        if len(names) > 1:
            failures.append("identical files (same sha256): %s" % ", ".join(sorted(names)))

    print("")
    print("Synthetic-source evidence (capture uses no production URLs/keys):")
    lines, found, scanned = source_evidence()
    print("\n".join("  " + line for line in lines))
    failures.extend(found)
    if not scanned:
        print("  no preview sources scanned")

    print("")
    print("Not checked here (needs a human/semantic look - see")
    print("docs/GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md): RTL correctness, text")
    print("clipping or overflow, absence of loading/error/debug state, privacy.")
    print("")

    if failures:
        for failure in failures:
            print("FAIL: %s" % failure)
        print("FAILED: %d problem(s) across %d expected screenshots" % (len(failures), len(EXPECTED)))
        return 1
    print(
        "PASS: %d/%d phone screenshots valid "
        "(PNG decoded, 1080x2400 portrait, opaque 8-bit, unique, non-trivial content)"
        % (len(EXPECTED), len(EXPECTED))
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
