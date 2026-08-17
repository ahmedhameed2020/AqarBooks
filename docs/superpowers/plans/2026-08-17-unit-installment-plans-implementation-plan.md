# Unit Purchase Installment Plans — Implementation Plan

> **For agentic workers:** execute phase by phase with a live-verification
> gate after each, same discipline as
> `docs/superpowers/plans/2026-08-17-unit-rental-occupancy-implementation-plan.md`.

**Goal:** let a member buy a unit over N installments (+ optional down
payment), all backed by ordinary `dues` rows via the existing
`source_type`/`source_id` attribution, reusing `record_payment` unchanged.

**Source spec:** `docs/superpowers/specs/2026-08-17-unit-installment-plans-design.md`.

**Decisions locked (2026-08-17):** no `DRAFT` status — `create_installment_plan`
generates everything eagerly and the plan starts `ACTIVE`. UI lives on a 6th
unit-detail tab ("التقسيط"/"Installments"), matching where leases landed.

---

## Phase 1: Schema

- `installment_plans` (organization_id, property_id, unit_id, buyer_member_id,
  due_type_id, receivable_account_id, status `ACTIVE|COMPLETED|CANCELLED`,
  total_price, down_payment, installment_count, installment_frequency,
  starts_on, created_by/created_at/updated_at, cancelled_by/cancelled_at/cancel_reason).
  Partial unique index on `unit_id where status = 'ACTIVE'`.
- `plan_installments` (plan_id, due_id, sequence_no, principal_amount,
  created_at). Unique `(plan_id, sequence_no)`.
- `dues.source_type` CHECK widened to include `'INSTALLMENT_PLAN'`.

## Phase 2: Permissions & RLS

- `property.installments.view` / `property.installments.manage`, same role
  grants as `property.leases.*`.
- Staff SELECT-only RLS on both new tables (writes go through RPCs only).
- `installment_plans_select_own` (buyer_member_id = current_member_id()).
- `dues_select_own_via_installment_plan`, mirroring `dues_select_own_via_lease`.

## Phase 3: RPCs

- `create_installment_plan(...)`: permission + org-active + unit/buyer/due_type/
  account validation + no-existing-ACTIVE-plan check, computes the
  rounding-reconciled installment amounts, inserts the plan row, the
  `unit_ownerships` row, the down-payment due (if any) + its `plan_installments`
  row, and all N installment dues + rows, all in one transaction. One
  `DUE_BATCH_ISSUED` financial-audit event, one `platform_audit_logs` row.
- `cancel_installment_plan(p_plan_id, p_cancel_reason)`: legal only from
  `ACTIVE`; VOIDs every not-yet-paid installment due; sets
  cancelled_by/cancelled_at/cancel_reason, status `CANCELLED`.
- `COMPLETED` status: set by a lightweight check inside `record_payment`'s
  existing due-status-update path is out of reach (that RPC isn't touched
  per scope) — instead, a small `AFTER UPDATE` trigger on `dues` checks,
  only when a row with `source_type = 'INSTALLMENT_PLAN'` transitions to
  `PAID`, whether every sibling installment due for the same plan is also
  `PAID`, and if so sets the plan to `COMPLETED`. Scoped tightly (trigger
  body is a single `WHERE NEW.source_type = 'INSTALLMENT_PLAN' AND NEW.status
  = 'PAID'` guard before doing any lookup) so it's a no-op for every other
  due update in the system.

## Phase 4: UI

- 6th tab "التقسيط"/"Installments" on the unit detail page.
- Current plan card (buyer, total/down payment/remaining, progress, status),
  a create-plan dialog, a cancel action, and a read-only installment schedule
  table (sequence, due date, amount, status) driven by joining
  `plan_installments` → `dues`.

## Verification per phase (live, against the real database)

- Phase 1: exact-sum invariant (`sum(plan_installments.principal_amount) ==
  total_price - down_payment` to the cent) for a plan with a non-evenly-
  divisible total; only one `ACTIVE` plan per unit enforced.
- Phase 2: org/property isolation, buyer-vs-unrelated-member isolation,
  staff permission gating, foreign-UUID access.
- Phase 3: happy-path creation produces the right number of dues with
  correct amounts; `unit_ownerships` row created; cancelling VOIDs only
  unpaid installments; paying every installment flips the plan to
  `COMPLETED`; `record_payment` works completely unchanged against an
  installment due (same empirical check style used for lease rent).
- Phase 4: create → view → pay via existing finance/payments flow → plan
  reaches COMPLETED → cancel flow on a fresh plan. RTL/EN/mobile.
