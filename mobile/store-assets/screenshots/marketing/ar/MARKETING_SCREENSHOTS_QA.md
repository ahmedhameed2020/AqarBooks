# AqarBooks — Google Play marketing screenshots (Arabic) — QA report

Deterministic render report for the eight Arabic marketing screenshots
that accompany the shipped Play listing. English, machine-generated from
the same facts the renderer used, plus the recorded manual review.

## 1. Deliverables

| File | Dimensions | SHA-256 | Bytes |
|---|---|---|---|
| `01-resident-home-marketing.png` | 1080x2400 | `d6cc1a856b32849368f047a9fa0c2b0d895ec48e1f523fe3806095506f814430` | 364,481 |
| `02-payments-marketing.png` | 1080x2400 | `925058d87e2e4257d7066f100094fb121148221c4475038d70be835ef1a1b08c` | 362,275 |
| `03-fawry-marketing.png` | 1080x2400 | `edb4199ea5b48730340385e95884461450012681cecef547b6f1e7f27d01f8d4` | 334,257 |
| `04-visitor-qr-marketing.png` | 1080x2400 | `4621aac48efcd978cde57fac202139f1df851b0626a5759bbd8fc6c3b972f7b5` | 336,555 |
| `05-maintenance-marketing.png` | 1080x2400 | `273aa21a97bc7ec2b510b576ee5374d9dbec371aefe329e4d723534a2868c40b` | 376,504 |
| `06-technician-marketing.png` | 1080x2400 | `7085ecf57759ad0fcd4a4634a5f7792531f9ace1006a908a4c1eae9d56dff0b0` | 358,933 |
| `07-gate-marketing.png` | 1080x2400 | `99b0034c867ca35a00c77779bf78f8b8e9f6a76add2a2e9594059c8ba2a0c74e` | 432,231 |
| `08-manager-marketing.png` | 1080x2400 | `9d0d6cbe84a4416328113eca9b898b51b92516c630465176f21243060f7956dc` | 543,071 |
| `contact-sheet-marketing-ar.png` | 1910x2363 | `64ab4a6c90beaef91d1ce8976a7ce48256d041faba66facd6e1406337a5a84b0` | 719,603 |
| `manifest-marketing-ar.json` | - | `4361ce6b788e94996fbfbe4ac8d52139f6c3229c06a0a1d764fdd2b4d75fdbfe` | - |
| `MARKETING_SCREENSHOTS_QA.md` | - | this report | - |

All eight main PNGs are exactly 1080x2400, opacity-checked, unique and
non-trivial (see section 8). The contact sheet and this report are review
tooling and are not uploaded to Play Console.

## 2. Canonical assets

| Asset | Path | Facts |
|---|---|---|
| Official logo (canonical, sole logo) | `mobile/assets/images/logo.png` | 977x1024, 82,459 bytes, SHA-256 `9cfb1ee28a13487913a10ba5dad623c85079d20b2ea4a6600f8497f9c8e2bcef` |
| Font weight 400 | `mobile/assets/fonts/IBMPlexSansArabic-Regular.ttf` | 235,924 bytes, SHA-256 `6f611412270a132bbac838da9259d4c68569b4175f3b3b8fa3fa36a30b56dab9` |
| Font weight 500 | `mobile/assets/fonts/IBMPlexSansArabic-Medium.ttf` | 242,100 bytes, SHA-256 `b8363ab9f733dfa4f8e96b8b2102c24b5cf4110fb96d1d3d9a9412f6fb49cf74` |
| Font weight 600 | `mobile/assets/fonts/IBMPlexSansArabic-SemiBold.ttf` | 244,616 bytes, SHA-256 `597bd5502e5997be4414e4c9c88834b30ff3784250c84f20bce2b20e53ebd467` |
| Font weight 700 | `mobile/assets/fonts/IBMPlexSansArabic-Bold.ttf` | 246,992 bytes, SHA-256 `691e0c891a38637ae6bbdb69700f8042cb0724a137bee615068ffdb92244f61f` |

The logo carries alpha (colour type 6, transparent field), so the navy
monogram is always placed on a white plate - the same treatment as the
shipped 512x512 Play icon - and stays legible on the dark variants. The
file is used verbatim as `<img>` content: never redrawn, recolored,
retraced or replaced, and no alternative logo exists anywhere in this
campaign.

Fonts are embedded per document as `data:font/ttf` `@font-face` sources for
weights 400/500/600/700, so Arabic shaping never depends on the host's
installed fonts.

