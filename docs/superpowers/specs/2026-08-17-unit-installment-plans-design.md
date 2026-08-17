# Unit Purchase Installment Plans — Design Spec

**Date:** 2026-08-17
**Area:** New `installment_plans` + `plan_installments` tables, `dues.source_type` extension, no changes to `unit_ownerships`, `unit_leases`, or the payment engine
**Type:** New feature (property model gap — a unit can only be billed as a single-amount `due` today, never financed over a schedule)
**Status:** Draft for review — no migration/RPC/RLS/UI code written yet

## Goal

Let a member buy a unit over a schedule of installments — a known total price, an optional down payment, and N equal (or near-equal) future payments — instead of paying a `due`'s full amount at once. This is the deliberately separate, later feature flagged when the [unit rental/occupancy design](2026-08-17-unit-rental-and-occupancy-design.md) was approved: it changes what a `due` *represents* (a slice of a purchase price) rather than *who pays it*, so it was intentionally not designed until that accounting contract was locked and shipped (`unit_leases`, commits `22f4755`..`66b4b32`).

This spec follows the exact conventions that work established, rather than reinventing them: `dues.source_type`/`source_id` attribution, the `property.<subject>.view/manage` permission-key shape, the `dues_select_own_via_lease`-style targeted RLS policy, and `platform_audit_logs` vs `financial_audit_logs` split.

## Scope

**In scope**

- `installment_plans`: one row per unit-purchase financing arrangement (buyer, unit, total price, down payment, installment count/frequency, due_type/receivable_account, status).
- `plan_installments`: one row per installment (including the down payment, if any), each linked to a real `dues` row.
- All N `dues` rows generated **eagerly, in one transaction, at plan-creation time** — not via a lazy sweep. This is the single biggest structural difference from `unit_leases`' rent generation, and is deliberate (§ Decisions 1).
- `dues.source_type` extended with `'INSTALLMENT_PLAN'`.
- `property.installments.view` / `property.installments.manage` permissions.
- RLS: staff gated by the new permissions; the buyer sees their own plan and its dues via a targeted policy, mirroring `dues_select_own_via_lease`.
- Plan lifecycle: `ACTIVE → COMPLETED` (all installments posted) and `ACTIVE → CANCELLED` (buyer backs out; unpaid future installments voided).
- UI: a plan creation flow and a read view — exact placement (unit detail page vs. member profile) is an open question, § Decisions 6.

**Out of scope for v1**

