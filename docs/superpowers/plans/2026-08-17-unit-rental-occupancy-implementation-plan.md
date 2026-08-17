# Unit Rental & Occupancy — Implementation Plan (Review Draft)

> **Status: DRAFT FOR REVIEW.** No migrations, RPCs, actions, or UI code have been
> written. This document exists to be approved before any of that starts. Several
> items below are explicit **open decisions** requiring sign-off (marked ⚠️),
> not defaults already chosen.

> **For agentic workers:** once approved, execute with
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`,
> phase by phase, with a live-verification gate after each phase — same
> discipline as `docs/superpowers/plans/2026-08-11-units-pages-polish.md`.

**Goal:** let a unit be billed through a tenant who is not its owner, via a new
`unit_leases` table decoupled from `unit_ownerships`, generating rent `dues`
through the existing dues/payments engine.

**Source spec:** `docs/superpowers/specs/2026-08-17-unit-rental-and-occupancy-design.md`
(approved 2026-08-17). This plan follows that spec's intent but revises two of
its naming choices after investigating the current schema (see Phase 0 §1) —
those revisions are open decisions below, not silent changes.

**Explicitly out of scope for this plan:** installment plans for unit purchase
prices (separate, later spec — not started until this plan's accounting
contract is locked, per prior agreement). A systemic `Select`-component bug
sweep (raw UUID/enum shown instead of label) is also out of scope and tracked
as an independent low-risk ticket.

---

## Phase 0: Inventory & Contract Lock-In

### 0.1 Confirmed facts (from reading the current migrations, not assumed)

- `organizations` is the tenant root. `properties` (table, formerly `resorts` —
  a compatibility view `public.resorts` still exists over it) belongs to an
  org. `units.property_id` (FK to `properties`) and `units.organization_id`
  are both present and required on every unit.
- `unit_ownerships` has **no `property_id` column** — only `unit_id` +
  `organization_id`. It deliberately allows **overlapping rows** (co-ownership
  via `share_percentage`); "current owner" is resolved at query time
  (`distinct on (unit_id) order by is_primary_contact desc, share_percentage
  desc, start_date desc`), not enforced by a constraint. This is *not* a
  precedent for the exclusion constraint this plan needs — see §0.4.
- `members` is org-scoped (not property-scoped), has `is_company`, and an
  optional `user_id` linking to `auth.users` for owner-portal login. A tenant,
  per the approved spec, must be an existing `members` row (even if
  `is_company = false` and it owns nothing) — confirmed still correct; no
  schema reason to relax this.
- `dues`, `payments`, `due_schedules`, `chart_of_accounts` all carry both
  `organization_id` and `property_id` (the resort→property rename campaign
  reached all of them). **`dues` has no `source_type`/`source_id` columns
  today — this is entirely new territory, not an extension of an existing
  pattern.**
- Payments link to a unit **only** through `payment_allocations → dues.unit_id`
  (`payments.unit_id` is present but always null in production). This means
  rent dues need **zero changes** to the payment/allocation path — a real due
  is a real due regardless of `source_type`. Confirmed low-risk.
- The recurring-due engine (`due_schedules` + `generate_recurring_dues`) is
  idempotent at the **run level** (`due_generation_runs` unique
  `(schedule_id, period)`, with `pg_advisory_xact_lock` to serialize), not via
  a per-due existence check. **No `pg_cron` exists anywhere in this codebase**
  — something outside Postgres invokes `run_due_schedules()` periodically.
  Confirming what that "something" is (Vercel cron route? edge function?) is
  a **pre-Phase-4 spike**, not an assumption this plan can bake in yet.
- Two separate audit mechanisms exist, used for different purposes:
  `platform_audit_logs` (manual insert per RPC, used by `update_unit`,
  `archive_unit`, purchase-order transitions — general entity lifecycle) and
  `financial_audit_logs` (hash-chained, append-only, written only via
  `append_financial_audit_event()`, used by `record_payment`/`issue_dues` —
  tamper-evident money events). Both are real, neither is a fallback for the
  other.
- Permission keys follow `<domain>.<subject>.<verb>`, but **the domain segment
  is inconsistent across the app**: unit/member management is
  `property.units.*` / `property.members.*` (verbs `view`/`manage`), while
  dues/payments are `receivables.dues.*` / `receivables.payments.*` — **not**
  `finance.dues.*`. There is no existing `finance.*` domain for anything
  dues/payments-shaped.

### 0.2 Contract decisions locked in (no sign-off needed — mechanical, low-risk)

- `starts_on`/`ends_on` are `date`, not `timestamptz` — matches
  `unit_ownerships.start_date`/`end_date` and `dues.due_date` conventions.
- No currency column on the lease — `organizations.default_currency` is the
  only currency concept anywhere in this schema (no per-row currency exists
  on `dues`/`payments` either). Multi-currency leases are not a v1 concern.
- Tenant must be an existing `members` row. No new "external party" entity.
- `billing_recipient` is `OWNER | TENANT`, set per lease, changeable only via
  a dedicated action (not blended into free-form terms edits — see Phase 3).
- Rent generation reuses the **run-level idempotency** pattern
  (`due_generation_runs`-style unique constraint + advisory lock), not a
  per-due existence check — matches house style exactly.
- Prorating (partial first/last billing period) is **out of scope for v1**.
  Generation always bills a full period; a partial-period adjustment is a
  manual one-off `issue_due` call outside this engine, exactly like
  `due_schedules` today has no prorating logic either (this is not a new gap
  we're introducing, it's consistent with the existing engine's limits).

### 0.3 ⚠️ Open decision: permission-key domain

Two candidates:

| Option | Keys | Rationale |
|---|---|---|
| **A — `property.leases.*`** (recommended) | `property.leases.view`, `property.leases.manage` | Matches the actual convention for unit/member-adjacent entities (`property.units.*`, `property.members.*`). A lease is a property-domain object with a financial *effect*, not a `receivables`/`finance` object itself (it doesn't issue money directly — it triggers `dues`, which already have their own `receivables.dues.*` gate). |
| B — `finance.occupancies.*` (as suggested) | `finance.occupancies.read`, `finance.occupancies.manage` | Matches nothing currently in the codebase — there is no `finance.*` domain today, and the verb `read` is used nowhere (existing verbs are `view`/`manage`/`create`/`export`/etc., never `read`). |

**Recommendation: Option A.** Needs explicit confirmation before Phase 1's
role-template seed migration is written, since the key strings are baked into
seed SQL and are painful to rename after tenants exist.

### 0.4 ⚠️ Open decision: table name (`unit_leases` vs `unit_occupancies`)

The existing `units_with_financials` view already computes an
`occupancy_status` column meaning **"has an owner"** (`OCCUPIED`/`VACANT`,
derived purely from `unit_ownerships`) — it has nothing to do with tenancy.
Naming the new table `unit_occupancies` (as the approved design spec did)
creates a real terminology collision: two different "occupancy" concepts,
one meaning "owned," one meaning "rented."

**Recommendation: rename the table to `unit_leases`** (columns:
`tenant_member_id` instead of `occupant_member_id`) — lower risk than the
alternative of renaming the existing view's `occupancy_status` column, which
is read by production UI code (`OccupancyBadge`, `units-table.tsx`, the unit
detail header) and would be a much larger, unrelated blast radius to touch
just to free up a word. This plan uses `unit_leases` / `tenant_member_id`
throughout; if rejected, every occurrence below maps 1:1 back to
`unit_occupancies` / `occupant_member_id` from the original spec.

### 0.5 What v1 explicitly does not cover (unchanged from the approved spec)

Multi-tenant occupancies (co-tenancy), automatic rent escalation, commercial
lease features (CAM reconciliation, percentage rent), IFRS 16 / right-of-use
accounting treatment, creating a tenant not linked to a `members` row,
prorating, installment plans.

---

## Phase 1: Schema & Migrations (proposed shape only — no SQL written yet)

### 1.1 New table: `unit_leases`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk | |
| `organization_id` | `uuid` not null, FK `organizations` | |
| `property_id` | `uuid` not null, FK `properties` | **Derived server-side from the unit's own `property_id` at creation, never trusted from client input** — prevents a mismatched/spoofed property_id, a class of bug this schema has no existing guard against elsewhere. |
| `unit_id` | `uuid` not null, FK `units` | |
| `tenant_member_id` | `uuid` not null, FK `members` | |
| `status` | `text` not null default `'DRAFT'` | `check in ('DRAFT','ACTIVE','ENDED','CANCELLED')` |
| `starts_on` | `date` not null | |
| `ends_on` | `date` nullable | open-ended lease until explicitly ended |
| `rent_amount` | `numeric(19,4)` not null, `check > 0` | matches `dues.amount`'s precision |
| `rent_frequency` | `text` not null | `check in ('MONTHLY','QUARTERLY','YEARLY')` — kept local to this table rather than reusing `due_schedules.frequency` (which is `MONTHLY`/`YEARLY` only and belongs to a different engine) |
| `security_deposit_amount` | `numeric(19,4)` not null default 0 | operational amount only — see §1.3 for whether it ever touches the GL |
| `billing_recipient` | `text` not null | `check in ('OWNER','TENANT')` |
| `created_by` | `uuid`, FK `auth.users` | |
| `created_at` / `updated_at` | `timestamptz` | |
| `ended_by` | `uuid`, FK `auth.users`, nullable | mirrors `payments.reversed_by` — set only on ENDED |
| `ended_at` | `timestamptz`, nullable | mirrors `payments.reversed_at` |
| `end_reason` | `text`, nullable | mirrors `payments.reversal_reason`; `check (status <> 'ENDED' or (end_reason is not null and trim(end_reason) <> ''))`, same shape as `payments_reversal_reason_required` |

Unique/exclusion constraints:

- `create extension if not exists btree_gist;` — **first use of this
  extension and of `EXCLUDE USING gist` in this codebase.** Flagged
  explicitly so it isn't mistaken for an established pattern being copied.
- `EXCLUDE USING gist (unit_id WITH =, daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') WITH &&) WHERE (status = 'ACTIVE')`
  — scoped to `ACTIVE` only, **not** `DRAFT`. Staff can draft multiple
  competing offers for the same unit/period; the hard block happens at
  **activation** (Phase 3), where a second overlapping `ACTIVE` lease raises
  a real Postgres exclusion violation that `activate_unit_lease()` translates
  into a friendly error.

Indexes: `(organization_id)`, `(property_id)`, `(unit_id)`,
`(tenant_member_id)`, and a partial index on `unit_id WHERE status = 'ACTIVE'`
for the "current lease" lookup.

### 1.2 RLS write policy

No client-direct INSERT/UPDATE/DELETE policies — matches the `dues`/`payments`
convention exactly ("every write goes through an RPC"). Only SELECT policies
exist at the table level (Phase 2).

### 1.3 ⚠️ Open decision: security deposit ledger

Recommendation from the approved spec still holds: a deposit is a liability,
never revenue on receipt. Two shapes:

- **A (recommended):** a small companion table
  `unit_lease_deposit_events (id, lease_id, event_type CHECK IN
  ('RECEIVED','REFUNDED','DEDUCTED'), amount, reason, created_by, created_at)`
  — full audit trail of partial refunds/deductions, no mutable balance
  column to get out of sync.
- **B:** a single `deposit_status`/`deposit_held_amount` pair directly on
  `unit_leases`, mutated in place.

**This is genuinely an accounting question, not just a schema-shape
question: does a deposit ever touch `chart_of_accounts`/journal entries in
v1 (e.g., recorded as a liability account balance), or does it stay purely
operational/off-books until refunded or deducted?** That answer determines
whether Option A's event table needs a `journal_entry_id` column from day
one or can be added later. **Needs explicit accounting sign-off before Phase
1 migrations are finalized** — this plan defaults to "off-books in v1,
`journal_entry_id` added in a follow-up if/when GL integration is approved,"
but does not assume that's acceptable.

### 1.4 Proposed migration list (names only, no content, ordering matters)

1. `202608XX_enable_btree_gist.sql`
2. `202608XX_unit_leases_table.sql` (table + indexes + exclusion constraint)
3. `202608XX_unit_lease_deposit_events.sql` (if Option A above is approved)
4. *(Phase 2)* `202608XX_unit_leases_rls.sql`
5. *(Phase 2)* `202608XX_property_leases_permissions_seed.sql`
6. *(Phase 3)* `202608XX_unit_lease_rpcs.sql` (`create_unit_lease`,
   `activate_unit_lease`, `end_unit_lease`, `cancel_unit_lease`,
   `set_unit_lease_billing_recipient`)
7. *(Phase 4)* `202608XX_dues_source_attribution.sql` (adds nullable
   `dues.source_type text check in ('LEASE_RENT')`, `dues.source_id uuid`)
8. *(Phase 4)* `202608XX_lease_rent_generation.sql`
   (`lease_rent_generation_runs` table + `generate_lease_rent_dues()` +
   `run_lease_rent_generation()`)
9. *(Phase 4, conditional)* `202608XX_extend_financial_audit_actions.sql`
   (adds `'LEASE_RENT_DUE_GENERATED'` etc. to `financial_audit_logs`'s
   `action` CHECK — only if the audit-log split in §3.4 is approved as
   written)

No dues-table changes happen before item 7 — this plan does not touch `dues`
at all until Phase 4's contract (§4.1) is explicitly locked, per instruction.

---

## Phase 2: RLS & Permissions

### 2.1 Permission matrix (assuming §0.3 Option A: `property.leases.*`)

| Role template | `property.leases.view` | `property.leases.manage` |
|---|:---:|:---:|
| TENANT_OWNER | ✅ (auto, all non-platform perms) | ✅ |
| TENANT_ADMIN | ✅ | — |
| GENERAL_MANAGER | ✅ | — |
| PROPERTY_MANAGER | ✅ | ✅ |
| FINANCE_MANAGER | ✅ | — ⚠️ *(confirm: should Finance be able to set `billing_recipient`, since it affects who gets billed? Recommend view-only unless finance explicitly owns that call.)* |
| ACCOUNTANT | ✅ | — |
| COLLECTOR | ✅ | — |
| AUDITOR | ✅ | — |
| VIEWER | ✅ | — |
| CASHIER / STOREKEEPER / PURCHASING_MANAGER | — | — |

Matches the `property.units.*`/`property.members.*` role-template pattern
exactly. **New permissions added after initial seed must be explicitly
granted to TENANT_OWNER too** (confirmed via investigation — TENANT_OWNER's
"all permissions" grant is a one-time seed-time `insert...select`, not a
live view), using the retroactive-grant pattern already established for
`members.portal.invite`.

### 2.2 RLS policies

Staff-facing (mirrors `unit_ownerships`' policy shape exactly):

- `select`: `property.leases.view` OR `property.leases.manage`
- `insert`/`update`/`delete`: **none at the table level** — all writes go
  through the RPCs in Phase 3, which perform their own `has_permission`
  check. (Matches `dues`/`payments`: zero client write policies by design.)
- All scoped by `organization_id`.

Tenant self-read (mirrors `unit_ownerships_select_own` verbatim):

```
create policy "unit_leases_select_own" on public.unit_leases for select
  using (tenant_member_id = public.current_member_id()
         and public.organization_is_active(organization_id));
```

⚠️ **Visibility persists after ENDED/CANCELLED** — a tenant should still be
able to see their own lease history after it ends, matching how
`unit_ownerships_select_own` has no active-only filter either. **Confirm this
is acceptable** (the alternative — hiding ended leases from the tenant —
would need an explicit date/status filter added to the policy above).

### 2.3 ⚠️ Cross-phase gap: tenant visibility into rent dues

The existing portal RLS (`dues_select_own`) grants a member visibility into
`dues` **only via `unit_ownerships`** (i.e., only owners see their own dues
today). A tenant billed via `billing_recipient = 'TENANT'` is **not** covered
by that policy at all — this is a real gap, not an oversight to fix "later."
It needs a new portal policy in Phase 4 (once `dues.source_id` exists):

```
-- sketch only, not final SQL
create policy "dues_select_own_via_lease" on public.dues for select
  using (source_type = 'LEASE_RENT'
         and source_id in (select id from public.unit_leases
                            where tenant_member_id = public.current_member_id()));
```

This is called out here in Phase 2 because it's easy to forget once Phase 4
is underway and the team is focused on the generation engine, not RLS.

### 2.4 Blocking RLS tests (must pass before merge)

1. Org isolation: a lease from another organization is invisible/unwritable.
2. Property isolation: consistent with org isolation (redundant if
   `property_id` is always derived correctly, but tested independently —
   don't assume the derivation logic in §1.1 is bug-free).
3. Owner vs tenant: the unit's *owner* (via `unit_ownerships`, no
   `property.leases.*` permission) cannot see or manage the lease through
   owner-portal RLS; the *tenant* can see only their own lease, never another
   tenant's lease on a different unit.
4. A staff user with zero `property.leases.*` permission is denied both
   read and write.
5. A tenant whose lease has `status = 'ENDED'` still sees the lease record
   (per §2.2's decision) but the app layer must not offer them "pay rent"
   actions against a non-ACTIVE lease.
6. Direct access to a foreign lease UUID (not merely omitted from a list)
   returns empty/404, not an error that leaks existence.

---

## Phase 3: Domain Actions

All actions below are `lib/actions/property.ts` server-action wrappers
(zod-validated `FormData` parsing, friendly-error translation) around
`security definer` plpgsql RPCs that perform the actual `has_permission`
check — **the server action is never the security boundary**, matching this
codebase's rule everywhere else.

### 3.1 RPC contracts (signatures + behavior, no SQL bodies)

| RPC | Params | Behavior |
|---|---|---|
| `create_unit_lease` | `p_organization_id, p_unit_id, p_tenant_member_id, p_rent_amount, p_rent_frequency, p_starts_on, p_ends_on, p_security_deposit_amount, p_billing_recipient` | Checks `property.leases.manage` + org active. Validates unit and tenant both belong to the org. Derives `property_id` from the unit row (never from client input, §1.1). Inserts `status = 'DRAFT'`. No overlap check at this stage (drafts are unconstrained). Returns lease id. |
| `activate_unit_lease` | `p_lease_id` | `property.leases.manage`. Legal transition only `DRAFT → ACTIVE` (tuple-membership check, same idiom as `set_purchase_order_status`). This is where the exclusion constraint can raise — caught and re-raised as a friendly "overlaps an existing active lease" error, not a raw Postgres exclusion-violation message. |
| `end_unit_lease` | `p_lease_id, p_ends_on, p_end_reason` | `property.leases.manage`. Legal transition only `ACTIVE → ENDED`. Sets `ended_by/ended_at/end_reason`. Stops future rent-due generation (Phase 4) from this lease; does **not** touch already-generated `dues`. |
| `cancel_unit_lease` | `p_lease_id, p_cancel_reason` | `property.leases.manage`. Legal transition only `DRAFT → CANCELLED`. ⚠️ **`ACTIVE → CANCELLED` is deliberately not offered** — an active lease with real billing history is ended (with a reason), never "cancelled," to keep the cancellation semantic clean ("never actually happened") distinct from ending ("happened, then stopped"). Confirm this reading is acceptable; the alternative (allow `ACTIVE → CANCELLED` like `purchase_orders` does for `APPROVED → CANCELLED`) is a one-line change to the transition table if rejected. |
| `set_unit_lease_billing_recipient` | `p_lease_id, p_billing_recipient` | `property.leases.manage`. Allowed in any non-terminal status (`DRAFT` or `ACTIVE`). Affects only *future* due generation, never past dues. Separated from a general "edit terms" RPC on purpose — see §3.2. |

### 3.2 ⚠️ Open decision: are `rent_amount`/`rent_frequency` ever editable after `ACTIVE`?

**Recommendation: no.** Once `ACTIVE`, `rent_amount`/`rent_frequency` are
immutable for the life of the lease. A rent change is modeled as ending the
current lease and creating a new one — this keeps each lease's billing
history internally consistent (one rent figure, one accounting story) and
avoids silently changing the amount future `generate_lease_rent_dues()` calls
will bill without a corresponding new lease record to explain why. This is
adjacent to revenue-recognition consistency, so it's listed as a decision
needing confirmation, not assumed. If accepted, only `DRAFT`-status terms
(before activation) are freely editable via a straightforward
`update_unit_lease_draft_terms()` RPC not detailed further here (mechanical,
same shape as `create_unit_lease`'s validation).

### 3.3 Blocking behavior for illegal transitions

Every RPC above uses the `(old_status, new_status) in (...)` tuple-membership
idiom from `set_purchase_order_status` — an illegal transition raises a clear
exception, never silently no-ops. No generic state-machine table exists in
this codebase to lean on; this is intentionally consistent with how every
other stateful entity here is implemented, not a new pattern being invented.

### 3.4 ⚠️ Open decision: which audit log for which event

- **`platform_audit_logs`** (manual insert, general lifecycle) for:
  lease created / activated / ended / cancelled / billing-recipient changed.
  Matches `update_unit`/`archive_unit`/purchase-order-transition precedent —
  these are entity-lifecycle events, not money-movement events.
- **`financial_audit_logs`** (hash-chained, via `append_financial_audit_event`
  only) for: rent-due generation events (Phase 4) — matches
  `issue_dues`/`generate_recurring_dues` precedent, since that *is* money
  generation. Requires extending the table's `action` CHECK constraint
  (migration item 9 in §1.4).

This split needs confirmation because it determines which migration touches
the tamper-evident log (higher scrutiny) versus the general one.

---

## Phase 4: Dues & Collection

### 4.1 The `dues.source_type`/`source_id` contract (locked here, not before)

```
dues.source_type = 'LEASE_RENT'   -- nullable text, new value in a new column;
                                   -- no other source_type value exists yet
dues.source_id   = unit_leases.id -- nullable uuid, no FK constraint enforced
                                   -- at the DB level (dues already outlives
                                   -- some referenced rows elsewhere in this
                                   -- schema without a hard FK; kept consistent)
```

`dues.member_id` **does not exist as a column today** (confirmed in Phase 0 —
dues are unit-scoped, not member-scoped; visibility to a member is derived,
not stored). So "who gets billed" for a lease-rent due is not a new column
on `dues` — it's resolved at generation time from
`unit_leases.billing_recipient`: `TENANT` → bill goes toward the tenant
(surfaced via the new RLS policy in §2.3); `OWNER` → toward the unit's
current owner (resolved the same way `unit_ownerships`' "current owner" is
resolved everywhere else — `distinct on (unit_id) order by ...`). If no
current owner exists when `OWNER` billing is configured, generation for that
period **fails loudly** (surfaced as a skipped/blocked generation entry, not
a silently-unbilled due) — matching how `issue_dues()` already reports
skipped units rather than silently dropping them.

### 4.2 Generation RPC

`generate_lease_rent_dues(p_organization_id, p_lease_id, p_period)`:

- Only operates on `ACTIVE` leases.
- If `p_period` falls outside `[starts_on, ends_on]`, this is a **no-op**,
  not an error (§0.2).
- Idempotency: a new `lease_rent_generation_runs (lease_id, period,
  generated_at, due_id, unique(lease_id, period))` table, guarded by
  `pg_advisory_xact_lock(hashtext('lease_rent_' || lease_id::text))` —
  identical shape to `due_generation_runs`/`generate_recurring_dues`. A
  second call for the same `(lease_id, period)` returns
  `{"success": true, "idempotent": true}` without touching `dues` again.
- Wrapper `run_lease_rent_generation()` scans all `ACTIVE` leases whose
  `rent_frequency`/`starts_on` anchor matches the current period, mirroring
  `run_due_schedules()`.

### 4.3 ⚠️ Pre-Phase-4 spike: how is `run_due_schedules()` actually invoked today?

No `pg_cron` exists in this database. Something in the Next.js app (a Vercel
Cron route, an edge function, a manual trigger) must call
`run_due_schedules()` periodically today for the existing recurring-dues
feature to work at all in production. **This must be found and confirmed
before Phase 4 can be scheduled** — `run_lease_rent_generation()` needs to be
wired into the same invocation path, and this plan cannot specify *how*
until that path is identified. Flagged as a short, isolated investigation
task at the start of Phase 4, not something to guess at now.

### 4.4 What Phase 4 does *not* touch

- `record_payment`/`payment_allocations` — **zero changes**. Confirmed in
  Phase 0: payments already link to a unit only through
  `payment_allocations → dues.unit_id`, agnostic to `source_type`. A rent due
  is paid exactly like any other due, today, with no new code.
- Prorating — out of scope (§0.2).
- Security deposits are **never** dues and never flow through this
  generation path — they're the separate ledger from §1.3.

---

## Phase 5: UI & Tests

### 5.1 ⚠️ Open decision: where does lease UI live on the unit detail page?

The unit detail page (shipped 2026-08-17) already has four tabs — Overview,
Financials, Ownership, Activity. Two options:

- **A:** a 5th tab, "Lease" / "الإيجار".
- **B:** fold lease info into the existing Ownership tab as a sibling
  section ("Ownership" tab becomes "Ownership & Occupancy").

No recommendation forced here — this is a product/design call, not a
technical one. Whichever is chosen, the unit header's existing
Owner-vs-Tenant terminology must be visually distinct (avoid the same
"occupancy" naming collision flagged in §0.4 leaking into UI copy).

### 5.2 Scope

- Lease creation / activation / ending flows as dialogs, modeled on the
  existing `create-unit-form.tsx`/`manage-structure-dialog.tsx` patterns
  (already established, no new UI primitives needed).
- Clear owner vs. tenant display wherever a unit's people are shown.
- `billing_recipient` indicator on the lease card/section.
- Bilingual empty states for units with no lease.
- Full RTL/LTR + mobile verification, same discipline as the units-polish
  plan (live Playwright checks, not just visual screenshots).
- **Does not touch installment plans** — reiterated per instruction, not
  because it needs repeating technically but because it's an explicit
  boundary for whoever implements this phase.

### 5.3 Tests (live, not just `tsc`/`build`)

**Blocking (gate merge):**

1. All RLS tests from §2.4.
2. Exclusion-constraint conflict: activating a second overlapping lease on
   the same unit produces the friendly error, not a raw DB error, and does
   not partially commit.
3. Idempotent generation: calling `generate_lease_rent_dues` twice for the
   same `(lease_id, period)` produces exactly one `dues` row.
4. State-transition legality: every illegal transition in §3.1/§3.3 is
   rejected; every legal one succeeds.
5. Tenant billing end-to-end: a `TENANT`-billed lease's generated due is
   visible to that tenant via the new RLS policy (§2.3) and payable through
   the existing `record_payment` flow unchanged.
6. Cross-tenant/foreign-UUID access returns 404/empty, never a leak.

**Non-blocking (can follow up post-merge, like the units-polish plan's mobile
sweep did):**

- Visual polish passes, RTL/LTR cosmetic review, additional empty-state
  copy tuning.

---

## Rollback Plan

- **Phases 1–3** introduce one new independent table (`unit_leases`) plus
  its RLS/permissions/RPCs — nothing existing is altered except an additive
  permission-seed insert. Rollback is low-risk: drop the table, drop the
  policies/RPCs, remove the seed row. No production data outside this new
  table is ever touched.
- **Phase 4** is the first point where `dues` itself is altered
  (`source_type`/`source_id`, both nullable, additive). Rollback is still
  safe **as long as no real `dues` row has `source_type = 'LEASE_RENT'`
  yet** — once real rent dues exist referencing a lease, rolling back Phase
  4's schema requires an explicit decision about what happens to those rows
  (leave the now-orphaned nullable columns permanently vs. a data migration).
  This is flagged here so a rollback decision isn't improvised under
  pressure later.
- No phase requires a maintenance window or downtime — every migration here
  is additive (new tables/nullable columns), matching how every other
  migration in this codebase has shipped.

---

## Summary: Decisions Requiring Explicit Sign-Off Before Phase 1

1. **§0.3** — Permission-key domain: `property.leases.*` (recommended) vs
   `finance.occupancies.*` (as originally suggested).
2. **§0.4** — Table/column naming: `unit_leases`/`tenant_member_id`
   (recommended, avoids collision with `occupancy_status`) vs
   `unit_occupancies`/`occupant_member_id` (original spec naming).
3. **§1.3** — Security deposit: does it ever touch the GL/chart_of_accounts
   in v1, or stay off-books until refund/deduction? **This one is genuinely
   an accounting decision, escalate accordingly.**
4. **§2.2** — Tenant visibility into ended/cancelled leases: persists
   (recommended) vs. hidden.
5. **§3.1** — Is `ACTIVE → CANCELLED` a legal transition, or is `ENDED` the
   only way out of `ACTIVE` (recommended)?
6. **§3.2** — Are `rent_amount`/`rent_frequency` ever editable after
   activation (not recommended), or is end-and-recreate the only path?
7. **§3.4** — Audit-log split: lifecycle events → `platform_audit_logs`,
   rent-generation events → `financial_audit_logs` (recommended) — confirm.
8. **§5.1** — Where lease UI lives on the unit detail page (5th tab vs.
   folded into Ownership) — product call, not technical.

Plus one **pre-Phase-4 spike** (§4.3): confirm how `run_due_schedules()` is
actually invoked in production today, since no `pg_cron` exists to lean on.

**No implementation starts until this document is explicitly approved.**
