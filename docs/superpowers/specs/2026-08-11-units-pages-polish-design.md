# Units Pages Polish & Enrichment — Design Spec

**Date:** 2026-08-11
**Area:** `app/[locale]/(app)/property/` (Units / Property)
**Type:** Visual polish + content enrichment
**Status:** Approved (design), pending implementation plan

## Goal

Bring the Units detail page and its sub-branches up to the polish level already
present on the units list page, and enrich the detail page with new, data-grounded
content — organized into tabs so density does not force an over-long page. All work
stays within the existing design system; no new libraries.

## Scope

**In scope**

- `property/[unitId]/page.tsx` — full redesign into a sticky header + 4-tab layout, with enriched content.
- `dues-table.tsx`, `payments-table.tsx` — visual upgrade to match the polished table language.
- `unit-drawer.tsx` — light consistency touch-ups only (match new header's type/area treatment).
- `add-unit-dialog.tsx`, `manage-structure-dialog.tsx` — spacing/title/icon consistency only; no functional change.
- **`finance/payments/page.tsx` + `record-payment-form.tsx`** and **`finance/dues/page.tsx` + `issue-due-form.tsx`** — add `?unit=<id>` prefill support (see "Header Actions").
- New client components for charts and timelines (see Components).
- New shared util `lib/finance/aging.ts` (see "Aging").

**Out of scope**

- `property/page.tsx` (list page) — already polished; left as-is. Only verify the new detail header speaks its visual language.
- Any schema change, new table, or new backend engine. No audit-log table is added.
- Functional behavior of dialogs, filters, pagination, CSV export (beyond the prefill work above).

## Decisions (locked during brainstorming)

1. **Ambition:** Polish **plus** content enrichment (not cosmetic only).
2. **Direction:** Tabbed organization ("C") for the detail page.
3. **Tabs:** Four — نظرة عامة (Overview) / المالية (Financials) / الملكية (Ownership) / النشاط (Activity).
4. **Header:** Sticky/persistent header (identity + KPI row + primary actions) visible across all tabs.
5. **Charts:** `recharts` (already used in `dashboard/charts.tsx`), theme-aware via the same `color-mix` + light/dark series pattern.
6. **Tabs component:** Existing `components/ui/tabs.tsx` (Radix).
7. **Header actions:** Build real `?unit=` prefill support into the payments and dues pages this sprint (rather than disabling the buttons). This also fixes the existing `UnitDrawer`, whose "Record Payment" / "Issue Due" links already point at these routes but are currently ignored.

## Detail Page Architecture

### Sticky Header (all tabs)

- `BackButton` (existing) at top.
- Hero block using the list page's language: `gradient-hero-banner`, `rounded-3xl`, `border-border/60`, `shadow-xs`.
  - Left: unit `code` + type (with the colored type icon from `UNIT_TYPE_ICONS`), `OccupancyBadge`, arrears/settled badge; sub-line: building · zone · floor · area · registered date (`created_at`).
  - Right: **Record Payment** and **Issue Due** actions (links below).
- KPI row: 4 `KpiCard`s — Balance · Total Due · Total Paid · Last Payment — wrapped in `reveal-stagger`.

### Header Actions (prefill)

- Links: `/finance/payments?unit=<id>` and `/finance/dues?unit=<id>`.
- **`finance/dues`:** read `searchParams.unit`; if it matches an org unit, preselect it in
  `IssueDueForm`'s unit select. Invalid/foreign unit → ignore param, form opens normally.
- **`finance/payments`:** read `searchParams.unit`; if valid, filter/preselect the open-dues
  options in `RecordPaymentForm` to that unit (the form is driven by open dues, not a unit
  field). Invalid/foreign unit → ignore param.
- Both pages must keep working with no `unit` param (current behavior preserved).
- Because prefill is now real, the header buttons and the drawer buttons both lead to a
  populated form — never an empty/no-op page.

### Tab state

- Controlled via URL search param `?tab=overview|financials|ownership|activity` so it is
  shareable, back-button friendly, and SSR-renderable.
- **Default + invalid handling:** any missing or unrecognized `tab` value resolves to
  `overview` without error.
- Switching tabs writes browser history so the back button moves between tabs correctly.

### Tab content & data sources

| Tab | Content | Data source |
|-----|---------|-------------|
| **① Overview** | Financial-health summary card (balance + arrears/settled badge); current-owner card (name, phone, share %, link to member); "Unit facts" grid (type, floor, area, building/zone, registered date); last 3 activity events (mini feed). | `units_with_financials`, `unit_ownerships` + `members` |
| **② Financials** | `recharts` chart: dues-issued vs payments-received by month; balance breakdown + arrears aging buckets; `DuesTable`; `PaymentsTable`. | Monthly aggregation from `dues` (by `issue_date`) and `payments` (by `payment_date`, via `payment_allocations` → `dues.unit_id`); aging via `lib/finance/aging.ts` |
| **③ Ownership** | Current owner(s) + share-distribution bar; primary contact highlighted; ownership history timeline (current and past owners, start/end dates). | Full `unit_ownerships` (no `end_date` filter) + `members` |
| **④ Activity** | Unified chronological timeline merged from real events: due issued · payment received · ownership change (start/end) · unit created — each with an icon and tone color. | Derived merge of the above tables |

**Activity feed rationale:** there is no audit/activity table. The feed is a *derived*
timeline synthesized from existing timestamped events (`dues.issue_date`,
`payments.payment_date`, `unit_ownerships.start_date`/`end_date`, `units.created_at`).
It is presented as a "unit history", not an audit trail.

## Aging (single source of truth)

The financials tab's aging must match `finance/reports/aging` exactly. Extract the existing
report's logic into `lib/finance/aging.ts` and consume it from both places so a due can never
land in a different bucket on two screens.

- **Remaining per due:** `remaining = amount − Σ(payment_allocations.amount for POSTED payments only)`.
  A partially-paid due contributes **only its remaining** to a bucket, never its full amount.
- **Eligible dues:** status in `ISSUED | PARTIALLY_PAID | OVERDUE`, then keep only `remaining > 0`.
- **Bucket boundaries** (`daysOverdue = floor((today − due_date)/86400000)`):
  `current` (≤0) / `1–30` / `31–60` / `61–90` / `90+`.
- The extracted helper exports the bucket keys/labels and a `bucketFor(daysOverdue)` +
  remaining calculator. The existing `finance/reports/aging/page.tsx` is refactored to import
  it (behavior unchanged), guaranteeing parity.
- **Invariant:** on the financials tab, the sum of all aging buckets equals the unit's
  outstanding balance (to the cent).

## Sub-branch Polish

- **`DuesTable` / `PaymentsTable`:** upgrade container from `rounded-lg border` to the
  polished table language — `rounded-2xl border border-border/60`, header `bg-muted/30`,
  colored status badges (already present for dues), `tabular-nums`, and an elegant empty
  state. No query changes.
- **`UnitDrawer`:** already well designed; only align the header's type/area presentation
  with the new detail header for consistency (plus it inherits the now-working prefill links).
- **Dialogs (`AddUnitDialog`, `ManageStructureDialog`):** review spacing, titles, icons for
  consistency; no functional change.
- **List page:** unchanged; verify the new detail header matches its visual language.

## Mobile / Responsive

- **Tabs on mobile:** the 4 tab triggers must be horizontally scrollable (or render as a
  segmented control) — never wrap into a tall multi-row block.
- **Sticky header collapse:** on small screens the header shrinks on scroll — the gradient
  hero collapses/hides while the KPI figures (or a condensed balance strip) remain pinned.
  The sticky region must not occupy half the viewport on mobile.
- Charts and tables scroll within their own `overflow-x-auto` containers; the page body never
  scrolls horizontally.
- Full RTL/LTR verified at mobile widths.

## Visual Consistency Rules (standards)

- Shared tokens: `rounded-2xl`/`rounded-3xl`, `border-border/60`, `shadow-xs`; tone colors
  `emerald` (positive) / `rose` (negative) / `amber` (warning) / `primary` (info);
  `tabular-nums` on every number.
- Full RTL/LTR (Arabic/English) with `rtl:-scale-x-100` on directional icons; all strings
  bilingual via the existing `isAr` pattern.
- Accessibility: WCAG-adequate contrast, keyboard-navigable tabs (Radix), appropriate `aria`.
- Charts theme-aware using `charts.tsx`'s `color-mix` + light/dark series approach.
- No new dependencies.

## Components

**New**

- `unit-detail-tabs.tsx` — client wrapper reading/writing `?tab=`, rendering tab triggers + panels; handles invalid-tab fallback and mobile scrollable triggers.
- `unit-financials-chart.tsx` — client, `recharts` dues-vs-payments monthly chart (+ aging).
- `ownership-timeline.tsx` — ownership history timeline.
- `activity-timeline.tsx` — merged derived activity feed.
- `lib/finance/aging.ts` — shared aging bucket + remaining logic.

**Modified**

- `property/[unitId]/page.tsx` — new queries (monthly aggregation, full ownership history,
  activity merge) + new layout; remains a Server Component. Client tab wrapper receives
  already-fetched data as props (keep data fetching on the server).
- `dues-table.tsx`, `payments-table.tsx` — presentational upgrade (stay Server Components).
- `finance/payments/page.tsx`, `record-payment-form.tsx` — `?unit=` prefill.
- `finance/dues/page.tsx`, `issue-due-form.tsx` — `?unit=` prefill.
- `finance/reports/aging/page.tsx` — refactor to consume `lib/finance/aging.ts` (no behavior change).
- `unit-drawer.tsx`, `add-unit-dialog.tsx`, `manage-structure-dialog.tsx` — consistency touch-ups.

## Data / Query Notes

- Monthly aggregation and the activity merge are computed in the server component from the
  same tables the page already reads; keep organization_id scoping explicit (as the existing
  detail page does — a cross-tenant `unitId` must 404, never leak).
- Payments are linked to a unit only through `payment_allocations` → `dues.unit_id`
  (`payments.unit_id` is null in production), matching the existing page's approach.
- Ownership history uses the full `unit_ownerships` set (no active-only filter), ordered by date.

## Verification

- [ ] KPI numbers in the sticky header == financials tab numbers == the unit's balance on the list page, to the cent.
- [ ] `?tab=` with an invalid value falls back to `overview` without breaking.
- [ ] Browser back/forward moves between tabs correctly (history written properly).
- [ ] A brand-new unit with no payments/owners/records: chart shows an empty state, and the
      activity timeline shows only the "unit created" event — zero errors.
- [ ] A `unitId` from another tenant returns 404 (actually tested, not assumed).
- [ ] Financials tab: sum of aging buckets == outstanding balance exactly.
- [ ] Header/drawer "Record Payment" and "Issue Due" open the target form with the unit prefilled.
- [ ] `next build` + `tsc --noEmit` + lint all pass.

## Risks / Notes

- Tab state in URL must not clash with the drawer's `?unit=` param usage on the list page
  (different route, so no conflict).
- Charts must render acceptably with sparse/empty data (new units): show an empty state, not a broken axis.
- Prefill must degrade gracefully for an invalid/foreign `unit` param (ignore, don't error).
- Keep the client bundle lean: only the chart/timeline/tab interactivity is client-side; tables stay server-rendered.
```
