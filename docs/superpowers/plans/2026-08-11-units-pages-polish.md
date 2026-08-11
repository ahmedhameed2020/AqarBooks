# Units Pages Polish & Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the unit detail page as a polished sticky-header + 4-tab layout with data-grounded enrichment (financial chart, aging, ownership timeline, activity timeline), upgrade the dues/payments tables, and wire real `?unit=` prefill into the finance forms — all within the existing design system.

**Architecture:** Server Components fetch and shape data; a thin Base-UI `Tabs` client wrapper drives `?tab=` state. Pure financial/history logic lives in `lib/` helpers reused across screens (aging is extracted from the existing report so two screens can never disagree). No new dependencies.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, `@base-ui/react` Tabs, `recharts` 3, Tailwind v4, Supabase, `next-intl` (ar/en, RTL).

---

## Testing note (read first)

This project has **no test runner** (`package.json` scripts: `dev`, `build`, `lint` only) and the spec's Verification section defines correctness as `tsc --noEmit` + `next build` + `eslint` + a manual checklist. This plan follows that. Verification commands used throughout:

- Type check: `npx tsc --noEmit`
- Lint: `npm run lint`
- Build: `npm run build`
- Manual: `npm run dev`, then exercise the listed URLs.

Correctness-critical pure logic (aging) is **extracted from already-working production code** and its parity confirmed against the existing report screen. Commit after every task.

## File Structure

**New**
- `lib/finance/aging.ts` — bucket keys/labels + `bucketFor`, `daysOverdue`, `remainingByDue`, `computeAgingRows`, `totalsByBucket`. Single source of truth for aging.
- `lib/property/unit-financials.ts` — monthly dues-vs-payments aggregation for one unit.
- `lib/property/unit-activity.ts` — merge dues/payments/ownership/creation into one sorted event list; `ownershipHistory` shaping.
- `app/[locale]/(app)/property/[unitId]/unit-detail-tabs.tsx` — client `?tab=` wrapper (mobile-scrollable triggers, invalid-tab fallback).
- `app/[locale]/(app)/property/[unitId]/unit-header.tsx` — sticky hero + KPI row.
- `app/[locale]/(app)/property/[unitId]/tab-overview.tsx`
- `app/[locale]/(app)/property/[unitId]/tab-financials.tsx`
- `app/[locale]/(app)/property/[unitId]/tab-ownership.tsx`
- `app/[locale]/(app)/property/[unitId]/tab-activity.tsx`
- `app/[locale]/(app)/property/[unitId]/unit-financials-chart.tsx` — client `recharts` chart.

**Modified**
- `app/[locale]/(app)/property/[unitId]/page.tsx` — new queries + assembly.
- `app/[locale]/(app)/property/dues-table.tsx`, `payments-table.tsx` — presentational upgrade.
- `app/[locale]/(app)/finance/reports/aging/page.tsx` — consume `lib/finance/aging.ts`.
- `app/[locale]/(app)/finance/dues/page.tsx`, `issue-due-form.tsx` — `?unit=` prefill.
- `app/[locale]/(app)/finance/payments/page.tsx`, `record-payment-form.tsx` — `?unit=` prefill.
- `app/[locale]/(app)/property/unit-drawer.tsx`, `add-unit-dialog.tsx`, `manage-structure-dialog.tsx` — consistency touch-ups.

---

## Phase 1 — Shared logic

### Task 1: Extract aging into a shared helper

**Files:**
- Create: `lib/finance/aging.ts`
- Modify: `app/[locale]/(app)/finance/reports/aging/page.tsx`

- [ ] **Step 1: Create `lib/finance/aging.ts`** with the exact logic currently inline in the aging report:

```ts
// Single source of truth for receivables aging. Consumed by the aging report
// and the unit detail financials tab so a due can never fall in different
// buckets on two screens. Logic lifted verbatim from the original
// finance/reports/aging/page.tsx.

export const AGING_BUCKETS = [
  { key: "current", labelAr: "غير مستحقة", labelEn: "Current" },
  { key: "d1_30", labelAr: "1-30 يوم", labelEn: "1-30 days" },
  { key: "d31_60", labelAr: "31-60 يوم", labelEn: "31-60 days" },
  { key: "d61_90", labelAr: "61-90 يوم", labelEn: "61-90 days" },
  { key: "d90plus", labelAr: "أكثر من 90 يوم", labelEn: "90+ days" },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]["key"];

export const AGING_ELIGIBLE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

export type DueLike = { id: string; amount: number; due_date: string; status: string };
export type AllocationLike = { due_id: string; amount: number; payment_id: string };

export function daysOverdue(dueDate: string, today: Date = new Date()): number {
  return Math.floor((today.getTime() - new Date(dueDate).getTime()) / 86400000);
}

export function bucketFor(days: number): AgingBucketKey {
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90plus";
}

// remaining = amount − Σ(allocations from POSTED payments only). A partially
// paid due contributes only its remaining, never its full amount.
export function remainingByDue(
  dues: DueLike[],
  allocations: AllocationLike[],
  postedPaymentIds: Set<string>,
): Map<string, number> {
  const paidByDue = new Map<string, number>();
  for (const a of allocations) {
    if (!postedPaymentIds.has(a.payment_id)) continue;
    paidByDue.set(a.due_id, (paidByDue.get(a.due_id) ?? 0) + a.amount);
  }
  const remaining = new Map<string, number>();
  for (const d of dues) remaining.set(d.id, d.amount - (paidByDue.get(d.id) ?? 0));
  return remaining;
}

export type AgingRow<D extends DueLike> = D & { remaining: number; bucket: AgingBucketKey };

export function computeAgingRows<D extends DueLike>(
  dues: D[],
  allocations: AllocationLike[],
  postedPaymentIds: Set<string>,
  today: Date = new Date(),
): AgingRow<D>[] {
  const remaining = remainingByDue(dues, allocations, postedPaymentIds);
  return dues
    .map((d) => ({ ...d, remaining: remaining.get(d.id) ?? 0, bucket: bucketFor(daysOverdue(d.due_date, today)) }))
    .filter((r) => r.remaining > 0);
}

export function totalsByBucket<D extends DueLike>(rows: AgingRow<D>[]): Map<AgingBucketKey, number> {
  const totals = new Map<AgingBucketKey, number>();
  for (const r of rows) totals.set(r.bucket, (totals.get(r.bucket) ?? 0) + r.remaining);
  return totals;
}
```

