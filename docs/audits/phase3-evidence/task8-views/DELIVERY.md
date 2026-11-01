# Delivery — repair of `units_with_financials` / `members_with_financials` (isolated stack only)

Local only: no commit, no push, no deployment, no cleanup or deletion; RLS, grants, the global timeout and every calculation are unchanged. Full detail: `result.md`, `diagnosis.md`, `ab-scaling.md` / `ab-final.md`, `before-after-8-queries.md`.

## 1. The migration
`supabase/migrations/20261017100800_phase3i_view_lateral_aggregates.sql` — 5,288 bytes — SHA-256 `579e3591d08b65a57c0a2959ed531cbed09b84bef79f5f5d0acaf39ffc1f2565` (pinned in `tests/migration-directory-guard.test.ts`, 49 authorized migrations).
Redefines both views with `CREATE OR REPLACE VIEW … WITH (security_invoker = true)`: same columns, order and types; the totals are LATERAL subqueries keyed on the returned unit / member (one pass over the unit's dues, allocations fetched per due), instead of unfiltered CTEs joined afterwards; plus `idx_payments_member_posted`. A first draft (two separate LATERALs) was rejected after measurement: it made list queries up to 25× slower (`ab-scaling.md`). The stack received that draft through `stack.mjs migrate`, then the final text of the same file by psql (idempotent; same ledger version); the migration never left the isolated stack.

## 2. Numbers and visibility equal
* `baseline.py after` vs `baseline-before.txt`: identical (every row's md5 in both views, per-organization sums, and the rows + md5 each of 8 staff and 8 owner principals sees through RLS).
* `tests/financial-views-equivalence.integration.test.ts` (4 tests): the pre-migration definitions are created in a throw-away schema in a rolled-back transaction and compared in both directions (`EXCEPT ALL`) with the new views: column names / order / types; all rows as table owner; 4 staff + 4 owner principals under RLS; after voiding an allocated due (`total_paid` still counts it, `total_due` does not). Fixture coverage asserted: reversed allocations (365 in the stack), advance payments (518), receipts with an unallocated remainder. Isolation: 0 foreign-organization rows for each staff principal. Re-run today after the Docker restart: guard + equivalence/isolation + grants + read-guards = 5 files, 131 tests, all pass (`vitest-final-run.log`).

## 3. The eight page queries, before / after (839-organization stack; staff and owner sessions under RLS; median of 3; buffers = top-node shared hits)
| query | before ms | after ms | before buffers | after buffers |
|---|---|---|---|---|
| Q1 member page: units of one member | 2064 | 30 | 75236 | 2568 |
| Q2 member page: the member row | 3479 | 31 | 76743 | 2861 |
| Q3 property **list** page: first 25 units | 2630 | 31 | 75181 | 2513 |
| Q4 property **KPI** strip (every unit of the property) | 2623 | 26 | 75234 | 2566 |
| Q5 members-page **KPI** (every unit balance of the organization) | 2177 | 24 | 51219 | 2566 |
| Q6 members **list**: first 25 | 2437 | 56 | 86861 | 2904 |
| Q7 portal units (owner, RLS only) | 2243 | 556 | 91419 | 27049 |
| Q8 portal home (owner) | 2045 | 53 | 91817 | 4108 |
**These improvements are large here because that stack holds 839 small organizations and the old views read all of them.** They do not transfer to one big organization. Same data, old and new definitions swapped, ONE organization of 1,502 units / 9,763 dues / 2,253 members (`ab-final.md`, min of 3, ms): one member 3,520 → 9; one member's units 6,101 → 11; **25-unit list page 2,701 → 4,369 on the first measurement, 2.9–6.2 s (old) vs 2.7–4.3 s (new) over 5 repeats each, i.e. no difference beyond noise; all units of the organization (KPI) 3,007 vs 2,945; 25-member list 2,713 vs 3,077; all members of the organization (KPI) 3,526 vs 3,039. Buffers rose 11 % (units) and 20 % (members).** Lists and organization-wide KPIs of a large organization are NOT improved; single lookups are. Synthetic limit: payments / allocations were not scaled.

## 4. Browser tests (production build on :3100, one run per spec, sequential; `playwright/summary.txt`)
`page-error-states` 2/2 — **the restore-permission step now requires the FIRST Retry to succeed (no retry loop); it did, in both tests**; `portal-refusals` 5/5; `accounting-duplicates` 5/5; `accounting-journey` 15/15; `portal-journey` 6/6; `portal-statement` 8/8; `customer-advances-ui-screens` 6/6; `customer-advances` first run 1 failed + 7 not run + 2 passed, rerun 10/10 (cause: the payments dialog's default deposit account has no `ORDER BY`; pre-existing); `owner-portal-isolation` 1 failed in its own setup (`create_resort` needs `tenant.settings.manage`; pre-existing). Passes spread over several runs, not one complete green run; not re-run after the Docker restart of 2026-10-14.

## 5. Failures that are not this change (classified in `result.md` §7)
`membership-status-access` (6 tests) and one `owner-statement-settlement` test hit the 8 s statement timeout on base tables (`chart_of_accounts`, `dues`) whose per-row RLS cost this migration does not touch; the default-deposit-account ordering; the `owner-portal-isolation` setup.

## 6. Schema-drift check — still OPEN
See `../task9-drift/result.md`. Final required check today, through `stack.mjs verify` with `VERIFY_CAPTURE=1`: ledger 82/82 MATCH; two clean observations; for each, the live database and the CLI's shadow read independently from the catalogs were identical (0 of 4,500 facts differ); verdict `CLEAN`, exit 0 (`../task9-drift/verify-final-with-capture.txt`). That does not close the item: a DRIFT-like report from the diff tool was reproduced once under load and its instance was not captured.

## 7. Follow-up (2026-10-14, after the delivery above)
Final sequential run on a rebuilt production build and the diagnosis of the remaining timeouts: `../task10-rls/final-run/RESULT.md`, `../task10-rls/diagnosis.md`. Summary: Vitest 21 files pass, 1 fails (`membership-status-access`, 6 tests: HTTP 500 / 57014 on `chart_of_accounts`, proposal pending approval), 1 file skipped (needs `LOCAL_PG_PORT`); Playwright 9 specs, all passed on the first run except `owner-portal-isolation` (stale spec: missing active membership, then password login on a passwordless portal; repaired, passes in a separate run); `page-error-states` 2/2 with the first Retry succeeding; `customer-advances` 10/10 after the explicit deposit-account order.

## 8. Follow-up (2026-10-14): RLS migration 20261017100900
Approved and applied for `chart_of_accounts`, `fiscal_periods` and `dues_select_permission`; equivalence proven, negative control fails as it must, catalog diff = 5 policies + 1 function, schema check CLEAN (83/83, catalogs identical). `membership-status-access` is NOT green yet (2 of 17 tests failed on the re-run); a refinement and `journal_entry_lines` are proposed, not applied. See `../task10-rls/final-run-after-rls/RESULT.md` and `../task10-rls/refinement-proposal.md`.

## 9. Follow-up (2026-10-15): second RLS migration and the final runs
`20261017101000_rls_admin_check_once.sql` (platform-admin check as an InitPlan, same five policies; red before / green after, catalog diff = 5 policies). Final runs: `../task10-rls/final-run-final/RESULT.md` — Playwright 9/9 first run; Vitest strictly sequential: every file passes except `membership-status-access` (1-2 of 17, `journal_entry_lines`, outside the approved tables); the 40 formerly skipped tests pass 40/40 on the isolated stack's port (first execution 39/40, cause = test setup vs the real auth schema). `journal_entry_lines` proposal and independent test, NOT applied: `../task10-rls/journal-entry-lines-proposal.md`.

## 10. Follow-up (2026-10-15): journal tables migrated, final run green
`20261017101100_rls_journal_entries_and_lines.sql` (both journal tables in one migration; equivalence for both tables, no write policy touched, writes still denied). Final run after the last change: Vitest strictly file by file 26/26 files (incl. `membership-status-access` 17/17 and the 40 local-sql tests), Playwright 9/9, schema verify `CLEAN` (ledger 85/85, catalogs identical): `../task10-rls/final-run-last/RESULT.md`. `fiscal_years` analysed and proposed, NOT applied: `../task10-rls/fiscal-years-proposal.md`.

## 11. Closure (2026-10-15)
Performance and permissions batch closed for its scope: `../task10-rls/CLOSURE-performance-and-permissions.md` (five migrations incl. `20261017101200_rls_fiscal_years.sql`; final run: Vitest file by file 26/26, Playwright 9/9, schema verify CLEAN 86/86). `owner-statement-settlement` passes; the cause of its earlier failure is unresolved.
