# Defect — partial-period rent billing has no proration policy

**Raised:** 2026-08-25
**Component:** `generate_lease_rent_dues`, and the lease data model behind it
**Status:** guarded, not solved. The core now refuses; it does not prorate.

---

## The defect

`generate_lease_rent_dues` billed a period whenever the lease **overlapped**
it. Overlap is not coverage.

```
2026-Q2 = 2026-04-01 .. 2026-06-30
a lease commencing 2026-06-01 overlaps by 30 of 91 days
→ billed the FULL quarter, due_date 2026-04-01
```

The tenancy did not exist on 1 April. The charge is dated two months before the
lease began, and it is a full quarter's rent.

It is **not** a quarterly problem. A `MONTHLY` lease commencing on the 15th is
overcharged the same way; `YEARLY` likewise. Quarterly is only where the gap
was large enough to be noticed.

Nor is it only about commencement. The same applies at the other end: a lease
ending mid-period is billed for the whole of it.

## Measured, not estimated

On the demo tenant, 2026-Q2, before any fix:

| | |
| --- | --- |
| quarterly leases overlapping Q2 | 16 |
| commencing mid-quarter | 10 of 16 |
| full calendar quarter (the rule as written) | 634,100.00 |
| prorated by days occupied | 610,671.98 |
| **overcharge** | **23,428.02** |

`PG-T-0502` commences 2026-06-01, occupies 30 of 91 days, and would have been
billed 34,950.00 dated 2026-04-01.

## Why the fix is a refusal and not proration

Proration is the accurate answer, and the schema cannot express it:

- no part-period concept on `unit_leases`
- no rounding rule anywhere
- nowhere to record which convention a given contract uses

And real commercial leases genuinely differ. Some charge the full period
regardless of commencement date. Some begin billing at the first full period.
Some prorate by days. The contract decides, and the contract is not modelled.

Choosing one convention inside a `SECURITY DEFINER` function would mean
inventing an accounting policy the data model cannot record — and inventing it
in the direction that bills more.

So the function fails closed. `PARTIAL_PERIOD_REQUIRES_POLICY`, nothing
written: no generation run, no due, no journal entry. A refusal is recoverable;
a wrong posted entry is not.

## What is still open

The guard makes the wrong answer impossible. It does not make the right answer
available. Until a proration policy exists:

- **a real customer cannot bill a lease that starts mid-period at all.** They
  can create it and activate it; the first partial period simply cannot be
  invoiced through this path. That is a genuine product limitation, not a
  demo limitation.
- **every lease with a mid-period end date will hit the same refusal in its
  final period.** On the demo tenant that is all 18 quarterly leases — they end
  2026-10-31, 2027-01-31 and 2027-05-31, none of which is a quarter end. It
  does not affect 2026-Q2 or 2026-Q3, so it is not blocking today, but it
  arrives in 2026-Q4.

## What a solution would need

Not a code change alone. At minimum:

1. A policy field on the lease — full-period / first-full-period / prorated —
   because it is a term of the contract, not a system-wide setting.
2. A rounding convention, recorded, because 30/91 of 34,950 is 11,521.978…
   and the currency has 2 decimals here and 3 in KWD/BHD/OMR.
3. A way to represent a part-period charge on the due itself, so the invoice
   can say *why* it is not a full period.
4. A decision about the final period, which is the same question mirrored.

That is a product decision with an accounting owner. **The demo is not where it
gets made**, which is why the demo's own fixtures were aligned to period
boundaries instead — see the alignment repair. That removes the ambiguity from
the demonstration without pretending the underlying question is settled.

## Related

- `supabase/migrations/20260825182109_rent_partial_period_guard.sql` — the
  guard, applied 2026-08-25
- `tests/rent-period-coverage.test.ts` — the boundary spec, after the
  off-by-one caught in review
- `tests/demo-q2-semantics.readonly.test.ts` — the three conventions, costed
- `docs/incidents/2026-08-25-generate-lease-rent-dues-exploit.md` — the same
  function's authorization gap, found separately