- [ ] **Step 2: Refactor `finance/reports/aging/page.tsx`** to consume the helper. Replace the inline `BUCKETS`, `bucketFor`, the `paidByDue` loop, the `rows` map, and `totalsByBucket` with imports. Keep the query and JSX identical. The relevant region becomes:

```tsx
import {
  AGING_BUCKETS,
  AGING_ELIGIBLE_STATUSES,
  computeAgingRows,
  totalsByBucket,
} from "@/lib/finance/aging";

// ...inside the component, queries unchanged except:
//   .in("status", AGING_ELIGIBLE_STATUSES as unknown as string[])

const postedIds = new Set((postedPayments ?? []).map((p) => p.id));
const unitCodeById = new Map((units ?? []).map((u) => [u.id, u.code]));
const rows = computeAgingRows(dues ?? [], allocations ?? [], postedIds).map((r) => ({
  ...r,
  unitCode: unitCodeById.get(r.unit_id) ?? r.unit_id,
}));
const totals = totalsByBucket(rows);
const grandTotal = rows.reduce((s, r) => s + r.remaining, 0);
```

Update the JSX to use `AGING_BUCKETS` (was `BUCKETS`), `totals` (was `totalsByBucket` map), and `AGING_BUCKETS.find(...)` for the row bucket label. Keep all labels/columns as they were.

- [ ] **Step 3: Verify parity.** Run `npx tsc --noEmit` (expect no errors) and `npm run dev`; open `/ar/finance/reports/aging` and confirm the five bucket totals, the per-row remaining, and the grand total are unchanged from before the refactor. Numbers must be byte-identical.

- [ ] **Step 4: Commit**

```bash
git add lib/finance/aging.ts "app/[locale]/(app)/finance/reports/aging/page.tsx"
git commit -m "refactor(finance): extract aging logic into shared lib/finance/aging"
```

---

### Task 2: Unit monthly-financials aggregation helper

**Files:**
- Create: `lib/property/unit-financials.ts`

- [ ] **Step 1: Create the helper.** Pure functions that turn raw dues/allocations/payments rows into a month-keyed series (dues issued vs payments received) for a single unit.

```ts
// Monthly dues-issued vs payments-received series for one unit's financials
// tab. Payments link to a unit only through payment_allocations -> dues.unit_id
// (payments.unit_id is null in production), so the caller passes the allocation
// amounts already resolved per payment.

export type MonthlyFinancialPoint = { month: string; dued: number; paid: number };

type DueRow = { issue_date: string | null; due_date: string; amount: number; status: string };
type PaidRow = { payment_date: string; amount: number };

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7); // YYYY-MM
}

// Build a continuous month axis between the earliest and latest event so the
// chart never shows gaps. Returns [] when there are no events at all.
export function buildMonthlyFinancials(dues: DueRow[], paid: PaidRow[]): MonthlyFinancialPoint[] {
  const duedByMonth = new Map<string, number>();
  const paidByMonth = new Map<string, number>();

  for (const d of dues) {
    if (d.status === "VOID") continue;
    const key = monthKey(d.issue_date ?? d.due_date);
    duedByMonth.set(key, (duedByMonth.get(key) ?? 0) + d.amount);
  }
  for (const p of paid) {
    const key = monthKey(p.payment_date);
    paidByMonth.set(key, (paidByMonth.get(key) ?? 0) + p.amount);
  }

  const keys = [...new Set([...duedByMonth.keys(), ...paidByMonth.keys()])].sort();
  if (keys.length === 0) return [];

  const out: MonthlyFinancialPoint[] = [];
  let cursor = keys[0];
  const last = keys[keys.length - 1];
  // walk month-by-month from first to last inclusive
  while (cursor <= last) {
    out.push({ month: cursor, dued: duedByMonth.get(cursor) ?? 0, paid: paidByMonth.get(cursor) ?? 0 });
    cursor = nextMonth(cursor);
  }
  return out;
}

function nextMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit` — expect no errors. (Consumed in Task 8; runtime verified there against a real unit and an empty unit.)

- [ ] **Step 3: Commit**

```bash
git add lib/property/unit-financials.ts
git commit -m "feat(property): add unit monthly-financials aggregation helper"
```

---

### Task 3: Unit activity + ownership-history helper

**Files:**
- Create: `lib/property/unit-activity.ts`

- [ ] **Step 1: Create the helper.** Merge timestamped events from the tables the page already reads into one sorted list, and shape ownership history.

