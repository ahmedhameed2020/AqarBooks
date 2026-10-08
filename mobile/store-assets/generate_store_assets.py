"""Generate the Google Play static store listing assets for AqarBooks.

Outputs (written next to this script):
  * google-play-icon-512.png               512 x 512, opaque
  * google-play-feature-graphic-1024x500.png  1024 x 500, opaque

Sources used (no new artwork is introduced):
  * public/AqarBooks.png            - the official mark (highest-resolution copy)
  * mobile/assets/fonts/IBMPlexSansArabic-*.ttf - bundled brand typeface

Run with the workspace Python:
  python mobile/store-assets/generate_store_assets.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# --- paths -------------------------------------------------------------------

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
MARK_SOURCE = REPO_ROOT / "public" / "AqarBooks.png"
FONT_DIR = REPO_ROOT / "mobile" / "assets" / "fonts"

# --- brand constants ---------------------------------------------------------

NAVY = (7, 66, 93)  # #07425D
PURPLE = (126, 24, 152)  # #7E1898, the mark's accent colour
WHITE = (255, 255, 255)

ICON_PX = 512
FEATURE_PX = (1024, 500)
SS = 2  # supersampling factor; everything is composed at 2x and reduced once

ICON_BG = WHITE
FEATURE_BG = NAVY

# The mark's ink is a knockout silhouette: the counters of the letterforms are
# transparent, so the artwork is only legible on a light plate. It is therefore
# flattened onto white, which also removes resampling fringes around the edges.
MARK_ALPHA_THRESHOLD = 16

ARABIC_TAGLINE = "إدارة أملاكك بثقة"


# --- Arabic shaping ----------------------------------------------------------
# The bundled Pillow has no Raqm/HarfBuzz shaping engine
# (PIL.features.check("raqm") is False), so Arabic is shaped here: each letter is
# mapped to its contextual Unicode Arabic Presentation Forms-B glyph and the
# sequence is reversed into visual (left-to-right) order for the basic layout
# engine. Only the standard joining rules for these letters are needed.

# codepoint -> (isolated, final, initial, medial); None where no such form exists
_FORMS: dict[int, tuple[int, int | None, int | None, int | None]] = {
    0x0621: (0xFE80, None, None, None),  # hamza
    0x0622: (0xFE81, 0xFE82, None, None),  # alef madda
    0x0623: (0xFE83, 0xFE84, None, None),  # alef hamza above
    0x0624: (0xFE85, 0xFE86, None, None),  # waw hamza above
    0x0625: (0xFE87, 0xFE88, None, None),  # alef hamza below
    0x0626: (0xFE89, 0xFE8A, 0xFE8B, 0xFE8C),  # yeh hamza above
    0x0627: (0xFE8D, 0xFE8E, None, None),  # alef
    0x0628: (0xFE8F, 0xFE90, 0xFE91, 0xFE92),  # beh
    0x0629: (0xFE93, 0xFE94, None, None),  # teh marbuta
    0x062A: (0xFE95, 0xFE96, 0xFE97, 0xFE98),  # teh
    0x062B: (0xFE99, 0xFE9A, 0xFE9B, 0xFE9C),  # theh
    0x062C: (0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0),  # jeem
    0x062D: (0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4),  # hah
    0x062E: (0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8),  # khah
    0x062F: (0xFEA9, 0xFEAA, None, None),  # dal
    0x0630: (0xFEAB, 0xFEAC, None, None),  # thal
    0x0631: (0xFEAD, 0xFEAE, None, None),  # reh
    0x0632: (0xFEAF, 0xFEB0, None, None),  # zain
    0x0633: (0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4),  # seen
    0x0634: (0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8),  # sheen
    0x0635: (0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC),  # sad
    0x0636: (0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0),  # dad
    0x0637: (0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4),  # tah
    0x0638: (0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8),  # zah
    0x0639: (0xFEC9, 0xFECA, 0xFECB, 0xFECC),  # ain
    0x063A: (0xFECD, 0xFECE, 0xFECF, 0xFED0),  # ghain
    0x0640: (0x0640, 0x0640, 0x0640, 0x0640),  # tatweel
    0x0641: (0xFED1, 0xFED2, 0xFED3, 0xFED4),  # feh
    0x0642: (0xFED5, 0xFED6, 0xFED7, 0xFED8),  # qaf
    0x0643: (0xFED9, 0xFEDA, 0xFEDB, 0xFEDC),  # kaf
    0x0644: (0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0),  # lam
    0x0645: (0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4),  # meem
    0x0646: (0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8),  # noon
    0x0647: (0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC),  # heh
    0x0648: (0xFEED, 0xFEEE, None, None),  # waw
    0x064A: (0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4),  # yeh
}

_LAM = 0x0644
# lam + alef ligature -> (isolated, final)
_LAM_ALEF = {
    0x0622: (0xFEF5, 0xFEF6),
    0x0623: (0xFEF7, 0xFEF8),
    0x0625: (0xFEF9, 0xFEFA),
    0x0627: (0xFEFB, 0xFEFC),
}


def _accepts_right_join(cp: int) -> bool:
    """True when the letter can be joined to the letter on its right."""
    forms = _FORMS.get(cp)
    return forms is not None and forms[1] is not None


def _joins_left(cp: int) -> bool:
    """True when the letter can be joined to the letter on its left."""
    forms = _FORMS.get(cp)
    return forms is not None and (forms[2] is not None or forms[3] is not None)


def shape_arabic(text: str) -> str:
    """Return `text` as contextual presentation forms in visual (LTR) order."""
    cps = [ord(ch) for ch in text]
    glyphs: list[int] = []
    i = 0
    while i < len(cps):
        cp = cps[i]
        if cp == _LAM and i + 1 < len(cps) and cps[i + 1] in _LAM_ALEF:
            isolated, final = _LAM_ALEF[cps[i + 1]]
            joined_right = i > 0 and _joins_left(cps[i - 1])
            glyphs.append(final if joined_right else isolated)
            i += 2
            continue
        forms = _FORMS.get(cp)
        if forms is None:  # neutrals (spaces, Latin, digits) are untouched
            glyphs.append(cp)
            i += 1
            continue
        joined_right = i > 0 and _joins_left(cps[i - 1])
        joined_left = i + 1 < len(cps) and _accepts_right_join(cps[i + 1])
        if joined_right and joined_left and forms[3] is not None:
            glyphs.append(forms[3])
        elif joined_right and forms[1] is not None:
            glyphs.append(forms[1])
        elif joined_left and forms[2] is not None:
            glyphs.append(forms[2])
        else:
            glyphs.append(forms[0])
        i += 1
    return "".join(chr(cp) for cp in reversed(glyphs))


# --- helpers -----------------------------------------------------------------


def load_mark() -> Image.Image:
    """The official mark, tightly cropped and flattened onto white."""
    source = Image.open(MARK_SOURCE).convert("RGBA")
    plate = Image.new("RGBA", source.size, WHITE)
    plate.alpha_composite(source)
    solid = plate.crop(
        source.getchannel("A").point(lambda v: 255 if v > MARK_ALPHA_THRESHOLD else 0).getbbox()
    )
    return solid


def scaled_mark(height: int) -> Image.Image:
    mark = load_mark()
    width = round(mark.width * height / mark.height)
    return mark.resize((width, height), Image.Resampling.LANCZOS)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / f"IBMPlexSansArabic-{name}.ttf"), size)


def blend(fg: tuple[int, int, int], bg: tuple[int, int, int], alpha: float) -> tuple[int, int, int]:
    return tuple(round(alpha * f + (1 - alpha) * b) for f, b in zip(fg, bg))  # type: ignore[return-value]


def ink_box(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont) -> tuple[int, int, int, int]:
    """Tight ink bounding box of `text`, measured from a zero origin."""
    left, top, right, bottom = draw.textbbox((0, 0), text, font=f)
    return left, top, right - left, bottom - top  # x_off, y_off, width, height


def draw_ink(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    f: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
) -> tuple[int, int]:
    """Draw `text` so that its ink starts at `xy`; return the ink size."""
    x_off, y_off, width, height = ink_box(draw, text, f)
    draw.text((xy[0] - x_off, xy[1] - y_off), text, font=f, fill=fill)
    return width, height


def assert_glyphs_present(f: ImageFont.FreeTypeFont, text: str) -> None:
    """Fail loudly if any codepoint would silently render as .notdef tofu."""
    def signature(ch: str) -> tuple[tuple[int, int], bytes]:
        mask = f.getmask(ch, mode="L")
        return mask.size, bytes(mask)

    notdef = signature("\uffff")
    missing = sorted({ch for ch in text if signature(ch) == notdef})
    if missing:
        raise SystemExit(
            "font %s has no glyph for: %s" % (f.path, ", ".join("U+%04X" % ord(c) for c in missing))
        )


# --- icon --------------------------------------------------------------------


def build_icon() -> Image.Image:
    """512x512 Play icon: the mark on a solid, fully opaque background."""
    canvas_px = ICON_PX * SS
    canvas = Image.new("RGBA", (canvas_px, canvas_px), ICON_BG + (255,))
    mark = scaled_mark(round(canvas_px * 0.66))  # ~17% safe margin on every side
    canvas.alpha_composite(mark, ((canvas_px - mark.width) // 2, (canvas_px - mark.height) // 2))
    icon = canvas.resize((ICON_PX, ICON_PX), Image.Resampling.LANCZOS)
    icon.putalpha(255)
    return icon


# --- feature graphic ---------------------------------------------------------


def build_feature_graphic() -> Image.Image:
    """1024x500 Play feature graphic: navy field, white mark plate, wordmark."""
    width, height = (FEATURE_PX[0] * SS, FEATURE_PX[1] * SS)
    canvas = Image.new("RGBA", (width, height), FEATURE_BG + (255,))
    draw = ImageDraw.Draw(canvas)

    # central 80% safe zone, so nothing critical sits near a cropped edge
    safe_left, safe_right = width * 0.1, width * 0.9
    safe_top, safe_bottom = height * 0.1, height * 0.9
    center_y = (safe_top + safe_bottom) / 2

    title_font = font("SemiBold", 66 * SS)
    tagline_font = font("Regular", 40 * SS)
    tagline = shape_arabic(ARABIC_TAGLINE)
    assert_glyphs_present(title_font, "AqarBooks")
    assert_glyphs_present(tagline_font, tagline)

    # white plate with the mark
    plate_px = 264 * SS
    plate_radius = round(plate_px * 0.11)
    mark = scaled_mark(round(plate_px * 0.72))

    # text stack: wordmark, purple rule, Arabic tagline
    gap_px, rule_gap = 20 * SS, 20 * SS
    rule_w, rule_h = 84 * SS, 6 * SS
    title_w, title_h = ink_box(draw, "AqarBooks", title_font)[2:]
    tagline_w, tagline_h = ink_box(draw, tagline, tagline_font)[2:]
    text_w = max(title_w, tagline_w, rule_w)
    text_h = title_h + gap_px + rule_h + rule_gap + tagline_h

    group_w = plate_px + 64 * SS + text_w
    group_x = safe_left + (safe_right - safe_left - group_w) / 2
    plate_x = group_x
    text_x = plate_x + plate_px + 64 * SS

    plate = Image.new("RGBA", (plate_px, plate_px), (0, 0, 0, 0))
    ImageDraw.Draw(plate).rounded_rectangle((0, 0, plate_px - 1, plate_px - 1), plate_radius, fill=WHITE + (255,))
    plate.alpha_composite(mark, ((plate_px - mark.width) // 2, (plate_px - mark.height) // 2))
    canvas.alpha_composite(plate, (round(plate_x), round(center_y - plate_px / 2)))

    text_y = center_y - text_h / 2
    draw_ink(draw, (text_x, text_y), "AqarBooks", title_font, WHITE)
    rule_y = text_y + title_h + gap_px
    draw.rectangle((text_x, rule_y, text_x + rule_w, rule_y + rule_h), fill=PURPLE + (255,))
    draw_ink(
        draw,
        (text_x, rule_y + rule_h + rule_gap),
        tagline,
        tagline_font,
        blend(WHITE, FEATURE_BG, 0.86),
    )

    graphic = canvas.resize(FEATURE_PX, Image.Resampling.LANCZOS)
    graphic.putalpha(255)
    return graphic


# --- entry point -------------------------------------------------------------


def main() -> None:
    for name, image in (
        ("google-play-icon-512.png", build_icon()),
        ("google-play-feature-graphic-1024x500.png", build_feature_graphic()),
    ):
        target = HERE / name
        image.convert("RGBA").save(target, format="PNG", optimize=True)
        print("wrote %s (%dx%d, %s)" % (target.name, image.width, image.height, image.mode))


if __name__ == "__main__":
    main()
