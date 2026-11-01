# Task 8 — diagnosis of `units_with_financials` / `members_with_financials` (isolated stack only, 2026-10-13)

**Status: the diagnosis below was followed by the approved fix: see `result.md` (migration 20261017100800, final shape, A/B and failures). The proposal section describes the first design; the shipped shape differs (single pass over dues), for the reason given in `result.md` §1.**
Scripts and raw output are in this folder: `baseline.py` / `baseline-before.txt` (numbers baseline), `plans.py` / `plans-*.txt` (EXPLAIN ANALYZE of the real page queries, staff and owner sessions, RLS on), `scaling.py` / `scaling-clone-1-org.txt`, `waits.py` / `waits-stack.txt`.

## 1. Baseline (before any change)
`baseline-before.txt`: `units_with_financials` 931 rows, md5 `b7da201f172d2defb29bd11e9818b20c`; `members_with_financials` 945 rows, md5 `4c2536dd4c5573ffeeb7384e585b78d9`; per-organization sums; and, for 8 staff + 8 owner principals, the rows and md5 each sees **through RLS**. After any fix, `python baseline.py after` must produce identical lines.

## 2. What the pages' queries cost (stack: 839 organizations, 931 units, 974 dues; `authenticated` role with the principal's JWT claims; 3 runs each)
| query (page) | stack, 839 orgs |
|---|---|
| Q1 member page, units of the member (`id = ANY`) | 1.9 – 2.5 s |
| Q2 member page, the member row | 2.5 – 4.4 s |
| Q3 property list, first 25 units | 1.8 – 3.2 s |
| Q4 property KPI strip | 2.5 – 2.8 s |
| Q5 members-page KPI | 2.1 – 2.9 s |
| Q6 members list, 25 rows | 1.7 – 2.7 s |
| Q7 portal units (owner) | 2.0 – 2.3 s |
| Q8 portal home (owner) | 1.7 – 2.2 s |

A lookup of **one member or one unit costs the same as listing everything** (about 2 s; 76 743 buffer hits for Q2). Against the 8 s `statement_timeout` of `authenticated` that is a 3–4× margin when idle, which parallel page queries and a busy Docker VM exhaust. This matches the 57014 timeouts seen in Task 7.

## 3. Cause (measured)
1. **The views aggregate over every row visible to the caller before filtering.** In the plan of Q2 (`plans-stack-835-orgs.txt`): a Seq Scan of `units` (25 489 buffers, 931 rows scanned, 2 kept) and a Seq Scan of `dues` (38 406 buffers, 974 rows scanned, 12 kept) feed the aggregates; the requested member/unit id is only applied after the joins. The planner cannot push an id/organization filter into the grouped CTEs.
2. **Every scanned row pays the RLS policy functions** (`has_permission`, `organization_is_active`, `is_org_member`, `work_order_cost_member_can_read_due`, `current_member_id`). They take the row's `organization_id`, so they are evaluated per row (STABLE, not hoistable), and each evaluation runs queries of its own.
3. **Controlled comparison on the same table, same user, same RLS** (stack, `dues`): `organization_id = own` → 13 rows, 780 buffers, **~5 ms** (indexed); `organization_id <> own` → 961 foreign rows scanned, 38 732 buffers, **1.1 – 1.5 s** (≈ 1.3 ms per foreign row). The cost is the number of *rows scanned*, and the views scan all tenants' rows.
4. **No waiting, no locks.** While 24 page queries ran with a sampler on `pg_stat_activity` and `pg_locks` (`waits-stack.txt`): 109 of 109 samples of active view queries were on CPU (no wait event), and all 124 lock samples had **0 ungranted locks**. The timeouts are CPU time, not blocking.

