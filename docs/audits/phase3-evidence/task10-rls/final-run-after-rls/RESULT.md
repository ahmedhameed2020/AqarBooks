# Full sequential run on the final state — AFTER migration 20261017100900 (2026-10-14, isolated stack)

State under test: production build of today (no app code changed since), migration `20261017100900_rls_set_based_permission_policies.sql` applied to the stack (5 policies + 1 function; catalog diff in `../migration/catalog-diff.txt` shows exactly that and nothing else). One sequential run, nothing re-run inside the table (`summary.txt`, `driver.sh`). Re-runs are listed separately and never replace a first-run result.

## First run
**Vitest (one invocation, 24 files):** `Test Files 3 failed | 20 passed | 1 skipped; Tests 13 failed | 404 passed | 40 skipped (457)` (`vitest.log`).
| file | failed tests | classification |
|---|---|---|
| `membership-status-access` | 5 | **STILL OPEN (RLS cost)** — see below |
| `customer-advances.integration` | 4 | statement timeouts inside SECURITY DEFINER RPCs — see below |
| `customer-advances-integrity` | 4 | same |
Skipped, NOT RUN: `owner-portal-access.local-sql.test.ts` (40 tests; needs `LOCAL_PG_PORT`).
**Passed in this run, among others:** the migration guard (50 migrations), `rls-set-based-policies-equivalence` (4), `financial-views-equivalence`, `security-function-grants` (allowlist now includes `orgs_with_permission_keys`), `drift-verdict`, `deposit-accounts`, `owner-statement-settlement` (it timed out once earlier; it passed here; not closed as a flake).
**Playwright (production build, one run per spec):** `page-error-states` 2/2 (first Retry succeeded), `owner-portal-isolation` 1/1 (the repaired spec), `portal-refusals` 5/5, `accounting-duplicates` 5/5, `accounting-journey` 15/15, `portal-journey` 6/6, `portal-statement` 8/8, `customer-advances` 10/10, `customer-advances-ui-screens` 6/6.

## Re-run of the three failing Vitest files (separate record, `rerun-3-failing-files.log`)
`customer-advances.integration` and `customer-advances-integrity`: **pass**. `membership-status-access`: **2 failed, 15 passed** (it was 6 failed before the migration, 5 in the first run after it).

## Classification
1. **`membership-status-access` — NOT fixed by the approved migration alone; improved.** Before: 6 of 17 tests failing, HTTP 500 / `57014` on `chart_of_accounts`. After: 5, then 2 of 17. What still times out (PostgREST 500 + database log): `HEAD /chart_of_accounts` (3 in the first run, 1 in the re-run) and `HEAD /journal_entry_lines` (2 and 1). Two causes, measured:
   * `journal_entry_lines` is NOT among the three approved tables; its policy runs a correlated `EXISTS` over `journal_entries` plus `has_any_permission` per row; 4.0–7.3 s in the probe (`probe-all-after-migration.md`), 6,099 rows and growing with every test run.
   * Inside the approved policies the platform-admin check `is_platform_admin(auth.uid())` is still called **per row** (the Filter of the plan shows it inline, twice per row; the timeouts' database CONTEXT is `SQL function "is_platform_admin"`). My migration header claims it is "evaluated once": **that claim is wrong** for a STABLE function in a sequential-scan filter. The refinement in `../refinement-proposal.md` fixes it; it is NOT applied.
2. **`customer-advances.integration` (4) and `customer-advances-integrity` (4) — ENVIRONMENT (load), first-run failures stay on record.** Every failure is a `57014` raised in an RPC call (`issue_dues`, `apply_payment_credit`, `create_journal_entry_internal`, `record_advance_payment`). All of these functions are `SECURITY DEFINER` and none of `dues`, `journal_entries`, `chart_of_accounts`, `fiscal_periods` has `FORCE ROW LEVEL SECURITY`, so inside them the table owner's rights apply and the five changed policies are **not evaluated**: the migration cannot be the cause. The 8 s limit counts the whole RPC, and the neighbouring Docker projects were using CPU at that moment; the same files passed in the previous series and in the immediate re-run. This explanation is by elimination, not by a profile of those RPCs.

## What the approved migration achieved (measured)
* Equivalence with the old policies: `tests/rls-set-based-policies-equivalence.integration.test.ts` (4 tests) — 0 differences in visible rows, updatable rows and insert outcomes for staff of every role present, roles without the keys, owners, invited / suspended members, a stranger and a platform admin; function SECURITY DEFINER / STABLE / search_path pinned / same EXECUTE grants as `has_permission` (not anon, not PUBLIC). Negative control: with deliberately wrong policies the same test FAILS (`../migration/negative-control-run.log`: 5 row differences, per-row helper still present); positive control on the scratch copy passes (`../migration/positive-control-run.log`).
* Controlled A/B, old vs new policy on full copies carrying only that policy, interleaved in the same minutes (`../ab-policy-timing.md`; medians): `chart_of_accounts` 18.9–46.9 s → 0.6–2.4 s; `fiscal_periods` 18.7–32.7 s → 0.8–2.6 s; `dues` 1.2–1.9 s → 0.13–0.15 s. The absolute "old" values are inflated by neighbour load; the ratio (8–40×) is the evidence.
* On the stack itself, quiet-machine probe, staff, exact count: `chart_of_accounts` 5.7–8.5 s → 2.0–2.8 s; `fiscal_periods` 5.5–6.1 s → 0.4–1.5 s. Real `dues` reads did not speed up: the other four policies on that table (owner routes, e.g. `work_order_cost_member_can_read_due`, 0.82 ms per row) are untouched and dominate.
* Schema check after the migration (`../verify-after-rls-migration.txt`): ledger 83/83 MATCH; two clean observations; live and shadow catalogs identical in both (`CLEAN`, exit 0). The drift item itself stays OPEN.

## Process notes (my own mistakes, disclosed)
Abandoned test runs left server-side `psql` sessions running in `scratch_rls` (up to 23 minutes) that slowed and blocked later runs; I terminated them (only in that scratch database; the stack's database had none) and added `statement_timeout` / `lock_timeout` guards to the test's script. The first probe of this task was contaminated by my own disk activity and is kept only for the record. The equivalence test compares on a deterministic sample of organizations (the principals' own plus 40 by id and up to 10 non-active ones), because the old per-row policies are too slow to scan fully for ~25 principals.
