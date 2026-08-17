# Unit Rental & Occupancy — Design Spec

**Date:** 2026-08-17
**Area:** New `unit_occupancies` table, `dues` source attribution, no changes to `unit_ownerships`
**Type:** New feature (property model gap — units currently assume owner-only billing)
**Status:** Approved (design), pending implementation plan

## Goal

Today a unit can only be billed through its owner: `unit_ownerships` is the sole
link between a unit and a person, and every due is implicitly "the owner's
responsibility." Real portfolios also have units occupied by a **tenant who is
not the owner**, with the owner sometimes still on the hook, sometimes not
(depends on the lease terms). This spec adds a first-class occupancy/lease
concept, separate from ownership, so a unit's occupant and its owner can be two
different people and billing can be routed explicitly.

Installment plans for unit *purchase* prices are a separate, later feature (see
`docs/superpowers/specs/` follow-up once this ships) — deliberately out of scope
here because it changes what a due *represents* rather than who pays it, and
mixing the two designs risks conflating unrelated business rules.

## Scope

**In scope**

- `unit_occupancies` table: a time-bounded lease/occupancy record linking a unit
  to an occupant (`occupant_member_id`), independent of `unit_ownerships`.
- Occupancy lifecycle: `DRAFT → ACTIVE → ENDED`, plus `CANCELLED` from `DRAFT`.
- Overlap prevention: no two `ACTIVE` (or `DRAFT`, once activated) occupancies for
  the same unit with overlapping date ranges.
- `billing_recipient` (`OWNER` | `TENANT`) on the occupancy — determines who the
  generated rent dues are billed to.
- Rent-due generation sourced from the occupancy (`source_type = 'LEASE_RENT'`,
  `source_id = unit_occupancies.id`), reusing the existing `dues`/`due_schedules`
  engine rather than inventing a parallel billing pipeline.
- Security deposit tracked as a liability, not revenue (see Accounting below).
- RLS scoped by `organization_id`/`property_id`, matching every other property
  table's pattern.
- Tenant-facing ledger view (staff-side first; owner-portal exposure is a
  follow-up once the occupancy model is proven, matching how the owner portal
  work was sequenced after `unit_ownerships` stabilized).
- Audit log entries on create/activate/end/cancel (matching the existing
  audit-log convention used elsewhere in `(app)`).

**Out of scope (this spec)**

- Multi-tenant occupancies (more than one active tenant per unit at once) —
  `unit_occupancies` is single-occupant per active period; co-tenancy is a
  follow-up if ever needed.
- Automatic rent escalation clauses, index-linked rent, or renewal automation.
- Commercial-lease features: CAM (common-area-maintenance) reconciliation,
  percentage rent, tenant improvement allowances.
- Standardized long-term-lease accounting treatment (e.g. IFRS 16/right-of-use
  asset recognition) — this is operational rent tracking, not lease accounting.
- Creating a tenant who has no corresponding `members` row — a tenant must be a
  `member` (even if `is_company = false` and they own nothing), so the existing
  member CRUD, `member_phones`, and RLS all apply unchanged.
- Installment plans for unit purchase prices (separate spec, next).

## Data model

### `unit_occupancies` (new)

```
id                          uuid, pk
organization_id             uuid, fk organizations, not null
property_id                 uuid, fk properties, not null
unit_id                     uuid, fk units, not null
occupant_member_id          uuid, fk members, not null
occupancy_type               text, check in ('OWNER', 'TENANT'), not null
status                       text, check in ('DRAFT','ACTIVE','ENDED','CANCELLED'), not null, default 'DRAFT'
starts_on                    date, not null
ends_on                      date, nullable  -- open-ended lease until explicitly ended
rent_amount                  numeric(14,2), not null
rent_frequency                text, check in ('MONTHLY','QUARTERLY','YEARLY'), not null
security_deposit_amount      numeric(14,2), not null, default 0
billing_recipient            text, check in ('OWNER','TENANT'), not null
created_at / updated_at      timestamptz
```

Constraints:

- `occupancy_type = 'OWNER'` exists in the enum for future flexibility (e.g. an
  owner who self-occupies and wants a rent-equivalent ledger for internal
  reporting) but the V1 UI only exposes `TENANT` creation. Owner-occupancy
  rows, if ever created, must NOT double-bill against `unit_ownerships`.