```ts
// Derived "unit history" — there is no audit table, so the activity feed is
// synthesized from real timestamped events. Presented as history, not audit.

export type ActivityKind = "due_issued" | "payment_received" | "ownership_start" | "ownership_end" | "unit_created";

export type ActivityEvent = {
  kind: ActivityKind;
  date: string; // ISO date (YYYY-MM-DD)
  amount?: number;
  label: string; // pre-resolved for the active locale
};

type DueEvt = { issue_date: string | null; due_date: string; amount: number; type: string; status: string };
type PayEvt = { payment_date: string; amount: number; method: string };
type OwnEvt = { start_date: string; end_date: string | null; member_name: string };

export function buildActivity(
  createdAt: string,
  dues: DueEvt[],
  payments: PayEvt[],
  ownerships: OwnEvt[],
  isAr: boolean,
): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  events.push({
    kind: "unit_created",
    date: createdAt.slice(0, 10),
    label: isAr ? "تم تسجيل الوحدة" : "Unit registered",
  });

  for (const d of dues) {
    if (d.status === "VOID") continue;
    events.push({
      kind: "due_issued",
      date: (d.issue_date ?? d.due_date).slice(0, 10),
      amount: d.amount,
      label: isAr ? `إصدار استحقاق: ${d.type}` : `Due issued: ${d.type}`,
    });
  }
  for (const p of payments) {
    events.push({
      kind: "payment_received",
      date: p.payment_date.slice(0, 10),
      amount: p.amount,
      label: isAr ? "استلام دفعة" : "Payment received",
    });
  }
  for (const o of ownerships) {
    events.push({
      kind: "ownership_start",
      date: o.start_date.slice(0, 10),
      label: isAr ? `بدء ملكية: ${o.member_name}` : `Ownership started: ${o.member_name}`,
    });
    if (o.end_date) {
      events.push({
        kind: "ownership_end",
        date: o.end_date.slice(0, 10),
        label: isAr ? `انتهاء ملكية: ${o.member_name}` : `Ownership ended: ${o.member_name}`,
      });
    }
  }

  // newest first; stable across equal dates
  return events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export type OwnershipHistoryRow = {
  member_id: string;
  member_name: string;
  share_percentage: number;
  is_primary_contact: boolean;
  start_date: string;
  end_date: string | null;
  active: boolean;
};

export function shapeOwnershipHistory(
  rows: { member_id: string; share_percentage: number; is_primary_contact: boolean; start_date: string; end_date: string | null }[],
  memberNameById: Map<string, string>,
  today: string,
): OwnershipHistoryRow[] {
  return rows
    .map((r) => ({
      member_id: r.member_id,
      member_name: memberNameById.get(r.member_id) ?? "—",
      share_percentage: r.share_percentage,
      is_primary_contact: r.is_primary_contact,
      start_date: r.start_date,
      end_date: r.end_date,
      active: !r.end_date || r.end_date >= today,
    }))
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
}
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit` — expect no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/property/unit-activity.ts
git commit -m "feat(property): add unit activity + ownership-history helpers"
```

---

## Phase 2 — Finance form prefill

### Task 4: `?unit=` prefill for Issue Due

**Files:**
- Modify: `app/[locale]/(app)/finance/dues/page.tsx`
- Modify: `app/[locale]/(app)/finance/dues/issue-due-form.tsx`

- [ ] **Step 1: Read the param on the page.** Change the page signature to accept `searchParams`, resolve it, and validate against the fetched units:

```tsx
export default async function DuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { locale } = await params;
  const { unit: unitParam } = await searchParams;
  // ...existing fetches...
  const preselectedUnitId = unitParam && (units ?? []).some((u) => u.id === unitParam) ? unitParam : undefined;