## 4. Accumulated test organizations vs the cost of one organization's data (independent database, no fixtures deleted)
`scratch_ref` is a `pg_dump`/`pg_restore` clone of the stack inside the same Postgres container (the stack's own data was never modified). Cloned unchanged it behaves like the stack; the 839-org clone was then reduced to **one organization** *in the clone only*, and that organization's dues were grown synthetically (copies of its own dues, same units; payments/allocations not scaled). Staff session, RLS on, min..max of 3 runs, ms:

| dues in the single organization | Q2 member row | Q1 units of member | Q5 org-wide balances |
|---|---|---|---|
| 13 (as cloned) | 45–85 | 64–68 | 59–101 |
| 1 001 | 342–680 | 216–401 | 215–245 |
| 5 005 | 1 331–1 390 | 1 106–2 376 | 1 516–2 389 |
| 20 007 | **5 401–21 024** | 5 746–6 533 | 4 761–6 956 |

Reading:
* **Accumulation effect.** ~1 000 dues spread over 839 tenants cost about 2.5 s on the stack, but ~1 000 dues of a *single* tenant cost 0.2–0.7 s: foreign rows are ≈ 5–6× dearer per row (all policy branches fail, so all are evaluated).
* **Single-organization data cost is real and linear**: ≈ 0.27 ms per due. With only one organization in the database, **a one-member lookup reaches 5–21 s at 20 000 dues, crossing the 8 s limit.** So this is not only a test-environment artifact: a large real tenant hits it too, and in a multi-tenant production the foreign rows add on top.
* Limitation: the sizes are synthetic and payments/allocations/units were not scaled, so the real crossing point for a real tenant is lower than the dues figure alone suggests; treat the table as a slope, not a forecast.

## 5. Proposed fix (NOT applied; needs your approval before any change)
Principle: **same arithmetic, same visibility, same RLS, same grants; only change *which rows the aggregates touch*.**
1. One forward migration redefining the two views (`create or replace view … with (security_invoker = true)`, same column list, order and types) so that the per-unit / per-member totals are computed with **correlated (LATERAL or scalar) subqueries keyed on the unit/member being returned**, instead of unfiltered CTEs joined afterwards. Then a lookup by id/organization drives from the *filtered* units/members (primary-key / organization index), reads that unit's dues, payments and allocations through their existing `unit_id` / `organization_id` indexes, and RLS is evaluated only on those rows.
2. No policy is touched, no grant widened, `security_invoker` kept, the global `statement_timeout` untouched, no change to what any role can see: RLS still filters every base-table row the caller reads.
3. If a supporting index is missing for the new access path (to be confirmed with `EXPLAIN` before writing it), it goes in the same forward migration.
4. Expected effect (a hypothesis until built): the foreign-row component disappears (the 2 s → low tens of ms for single lookups on the stack); org-wide KPIs (Q4/Q5) still scan the organization's own rows, so their cost stays linear in that organization's data at ≈ 0.27 ms/due — a separate per-row policy cost that only an RLS-side change could remove, which is out of scope under your constraint. The owner's portal listing (Q7) still evaluates the `units` policy for every unit row because owner visibility is expressed only by RLS; the rewrite removes the dues/payments/allocations scan but not that one.
5. Verification plan after approval: `baseline.py after` diffed against `baseline-before.txt` (numbers and per-principal row sets must be identical, no row-set widening), a cross-tenant isolation test (staff of A and owner of A never see B), forward-migration guard/grants allowlist updates, affected unit/integration tests, and Playwright (customer-advances, portal-statement, portal-journey, accounting-duplicates, accounting-journey, ui-screens, page-error-states).
6. `tests/e2e/page-error-states.spec.ts`: the restore-permission step will assert the **first** Retry succeeds (the tolerant `settle` loop removed from that step); any later statement timeout is recorded as its own failure and is not hidden by repeated clicks.

## Not established / limits
* Production data volume and tenant sizes are unknown; the single-organization table is synthetic.
* The clone shares the Docker VM with the stack, so absolute milliseconds vary run to run (see min..max); the slopes and the own-vs-foreign contrast are the evidence.
* `scratch_ref` (≈ 100 MB) is left in the stack's Postgres container for the next step; drop it on request.