## 3. Source to output mapping

| # | Source (validated capture) | Source SHA-256 | Output | Output SHA-256 |
|---|---|---|---|---|
| 01 | `screenshots/ar/01-resident-home.png` | `f81fd4d9b52ce7e3ff020695772dd33aeabd87e044643a08c59f747c25a12ecb` | `01-resident-home-marketing.png` | `d6cc1a856b32849368f047a9fa0c2b0d895ec48e1f523fe3806095506f814430` |
| 02 | `screenshots/ar/02-payments-dues.png` | `806d714f6f6cfda91f3efba6837161cd88be502aa04f0fa611479287143bb73c` | `02-payments-marketing.png` | `925058d87e2e4257d7066f100094fb121148221c4475038d70be835ef1a1b08c` |
| 03 | `screenshots/ar/03-fawry-payment.png` | `370b9c1fbf96b87392ff73917a331a86eddece60d8e8a12a4846753265afeb76` | `03-fawry-marketing.png` | `edb4199ea5b48730340385e95884461450012681cecef547b6f1e7f27d01f8d4` |
| 04 | `screenshots/ar/04-visitor-qr-pass.png` | `2923da3072d8ac0d5363c1c95e252279a5b20cf0e94f9e2cb21850e0919018a9` | `04-visitor-qr-marketing.png` | `4621aac48efcd978cde57fac202139f1df851b0626a5759bbd8fc6c3b972f7b5` |
| 05 | `screenshots/ar/05-maintenance-request.png` | `56fac1d0f2d612dd535c7a98d40bf634796a0d709f9a958398cb53b5d67ee312` | `05-maintenance-marketing.png` | `273aa21a97bc7ec2b510b576ee5374d9dbec371aefe329e4d723534a2868c40b` |
| 06 | `screenshots/ar/06-technician-dashboard.png` | `319d499aac19942fdf8db1e91848be7187d507ac1ee9b3fa051259aa7891415f` | `06-technician-marketing.png` | `7085ecf57759ad0fcd4a4634a5f7792531f9ace1006a908a4c1eae9d56dff0b0` |
| 07 | `screenshots/ar/07-gate-scanner.png` | `0840d831f2856fd796ee95ff823fcea16b84bf012a2d96c485a1b47126f960fd` | `07-gate-marketing.png` | `99b0034c867ca35a00c77779bf78f8b8e9f6a76add2a2e9594059c8ba2a0c74e` |
| 08 | `screenshots/ar/08-manager-dashboard.png` | `803a07e472a4079f9a45aff014fe88c4b5a7c2f24aed5e6e3630dba90c26fa79` | `08-manager-marketing.png` | `9d0d6cbe84a4416328113eca9b898b51b92516c630465176f21243060f7956dc` |

Every source is required to match its approved SHA-256 **before**
rendering; a mismatch stops the run with `FAIL:` and no file is written.
The screen box is 729x1620 inside a 759x1650 device shell - exactly the source's
1080x2400 ratio (729*2400 == 1620*1080), so the full capture is visible with no
resampling of geometry, no `object-fit` crop, no `filter`, no overlay
inside the screenshot and no aspect-ratio change. The shell masks only the
four 40px corner arcs (`data-corner-clip="nonessential-40px"`), which fall
on flat status-bar/navigation background in these captures - no control,
label or numeral is clipped.

## 4. Art direction per screen

### 01 - `01-resident-home-marketing.png`

- Variant: welcoming — arches, warm gold wash
- Headline: كل ما يخص وحدتك في مكان واحد
- Subtitle: تابع وحدتك ومستحقاتك وطلبات الصيانة بسهولة.
- Art direction: Bright, welcoming opener: two concentric gold arches spring from the lower-left margin, a small gold window lattice sits in the left margin, and a wide, low-alpha gold wash warms the top-left corner. Navy headline, petrol subtitle, purple kicker rule.
- Kicker rule: `#7E1898`; canvas tone: light

### 02 - `02-payments-marketing.png`

- Variant: ledger — statement rules
- Headline: تابع مستحقاتك بكل سهولة
- Subtitle: اطّلع على المستحقات والمدفوعات السابقة في أي وقت.
- Art direction: Payments: a right-aligned column of statement rules of uneven length (gold and petrol) reads as a dues ledger, scored by a vertical spine and five gold ticks in the right margin. Cool petrol wash, purple kicker rule.
- Kicker rule: `#7E1898`; canvas tone: light