```

Pass it into the form: add `preselectedUnitId={preselectedUnitId}` to `<IssueDueForm />`.

- [ ] **Step 2: Consume it in `issue-due-form.tsx`.** Add the prop and use it as the unit field's initial value. Locate the `react-hook-form` `useForm` default values (or the unit `<select>` initial state) and seed it:

```tsx
export function IssueDueForm({
  // ...existing props...
  preselectedUnitId,
}: {
  // ...existing prop types...
  preselectedUnitId?: string;
}) {
  // wherever defaultValues / initial unit state is set, use:
  //   unit_id: preselectedUnitId ?? ""
```

Match whatever state mechanism the form already uses (RHF `defaultValues.unit_id` or `useState`). Do not change validation or submit behavior.

- [ ] **Step 3: Verify.** `npx tsc --noEmit`; `npm run dev`; open `/ar/finance/dues?unit=<real-unit-id>` and confirm the unit is preselected. Open `/ar/finance/dues?unit=not-a-real-id` and `/ar/finance/dues` — form opens normally with no selection, no error.

- [ ] **Step 4: Commit**

```bash
git add "app/[locale]/(app)/finance/dues/page.tsx" "app/[locale]/(app)/finance/dues/issue-due-form.tsx"
git commit -m "feat(finance): prefill unit in Issue Due form from ?unit= param"
```

---

### Task 5: `?unit=` prefill for Record Payment

**Files:**
- Modify: `app/[locale]/(app)/finance/payments/page.tsx`
- Modify: `app/[locale]/(app)/finance/payments/record-payment-form.tsx`

- [ ] **Step 1: Read + validate the param.** The payments form is driven by open dues, not a unit field. Add `searchParams`, validate the unit exists, and pass both the id and a filtered/annotated due-options view:

```tsx
export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ unit?: string }>;
}) {
  const { locale } = await params;
  const { unit: unitParam } = await searchParams;
  // ...existing fetches (openDues already selects unit_id)...
  const preselectedUnitId = unitParam && (units ?? []).some((u) => u.id === unitParam) ? unitParam : undefined;
```

Annotate each due option with its `unitId` so the client can scope to the unit:

```tsx
const dueOptions = (openDues ?? []).map((d) => ({
  id: d.id,
  unitId: d.unit_id,
  label: `${unitCodeById.get(d.unit_id) ?? d.unit_id} — ${d.amount.toFixed(2)}`,
  remaining: d.amount - (paidByDue.get(d.id) ?? 0),
}));
```

Pass `preselectedUnitId={preselectedUnitId}` to `<RecordPaymentForm />`.

- [ ] **Step 2: Consume it in `record-payment-form.tsx`.** Add `preselectedUnitId` and `unitId` on the due option type. When present, default the due selection to that unit's open dues (preselect the first, or filter the selectable list to that unit — whichever matches the form's current selection UI). Preserve behavior when absent:

```tsx
type DueOption = { id: string; unitId: string; label: string; remaining: number };

export function RecordPaymentForm({
  // ...existing props...
  preselectedUnitId,
}: {
  // ...existing prop types with dues: DueOption[] ...
  preselectedUnitId?: string;
}) {
  const unitDues = preselectedUnitId ? dues.filter((d) => d.unitId === preselectedUnitId) : dues;
  // seed the due field's initial value with unitDues[0]?.id when preselectedUnitId is set
```

Do not change validation or submit.

- [ ] **Step 3: Verify.** `npx tsc --noEmit`; `npm run dev`; open `/ar/finance/payments?unit=<unit-with-open-dues>` and confirm the due selection is scoped/seeded to that unit. Open with an invalid id and with no param — normal behavior, no error.

- [ ] **Step 4: Commit**

```bash
git add "app/[locale]/(app)/finance/payments/page.tsx" "app/[locale]/(app)/finance/payments/record-payment-form.tsx"
git commit -m "feat(finance): prefill unit's open dues in Record Payment form from ?unit= param"
```

---

## Phase 3 — Detail page rebuild

### Task 6: Tab wrapper (`?tab=` state, mobile-scrollable, fallback)

**Files:**
- Create: `app/[locale]/(app)/property/[unitId]/unit-detail-tabs.tsx`

- [ ] **Step 1: Create the client wrapper.** Uses Base-UI `Tabs`, syncs value to `?tab=`, falls back to `overview` for invalid values, writes history on change, and makes triggers horizontally scrollable on mobile.

```tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsIndicator, TabsPanel } from "@/components/ui/tabs";

export const UNIT_TABS = ["overview", "financials", "ownership", "activity"] as const;
export type UnitTab = (typeof UNIT_TABS)[number];

export function resolveTab(raw: string | null | undefined): UnitTab {
  return (UNIT_TABS as readonly string[]).includes(raw ?? "") ? (raw as UnitTab) : "overview";
}

export function UnitDetailTabs({
  labels,
  overview,
  financials,
  ownership,
  activity,
}: {
  labels: Record<UnitTab, string>;
  overview: React.ReactNode;
  financials: React.ReactNode;
  ownership: React.ReactNode;
  activity: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = resolveTab(searchParams.get("tab"));
  const panels: Record<UnitTab, React.ReactNode> = { overview, financials, ownership, activity };

  function onValueChange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <Tabs value={active} onValueChange={onValueChange}>
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList className="w-max min-w-full">
          {UNIT_TABS.map((t) => (
            <TabsTrigger key={t} value={t} className="whitespace-nowrap">
              {labels[t]}
            </TabsTrigger>
          ))}
          <TabsIndicator />
        </TabsList>
      </div>
      {UNIT_TABS.map((t) => (
        <TabsPanel key={t} value={t}>
          {panels[t]}
        </TabsPanel>
      ))}
    </Tabs>
  );
}
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit` — expect no errors. (Wired in Task 11.)

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(app)/property/[unitId]/unit-detail-tabs.tsx"
git commit -m "feat(property): add unit detail tab wrapper with ?tab= state + fallback"
```

---

### Task 7: Sticky header (hero + KPI row)

**Files:**
- Create: `app/[locale]/(app)/property/[unitId]/unit-header.tsx`

- [ ] **Step 1: Create the header.** Mirrors the list page's `gradient-hero-banner` language; sticky on scroll with the hero collapsing on mobile while the KPI strip stays. Reuses `KpiCard`, `OccupancyBadge`, `UNIT_TYPE_ICONS`, `unitTypeLabel`, `UnitBalanceBadge`, `Money`, `BackButton`.

```tsx
import { Wallet, Receipt, CircleCheck, Clock3, Building, CreditCard, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Money } from "@/components/money";
import { KpiCard } from "../../dashboard/kpi-card";
import { BackButton } from "../back-button";
import { OccupancyBadge, unitTypeLabel, UNIT_TYPE_ICONS, type UnitRow } from "../units-table";
import { UnitBalanceBadge } from "../unit-balance-badge";

export function UnitHeader({
  unit,
  locale,
  currency,
  registeredDate,
  lastPayment,
}: {
  unit: UnitRow & { created_at?: string | null };
  locale: string;
  currency: string;
  registeredDate: string | null;
  lastPayment: { amount: number; payment_date: string } | null;
}) {
  const isAr = locale === "ar";
  const facts = [
    isAr ? unit.building_name_ar : unit.building_name_en,
    isAr ? unit.zone_name_ar : unit.zone_name_en,
    unit.floor_number != null ? (isAr ? `الدور ${unit.floor_number}` : `Floor ${unit.floor_number}`) : null,
    unit.area != null ? `${unit.area} ${isAr ? "م²" : "m²"}` : null,
    registeredDate ? (isAr ? `مُسجّلة ${registeredDate}` : `Registered ${registeredDate}`) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <BackButton locale={locale} />

      <div className="gradient-hero-banner relative overflow-hidden rounded-3xl border border-border/60 p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-primary">{UNIT_TYPE_ICONS[unit.unit_type]}</span>
              <h1 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">{unit.code}</h1>
              <OccupancyBadge status={unit.occupancy_status} locale={locale} />
              <UnitBalanceBadge balance={unit.balance} currency={currency} locale={locale} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <Building className="me-1 inline size-3.5" />
              {unitTypeLabel(unit, isAr)}
              {facts ? ` · ${facts}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/finance/payments?unit=${unit.id}`}
              locale={locale}
              className={buttonVariants({ size: "sm", className: "gap-1.5" })}
            >
              <CreditCard className="size-3.5" />
              {isAr ? "سداد دفعة" : "Record Payment"}
            </Link>
            <Link
              href={`/finance/dues?unit=${unit.id}`}
              locale={locale}
              className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
            >
              <Plus className="size-3.5" />
              {isAr ? "إصدار مستحق" : "Issue Due"}
            </Link>
          </div>
        </div>
      </div>

      <div className="reveal-stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div style={{ "--reveal-i": 0 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? `الرصيد الحالي (${currency})` : `Current balance (${currency})`}
            value={<Money amount={unit.balance} locale={locale} tone={unit.balance > 0 ? "negative" : "positive"} />}
            icon={<Wallet className="size-5" />}
            tone={unit.balance > 0 ? "negative" : "positive"}
          />
        </div>
        <div style={{ "--reveal-i": 1 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? `إجمالي المستحق (${currency})` : `Total due (${currency})`}
            value={<Money amount={unit.total_due} locale={locale} />}
            icon={<Receipt className="size-5" />}
            tone="info"
          />
        </div>
        <div style={{ "--reveal-i": 2 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? `إجمالي المدفوع (${currency})` : `Total paid (${currency})`}
            value={<Money amount={unit.total_paid} locale={locale} tone="positive" />}
            icon={<CircleCheck className="size-5" />}
            tone="positive"
          />
        </div>
        <div style={{ "--reveal-i": 3 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? "آخر دفعة" : "Last payment"}
            value={lastPayment ? <Money amount={lastPayment.amount} currency={currency} locale={locale} /> : "—"}
            hint={lastPayment?.payment_date}
            icon={<Clock3 className="size-5" />}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit` — expect no errors. (`KpiCard` accepts a `tone="info"`; confirm the type union in `kpi-card.tsx` includes `"info"` — it does.)

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(app)/property/[unitId]/unit-header.tsx"
git commit -m "feat(property): add sticky unit header (hero + KPI row)"
```

---

### Task 8: Financials tab + chart

**Files:**
- Create: `app/[locale]/(app)/property/[unitId]/unit-financials-chart.tsx`
- Create: `app/[locale]/(app)/property/[unitId]/tab-financials.tsx`

- [ ] **Step 1: Create the chart (client, recharts).** Follow `dashboard/charts.tsx`'s theme-aware pattern (`color-mix` grid/ink, light/dark series). Empty state when no points.

```tsx
"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import type { MonthlyFinancialPoint } from "@/lib/property/unit-financials";

const SERIES = {
  dued: "#6366f1",
  paid: "#10b981",
} as const;
const GRID = "color-mix(in oklab, currentColor 10%, transparent)";
const INK_MUTED = "color-mix(in oklab, currentColor 60%, transparent)";

export function UnitFinancialsChart({
  data,
  labels,
}: {
  data: MonthlyFinancialPoint[];
  labels: { dued: string; paid: string; empty: string };
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border/60 text-sm text-muted-foreground">
        {labels.empty}
      </div>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: INK_MUTED }} tickLine={false} axisLine={false} width={48} />
          <Tooltip cursor={{ fill: GRID }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="dued" name={labels.dued} fill={SERIES.dued} radius={[4, 4, 0, 0]} />
          <Bar dataKey="paid" name={labels.paid} fill={SERIES.paid} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Create the financials tab (server).** Renders the chart, the aging bucket strip (via `lib/finance/aging`), then `DuesTable` and `PaymentsTable`. Receives already-computed data as props from `page.tsx`.

```tsx
import { Money } from "@/components/money";
import { AGING_BUCKETS, type AgingBucketKey } from "@/lib/finance/aging";
import type { MonthlyFinancialPoint } from "@/lib/property/unit-financials";
import { DuesTable } from "../dues-table";
import { PaymentsTable } from "../payments-table";
import { UnitFinancialsChart } from "./unit-financials-chart";

export function TabFinancials({
  organizationId,
  unitId,
  locale,
  currency,
  monthly,
  agingTotals,
}: {
  organizationId: string;
  unitId: string;
  locale: string;
  currency: string;
  monthly: MonthlyFinancialPoint[];
  agingTotals: Map<AgingBucketKey, number>;
}) {
  const isAr = locale === "ar";
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="mb-4 text-sm font-semibold">{isAr ? "المستحقات مقابل المدفوعات (شهريًا)" : "Dues vs payments (monthly)"}</h2>
        <UnitFinancialsChart
          data={monthly}
          labels={{
            dued: isAr ? "مستحقات" : "Dues",
            paid: isAr ? "مدفوعات" : "Payments",
            empty: isAr ? "لا توجد حركات مالية بعد" : "No financial activity yet",
          }}
        />
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="mb-4 text-sm font-semibold">{isAr ? "أعمار المتأخرات" : "Arrears aging"}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {AGING_BUCKETS.map((b) => (
            <div key={b.key} className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">{isAr ? b.labelAr : b.labelEn}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">
                <Money amount={agingTotals.get(b.key) ?? 0} locale={locale} zeroLabel="—" />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{isAr ? "سجل الاستحقاقات" : "Dues history"}</h2>
        <DuesTable organizationId={organizationId} unitId={unitId} locale={locale} currency={currency} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{isAr ? "سجل الدفعات" : "Payments history"}</h2>
        <PaymentsTable organizationId={organizationId} unitId={unitId} locale={locale} currency={currency} />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify.** `npx tsc --noEmit`. Runtime verified in Task 11 against a real unit (bars + non-zero buckets) and a brand-new unit (empty-state card, all buckets `—`).

- [ ] **Step 4: Commit**

```bash
git add "app/[locale]/(app)/property/[unitId]/unit-financials-chart.tsx" "app/[locale]/(app)/property/[unitId]/tab-financials.tsx"
git commit -m "feat(property): add financials tab with monthly chart + aging strip"
```

---

### Task 9: Overview tab

**Files:**
- Create: `app/[locale]/(app)/property/[unitId]/tab-overview.tsx`

- [ ] **Step 1: Create the tab.** Financial-health summary + current-owner card + unit-facts grid + last-3 activity mini feed. Receives shaped data as props.

```tsx
import { Wallet, User, ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Money } from "@/components/money";
import type { UnitRow } from "../units-table";
import type { ActivityEvent } from "@/lib/property/unit-activity";
import { ActivityTimeline } from "./tab-activity";

export function TabOverview({
  unit,
  locale,
  currency,
  owner,
  registeredDate,
  recentActivity,
}: {
  unit: UnitRow;
  locale: string;
  currency: string;
  owner: { id: string; name: string; phone: string | null; share: number } | null;
  registeredDate: string | null;
  recentActivity: ActivityEvent[];
}) {
  const isAr = locale === "ar";
  const facts: [string, string][] = [
    [isAr ? "النوع" : "Type", isAr ? unit.unit_type : unit.unit_type],
    [isAr ? "الدور" : "Floor", unit.floor_number != null ? String(unit.floor_number) : "—"],
    [isAr ? "المساحة" : "Area", unit.area != null ? `${unit.area} ${isAr ? "م²" : "m²"}` : "—"],
    [isAr ? "المبنى" : "Building", (isAr ? unit.building_name_ar : unit.building_name_en) ?? "—"],
    [isAr ? "المنطقة" : "Zone", (isAr ? unit.zone_name_ar : unit.zone_name_en) ?? "—"],
    [isAr ? "تاريخ التسجيل" : "Registered", registeredDate ?? "—"],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Wallet className="size-4 text-primary" />
          {isAr ? "الصحة المالية" : "Financial health"}
        </h2>
        <p className="mt-3 text-3xl font-bold">
          <Money amount={unit.balance} currency={currency} locale={locale} tone={unit.balance > 0 ? "negative" : "positive"} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {unit.balance > 0 ? (isAr ? "رصيد متأخرات قائم" : "Outstanding arrears") : (isAr ? "رصيد منضبط" : "Fully settled")}
        </p>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="text-sm font-semibold">{isAr ? "المالك الحالي" : "Current owner"}</h2>
        {owner ? (
          <Link
            href={`/members/${owner.id}`}
            locale={locale}
            className="mt-3 flex items-center justify-between rounded-xl border border-border/50 p-3 text-sm transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center gap-2 font-semibold">
              <User className="size-4 text-muted-foreground" />
              {owner.name}
              <span className="text-xs font-normal text-muted-foreground">· {owner.share}%</span>
            </span>
            <ArrowUpRight className="size-4 text-primary rtl:-scale-x-100" />
          </Link>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
            {isAr ? "لا يوجد مالك مسجّل" : "No owner on record"}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs lg:col-span-1">
        <h2 className="mb-3 text-sm font-semibold">{isAr ? "بيانات الوحدة" : "Unit facts"}</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs lg:col-span-1">
        <h2 className="mb-3 text-sm font-semibold">{isAr ? "آخر النشاط" : "Recent activity"}</h2>
        <ActivityTimeline events={recentActivity} locale={locale} currency={currency} compact />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify.** `npx tsc --noEmit` — note this imports `ActivityTimeline` from Task 10; if implementing strictly in order, expect a missing-module error until Task 10 lands. Acceptable — do Task 10 before the Task 11 build gate. (If working out of order, do Task 10 first.)

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(app)/property/[unitId]/tab-overview.tsx"
git commit -m "feat(property): add overview tab (health + owner + facts + mini activity)"
```

---

### Task 10: Ownership + Activity tabs (timelines)

**Files:**
- Create: `app/[locale]/(app)/property/[unitId]/tab-activity.tsx`
- Create: `app/[locale]/(app)/property/[unitId]/tab-ownership.tsx`

- [ ] **Step 1: Create the activity timeline** (also used compact in Overview).

```tsx
import { Receipt, CreditCard, UserPlus, UserMinus, Building2 } from "lucide-react";
import { Money } from "@/components/money";
import type { ActivityEvent, ActivityKind } from "@/lib/property/unit-activity";

const ICON: Record<ActivityKind, React.ReactNode> = {
  due_issued: <Receipt className="size-3.5" />,
  payment_received: <CreditCard className="size-3.5" />,
  ownership_start: <UserPlus className="size-3.5" />,
  ownership_end: <UserMinus className="size-3.5" />,
  unit_created: <Building2 className="size-3.5" />,
};
const TONE: Record<ActivityKind, string> = {
  due_issued: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  payment_received: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  ownership_start: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ownership_end: "bg-muted text-muted-foreground",
  unit_created: "bg-primary/10 text-primary",
};

export function ActivityTimeline({
  events,
  locale,
  currency,
  compact = false,
}: {
  events: ActivityEvent[];
  locale: string;
  currency: string;
  compact?: boolean;
}) {
  const isAr = locale === "ar";
  const shown = compact ? events.slice(0, 3) : events;
  if (shown.length === 0) {
    return <p className="text-xs text-muted-foreground">{isAr ? "لا يوجد نشاط بعد" : "No activity yet"}</p>;
  }
  return (
    <ol className="space-y-3">
      {shown.map((e, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${TONE[e.kind]}`}>
            {ICON[e.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{e.label}</p>
            <p className="text-[11px] text-muted-foreground">{e.date}</p>
          </div>
          {e.amount != null && (
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              <Money amount={e.amount} currency={currency} locale={locale} />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function TabActivity({
  events,
  locale,
  currency,
}: {
  events: ActivityEvent[];
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
      <h2 className="mb-4 text-sm font-semibold">{isAr ? "سجل نشاط الوحدة" : "Unit activity history"}</h2>
      <ActivityTimeline events={events} locale={locale} currency={currency} />
    </section>
  );
}
```

- [ ] **Step 2: Create the ownership tab** (share bar + history timeline).

```tsx
import { Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { OwnershipHistoryRow } from "@/lib/property/unit-activity";

export function TabOwnership({
  history,
  locale,
}: {
  history: OwnershipHistoryRow[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const active = history.filter((h) => h.active);
  const palette = ["bg-primary", "bg-emerald-500", "bg-amber-500", "bg-blue-500", "bg-rose-500"];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="mb-3 text-sm font-semibold">{isAr ? "توزيع الملكية الحالي" : "Current ownership split"}</h2>
        {active.length ? (
          <>
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              {active.map((o, i) => (
                <div key={o.member_id} className={palette[i % palette.length]} style={{ width: `${o.share_percentage}%` }} />
              ))}
            </div>
            <ul className="mt-4 space-y-2">
              {active.map((o, i) => (
                <li key={o.member_id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${palette[i % palette.length]}`} />
                    <span className="font-medium">{o.member_name}</span>
                    {o.is_primary_contact && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Star className="size-3 fill-amber-400 text-amber-400" />
                        {isAr ? "جهة الاتصال الأساسية" : "Primary contact"}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums font-semibold">{o.share_percentage}%</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{isAr ? "لا يوجد مالك حالي" : "No current owner"}</p>
        )}
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="mb-4 text-sm font-semibold">{isAr ? "تاريخ الملكية" : "Ownership history"}</h2>
        {history.length ? (
          <ol className="relative space-y-4 border-s border-border/60 ps-5">
            {history.map((o) => (
              <li key={`${o.member_id}-${o.start_date}`} className="relative">
                <span className={`absolute -start-[23px] top-1 size-2.5 rounded-full ${o.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                <p className="text-sm font-medium">{o.member_name} <span className="text-xs font-normal text-muted-foreground">· {o.share_percentage}%</span></p>
                <p className="text-[11px] text-muted-foreground">
                  {o.start_date} → {o.end_date ?? (isAr ? "حتى الآن" : "present")}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-muted-foreground">{isAr ? "لا يوجد سجل ملكية" : "No ownership records"}</p>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify.** `npx tsc --noEmit` — expect no errors (this resolves the Task 9 import too).

- [ ] **Step 4: Commit**

```bash
git add "app/[locale]/(app)/property/[unitId]/tab-activity.tsx" "app/[locale]/(app)/property/[unitId]/tab-ownership.tsx"
git commit -m "feat(property): add ownership + activity timeline tabs"
```

---

### Task 11: Assemble the page (queries + wiring)

**Files:**
- Modify: `app/[locale]/(app)/property/[unitId]/page.tsx`

- [ ] **Step 1: Extend the queries.** Keeping the existing org-scoped `unit`, `ownerships`, `lastPayment`, and `members` fetches, add: `units.created_at`, the full ownership rows with members, the dues+allocations+posted-payments needed for the monthly series + aging, and payment rows for the activity feed. Reuse the existing `unitDueIds` / allocations approach (payments link via `payment_allocations` → `dues.unit_id`).

```tsx
// after existing `unit` fetch — add created_at to the unit view select is not
// possible (view lacks it), so fetch it from the base table:
const { data: unitMeta } = await supabase
  .from("units")
  .select("created_at")
  .eq("id", unitId)
  .eq("organization_id", organization.id)
  .maybeSingle();
const registeredDate = unitMeta?.created_at ? unitMeta.created_at.slice(0, 10) : null;

// full dues for this unit (for chart + aging + activity)
const { data: dueRows } = await supabase
  .from("dues")
  .select("id, unit_id, amount, issue_date, due_date, status, due_type_id")
  .eq("organization_id", organization.id)
  .eq("unit_id", unitId);

// due type names for activity labels
const dueTypeIds = [...new Set((dueRows ?? []).map((d) => d.due_type_id))];
const { data: dueTypes } = dueTypeIds.length
  ? await supabase.from("due_types").select("id, name_ar, name_en").in("id", dueTypeIds)
  : { data: [] };
const dueTypeName = new Map((dueTypes ?? []).map((t) => [t.id, isAr ? t.name_ar : t.name_en]));

// allocations + posted payments for this unit's dues
const dueIds = (dueRows ?? []).map((d) => d.id);
const { data: allocRows } = dueIds.length
  ? await supabase.from("payment_allocations").select("due_id, payment_id, amount").in("due_id", dueIds)
  : { data: [] };
const allocPaymentIds = [...new Set((allocRows ?? []).map((a) => a.payment_id))];
const { data: postedPayRows } = allocPaymentIds.length
  ? await supabase
      .from("payments")
      .select("id, amount, payment_date, method, status")
      .eq("organization_id", organization.id)
      .in("id", allocPaymentIds)
      .eq("status", "POSTED")
  : { data: [] };
const postedIds = new Set((postedPayRows ?? []).map((p) => p.id));
const payById = new Map((postedPayRows ?? []).map((p) => [p.id, p]));

// per-payment amount allocated to THIS unit's dues (for chart + activity)
const paidPerPayment = new Map<string, { amount: number; payment_date: string; method: string }>();
for (const a of allocRows ?? []) {
  if (!postedIds.has(a.payment_id)) continue;
  const p = payById.get(a.payment_id);
  if (!p) continue;
  const prev = paidPerPayment.get(a.payment_id);
  paidPerPayment.set(a.payment_id, {
    amount: (prev?.amount ?? 0) + a.amount,
    payment_date: p.payment_date,
    method: p.method,
  });
}
const paidEvents = [...paidPerPayment.values()];

// full ownership history (no active-only filter)
const { data: ownershipHistoryRows } = await supabase
  .from("unit_ownerships")
  .select("member_id, share_percentage, is_primary_contact, start_date, end_date")
  .eq("organization_id", organization.id)
  .eq("unit_id", unitId)
  .order("start_date", { ascending: false });
const historyMemberIds = [...new Set((ownershipHistoryRows ?? []).map((o) => o.member_id))];
const { data: historyMembers } = historyMemberIds.length
  ? await supabase.from("members").select("id, full_name").in("id", historyMemberIds)
  : { data: [] };
const historyMemberName = new Map((historyMembers ?? []).map((m) => [m.id, m.full_name]));
```

- [ ] **Step 2: Shape the data** with the helpers:

```tsx
import { buildMonthlyFinancials } from "@/lib/property/unit-financials";
import { computeAgingRows, totalsByBucket } from "@/lib/finance/aging";
import { buildActivity, shapeOwnershipHistory } from "@/lib/property/unit-activity";
import { UnitHeader } from "./unit-header";
import { UnitDetailTabs, type UnitTab } from "./unit-detail-tabs";
import { TabOverview } from "./tab-overview";
import { TabFinancials } from "./tab-financials";
import { TabOwnership } from "./tab-ownership";
import { TabActivity } from "./tab-activity";

const today = new Date().toISOString().slice(0, 10);

const monthly = buildMonthlyFinancials(
  (dueRows ?? []).map((d) => ({ issue_date: d.issue_date, due_date: d.due_date, amount: d.amount, status: d.status })),
  paidEvents.map((p) => ({ payment_date: p.payment_date, amount: p.amount })),
);

const agingTotals = totalsByBucket(
  computeAgingRows(
    (dueRows ?? []).filter((d) => ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(d.status)),
    (allocRows ?? []).map((a) => ({ due_id: a.due_id, payment_id: a.payment_id, amount: a.amount })),
    postedIds,
  ),
);

const activity = buildActivity(
  unitMeta?.created_at ?? `${today}T00:00:00Z`,
  (dueRows ?? []).map((d) => ({
    issue_date: d.issue_date,
    due_date: d.due_date,
    amount: d.amount,
    status: d.status,
    type: dueTypeName.get(d.due_type_id) ?? "—",
  })),
  paidEvents,
  (ownershipHistoryRows ?? []).map((o) => ({
    start_date: o.start_date,
    end_date: o.end_date,
    member_name: historyMemberName.get(o.member_id) ?? "—",
  })),
  isAr,
);

const ownershipHistory = shapeOwnershipHistory(ownershipHistoryRows ?? [], historyMemberName, today);

// primary current owner for the overview card (reuse existing activeOwnerships/memberById)
const primary = activeOwnerships[0];
const primaryMember = primary ? memberById.get(primary.member_id) : undefined;
const overviewOwner = primary && primaryMember
  ? { id: primaryMember.id, name: primaryMember.full_name, phone: primaryMember.phone, share: primary.share_percentage }
  : null;
```

- [ ] **Step 3: Replace the JSX return** with the header + tabs. Remove the old flat header/sections (they are superseded).

```tsx
return (
  <main className="space-y-6 p-6">
    <UnitHeader
      unit={unit}
      locale={locale}
      currency={currency}
      registeredDate={registeredDate}
      lastPayment={lastPayment}
    />
    <UnitDetailTabs
      labels={{
        overview: isAr ? "نظرة عامة" : "Overview",
        financials: isAr ? "المالية" : "Financials",
        ownership: isAr ? "الملكية" : "Ownership",
        activity: isAr ? "النشاط" : "Activity",
      }}
      overview={
        <TabOverview
          unit={unit}
          locale={locale}
          currency={currency}
          owner={overviewOwner}
          registeredDate={registeredDate}
          recentActivity={activity}
        />
      }
      financials={
        <TabFinancials
          organizationId={organization.id}
          unitId={unitId}
          locale={locale}
          currency={currency}
          monthly={monthly}
          agingTotals={agingTotals}
        />
      }
      ownership={<TabOwnership history={ownershipHistory} locale={locale} />}
      activity={<TabActivity events={activity} locale={locale} currency={currency} />}
    />
  </main>
);
```

- [ ] **Step 4: Verify.** `npx tsc --noEmit` (no errors), `npm run lint` (clean), `npm run build` (succeeds). Then `npm run dev` and check `/ar/property/<id>` and `/ar/property/<id>?tab=financials`.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(app)/property/[unitId]/page.tsx"
git commit -m "feat(property): assemble tabbed unit detail page with enriched content"
```

---

## Phase 4 — Sub-branch polish

### Task 12: Upgrade DuesTable & PaymentsTable

**Files:**
- Modify: `app/[locale]/(app)/property/dues-table.tsx`
- Modify: `app/[locale]/(app)/property/payments-table.tsx`

- [ ] **Step 1: DuesTable container + empty state.** Change the wrapper from `rounded-lg border` to the polished language and header shading; keep queries and columns:

```tsx
// wrapper:
<div className="overflow-x-auto rounded-2xl border border-border/60 bg-card shadow-xs">
// header row:
<TableRow className="bg-muted/30">
// amount/remaining cells: add `tabular-nums`
// empty state cell: richer copy
```

Apply the same container/header treatment to `payments-table.tsx`. Read each file first to place edits precisely; do not alter the data logic (the `payment_allocations → dues.unit_id` derivation stays).

- [ ] **Step 2: Verify.** `npx tsc --noEmit`; `npm run dev`; open a unit's `?tab=financials` and confirm both tables render with the new look and an empty unit shows the empty state.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(app)/property/dues-table.tsx" "app/[locale]/(app)/property/payments-table.tsx"
git commit -m "style(property): polish dues & payments tables to match design language"
```

---

### Task 13: Drawer & dialog consistency touch-ups

**Files:**
- Modify: `app/[locale]/(app)/property/unit-drawer.tsx`
- Modify: `app/[locale]/(app)/property/add-unit-dialog.tsx`
- Modify: `app/[locale]/(app)/property/manage-structure-dialog.tsx`

- [ ] **Step 1: Drawer.** In `unit-drawer.tsx`, align the sub-line type/area presentation with `UnitHeader` (same order: type · building · zone · floor · area). No behavior change. The "Record Payment" / "Issue Due" links already point to `/finance/payments?unit=` and `/finance/dues?unit=` — now functional after Tasks 4–5; verify they open a prefilled form.

- [ ] **Step 2: Dialogs.** Read `add-unit-dialog.tsx` and `manage-structure-dialog.tsx`; adjust only spacing/title/icon classes for consistency with the design system (e.g., dialog titles `text-sm font-semibold`, consistent icon sizing `size-4`). No functional or field changes.

- [ ] **Step 3: Verify.** `npx tsc --noEmit`; `npm run dev`; open the drawer from the list, click both action buttons (confirm prefilled forms), and open both dialogs to confirm layout is intact.

- [ ] **Step 4: Commit**

```bash
git add "app/[locale]/(app)/property/unit-drawer.tsx" "app/[locale]/(app)/property/add-unit-dialog.tsx" "app/[locale]/(app)/property/manage-structure-dialog.tsx"
git commit -m "style(property): align drawer & dialogs with detail page; verify prefill links"
```

---

## Phase 5 — Verification gate

### Task 14: Run the full verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Automated gates.** Run and confirm all pass:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

- [ ] **Step 2: Manual checklist (via `npm run dev`).** Confirm each spec Verification item:
  - [ ] Header KPI numbers == financials tab numbers == the unit's balance on the list page, to the cent.
  - [ ] `/ar/property/<id>?tab=bogus` renders the Overview tab (no crash).
  - [ ] Browser back/forward moves between tabs correctly.
  - [ ] A brand-new unit (no payments/owners/dues): chart shows empty state, all aging buckets `—`, activity timeline shows only "Unit registered".
  - [ ] `/ar/property/<unitId-from-another-tenant>` returns 404.
  - [ ] Financials tab: sum of the five aging buckets == the unit's outstanding balance exactly.
  - [ ] Header & drawer "Record Payment" / "Issue Due" open the target form with the unit prefilled.
  - [ ] Mobile width (~375px): tab triggers scroll horizontally, page body does not scroll horizontally, hero collapses while KPIs remain usable.
  - [ ] RTL (ar) and LTR (en) both render correctly.

- [ ] **Step 3: Commit** any fixes found during verification with a descriptive message. If none needed, this task closes the plan.

---

## Self-review notes (author)

- **Spec coverage:** header actions/prefill (T4–5), aging single-source + partial-payment remaining (T1, T8), tab fallback + history (T6), mobile (T6/T7 + T14 check), verification checklist (T14), enrichment tabs (T7–11), sub-branch polish (T12–13). All spec sections mapped.
- **Type consistency:** `MonthlyFinancialPoint`, `ActivityEvent`/`ActivityKind`, `OwnershipHistoryRow`, `AgingBucketKey`, `UnitTab` defined once and imported; `KpiCard` `tone="info"` exists in the union.
- **Ordering caveat:** Task 9 imports `ActivityTimeline` from Task 10 — do Task 10 before the Task 11 build gate (noted in T9 Step 2).
- **No test runner:** deliberate, per spec Verification + "no new dependencies"; correctness of aging guaranteed by extraction + parity check (T1 Step 3).
```
