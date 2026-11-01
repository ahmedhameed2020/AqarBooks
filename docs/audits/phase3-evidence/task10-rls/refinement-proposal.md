# Proposal (NOT applied): evaluate the platform-admin check once per statement in the five policies

**Status: prototype on the scratch copy only (`scratch_rls`). The stack's policies are exactly those of migration 20261017100900. Needs your approval before any migration.**

## Finding
The approved migration made the *organization* check a once-per-statement set, but each policy still contains `auth.uid() IS NOT NULL AND is_platform_admin(auth.uid())`. `auth.uid()` and `is_platform_admin()` are STABLE, not IMMUTABLE, so inside a sequential-scan filter Postgres calls them **for every row** (the plan's Filter shows the call inline, twice per row because two permissive policies apply; 14,699 rows removed by filter on `fiscal_periods`). In the membership test the timeouts' database CONTEXT is `SQL function "is_platform_admin"`. The comment I wrote in the migration ("constant argument, evaluated once") is wrong.

## Proposed change
Wrap the admin check in an uncorrelated scalar sub-select — `(SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))` — which Postgres plans as an InitPlan evaluated once per statement. Same five policies, same semantics, same grants; only that sub-expression changes (7 occurrences: `migration/refinement-prototype.sql`). It would ship as a forward migration `20261017101000_…` (the applied migration stays as is).

## Evidence (scratch copy)
* Equivalence: `tests/rls-set-based-policies-equivalence.integration.test.ts` against the refined policies, run with `RLS_TEST_DB=scratch_rls`: 4/4 pass (`migration/refinement-equivalence-run.log`) — same visible rows, updatable rows and insert outcomes as the original policies for the same principals, platform admin included.
* Interleaved timing, policies as installed (A) vs refined (B), full copies with only the policy under test (`ab-refinement.md`, median of 5, ms): `chart_of_accounts` staff 380 → 10, owner 497 → 10, stranger 401 → 10; `fiscal_periods` 512 → 10, 398 → 8, 397 → 9; `dues` 22 → 6, 24 → 7, 17 → 5.
* Limits: copies carry only these policies, so the real tables' other policies are not in the picture (for `dues` the owner routes still dominate); no performance claim is made for the real-table totals beyond "the admin part disappears".

## NOT covered (separate decisions, each needing its own equivalence proof)
* `journal_entry_lines` (4.0–7.3 s in the probe; correlated `EXISTS` over `journal_entries` + `has_any_permission` per row) — the next relation to cross 8 s as test data grows, and the other timeout still seen in `membership-status-access`.
* `members`, `units`, `properties`, `fiscal_years` (1–4 s under load) and the remaining ~80 tables that use the permission helpers.
* The owner-route policies of `dues` (`work_order_cost_member_can_read_due`, 0.82 ms per row).