### 03 - `03-fawry-marketing.png`

- Variant: payment — code card, authentic Fawry accent
- Headline: ادفع مستحقاتك عبر فوري
- Subtitle: احصل على كود الدفع وسدّد مستحقاتك بسهولة.
- Art direction: Payment focus: a gold code-card outline with two inner rules and dotted keylines in both margins. The only yellow in the campaign is the authentic Fawry yellow #FFDD00 sampled from this screen's own source screenshot, used as the 96x6 kicker rule above the headline and one 184px footer hairline - no other yellow branding.
- Kicker rule: `#FFDD00`; canvas tone: light

### 04 - `04-visitor-qr-marketing.png`

- Variant: entry — visitor gate portal
- Headline: تصاريح ذكية لزوارك
- Subtitle: أنشئ تصاريح الزيارة وشاركها باستخدام رمز QR.
- Art direction: Visitor entry: a gold gate portal with three bars and a petrol access frame, plus mirrored post markers down both margins and a threshold hairline just above the device. Light, open composition - entry is granted, not blocked.
- Kicker rule: `#C5A880`; canvas tone: light

### 05 - `05-maintenance-marketing.png`

- Variant: technical — dimension lines and hatch
- Headline: صيانة أسهل، ومتابعة أوضح
- Subtitle: قدّم طلبات الصيانة وتابع مراحل تنفيذها.
- Art direction: Technical maintenance: a petrol dimension line with end ticks and four station ticks, a small gold keyframe, two ruled margin traces with cross ticks, and a 72px 45-degree hatch band along the base - a drafting sheet, not a dashboard.
- Kicker rule: `#7E1898`; canvas tone: light

### 06 - `06-technician-marketing.png`

- Variant: workflow — task nodes and connectors
- Headline: مهامك اليومية بين يديك
- Subtitle: نظّم أعمال الصيانة وتابع المهام المكلّف بها.
- Art direction: Technician workflow: three gold task-node outlines chained by elbow connectors down the left edge, mirrored by an eight-point petrol task queue in the right margin. A restrained purple wash in the top-right corner ties it to the purple kicker rule.
- Kicker rule: `#7E1898`; canvas tone: light

### 07 - `07-gate-marketing.png`

- Variant: security — dark navy, scan brackets
- Headline: دخول منظّم وآمن
- Subtitle: تحقّق من تصاريح الزوار بسرعة عبر مسح رمز QR.
- Art direction: Dark security: the source screen is itself dark navy, so the canvas goes near-black #042434 fading to #07425D and the device reads as a lighter #07425D shell. Gold scan brackets sit at all four canvas corners in echo of the scanner frame inside the screenshot, with three gold radar arcs bottom-right and a dotted petrol trust line.
- Kicker rule: `#C5A880`; canvas tone: dark

### 08 - `08-manager-marketing.png`

- Variant: executive — skyline and hierarchy
- Headline: إدارة عقارية برؤية شاملة
- Subtitle: تابع التحصيلات والصيانة والعمليات من مكان واحد.
- Art direction: Executive oversight: a gold-hairline skyline silhouette rises from the base behind and beside the device (visible in the margins and the 72px footer strip), and a three-rule hierarchy sits top-left. Deep #042434 to #07425D gradient with a soft petrol glow - the calm, widest-view close.
- Kicker rule: `#C5A880`; canvas tone: dark

Shared campaign system: 1080x2400 portrait, 96px side safe margins, a
right-aligned RTL column (kicker rule at y=226, headline at y=256, subtitle
below it), a full-width gold keyline at y=648, a 184px footer hairline at
y=2384, one 96px architectural column grid, and the device bottom-anchored at
y=678. Headline is the strongest type (88px/700), the screenshot is the
second-largest element (729x1620 inside a 759x1650 shell), the subtitle supports at
38px/400, and the logo stays restrained at 54px inside an 84px white plate.
Everyone else in the frame is hairlines, arches, silhouettes and grids.

## 5. Exact copy and RTL method

The copy table is declared once in
`store-assets/generate_marketing_screenshots.py` (`APPROVED_COPY`) and is
emitted verbatim into each document as a single contiguous text node.
`store-assets/validate_marketing_screenshots.py` carries its own separately
hardcoded copy of the same eight pairs and compares them character for
character, so a drift in either table fails the gate. It also:

