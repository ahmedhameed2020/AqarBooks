# RESORTOS — Phase 8 Implementation Report

**Scope:** Public marketing landing page, demo lead capture, contact page, and SEO — plus a layout refactor required to give the marketing site its own identity separate from the authenticated app shell.
**Verdict: CODE INTEGRATION PASSED — visual review pending** (see §5 — no browser/screenshot tool is available to me in this environment, so polish has been verified structurally, not eyeballed).

---

## 1. What was built

### Layout refactor (prerequisite)
Every route so far shared one global `<SiteHeader>` rendered from the root `app/[locale]/layout.tsx`. A marketing landing page needs its own sticky nav (spec §31, item 1) — stacking a second nav under the generic app header would look unprofessional. Moved `SiteHeader` out of the root layout and into an `(app)` route group (`dashboard`, `property`, `members`, `login`) plus explicitly into `admin/layout.tsx`, `finance/layout.tsx`, and `platform/layout.tsx`, which already had their own layouts. Route groups don't affect URLs — `/dashboard` is still `/dashboard` — so this was a file-organization change, not a routing change. `/` (home), `/demo`, and `/contact` now render with **no** inherited chrome, free to define their own.

### Landing page (`/[locale]` — now the public home page)
All content is the master spec's actual copy (§30), not paraphrased placeholders — the exact bilingual headline, subhead, and description. Sections built: sticky nav, hero with a static dashboard-preview mockup (deterministic placeholder figures, explicitly not live tenant data), trust indicators, the "fragmented systems" problem statement, a 6-item platform feature grid, an accounting-engine deep dive with a real double-entry example, a security section (tenant isolation / immutable postings / audit trail — each claim traceable to an actual enforced mechanism from Phases 1–7, not marketing fluff), white-label branding, pricing tiers **without prices** (per spec's explicit instruction not to invent them), FAQ (native `<details>`/`<summary>` — accessible by default, zero JS), final CTA, footer.

### Visual system
A `.marketing` CSS scope in `globals.css` with its own custom properties (`--mk-bg`, `--mk-surface`, `--mk-emerald`, `--mk-gold`, etc.) — deliberately separate from the shadcn tokens the app shell uses, so this doesn't affect `/dashboard` or any authenticated page. Fixed dark "financial institution" palette per spec §32: deep graphite background, pearl-white headline text, restrained emerald primary accent, muted gold secondary accent, no purple, no glassmorphism, no neon. Fonts are the already-configured Inter (English) and IBM Plex Sans Arabic (Arabic) — no third font introduced, honoring the spec's explicit font mandate over generic "add a display font" instinct.

### `/demo` — lead capture (spec §34)
Full field set from the spec (name, company role, organization, units/gates count, email, phone, preferred contact method, message) plus a CSS-hidden honeypot field. Server-side: `lib/actions/leads.ts` validates with Zod (rejecting unknown fields by construction — the schema only reads named fields off `FormData`), enforces a **database-backed** one-submission-per-email-per-hour rate limit (survives restarts, works across instances — not an in-memory counter), and inserts via the service-role admin client. **The browser has no path to insert into `demo_leads` directly** — no RLS policy grants that to any client role; the service-role key never leaves the server.

### `/contact` — same pattern
Simpler form (name, email, phone, message), same honeypot + rate-limit + service-role-only-write discipline, targeting the `contact_requests` table (schema existed since Phase 2, unused until now).

### SEO
- `app/robots.ts` — disallows `/dashboard`, `/admin`, `/finance/*`, `/platform/*`, `/property`, `/members`, `/login` across both locales
- `alternates.languages` (hreflang) on the homepage
- OpenGraph + Twitter card metadata
- `SoftwareApplication` JSON-LD on the homepage
- `/demo` and `/contact` explicitly `noindex` (lead-capture forms, not content to rank)

## 2. Verification executed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass |
| `npm run lint` | ✅ Pass |
| `npm run build` | ✅ Pass, 66 routes — `/ar`, `/en`, `/ar/demo`, `/en/demo`, `/ar/contact`, `/en/contact` all **statically prerendered** (○/●), not server-rendered per request |
| `/robots.txt` | ✅ 200, generated |
| Route smoke test (curl) | ✅ home/demo/contact 200 both locales; `/dashboard` unauthenticated still 307 → login (layout refactor didn't break existing auth gating) |
| Rendered HTML spot-check | ✅ `/ar` has `lang="ar" dir="rtl"` and the exact Arabic CTA copy; `/en` has the exact English CTA copy |

## 3. Honest limitation: no visual/browser verification

**I do not have a browser, screenshot, or visual-preview tool available in this environment.** Every prior phase's UI was verified by *you* clicking through it in a real browser; that was especially necessary here because a landing page's whole point is how it *looks*, and I cannot see that. What I verified instead: the build succeeds, the correct copy is present in the rendered HTML for both locales, RTL/LTR direction attributes are correct, and the route structure is sound. **I have not confirmed**: whether the dark palette actually reads as premium rather than muddy, whether spacing/hierarchy work at a glance, whether the mobile menu opens/closes correctly, whether the FAQ accordion's RTL chevron rotation looks right, or Core Web Vitals in a real browser. Please open `/ar` and `/en` yourself before treating this as done — this is the one phase where my own checks are not sufficient evidence of quality.

## 4. Known limitations / explicit scope cuts

- **Dashboard preview is a static mockup**, not a live or even lazily-loaded interactive component — correct per spec ("do not expose live tenant data") but worth confirming it reads as intentional, not broken/unfinished.
- **No image assets** — no logo file, no OG image, no favicon beyond Next.js defaults. Spec explicitly bans stock photography, which this respects, but a proper wordmark/favicon is still a gap.
- **Locale switch on `/demo` and `/contact`** goes through the marketing nav's language toggle but was not confirmed to preserve form input across the switch (it re-navigates, which clears the form) — acceptable but worth knowing.
- **`/contact` and `/demo` rate limiting is per-email only** — no IP-based throttling. Sufficient against casual spam, not a determined attacker.

## 5. Next step

Nothing from the master spec's phase list remains unaddressed except the deeper Fixed Assets / Inventory build-out and the remaining ~21 of 26 reports. **Recommend you review the landing page in a browser first** (both locales, mobile width) before deciding whether to polish this further or move to another module.
