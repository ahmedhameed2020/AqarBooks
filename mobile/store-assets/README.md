# Google Play store listing assets

Static Play listing assets for the AqarBooks Android app (`com.aqarbooks.app`). All
files here are generated from existing brand assets only — no new artwork, no
third-party imagery, no gradients.

| File | Dimensions | Format | Purpose | Play Console upload field |
|---|---|---|---|---|
| [google-play-icon-512.png](google-play-icon-512.png) | 512×512 | PNG, opaque (alpha = 255 everywhere) | Store icon shown on the listing, search results, and the Play app page; Play masks it to a rounded square, so the mark sits inside ~17% safe margins | **Main store listing → App icon** (512×512, 32-bit PNG) |
| [google-play-feature-graphic-1024x500.png](google-play-feature-graphic-1024x500.png) | 1024×500 | PNG, opaque | Header banner above the screenshots: the official mark on a white plate with the `AqarBooks` wordmark and the Arabic tagline `إدارة أملاكك بثقة` | **Main store listing → Feature graphic** (1024×500, PNG/JPEG) |

Screenshots are intentionally **not** included: Play requires 2–8 real-device
screenshots (1080×2400 recommended) captured during the device test plan, and those
cannot be produced from static brand assets.

## Composition

**Icon** — solid white background, official mark centred at 66% of the canvas height
(ink margins: 94 px left/right, 86 px top/bottom). White is used rather than navy
because the mark is a knockout silhouette: its letterform counters are transparent,
so on navy the "A" would disappear. Text-free, per Play icon guidance.

**Feature graphic** — solid navy `#07425D` field, white rounded plate holding the
mark, `AqarBooks` in IBM Plex Sans Arabic SemiBold, a `#7E1898` rule (the mark's
accent colour), then the tagline in Regular at 86% white. The whole composition sits
inside the central 80% safe zone (measured content bounds: x 203–818, y 127–372 of
1024×500), which keeps it clear of Play's cropping and of the video play-button
overlay. No gradients, no stock imagery, no text below 36 px.

## Source assets

| Source | Used for |
|---|---|
| [public/AqarBooks.png](../../public/AqarBooks.png) | The official mark (1761×1845, the largest copy in the repo; pixel-equivalent to [mobile/assets/images/logo.png](../../mobile/assets/images/logo.png)). Flattened onto white to remove resampling fringes, then cropped to its ink bounds. |
| `mobile/assets/fonts/IBMPlexSansArabic-SemiBold.ttf` | The `AqarBooks` wordmark |
| `mobile/assets/fonts/IBMPlexSansArabic-Regular.ttf` | The Arabic tagline |

Brand colours: navy `#07425D`, purple `#7E1898` (both taken from the mark itself), white.

## Regenerate and validate

Both scripts are deterministic and read only the sources listed above; they write
only the two PNGs in this directory.

```bash
python mobile/store-assets/generate_store_assets.py
python mobile/store-assets/validate_store_assets.py
```

The validator asserts, for both files: PNG format, exact dimensions, zero
transparent pixels, and the presence of the brand navy/purple ink. It prints `PASS`
and exits 0 when they are valid.

## Arabic text shaping note

The Arabic tagline is drawn with the bundled typeface, so it needs shaping and
right-to-left ordering. The bundled Pillow has no Raqm/HarfBuzz engine
(`PIL.features.check("raqm")` is `False`), so
[generate_store_assets.py](generate_store_assets.py) maps each letter of
`إدارة أملاكك بثقة` to its contextual Unicode Arabic Presentation Forms-B glyph,
applies the standard joining rules plus the lam-alef ligature, reverses the run into
visual order, and asserts that the font actually covers every resulting codepoint
(instead of silently drawing `.notdef` boxes). Keep this in mind when editing the
tagline: the logical string is the input, the shaping is automatic.

## Not covered here

Localised listing text, Data safety answers, permissions rationale, and the publish
checklist live in [mobile/docs/GOOGLE_PLAY_RELEASE.md](../../mobile/docs/GOOGLE_PLAY_RELEASE.md).