- rebuilds each screen document from the shared template and requires each
  approved string to occur exactly once, and no other screen's string to
  occur at all;
- requires the Latin wordmark `AqarBooks` to be the only other text node in
  the document, so no extra or generated Arabic can be present;
- compares the SHA-256 of the rebuilt document against the hash recorded in
  the render manifest, tying the checked markup to the markup actually
  rendered.

Directionality: `lang="ar" dir="rtl"` on the root, `text-align:right` on
the copy block, physical `right:96px` anchors for the brand row and kicker,
and the device centred with `left:50%; transform:translateX(-50%)` so RTL
does not repin it. Arabic-Indic numerals inside the source screenshots come
from the captures themselves.

Line breaking uses CSS `text-wrap: balance` on the headline and subtitle, so
no headline leaves a single short word on its last line. The break points
were measured in this browser (Chrome 155): the balanced two-line headlines
land at second/first line width ratios of 0.58-1.10, against 0.26-0.44 under
greedy wrapping at the same 88px size. Balancing never edits the copy - the
string in the markup is byte-identical to the approved table.

**No OCR claim is made.** The validator reads DOM/markup and hashes, never
pixels, so it proves which glyph string was *handed to the browser*, not
which glyphs were *rasterised*. Exact Arabic rendering was confirmed by
opening every output (section 7); the validator's own coverage is limited to
markup, geometry and file-level facts, and it says so in its output.

## 6. Privacy evidence

- The eight sources are the fixed, hash-pinned QA captures:
  `screenshots/ar/<NN>-*.png` with the approved SHA-256 values above. The
  renderer refuses to run if any of them changes, so no other capture can
  leak into the campaign.
- Those captures are synthetic by construction: the preview entrypoint
  builds its repository with a null Supabase client, the QR payload is
  `AQP1.v1.NOT-A-REAL-PASS-STORE-SCREENSHOT-SAMPLE`, the guest is
  `ضيف تجريبي`, the Fawry reference `928451736` comes from a stubbed TEST
  checkout, and the gate camera is disabled. See
  `docs/GOOGLE_PLAY_SCREENSHOTS_VALIDATION.md`.
- This campaign adds no new data: every pixel outside the eight sources is
  geometry, the canonical logo or the approved copy. No real name, unit,
  amount, phone number or credential is introduced.
- The renderer performs no network access: all fonts, the logo and the
  screenshots are `data:` URLs; the validator fails any document containing
  an `http`/`https` reference or a non-`data:` `url()`.
- Fawry yellow is the only non-palette hue and it is sampled from source 03
  itself (`#FFDD00`); it appears on screen 03 only, as one 96x6 kicker rule and
  one 184px 1px footer hairline.

## 7. Manual review

Every output and the contact sheet were opened, and every screen's type
band was additionally inspected in a ~1:1 pixel crop (four 1:1 detail panels
and eight type-band panels were rendered in a temporary directory). Reduced
360px-wide previews were also generated in a temporary directory - neither
helper artifact is a deliverable - to judge campaign rhythm and small-size
legibility.

