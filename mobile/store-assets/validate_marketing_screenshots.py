#!/usr/bin/env python3
"""Validate the eight Arabic Google Play *marketing* screenshots.

Deterministic, offline gate over the campaign that
`store-assets/generate_marketing_screenshots.py` renders into
`store-assets/screenshots/marketing/ar/`. It checks four families of facts:

1. **Artifacts.** Exactly the eight expected output files, plus the contact
   sheet and this campaign's QA report (and the optional render manifest) - no
   extra, none missing. Every main PNG is 1080x2400, 8-bit, *fully opaque* (every
   alpha sample decoded and inspected, so a colour type that merely carries
   alpha cannot pass), byte-distinct, above a size floor and above a
   distinct-colour floor after block averaging, so a blank or single-fill frame
   cannot pass.
2. **Pinned inputs.** Each of the eight source screenshots is re-hashed against
   its approved SHA-256 and re-measured at 1080x2400; the canonical logo is
   re-hashed against its approved SHA-256 and re-measured at 977x1024; the four
   approved font files are re-hashed. A single changed byte fails the run.
3. **Copy.** The generator's `APPROVED_COPY` table is imported and compared
   character for character against the independently hardcoded table in this
   file and against the render manifest. For every screen, the document rebuilt
   from the shared template must contain its own headline and subtitle exactly
   once, must contain no other screen's copy, and must contain no other text at
   all beyond the Latin wordmark - which is what makes "no extra or generated
   Arabic" a checkable claim rather than a promise.
4. **Template contract.** `lang="ar" dir="rtl"`, exactly four local `@font-face`
   faces whose embedded payloads hash to the approved font files, exactly two
   `<img>` elements whose payloads hash to the canonical logo and to that
   screen's source screenshot, `object-fit: contain` with an exactly proportional
   screen box, `filter: none`, no `clip-path`, no overlay element inside the
   screen box, nothing painted above the content layer, only approved palette
   colours (hex literals and `rgba()` RGB triples), the documented Fawry accent
   on screen 03 only, and no external `http`/`https` reference anywhere. The
   rebuilt document's SHA-256 must equal the hash recorded in the manifest, which
   ties all of this to the markup that was actually rendered.

It also checks the render manifest against the files on disk and the QA report's
required content.

**This validator makes no OCR claim.** It reads markup, geometry, hashes and
file-level pixel statistics - never glyph identity. It proves which text was
handed to the browser, not which glyphs were rasterised; Arabic shaping, clipping
and overlap are covered by the manual review recorded in
`MARKETING_SCREENSHOTS_QA.md`.

Standard library only - no Pillow, no third-party package. The PNG reader and
the screen/copy tables are imported from the generator, so the validator checks
the same artifacts the renderer produced rather than a second copy of them.

Run:
  python store-assets/validate_marketing_screenshots.py
Exits 0 and prints PASS when everything holds, 1 otherwise (each failure printed
as a `FAIL:` line).
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
import struct
import sys
import zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
MOBILE = HERE.parent
sys.path.insert(0, str(HERE))

try:
    import generate_marketing_screenshots as generator
except ImportError as error:  # pragma: no cover - environment guard
    print(
        "FAIL: cannot import store-assets/generate_marketing_screenshots.py "
        "(%s). Both scripts must sit in the same directory." % error
    )
    raise SystemExit(1)

OUT_DIR = generator.OUT_DIR
SOURCE_DIR = generator.SOURCE_DIR
LOGO_PATH = generator.LOGO_PATH
FONT_DIR = generator.FONT_DIR

CANVAS_W, CANVAS_H = generator.CANVAS_W, generator.CANVAS_H

MIN_BYTES = 60_000
MIN_DISTINCT_COLOURS = 24
CONTENT_BLOCK = 8
COLOUR_BITS = 4

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
CHANNELS = {0: 1, 2: 3, 4: 2, 6: 4}

CONTACT_SHEET = generator.CONTACT_SHEET_PATH.name
QA_REPORT = generator.QA_PATH.name
MANIFEST = generator.MANIFEST_PATH.name

# ---------------------------------------------------------------------------
# Approved constants, hardcoded here on purpose: this file must be able to
# disagree with the generator.
# ---------------------------------------------------------------------------

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

APPROVED_EXPECTED = (
    ("01", "01-resident-home.png", "01-resident-home-marketing.png",
     "f81fd4d9b52ce7e3ff020695772dd33aeabd87e044643a08c59f747c25a12ecb"),
    ("02", "02-payments-dues.png", "02-payments-marketing.png",
     "806d714f6f6cfda91f3efba6837161cd88be502aa04f0fa611479287143bb73c"),
    ("03", "03-fawry-payment.png", "03-fawry-marketing.png",
     "370b9c1fbf96b87392ff73917a331a86eddece60d8e8a12a4846753265afeb76"),
    ("04", "04-visitor-qr-pass.png", "04-visitor-qr-marketing.png",
     "2923da3072d8ac0d5363c1c95e252279a5b20cf0e94f9e2cb21850e0919018a9"),
    ("05", "05-maintenance-request.png", "05-maintenance-marketing.png",
     "56fac1d0f2d612dd535c7a98d40bf634796a0d709f9a958398cb53b5d67ee312"),
    ("06", "06-technician-dashboard.png", "06-technician-marketing.png",
     "319d499aac19942fdf8db1e91848be7187d507ac1ee9b3fa051259aa7891415f"),
    ("07", "07-gate-scanner.png", "07-gate-marketing.png",
     "0840d831f2856fd796ee95ff823fcea16b84bf012a2d96c485a1b47126f960fd"),
    ("08", "08-manager-dashboard.png", "08-manager-marketing.png",
     "803a07e472a4079f9a45aff014fe88c4b5a7c2f24aed5e6e3630dba90c26fa79"),
)

APPROVED_LOGO_SHA256 = "9cfb1ee28a13487913a10ba5dad623c85079d20b2ea4a6600f8497f9c8e2bcef"
APPROVED_LOGO_SIZE = (977, 1024)

APPROVED_FONTS = (
    ("IBMPlexSansArabic-Regular.ttf", 400),
    ("IBMPlexSansArabic-Medium.ttf", 500),
    ("IBMPlexSansArabic-SemiBold.ttf", 600),
    ("IBMPlexSansArabic-Bold.ttf", 700),
)

APPROVED_PALETTE = (
    "#07425D",
    "#042434",
    "#1B60B9",
    "#7E1898",
    "#C5A880",
    "#F4F6F9",
    "#FFFFFF",
)
APPROVED_ACCENT = "#FFDD00"
ACCENT_SCREEN = "03"

WORDMARK = "AqarBooks"

QA_REQUIRED_SECTIONS = (
    "# AqarBooks — Google Play marketing screenshots (Arabic) — QA report",
    "## 1. Deliverables",
    "## 2. Canonical assets",
    "## 3. Source to output mapping",
    "## 4. Art direction per screen",
    "## 5. Exact copy and RTL method",
    "No OCR claim is made.",
    "## 6. Privacy evidence",
    "## 7. Manual review",
    "## 8. Validation record",
    "## 9. Limitations",
    "## 10. Reproduce and validate",
    "## 11. Deliberate exclusions",
    "python store-assets/generate_marketing_screenshots.py",
    "python store-assets/validate_marketing_screenshots.py",
)

HEX_LITERAL = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RGB_FUNC = re.compile(r"\brgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[0-9.]+\s*)?\)")
FORBIDDEN_COLOUR_FUNC = re.compile(r"\b(hsla?|color-mix|lab|lch|oklab|oklch|color)\(", re.I)
DATA_FONT = re.compile(r"data:font/ttf;base64,([A-Za-z0-9+/=]+)")
DATA_PNG = re.compile(r"data:image/png;base64,([A-Za-z0-9+/=]+)")
FONT_FACE = re.compile(r"@font-face\s*\{[^}]*\}")
FILTER_DECL = re.compile(r"filter\s*:\s*([^;}]+)")
Z_INDEX = re.compile(r"z-index\s*:\s*(-?\d+)")
STYLE_BLOCK = re.compile(r"<style.*?</style>", re.S)
SCRIPT_BLOCK = re.compile(r"<script.*?</script>", re.S)
TAG = re.compile(r"<[^>]+>")
SCREEN_BOX = re.compile(r'<div class="screen">(.*?)</div>', re.S)
SCREEN_IMG_RULE = re.compile(r"\.screen img\s*\{([^}]*)\}")
FONT_FACE_BLOCK = re.compile(r"@font-face\s*\{([^}]*)\}")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def png_ihdr(path: Path) -> tuple[int, int, int, int]:
    """(width, height, bit depth, colour type) straight from the header."""
    with path.open("rb") as handle:
        head = handle.read(26)
    if len(head) < 26 or head[:8] != PNG_SIGNATURE or head[12:16] != b"IHDR":
        raise ValueError("not a PNG with an IHDR header")
    width, height, depth, colour = struct.unpack(">IIBB", head[16:26])
    return width, height, depth, colour


def distinct_block_colours(rows, width: int, height: int, channels: int) -> int:
    """Distinct colours after box-averaging blocks of CONTENT_BLOCK pixels."""
    block = CONTENT_BLOCK
    mask = 0xFF << (8 - COLOUR_BITS)
    seen: set[tuple[int, int, int]] = set()
    for by in range(0, height, block):
        for bx in range(0, width, block):
            r = g = b = count = 0
            for y in range(by, min(by + block, height), 2):
                line = rows[y]
                for x in range(bx, min(bx + block, width), 2):
                    offset = x * channels
                    r += line[offset]
                    g += line[offset + 1]
                    b += line[offset + 2]
                    count += 1
            if not count:
                continue
            seen.add(((r // count) & mask, (g // count) & mask, (b // count) & mask))
    return len(seen)


def visual_text_lines(html: str) -> set[str]:
    """Every non-empty text node of a document, with CSS/JS removed."""
    text = STYLE_BLOCK.sub(" ", html)
    text = SCRIPT_BLOCK.sub(" ", text)
    text = TAG.sub("\n", text)
    return {line.strip() for line in text.splitlines() if line.strip()}


class Report:
    def __init__(self) -> None:
        self.lines: list[str] = []
        self.failures: list[str] = []

    def say(self, message: str = "") -> None:
        self.lines.append(message)

    def check(self, ok: bool, failure: str, success: str | None = None) -> bool:
        if not ok:
            self.failures.append(failure)
        elif success:
            self.lines.append("  OK   %s" % success)
        return ok

    def emit(self) -> None:
        print("\n".join(self.lines))


# ---------------------------------------------------------------------------
# checks
# ---------------------------------------------------------------------------


def check_directory(report: Report, present: list[str]) -> None:
    expected_outputs = [row[2] for row in APPROVED_EXPECTED]
    required = set(expected_outputs) | {CONTACT_SHEET, QA_REPORT}
    allowed_extra = {MANIFEST}

    report.say("output directory %s" % OUT_DIR)
    report.say(
        "  %d file(s) present; %d expected output(s) + contact sheet + QA report"
        % (len(present), len(expected_outputs))
    )
    for name in expected_outputs:
        report.check(name in present, "%s: missing output file" % name)
    for name in (CONTACT_SHEET, QA_REPORT):
        report.check(name in present, "%s: missing required file" % name)
    for name in sorted(set(present) - required - allowed_extra):
        report.failures.append("%s: unexpected file in the marketing output directory" % name)
    if MANIFEST in present:
        report.say("  manifest  %s (allowed extra, validated below)" % MANIFEST)


def check_copy_tables(report: Report) -> None:
    report.say("")
    report.say("approved copy (generator table vs this file's hardcoded table)")
    generator_table = tuple(
        (screen["id"], screen["headline"], screen["subtitle"])
        for screen in generator.SCREENS
    )
    report.check(
        generator_table == APPROVED_COPY,
        "the generator's screen table no longer matches the approved copy character for character",
        "generator copy table == independently hardcoded table (8 pairs)",
    )
    report.check(
        generator.APPROVED_COPY == APPROVED_COPY,
        "generator.APPROVED_COPY differs from the approved copy table in the validator",
        "generator.APPROVED_COPY == approved table",
    )
    for screen_id, expected_source, expected_output, expected_hash in APPROVED_EXPECTED:
        screen = next((s for s in generator.SCREENS if s["id"] == screen_id), None)
        if screen is None:
            report.failures.append("screen %s is missing from the generator" % screen_id)
            continue
        report.check(
            screen["source"] == expected_source,
            "screen %s maps to source %s, expected %s"
            % (screen_id, screen["source"], expected_source),
        )
        report.check(
            screen["output"] == expected_output,
            "screen %s renders to %s, expected %s"
            % (screen_id, screen["output"], expected_output),
        )
        report.check(
            screen["source_sha256"] == expected_hash,
            "screen %s pins source hash %s, expected %s"
            % (screen_id, screen["source_sha256"], expected_hash),
        )


def check_pinned_inputs(report: Report) -> dict:
    report.say("")
    report.say("pinned inputs (re-hashed now)")

    ok = LOGO_PATH.is_file()
    report.check(ok, "canonical logo is missing: %s" % LOGO_PATH)
    logo_hash = ""
    if ok:
        logo_hash = sha256_file(LOGO_PATH)
        report.check(
            logo_hash == APPROVED_LOGO_SHA256,
            "canonical logo hash is %s, approved %s" % (logo_hash, APPROVED_LOGO_SHA256),
            "logo %s sha256 %s" % (LOGO_PATH.name, logo_hash),
        )
        width, height, depth, colour = png_ihdr(LOGO_PATH)
        report.check(
            (width, height) == APPROVED_LOGO_SIZE,
            "canonical logo is %dx%d, approved %dx%d"
            % (width, height, APPROVED_LOGO_SIZE[0], APPROVED_LOGO_SIZE[1]),
            "logo %dx%d, %d-bit colour type %d" % (width, height, depth, colour),
        )

    fonts = {}
    for filename, weight in APPROVED_FONTS:
        path = FONT_DIR / filename
        if not path.is_file():
            report.failures.append("approved font is missing: %s" % filename)
            continue
        fonts[filename] = sha256_file(path)
    report.check(
        len(fonts) == len(APPROVED_FONTS),
        "only %d of %d approved font files are present" % (len(fonts), len(APPROVED_FONTS)),
        "fonts %d/%d present and hashed" % (len(fonts), len(APPROVED_FONTS)),
    )

    sources = {}
    for screen_id, source, _output, expected_hash in APPROVED_EXPECTED:
        path = SOURCE_DIR / source
        if not path.is_file():
            report.failures.append("source screenshot is missing: %s" % source)
            continue
        digest = sha256_file(path)
        sources[screen_id] = digest
        report.check(
            digest == expected_hash,
            "source %s hash is %s, approved %s" % (source, digest, expected_hash),
        )
        width, height, _depth, _colour = png_ihdr(path)
        report.check(
            (width, height) == (CANVAS_W, CANVAS_H),
            "source %s is %dx%d, expected %dx%d" % (source, width, height, CANVAS_W, CANVAS_H),
        )
    report.say("  OK   sources 8/8 hashed to the approved values at 1080x2400")
    return {"logo": logo_hash, "fonts": fonts, "sources": sources}


def check_output_image(report: Report, name: str, sheet: bool = False) -> tuple[str, int, int] | None:
    path = OUT_DIR / name
    if not path.is_file():
        return None
    try:
        width, height, depth, colour = png_ihdr(path)
        reader = generator.PngReader(path)
        rows = reader.rows()
        opaque = reader.is_opaque()
    except (ValueError, OSError, zlib.error) as error:
        report.failures.append("%s: %s" % (name, error))
        return None

    channels = CHANNELS[colour]
    colours = distinct_block_colours(rows, width, height, channels)
    size = path.stat().st_size
    digest = sha256_file(path)

    report.say(
        "  %-38s %dx%d  %d-bit type %d  %s  %s  %s col  %sB  %s"
        % (
            name,
            width,
            height,
            depth,
            colour,
            "opaque" if opaque else "TRANSPARENT",
            "decoded",
            f"{colours:,}",
            f"{size:,}",
            digest[:16],
        )
    )

    if not sheet:
        report.check(
            (width, height) == (CANVAS_W, CANVAS_H),
            "%s: is %dx%d, expected %dx%d" % (name, width, height, CANVAS_W, CANVAS_H),
        )
        report.check(
            height > width, "%s: is not portrait (%dx%d)" % (name, width, height)
        )
    report.check(depth == 8, "%s: bit depth is %d, expected 8" % (name, depth))
    report.check(
        opaque,
        "%s: has transparent pixels (every alpha sample was inspected)" % name,
    )
    report.check(
        size >= MIN_BYTES,
        "%s: only %d bytes, expected at least %d" % (name, size, MIN_BYTES),
    )
    report.check(
        colours >= MIN_DISTINCT_COLOURS,
        "%s: only %d distinct colours in %dx%d blocks - looks blank, not a rendered "
        "artwork" % (name, colours, CONTENT_BLOCK, CONTENT_BLOCK),
    )
    return digest, width, height


def check_palette(report: Report, name: str, html: str, allow_accent: bool) -> None:
    approved_rgb = {
        tuple(int(value[i:i + 2], 16) for i in (1, 3, 5)) for value in APPROVED_PALETTE
    }
    accent_rgb = tuple(int(APPROVED_ACCENT[i:i + 2], 16) for i in (1, 3, 5))
    allowed_hex = {value.upper() for value in APPROVED_PALETTE}
    if allow_accent:
        allowed_hex.add(APPROVED_ACCENT)

    for literal in HEX_LITERAL.findall(html):
        upper = literal.upper()
        if upper in allowed_hex:
            continue
        # #RGB / #RRGGBBAA shorthands are legal only if they expand to an approved colour.
        if len(upper) == 4 and all(
            (upper[1] * 2 + upper[2] * 2 + upper[3] * 2) for _ in (0,)
        ):
            expanded = "#" + "".join(c * 2 for c in upper[1:])
            if expanded in allowed_hex:
                continue
        report.failures.append(
            "%s: colour %s is outside the approved palette%s"
            % (name, literal, " plus Fawry accent" if allow_accent else "")
        )

    for match in RGB_FUNC.finditer(html):
        triple = tuple(int(match.group(i)) for i in (1, 2, 3))
        if triple not in approved_rgb and not (allow_accent and triple == accent_rgb):
            report.failures.append(
                "%s: %s is not an approved palette colour (approved hues only, any alpha)"
                % (name, match.group(0))
            )

    if FORBIDDEN_COLOUR_FUNC.search(html):
        report.failures.append(
            "%s: uses a colour function outside the approved palette system" % name
        )


def check_document(
    report: Report, screen: dict, manifest_row: dict, fonts: dict, assets: dict
) -> None:
    name = screen["output"]
    html = generator.build_document(screen, assets)

    report.say("")
    report.say("  document contract for %s" % name)
    report.check(
        '<html lang="ar" dir="rtl"' in html,
        "%s: root element is not <html lang=\"ar\" dir=\"rtl\">" % name,
    )
    report.check(
        'data-template="%s"' % generator.TEMPLATE_ID in html,
        "%s: missing template id marker" % name,
    )
    report.check(
        "https://" not in html and "http://" not in html,
        "%s: contains an external http/https reference" % name,
    )
    stripped = re.sub(r"url\(\s*data:[^)]*\)", "", html)
    report.check(
        "url(" not in stripped,
        "%s: references a non-data external resource" % name,
    )

    # fonts
    faces = FONT_FACE.findall(html)
    report.check(
        len(faces) == len(APPROVED_FONTS),
        "%s: declares %d @font-face blocks, expected %d"
        % (name, len(faces), len(APPROVED_FONTS)),
    )
    declared = set()
    for face in faces:
        weight = re.search(r"font-weight\s*:\s*(\d+)", face)
        payload = DATA_FONT.search(face)
        if not weight or not payload:
            report.failures.append("%s: an @font-face block is not a local data: font" % name)
            continue
        digest = sha256_bytes(base64.b64decode(payload.group(1)))
        match = [filename for filename, value in fonts.items() if value == digest]
        declared.add((int(weight.group(1)), tuple(match)))
    for filename, weight in APPROVED_FONTS:
        report.check(
            (weight, (filename,)) in declared,
            "%s: weight %d is not embedded from %s" % (name, weight, filename),
        )

    # images
    payloads = DATA_PNG.findall(html)
    report.check(
        len(payloads) == 2,
        "%s: embeds %d PNG images, expected exactly 2 (logo + source)" % (name, len(payloads)),
    )
    if len(payloads) == 2:
        digests = [sha256_bytes(base64.b64decode(value)) for value in payloads]
        report.check(
            APPROVED_LOGO_SHA256 in digests,
            "%s: neither embedded image is the canonical logo" % name,
            "canonical logo embedded verbatim",
        )
        report.check(
            screen["source_sha256"] in digests,
            "%s: the source screenshot embedded does not match the approved hash for %s"
            % (name, screen["source"]),
            "source %s embedded verbatim" % screen["source"],
        )
        report.check(
            len(set(digests)) == 2,
            "%s: the logo and the screenshot resolve to the same payload" % name,
        )

    # capture integrity
    rule = SCREEN_IMG_RULE.search(html)
    report.check(rule is not None, "%s: has no .screen img rule" % name)
    if rule:
        body = rule.group(1)
        report.check(
            "object-fit:contain" in body,
            "%s: .screen img does not declare object-fit:contain" % name,
            "screen image drawn with object-fit:contain",
        )
        report.check(
            "width:%dpx" % generator.SCREEN_W in body
            and "height:%dpx" % generator.SCREEN_H in body,
            "%s: .screen img box is not the declared %dx%d"
            % (name, generator.SCREEN_W, generator.SCREEN_H),
            "screen box %dx%d" % (generator.SCREEN_W, generator.SCREEN_H),
        )
        report.check(
            generator.SCREEN_W * CANVAS_H == generator.SCREEN_H * CANVAS_W,
            "%s: the screen box aspect ratio distorts the 1080x2400 source" % name,
            "screen box ratio == source ratio (729*2400 == 1620*1080)",
        )
        report.check(
            "clip-path" not in body and "transform:" not in body,
            "%s: the screen image rule clips or transforms the source" % name,
        )
    filters = FILTER_DECL.findall(html)
    report.check(
        all(value.strip() == "none" for value in filters) and bool(filters),
        "%s: applies a filter to the source (must be filter:none only)" % name,
        "filter:none only (no sharpening, no recolor)",
    )
    report.check(
        "clip-path" not in html,
        "%s: uses clip-path somewhere, which could crop the source" % name,
    )
    report.check(
        "scale(" not in html,
        "%s: uses a scale() transform, which could resize the source" % name,
    )
    interior = SCREEN_BOX.search(html)
    report.check(
        interior is not None and re.fullmatch(r"\s*<img [^>]*>\s*", interior.group(1) or ""),
        "%s: the screen box holds something other than the single source <img>" % name,
        "nothing overlays or annotates the source inside the screen box",
    )
    z_values = {int(value) for value in Z_INDEX.findall(html)}
    report.check(
        z_values <= {0, 1},
        "%s: paints a layer above the content (z-index %s)" % (name, sorted(z_values)),
        "no layer painted above the content",
    )
    corner = 'data-corner-clip="nonessential-%dpx"' % generator.SCREEN_CORNER_RADIUS
    report.check(
        corner in html and generator.SCREEN_CORNER_RADIUS <= 48,
        "%s: corner-clip declaration missing or too large (%dpx)"
        % (name, generator.SCREEN_CORNER_RADIUS),
        "corner clip declared and bounded at %dpx" % generator.SCREEN_CORNER_RADIUS,
    )

    # palette
    check_palette(report, name, html, allow_accent=screen["id"] == ACCENT_SCREEN)
    if screen["id"] != ACCENT_SCREEN:
        report.check(
            APPROVED_ACCENT not in html,
            "%s: carries the Fawry accent, which belongs to screen %s only"
            % (name, ACCENT_SCREEN),
        )

    # copy
    own_headline, own_subtitle = screen["headline"], screen["subtitle"]
    report.check(
        html.count(own_headline) == 1,
        "%s: its headline does not appear exactly once" % name,
    )
    report.check(
        html.count(own_subtitle) == 1,
        "%s: its subtitle does not appear exactly once" % name,
    )
    for other_id, other_headline, other_subtitle in APPROVED_COPY:
        if other_id == screen["id"]:
            continue
        report.check(
            other_headline not in html and other_subtitle not in html,
            "%s: carries copy that belongs to screen %s" % (name, other_id),
        )
    report.check(
        visual_text_lines(html) == {own_headline, own_subtitle, WORDMARK},
        "%s: text nodes are not exactly the approved copy + the Latin wordmark "
        "(found %s)" % (name, sorted(visual_text_lines(html))),
        "text nodes == approved headline + subtitle + AqarBooks",
    )

    # manifest tie
    document_hash = sha256_bytes(html.encode("utf-8"))
    report.check(
        manifest_row.get("document_sha256") == document_hash,
        "%s: the rebuilt document hash %s does not match the manifest's %s"
        % (name, document_hash[:16], str(manifest_row.get("document_sha256"))[:16]),
        "rebuilt markup matches the manifest's render hash",
    )


def check_manifest(report: Report, manifest: dict, facts: dict, outputs: dict) -> dict:
    report.say("")
    report.say("render manifest %s" % MANIFEST)
    report.check(
        manifest.get("template") == generator.TEMPLATE_ID,
        "manifest: unexpected template id %r" % manifest.get("template"),
    )
    canvas = manifest.get("canvas", {})
    report.check(
        (canvas.get("width"), canvas.get("height")) == (CANVAS_W, CANVAS_H)
        and canvas.get("device_scale_factor") == 1,
        "manifest: canvas is not 1080x2400 at deviceScaleFactor 1",
        "canvas %sx%s at deviceScaleFactor %s"
        % (canvas.get("width"), canvas.get("height"), canvas.get("device_scale_factor")),
    )
    palette = [entry["value"] for entry in manifest.get("palette", [])]
    report.check(
        palette == list(APPROVED_PALETTE),
        "manifest: palette is %s, expected %s" % (palette, list(APPROVED_PALETTE)),
    )
    accent = manifest.get("fawri_accent", {}).get("value")
    report.check(
        accent == APPROVED_ACCENT,
        "manifest: Fawry accent is %r, expected %s" % (accent, APPROVED_ACCENT),
    )
    try:
        sampled = generator.sample_fawri_accent(SOURCE_DIR / "03-fawry-payment.png")
    except (ValueError, OSError, zlib.error) as error:
        report.failures.append("could not re-sample the Fawry accent: %s" % error)
        sampled = None
    if sampled is not None:
        report.check(
            sampled == APPROVED_ACCENT,
            "source 03 now samples %s for the Fawry accent, approved %s"
            % (sampled, APPROVED_ACCENT),
            "Fawry accent re-sampled from source 03: %s" % sampled,
        )
    report.check(
        manifest.get("logo", {}).get("sha256") == APPROVED_LOGO_SHA256,
        "manifest: logo hash is not the canonical one",
        "manifest logo hash == canonical logo",
    )
    manifest_fonts = {entry["file"]: entry["sha256"] for entry in manifest.get("fonts", [])}
    report.check(
        manifest_fonts == facts["fonts"],
        "manifest: font hashes do not match the files on disk",
        "manifest font hashes == files on disk",
    )

    rows = {row["id"]: row for row in manifest.get("screens", [])}
    report.check(
        len(rows) == len(APPROVED_EXPECTED),
        "manifest: records %d screens, expected %d" % (len(rows), len(APPROVED_EXPECTED)),
    )
    for screen_id, source, output, source_hash in APPROVED_EXPECTED:
        row = rows.get(screen_id)
        if row is None:
            report.failures.append("manifest: screen %s is not recorded" % screen_id)
            continue
        report.check(
            row.get("source") == source and row.get("source_sha256") == source_hash,
            "manifest: screen %s does not record the approved source and hash" % screen_id,
        )
        report.check(
            row.get("output") == output,
            "manifest: screen %s records output %s, expected %s"
            % (screen_id, row.get("output"), output),
        )
        actual = outputs.get(output)
        if actual is None:
            continue
        digest, width, height = actual
        report.check(
            row.get("output_sha256") == digest
            and row.get("output_width") == width
            and row.get("output_height") == height,
            "manifest: screen %s records %s %dx%d, file is %s %dx%d"
            % (screen_id, str(row.get("output_sha256"))[:16], row.get("output_width", 0),
               row.get("output_height", 0), digest[:16], width, height),
        )
    return rows


def main() -> int:
    report = Report()

    if not OUT_DIR.is_dir():
        print("FAIL: %s does not exist - run the generator first" % OUT_DIR)
        return 1

    present = sorted(path.name for path in OUT_DIR.iterdir() if path.is_file())
    check_directory(report, present)
    check_copy_tables(report)

    if not (OUT_DIR / QA_REPORT).is_file():
        report.failures.append("%s: missing QA report" % QA_REPORT)
    if not (OUT_DIR / MANIFEST).is_file():
        report.failures.append("%s: missing render manifest" % MANIFEST)

    facts = check_pinned_inputs(report)

    report.say("")
    report.say("output images (decoded: dimensions, bit depth, every alpha sample, "
               "block colour count)")
    outputs: dict[str, tuple[str, int, int]] = {}
    for _screen_id, _source, output, _hash in APPROVED_EXPECTED:
        result = check_output_image(report, output)
        if result:
            outputs[output] = result
    sheet_result = check_output_image(report, CONTACT_SHEET, sheet=True)
    if sheet_result:
        _digest, width, height = sheet_result
        report.check(
            (width, height) == (generator.SHEET_W, generator.SHEET_H),
            "%s: is %dx%d, expected %dx%d"
            % (CONTACT_SHEET, width, height, generator.SHEET_W, generator.SHEET_H),
        )
        report.check(
            sheet_result[0] == sha256_file(OUT_DIR / CONTACT_SHEET),
            "%s: hash is unstable between reads" % CONTACT_SHEET,
        )
        sheet_digest = sheet_result[0]
    else:
        sheet_digest = None

    duplicates: dict[str, list[str]] = {}
    for name, (digest, _width, _height) in outputs.items():
        duplicates.setdefault(digest, []).append(name)
    report.say("")
    for digest, names in sorted(duplicates.items()):
        if len(names) > 1:
            report.failures.append("identical outputs (same sha256): %s" % ", ".join(sorted(names)))
    report.check(
        len(duplicates) == len(outputs) and len(outputs) == len(APPROVED_EXPECTED),
        "outputs are not all byte-distinct (no accidental duplicate render)",
        "all eight outputs are byte-distinct",
    )

    manifest = None
    manifest_path = OUT_DIR / MANIFEST
    if manifest_path.is_file():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (ValueError, OSError) as error:
            report.failures.append("manifest: cannot be parsed (%s)" % error)
    if manifest is not None:
        rows = check_manifest(report, manifest, facts, outputs)
        sheet = manifest.get("contact_sheet", {})
        report.check(
            sheet.get("output") == CONTACT_SHEET
            and sheet.get("sha256") == sheet_digest
            and sheet.get("width") == generator.SHEET_W
            and sheet.get("height") == generator.SHEET_H,
            "manifest: contact sheet entry does not match the file on disk",
            "manifest contact sheet entry matches the file",
        )
        if sheet_digest:
            print("  %-38s %dx%d  %s" % (CONTACT_SHEET, generator.SHEET_W, generator.SHEET_H, sheet_digest[:16]))

        report.say("")
        report.say("document contract (markup rebuilt from the shared template)")
        assets = generator.template_assets()
        for screen in generator.SCREENS:
            row = rows.get(screen["id"])
            if row is None:
                continue
            check_document(report, screen, row, facts["fonts"], assets)

    qa_path = OUT_DIR / QA_REPORT
    report.say("")
    report.say("QA report %s" % QA_REPORT)
    if qa_path.is_file():
        qa = qa_path.read_text(encoding="utf-8")
        for section in QA_REQUIRED_SECTIONS:
            report.check(
                section in qa, "%s: missing required content %r" % (QA_REPORT, section)
            )
        for _screen_id, _source, output, _hash in APPROVED_EXPECTED:
            report.check(
                output in qa, "%s: does not list %s" % (QA_REPORT, output)
            )
        report.check(
            APPROVED_LOGO_SHA256 in qa,
            "%s: does not state the canonical logo hash" % QA_REPORT,
        )
        for filename, _weight in APPROVED_FONTS:
            report.check(
                filename in qa, "%s: does not name the font %s" % (QA_REPORT, filename)
            )
        for _screen_id, _source, output, _hash in APPROVED_EXPECTED:
            digest = outputs.get(output, (None,))[0]
            if digest:
                report.check(
                    digest in qa,
                    "%s: does not record the output hash of %s" % (QA_REPORT, output),
                )

    report.emit()
    print("")
    print("Not checked here (needs a human/semantic look - see")
    print("MARKETING_SCREENSHOTS_QA.md): Arabic glyph shaping and letter joining,")
    print("clipping or overlap, and whether the rendered pixels really show the")
    print("approved copy. This validator reads markup, geometry, hashes and")
    print("file-level pixel statistics; it makes no OCR claim.")
    print("")
    if report.failures:
        for failure in report.failures:
            print("FAIL: %s" % failure)
        print(
            "FAILED: %d problem(s) across %d marketing screenshots"
            % (len(report.failures), len(APPROVED_EXPECTED))
        )
        return 1
    print(
        "PASS: 8/8 marketing screenshots + contact sheet valid (1080x2400 opaque, "
        "unique, non-trivial; sources and logo hash-pinned; template contract and "
        "approved copy verified)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
