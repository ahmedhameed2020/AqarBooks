"""Validate the Google Play static listing assets in this directory.

Asserts, for every asset: PNG format, exact dimensions, and zero transparent
pixels (Play rejects transparency in the icon and feature graphic). Also checks
that the brand ink is actually present, so a blank file cannot pass.

Run with the workspace Python:
  python mobile/store-assets/validate_store_assets.py
Exits 0 and prints PASS when every asset is valid, 1 otherwise.
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent

NAVY = (7, 66, 93)  # #07425D
PURPLE = (126, 24, 152)  # #7E1898

# file name -> (width, height, minimum navy pixels, minimum purple pixels)
EXPECTED = {
    "google-play-icon-512.png": (512, 512, 10_000, 100),
    "google-play-feature-graphic-1024x500.png": (1024, 500, 10_000, 100),
}


def count_near(image: Image.Image, colour: tuple[int, int, int], tolerance: int = 6) -> int:
    """Pixels within `tolerance` of `colour` on every channel."""
    low = tuple(max(c - tolerance, 0) for c in colour)
    high = tuple(min(c + tolerance, 255) for c in colour)
    channels = image.convert("RGB").split()
    mask = None
    for channel, lo, hi in zip(channels, low, high):
        band = channel.point(lambda v, lo=lo, hi=hi: 255 if lo <= v <= hi else 0)
        mask = band if mask is None else ImageChops.multiply(mask, band)
    return mask.histogram()[255]


def validate(name: str, expected: tuple[int, int, int, int]) -> tuple[list[str], list[str]]:
    report: list[str] = []
    failures: list[str] = []
    path = HERE / name
    width, height, min_navy, min_purple = expected

    if not path.is_file():
        return report, ["%s: file is missing" % name]

    with Image.open(path) as image:
        image.load()
        fmt = image.format
        mode = image.mode
        size = image.size
        alpha = image.convert("RGBA").getchannel("A")
        histogram = alpha.histogram()
        transparent = sum(histogram[:255])
        alpha_range = alpha.getextrema()
        navy = count_near(image, NAVY)
        purple = count_near(image, PURPLE)

    report.append("%s" % name)
    report.append("  format          %s" % fmt)
    report.append("  dimensions      %dx%d (expected %dx%d)" % (size[0], size[1], width, height))
    report.append("  mode            %s" % mode)
    report.append("  alpha range     %d..%d" % alpha_range)
    report.append("  transparent px  %d (expected 0)" % transparent)
    report.append("  brand ink       navy %s px, purple %s px" % (f"{navy:,}", f"{purple:,}"))

    if fmt != "PNG":
        failures.append("%s: format is %s, expected PNG" % (name, fmt))
    if size != (width, height):
        failures.append("%s: is %dx%d, expected %dx%d" % (name, size[0], size[1], width, height))
    if transparent != 0:
        failures.append("%s: has %d transparent pixels, expected 0" % (name, transparent))
    if alpha_range != (255, 255):
        failures.append("%s: alpha range is %s, expected (255, 255)" % (name, alpha_range))
    if navy < min_navy:
        failures.append("%s: only %d navy pixels, expected at least %d" % (name, navy, min_navy))
    if purple < min_purple:
        failures.append("%s: only %d purple pixels, expected at least %d" % (name, purple, min_purple))
    return report, failures


def main() -> int:
    reports: list[str] = []
    failures: list[str] = []
    for name, expected in EXPECTED.items():
        report, found = validate(name, expected)
        reports.extend(report)
        failures.extend(found)
    print("\n".join(reports))
    if failures:
        print("")
        for failure in failures:
            print("FAIL: %s" % failure)
        print("FAILED: %d of %d assets invalid" % (len(failures), len(EXPECTED)))
        return 1
    print("")
    print("PASS: %d/%d assets valid (PNG, exact dimensions, 0 transparent pixels)" % (len(EXPECTED), len(EXPECTED)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