| # | Review at native size (~1:1 crop of the frame and type band) | Reduced 360px preview |
|---|---|---|
| 01 | Balanced two-line headline right-aligned to the 96px margin (second line 73% of the first), no collision with the subtitle; the gold arch trio stays in the left margin clear of the copy and the warm gold wash sits top-left. Source: status bar, balance card, last-payment row and the visitor-pass row are all fully visible and undistorted. | same artwork at 33% - headline still the strongest type, motif stays ambient, margins unchanged |
| 02 | The statement-rule motif reads as a dues ledger at 1:1 and as texture at 360px; balanced headline (تابع مستحقاتك / بكل سهولة); the petrol subtitle is legible on the gradient. Source: the عليّ/دفعت segmented control and all three instalment rows are intact and readable. | same artwork at 33% - headline still the strongest type, motif stays ambient, margins unchanged |
| 03 | The Fawry accent kicker matches the yellow of the fawry chip inside this very screenshot; balanced headline (ادفع مستحقاتك / عبر فوري); the code-card outline and dotted keylines keep to the margins. Source: the reference code, amount and both buttons are uncropped. | same artwork at 33% - headline still the strongest type, motif stays ambient, margins unchanged |
| 04 | Gate portal with mirrored post markers reads clearly, and the threshold hairline sits above the device; single-line headline. The subtitle's final "رمز QR." is shaped with the period to the left of the Latin run. The QR inside the source is square, which independently confirms no aspect-ratio distortion. | same artwork at 33% - headline still the strongest type, motif stays ambient, margins unchanged |
| 05 | Dimension line with end and station ticks, keyframe and the 45-degree hatch band read as drafting notation; the headline breaks after the Arabic comma (صيانة أسهل، / ومتابعة أوضح) instead of leaving one word. Source: the timeline with four Arabic statuses and the attachment row stay legible. | same artwork at 33% - headline still the strongest type, motif stays ambient, margins unchanged |
| 06 | Three task nodes chained by elbow connectors plus an eight-dot queue in the right margin; the softened purple wash (0.09) reads as a faint tint at 1:1 and does not affect headline contrast. Source: the current-task card and the ranked task list are unaffected. | same artwork at 33% - headline still the strongest type, motif stays ambient, margins unchanged |
| 07 | Dark variant: the white headline on #042434 has strong contrast and the #07425D shell separates cleanly from the near-black canvas; the canvas corner brackets echo the scanner frame inside the screenshot without touching it. Source: the docked scan panel, manual search field and bottom navigation are fully visible. | same artwork at 33% - headline still the strongest type, motif stays ambient, margins unchanged |
| 08 | The skyline silhouette reads in both side margins and in the 72px footer strip, and the three gold hierarchy rules sit clear of the type. Source: the totals card, the three metric tiles and the six-row "يحتاج انتباهك" list are all legible inside the shell. | same artwork at 33% - headline still the strongest type, motif stays ambient, margins unchanged |

| Manual check | Result |
|---|---|
| All eight outputs opened - downscaled frame plus a ~1:1 crop of the type band for every screen | PASS |
| 1:1 pixel crops inspected (01 top/middle/bottom-right, 03 headline + accent, 06 header wash, 07 header chip) | PASS |
| Four 1:1 detail panels: no clipped glyph, no overlap, no stray artifact | PASS |
| Contact sheet opened; all eight labels outside the images and legible | PASS |
| Reduced 360px campaign preview opened for rhythm and small-size legibility | PASS |
| Arabic shaping and letter joining correct on every screen | PASS |
| Diacritics from the approved copy intact (اطّلع · وسدّد · قدّم · نظّم · المكلّف · منظّم · تحقّق) | PASS |
| No clipping, overflow or text collision on any screen | PASS |
| Logo unmodified, proportions correct, clear space consistent, and legible on the dark variants' white plate | PASS |
| Source UI legible and unmodified; QR still square (no aspect distortion) | PASS |
| Only the approved copy appears; no extra or generated Arabic text | PASS |

## 8. Validation record

Recorded verbatim from `python store-assets/validate_marketing_screenshots.py`
on exactly these artifacts (only this report's prose sections changed after
that run, which does not affect any rendered file):

```
  python store-assets/validate_marketing_screenshots.py   (exit 0)

output directory D:\Web\AqarBooks\mobile\store-assets\screenshots\marketing\ar
  11 file(s) present; 8 expected output(s) + contact sheet + QA report
  manifest  manifest-marketing-ar.json (allowed extra, validated below)

approved copy (generator table vs this file's hardcoded table)
  OK   generator copy table == independently hardcoded table (8 pairs)
  OK   generator.APPROVED_COPY == approved table

pinned inputs (re-hashed now)
  OK   logo logo.png sha256 9cfb1ee28a13487913a10ba5dad623c85079d20b2ea4a6600f8497f9c8e2bcef
  OK   logo 977x1024, 8-bit colour type 6
  OK   fonts 4/4 present and hashed
  OK   sources 8/8 hashed to the approved values at 1080x2400

output images (decoded: dimensions, bit depth, every alpha sample, block colour count)
  01-resident-home-marketing.png   1080x2400  8-bit type 2  opaque  decoded  145 col  364,481B  d6cc1a856b328493
  02-payments-marketing.png        1080x2400  8-bit type 2  opaque  decoded  131 col  362,275B  925058d87e2e4257
  03-fawry-marketing.png           1080x2400  8-bit type 2  opaque  decoded  141 col  334,257B  edb4199ea5b48730
  04-visitor-qr-marketing.png      1080x2400  8-bit type 2  opaque  decoded  138 col  336,555B  4621aac48efcd978
  05-maintenance-marketing.png     1080x2400  8-bit type 2  opaque  decoded  114 col  376,504B  273aa21a97bc7ec2
  06-technician-marketing.png      1080x2400  8-bit type 2  opaque  decoded  130 col  358,933B  7085ecf57759ad0f
  07-gate-marketing.png            1080x2400  8-bit type 2  opaque  decoded  126 col  432,231B  99b0034c867ca35a
  08-manager-marketing.png         1080x2400  8-bit type 2  opaque  decoded  140 col  543,071B  9d0d6cbe84a44163
  contact-sheet-marketing-ar.png   1910x2363  8-bit type 2  opaque  decoded  207 col  719,603B  64ab4a6c90beaef9

render manifest manifest-marketing-ar.json
  OK   canvas 1080x2400 at deviceScaleFactor 1
  OK   Fawry accent re-sampled from source 03: #FFDD00
  OK   manifest logo hash == canonical logo
  OK   manifest font hashes == files on disk
  OK   manifest contact sheet entry matches the file

document contract per screen (markup rebuilt from the shared template), 8/8 screens:
  OK   canonical logo embedded verbatim
  OK   source <NN>-*.png embedded verbatim
  OK   screen image drawn with object-fit:contain
  OK   screen box 729x1620
  OK   screen box ratio == source ratio (729*2400 == 1620*1080)
  OK   filter:none only (no sharpening, no recolor)
  OK   nothing overlays or annotates the source inside the screen box
  OK   no layer painted above the content
  OK   corner clip declared and bounded at 40px
  OK   text nodes == approved headline + subtitle + AqarBooks
  OK   rebuilt markup matches the manifest's render hash

PASS: 8/8 marketing screenshots + contact sheet valid (1080x2400 opaque, unique,
non-trivial; sources and logo hash-pinned; template contract and approved copy verified)
```