- Automatic early-payoff/rescheduling logic. A buyer can already pay ahead or pay multiple installments in one `record_payment` call — nothing new is needed for that, it falls out of the existing multi-allocation payment engine for free (§ Decisions 4).
- Interest/finance charges on the outstanding balance. Installments are equal slices of `total_price − down_payment`, not an amortization schedule.
- Automatic conditional-ownership/resale-blocking until fully paid. `unit_ownerships` stays exactly as decoupled from this feature as it already is from `unit_leases` (§ Decisions 2).
- Any change to `record_payment`, `payment_allocations`, or `unit_leases`.
- Multi-currency, VAT/WHT-aware installment splitting (a due's amount is still a single flat number, exactly like today).

## Decisions

### 1. Eager generation at creation time, not a lazy sweep — locked, not a question

Every existing due-generation engine in this codebase (`due_schedules`, `unit_leases`' rent generation) is a **lazy sweep**: the end date is unknown or far away, so dues are generated one period at a time, as time passes, with a `*_generation_runs` idempotency table guarding each sweep call. Installments are structurally different: the total count and every due date are **fully known the moment the plan is created** (e.g. "24 monthly installments starting 2026-09-01"). There is nothing to sweep for.

The one existing precedent for "insert N known future rows in a loop, inside one transaction, at creation time" is `create_fiscal_year()` — it inserts every one of a fiscal year's 12 `fiscal_periods` rows synchronously, no sweep, no run-table. `create_installment_plan()` follows that shape: insert the parent plan row, then loop N (or N+1, with a down payment) times inserting `plan_installments` + `dues` rows, all inside one transaction. Idempotency here just means "the plan either exists or it doesn't" — there's no periodic re-invocation to guard against, so no `*_generation_runs` table is needed at all.

### 2. `unit_ownerships` stays fully decoupled — locked, matches the lease precedent exactly

`unit_ownerships` has no financing/payment-status concept today, and the just-shipped `unit_leases` deliberately never links to it either (a lease's tenant is orthogonal to the unit's owner record). This spec keeps that same orthogonality: **a `unit_ownerships` row is inserted immediately at plan creation** (the buyer becomes the recorded owner right away), and `installment_plans` is a purely financial arrangement layered on top, with no gating logic linking the two.

This means "conditional ownership until fully paid" — blocking resale/transfer before the last installment clears — is explicitly **not** modeled in v1. If that's ever needed, it's a new column/flag on `unit_ownerships` (or a check in whatever transfer flow exists), added later, not baked into this feature's core data model now. Flagging this clearly rather than silently deciding it either way, since it's the kind of business rule a future request will likely ask for.

### 3. Rounding rule — locked, mechanical, no precedent existed so this spec sets one

No existing code in this schema splits a total across N rows and reconciles the sum (the closest analog, proportional WHT splitting across payment allocations, does *not* reconcile — each row is independently rounded and aggregate drift is accepted). Installments need an exact rule since the sum must equal `total_price − down_payment` to the cent:

```
per_installment = round((total_price - down_payment) / n, 4)      -- installments 1..n-1
last_installment = (total_price - down_payment) - per_installment * (n - 1)   -- installment n absorbs the remainder
```

This is a deterministic, non-judgment rounding rule (not an accounting policy question), so it's locked here rather than escalated.

### 4. The down payment is itself a `due` — locked, required by how `record_payment` works

`record_payment`'s allocations always target an existing `dues.id` — there is no "pay a lump sum not tied to any due" path anywhere in this engine, and this spec doesn't add one. So if `down_payment > 0`, plan creation generates **one extra due** (`sequence_no = 0`, `due_date = starts_on`) for it, in addition to the N regular installments. Total dues generated = `N + 1` when there's a down payment, `N` when there isn't.

A useful, free consequence of modeling installments as ordinary `dues`: **early or bulk payoff needs no new code.** `record_payment`'s existing multi-allocation support already lets a buyer pay several installment dues (or the whole remaining balance) in one call — this spec doesn't have to build that, it falls out of reusing the existing engine, exactly like `unit_leases`' rent dues fell out of it for the "record_payment works unchanged" claim that was verified live during that work.

### 5. Data model

**`installment_plans`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `organization_id` | `uuid` not null, FK `organizations` | |
| `property_id` | `uuid` not null, FK `properties` | derived server-side from the unit, same rule as `unit_leases.property_id` |
| `unit_id` | `uuid` not null, FK `units` | |
| `buyer_member_id` | `uuid` not null, FK `members` | the installment buyer — becomes the `unit_ownerships.member_id` too (§ Decisions 2) |
| `due_type_id` | `uuid` not null, FK `due_types` | one due type for every installment + the down payment, matching `unit_leases`' `due_type_id`/`receivable_account_id` shape |
| `receivable_account_id` | `uuid` not null, FK `chart_of_accounts` | |
| `status` | `text` not null default `'ACTIVE'` | `check in ('ACTIVE','COMPLETED','CANCELLED')` — no `DRAFT`, since generation is eager and immediate (unlike a lease, there's no "prepare it now, activate it later" step here; § Decisions 6 covers whether that's the right call) |
| `total_price` | `numeric(19,4)` not null, `check > 0` | |
| `down_payment` | `numeric(19,4)` not null default 0, `check >= 0` | |
| `installment_count` | `int` not null, `check > 0` | |
| `installment_frequency` | `text` not null | `check in ('MONTHLY','QUARTERLY','YEARLY')`, matches `unit_leases.rent_frequency`'s value set |
| `starts_on` | `date` not null | first installment's (or down payment's) due date |
| `created_by` | `uuid`, FK `auth.users` | |
| `created_at` / `updated_at` | `timestamptz` | |
| `cancelled_by` / `cancelled_at` / `cancel_reason` | nullable | mirrors `unit_leases.ended_by/ended_at/end_reason` — set only on `ACTIVE → CANCELLED` |

Constraint: partial unique index on `unit_id where status = 'ACTIVE'` — only one active installment plan per unit at a time (a unit can't be mid-sale under two simultaneous financing arrangements). This is a plain unique index, not an `EXCLUDE USING gist` — there's no date-range overlap concept here, just "at most one ACTIVE row per unit."

**`plan_installments`**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `plan_id` | `uuid` not null, FK `installment_plans` | |
| `due_id` | `uuid` not null, FK `dues` | the actual payable row |
| `sequence_no` | `int` not null | `0` for the down payment (if any), `1..N` for regular installments |
| `principal_amount` | `numeric(19,4)` not null | equals the linked due's `amount` — kept here (not just read off `dues`) so the plan's own breakdown survives independent of whatever the due's amount later becomes through VOID/edits, and so `sequence_no`/plan membership don't require joining through `dues.source_id` for every read |
| `created_at` | `timestamptz` | |
| unique | `(plan_id, sequence_no)` | |

`dues.source_type = 'INSTALLMENT_PLAN'`, `dues.source_id = plan_installments.id` (not `installment_plans.id` directly) — each due's source is the specific installment row, which itself carries the `plan_id` back-reference. This mirrors the lease pattern's "source_id points at the one generating record" shape while still giving an O(1) join from a due to its plan.

No `fees_amount` column in v1 (present in the original brainstorm) — nothing in this schema currently prices per-installment fees separately from the principal, and adding it now would be speculative. If ever needed, it's an additive column later.

### 6. ⚠️ Open decision: no `DRAFT` status, or should there be one?

`unit_leases` has `DRAFT → ACTIVE` because a lease is prepared, then formally activated (and activation is where the overlap-exclusion constraint bites). Installments don't have an equivalent "not yet real" preparation step in this draft — the moment `create_installment_plan()` runs, all the dues already exist and are real, payable, receivable-generating rows. Two options:

- **A (as drafted above):** no `DRAFT` state — creation *is* activation. Simpler, and matches the "eager generation" decision (§1): there's nothing meaningfully different between "drafted" and "active" when all N dues already exist either way.
- **B:** add `DRAFT`, and generation only happens on a separate `activate_installment_plan()` call — mirrors the lease UX (prepare a plan, review it, then commit), at the cost of a state that doesn't otherwise do anything (no exclusion constraint needs the two-step split here, since the uniqueness rule is a plain "one ACTIVE per unit" index, not a date-overlap check that only matters at commit time).

No recommendation forced — this is a UX/business-process call (does staff want to review a financing plan before it starts generating real receivables?), not a technical one.

### 7. ⚠️ Open decision: where does this live in the UI?

`unit_leases` got its own 5th tab on the unit detail page. Installment plans could:

- **A:** get a 6th tab ("التقسيط"/"Installments") — consistent with how leases were placed, keeps every unit-level financial arrangement in one page.
- **B:** live on the member's profile page instead (a buyer's installment plan is arguably more "their" record than "the unit's" — similar reasoning to why a lease's tenant view matters), with only a summary/link from the unit page.

No recommendation forced — flagging it the same way the lease UI placement was flagged, since that turned out to matter to you last time.

### 8. Permissions & RLS (mechanical extension of the established pattern)

`property.installments.view` / `property.installments.manage`, granted to the same role set as `property.leases.*` (TENANT_OWNER both, PROPERTY_MANAGER both, view-only for TENANT_ADMIN/GENERAL_MANAGER/FINANCE_MANAGER/ACCOUNTANT/COLLECTOR/AUDITOR/VIEWER) — no reason for this feature's role matrix to differ from leases'.

RLS: staff SELECT gated by the new permissions (no client write policies — every write goes through an RPC, same as `unit_leases`/`dues`/`payments`). Buyer self-visibility: a new `installment_plans_select_own` policy (`buyer_member_id = current_member_id()`), plus a `dues_select_own_via_installment_plan` policy mirroring `dues_select_own_via_lease` exactly:

```
-- sketch only, not final SQL
create policy "dues_select_own_via_installment_plan" on public.dues for select
  using (
    source_type = 'INSTALLMENT_PLAN'
    and source_id in (
      select pi.id from public.plan_installments pi
      join public.installment_plans p on p.id = pi.plan_id
      where p.buyer_member_id = public.current_member_id()
    )
  );
```

### 9. Audit logging — reuses existing values, no `financial_audit_logs` CHECK migration needed

Plan-creation/cancellation lifecycle events go to `platform_audit_logs` (manual insert), matching `unit_lease.created`/`unit_lease.cancelled` precedent — these are entity-lifecycle events, not money-generation events by themselves.

The N-dues generation *is* a money event, but it doesn't need a new `financial_audit_logs` action value: `issue_dues()` (bulk manual due issuance) already writes `'DUE_BATCH_ISSUED'` for exactly this shape of event ("more than one due created together"). `create_installment_plan()` calling `append_financial_audit_event(..., 'DUE_BATCH_ISSUED', ...)` for the generated batch reuses that value directly — no `check_audit_action` migration required for this feature at all, unlike the lease work which did need one. Worth calling out as a small win from following the "reuse an existing action value when the semantics genuinely match" instinct that migration's own comment already modeled.

### 10. RPC sketch (contracts only, no SQL bodies)

| RPC | Behavior |
|---|---|
| `create_installment_plan(p_organization_id, p_unit_id, p_buyer_member_id, p_due_type_id, p_receivable_account_id, p_total_price, p_down_payment, p_installment_count, p_installment_frequency, p_starts_on)` | Checks `property.installments.manage`. Validates unit/buyer/due_type/account belong to the org, and no other `ACTIVE` plan exists for the unit. Computes the rounding-reconciled installment amounts (§3). Inserts the plan row, the `unit_ownerships` row (§2), the down-payment due + `plan_installments` row (if `down_payment > 0`), and all N installment dues + `plan_installments` rows — all in one transaction. Writes one `DUE_BATCH_ISSUED` financial-audit event for the batch and one `platform_audit_logs` row for the plan itself. Returns the plan id. |
| `cancel_installment_plan(p_plan_id, p_cancel_reason)` | Checks `property.installments.manage`. Legal only from `ACTIVE`. VOIDs every not-yet-paid installment `due` (`status IN ('ISSUED','PARTIALLY_PAID','OVERDUE')` → `'VOID'`) — already-`PAID` installments are untouched, this is not a refund flow. Sets `cancelled_by/cancelled_at/cancel_reason`, `status = 'CANCELLED'`. |
| *(no explicit "complete" RPC)* | `COMPLETED` is set by a small trigger/check when the last installment's due reaches `PAID` — worth deciding whether this is a trigger on `dues` (checking if it was the plan's final installment) or a lazy check computed at read time instead of stored at all. Flagged here rather than resolved, since it's a small mechanical choice not worth a full open-decision writeup. |

## Next steps

1. Resolve the two ⚠️ open decisions above (§6 DRAFT-or-not, §7 UI placement) — both are yours to call, not technical.
2. Once resolved, turn this into a `superpowers:writing-plans` implementation plan, phased the same way rental/occupancy was (schema → RLS/permissions → RPCs → integration/audit → UI), each phase live-verified against the real database before moving to the next.