- Exclusion constraint (Postgres `EXCLUDE USING gist` on `unit_id` +
  `daterange(starts_on, ends_on, '[]')`) restricted to `status IN ('DRAFT',
  'ACTIVE')`, so overlapping leases on the same unit are rejected at the
  database level, not just in application code — consistent with this
  codebase's RLS-is-the-boundary philosophy of pushing invariants into
  Postgres wherever possible.
- `ends_on >= starts_on` when both present.
- No FK/trigger back into `unit_ownerships`: ownership and occupancy are
  intentionally uncoupled tables. A unit can have zero, one, or (with shared
  ownership) multiple owners in `unit_ownerships`, and independently zero or
  one active occupancy in `unit_occupancies`.

### `dues` (existing table, additive change only)

Add two nullable columns:

```
source_type   text, check in (existing values..., 'LEASE_RENT'), nullable
source_id     uuid, nullable  -- unit_occupancies.id when source_type = 'LEASE_RENT'
```

Rent dues are still real `dues` rows — same `due_types`, `due_schedules`,
`record_payment`, aging, and reporting machinery as every other due. The
`source_type`/`source_id` pair is attribution only: it lets the UI show "this
due came from lease X" and lets a future report filter rent income separately
from HOA/service dues, without creating a second billing pipeline.

`dues.member_id` is set from `unit_occupancies.billing_recipient`:
`TENANT` → `occupant_member_id`; `OWNER` → the unit's current owner from
`unit_ownerships` at generation time (if none, generation must fail loudly
rather than silently bill nobody — surfaced as a blocked schedule run, same
pattern the existing due-schedule engine already uses for other blocked-state
cases).

### Security deposits

Not modeled as a `due` and not recognized as revenue on receipt. Tracked as a
liability: a `security_deposits` table (or a `deposit_status` +
`deposit_held_amount` pair directly on `unit_occupancies`, TBD at
implementation-plan time based on whether partial refunds/deductions need their
own audit trail — if they do, a separate table with its own ledger of
receive/refund/deduct events is the safer choice). Deducting from a deposit at
lease-end (damage, unpaid rent) must be an explicit, audited action, never an
automatic offset against an outstanding due.

## RLS

Mirrors `unit_ownerships`' existing policy shape exactly:

- `select`: `property.members.view` OR `property.members.manage` (occupancy is
  member-adjacent data, same visibility tier as ownership).
- `insert`/`update`/`delete`: `property.members.manage`.
- All policies scoped by `organization_id` (and `property_id` where the table
  carries it), matching every other property table — no new permission key
  needed unless the implementation plan surfaces a reason to separate "manage
  leases" from "manage members" (worth revisiting once the owner-portal
  exposure follow-up is scoped, since tenants seeing their own lease is a
  different trust boundary than an owner seeing their own ownership record).

## Lifecycle & edge cases to test live (not just read from migration source)

- Creating an `ACTIVE` occupancy that overlaps an existing `ACTIVE` occupancy
  on the same unit → rejected by the exclusion constraint, not just app-layer
  validation.
- Ending an occupancy (`ends_on` set, status → `ENDED`) stops future rent-due
  generation from that occupancy but leaves already-generated `dues` rows
  untouched (they still need collecting/writing off through the normal AR
  flow).
- Cancelling a `DRAFT` occupancy before activation must not have generated any
  dues yet — generation only starts at `ACTIVE`.
- A unit with an owner in `unit_ownerships` AND an active `TENANT` occupancy
  with `billing_recipient = 'TENANT'` → HOA/service dues (existing `dues` flow)
  continue billing the owner as today; only the new `LEASE_RENT` dues bill the
  tenant. The two billing streams must not cross.
- `billing_recipient = 'OWNER'` on a tenant occupancy (owner still liable for
  rent collection risk, e.g. subletting arrangements) → rent dues bill the
  owner, tenant still recorded as occupant for reporting/access purposes only.
- Organization/property isolation: an occupancy row must never be
  selectable/writable across organizations, verified the same way every prior
  RLS ticket in this engagement was closed (live cross-tenant negative test,
  not just reading the policy SQL).

## Next steps

1. Turn this into a `superpowers:writing-plans` implementation plan (migration
   + RLS + `lib/actions/property.ts` actions + UI) once this design is
   confirmed.
2. After rental/occupancy ships and is stable, write the follow-up design spec
   for unit purchase installment plans (`installment_plans` /
   `installments`, referenced but intentionally deferred above).