## 9. Limitations

- Rendering is deterministic in this environment (same browser binary,
  same flags, `deviceScaleFactor` 1, virtual time budget): re-running the
  generator is expected to reproduce the recorded hashes, and the validator
  re-checks the recorded hashes against the files on disk. A different
  Chrome/Edge major version, a different font rasteriser or a different OS
  may change subpixel antialiasing and therefore the output hashes, without
  changing layout or copy.
- The validator proves 1080x2400, opacity, uniqueness, non-triviality,
  hash pinning, palette/contract compliance and exact copy in the markup. It
  cannot see pixels semantically: no OCR, no glyph-level Arabic shaping
  proof, no automated detection of a clipped word or an overlap. That
  evidence is the manual review in section 7, re-run on every artwork
  change.
- The device shell is a drawn frame, not a real device photo, and the
  sources are emulator captures (`Medium_Phone_API_36.1`, 1080x2400), not
  captures from a retail device - the same limitation the store validation
  document records for the raw listing screenshots.
- Readiness is enforced twice: every document waits for all images to
  decode, `document.fonts.ready`, two animation frames and a 120ms settle
  before it marks itself, and the capture runs under a virtual-time budget.
  A probe render of the first screen - the real document plus a four-segment
  strip in the last four rows, painted only when each condition holds - is
  decoded and its pixels read, so "fonts loaded, 2/2 images decoded, hook
  fired" is evidenced from a captured frame with the same flags as the
  deliverables. It cannot prove paint completeness per screen beyond the
  shared template and identical flags, which is why the visual review in
  section 7 is part of the gate.
- Glyph metrics assume the four bundled IBM Plex Sans Arabic TTFs. Swapping
  a font file changes line breaking and is a new artwork revision, not a
  re-run.

## 10. Reproduce and validate

```powershell
# from mobile/ - render the eight screenshots, contact sheet, manifest, report
python store-assets/generate_marketing_screenshots.py

# deterministic gate: files, sizes, opacity, uniqueness, hashes, palette,
# template contract, approved copy, manifest consistency; exits non-zero on
# any failure and prints PASS only when everything holds
python store-assets/validate_marketing_screenshots.py
```

Both scripts use the Python standard library only (no Pillow, no third-party
package) and discover Chrome/Edge themselves; if no browser is found, the
generator fails loudly instead of writing a partial campaign.

## 11. Deliberate exclusions

- No Flutter, backend, signing or production file was modified; nothing was
  committed, pushed, deployed or uploaded.
- No generative model, stock image, cartoon, person, photograph or invented
  icon is used. The scene is HTML/CSS/SVG geometry only.
- No Arabic text was written for this campaign: the only Arabic in every
  output is the eight approved headline/subtitle pairs, and the only other
  text is the Latin wordmark `AqarBooks`.
