# Closure report — performance and permissions batch (isolated stack only, 2026-10-12 … 2026-10-15)

Local only. No commit, no push, no deployment. The global `statement_timeout` was never changed; no fixture and nothing in the development database was deleted. The batch is closed for its stated scope; what it did NOT cover is listed in §6.

## 1. Scope and the five forward migrations
| migration | what it does | bytes | SHA-256 |
|---|---|---|---|
| `20261017100800_phase3i_view_lateral_aggregates` | `units_with_financials` / `members_with_financials`: totals computed for the returned row (LATERAL, one pass over the unit's dues) instead of unfiltered CTEs; one index | 5,288 | `579e3591d08b65a57c0a2959ed531cbed09b84bef79f5f5d0acaf39ffc1f2565` |
| `20261017100900_rls_set_based_permission_policies` | `orgs_with_permission_keys()` + 5 policies (chart_of_accounts select + manage, fiscal_periods select + manage, dues_select_permission) | 6,822 | `ddee18f634275e21d332424252154bab53912715cbeb783684f873093986c19b` |
| `20261017101000_rls_admin_check_once` | the platform-admin check of those 5 policies as an uncorrelated InitPlan (corrects a wrong claim in the previous header) | 5,355 | `ec14382329dbcdc3adc2eca0bd80c62c78f1322d3d627abf726ae9f90f322330` |
| `20261017101100_rls_journal_entries_and_lines` | `journal_entries` + `journal_entry_lines` select policies, together (the lines policy alone does not help) | 2,780 | `acddadb100368b30f31a8241fafbfe6c1c23b283ff3904530d64d75f90f9bafb` |
| `20261017101200_rls_fiscal_years` | `fiscal_years` select + ALL ("manage") policies | 2,367 | `703554ff3f723b09436ce4aa0f1beddb5edb73cd931098d9d908e978e23e731d` |
All five are pinned in `tests/migration-directory-guard.test.ts` (53 authorized migrations; ledger 86/86). Each RLS migration changed exactly the policies named (catalog diffs: 5 policies + 1 function; 5 policies; 2 policies; 2 policies — `migration/catalog-diff*.txt`). No grant was changed, no policy added or removed; `orgs_with_permission_keys` has the EXECUTE grants of `has_permission` (authenticated, service_role; not anon, not PUBLIC).

## 2. Equivalence — what was proven, and how
* Views: old vs new definitions compared in both directions (`EXCEPT ALL`) for all rows and for 4 staff + 4 owner principals under RLS, plus a voided-but-allocated due; the baseline of every row's md5 identical (`task8-views`).
* RLS tables: for each migrated table the INSTALLED policy expressions are read from the catalog and compared with the previous ones (hard-coded) on copies carrying only the policy under test, for staff of every role present (10 holding the keys, 4 without), owners, invited and suspended members, a stranger and a platform admin created in a rolled-back transaction. Reads in both directions for every table; **inserts, updates, deletes and WITH CHECK (moving a row to another organization) for `chart_of_accounts`, `fiscal_periods` and `fiscal_years`**; for the two journal tables, which have only a SELECT policy, the test asserts that no write policy exists and that updates and deletes stay at 0 rows for staff, platform admin and stranger. Catalog assertions: exactly the expected policies, PUBLIC, permissive, no per-row permission helper, an uncorrelated platform-admin sub-select; plan assertions: an InitPlan executed at most once, no per-row `is_platform_admin` in any Filter.
* Every suite was **red before and green after** the migration, and each has a **negative control** that fails as it must (sabotaged policies: the platform admin loses 51 `dues` / 158 journal entries, CASHIER and FRA_READER lose rows, the admin sub-select or InitPlan disappears).
* Limits: the old per-row policies are too slow to scan fully for ~25 principals, so the RLS comparisons run on a deterministic sample of organizations (the principals' own plus 40 by id and up to 10 non-active); the equivalence is therefore proven for those organizations, not for every row of the stack.

## 3. Measurements (isolated stack, 839+ test organizations; neighbour load made absolute numbers vary 2–6×, so the controlled comparisons are interleaved)
* Views, 8 page queries, median ms before → after: unit lookup 2,064 → 30; member row 3,479 → 31; list page 2,630 → 31; property KPI 2,623 → 26; members KPI 2,177 → 24; members list 2,437 → 56; owner units 2,243 → 556; owner home 2,045 → 53. **On one big organization (1,502 units / 9,763 dues) single lookups improve 3.5–6 s → ~10 ms, but lists and organization-wide KPIs do NOT improve** (≈ same time, buffers +11 %/+20 %).
* RLS, interleaved on copies carrying only the policy under test, median: `chart_of_accounts` 18.9–46.9 s → 0.6–2.4 s (first migration) → ~10 ms (InitPlan); `fiscal_periods` 18.7–32.7 s → 0.8–2.6 s → ~10 ms; `dues` permission policy 1.2–1.9 s → 0.13–0.15 s → 5–7 ms; journal tables 3.3 / 2.5 / 7.9 s → 13 / 13 / 30 ms; `fiscal_years` 1,156 / 689 / 1,319 ms → 18 / 10 / 13 ms. The real `dues` table is NOT faster as a whole: its owner-route policies are untouched and dominate.

## 4. Final results after the last change (`final-run-closure/`; first run, nothing re-run, no timeout changed)
* **Vitest, one process per file, strictly sequential: exit 0, 26 of 26 files pass** — including `membership-status-access` 17/17 (it failed in every earlier series), the 40 formerly skipped `owner-portal-access.local-sql` tests on the isolated stack's port 55322, `rls-fiscal-years` 4/4, `rls-journal-entry-lines` 5/5, `rls-set-based` 6/6, all `customer-advances*` files, the migration guard (104 tests), the function-grants guard.
* **Playwright, production build, one run per spec: 9 of 9 specs pass** — `page-error-states` 2/2 (the first Retry succeeded in both), `owner-portal-isolation` 1/1, `portal-refusals` 5/5, `accounting-duplicates` 5/5, `accounting-journey` 15/15, `portal-journey` 6/6, `portal-statement` 8/8, `customer-advances` 10/10, `customer-advances-ui-screens` 6/6.
* **Schema check with catalog capture:** ledger 86/86 MATCH; two clean observations, the live and shadow catalogs identical in both; `CLEAN`, exit 0.

## 5. Failures recorded along the way (none is hidden by the green run)
| failure | classification |
|---|---|
| `membership-status-access`: HTTP 500 / 57014 on `chart_of_accounts`, later `journal_entry_lines`, once `fiscal_years` | RLS per-row cost; fixed by migrations 100900 … 101200; 17/17 now |
| 5 `customer-advances*` Vitest files failed in fixture setup in a parallel invocation; 8 tests timed out in SECURITY DEFINER RPCs once | ENVIRONMENT (overload); by elimination, not profiled; all pass when run one file at a time; RLS is not evaluated inside those definer functions |
| `customer-advances` B1 (cash line posted to 1130) | PRODUCTION_BUG (unordered deposit-account list) — fixed (`lib/finance/deposit-accounts.ts`) |
| `owner-portal-isolation` setup | TEST_EXPECTATION_BUG (missing active membership; password login on a passwordless portal) — fixed in the spec |
| `owner-portal-access.local-sql`, first execution 39/40 | test setup vs the real `auth.sessions` (id has no default) — fixed in the test |
| `owner-statement-settlement` "never hides a due": one 57014 on a direct owner read of `dues` | **Currently passing (8/8 in every run since). The cause of the earlier failure is NOT resolved**: a bare owner `select id from dues` was measured at 4.6–6.8 s once and 1.0–1.5 s otherwise, dominated by the untouched owner-route policy `work_order_cost_member_can_read_due` (~0.82 ms per row); load-dependence is the likely, unproven explanation. No open-ended repetition planned. |
| my own test-script bugs (regex/escaping, a helper listed as a test, an abandoned run leaving `psql` sessions in `scratch_rls`) | disclosed in the RESULT files; fixed before any result relied on |

## 6. NOT covered / still open
* The ~80 other tables that call `has_permission` / `has_any_permission` per row, and the owner-route policies of `dues` — deliberately not expanded.
* Schema-drift item: the check now reports `CLEAN`, but the unexplained intermittent tool reports of 2026-10-12 and the one reproduced under load were never explained; the item stays open.
* G-ADV-1 and the cash refund / credit transfer outside V1; Accsys (conditional on Bagoush's decision).
* Housekeeping: four temporary debug files of mine remain because the environment's safety check refused their removal (`task10-rls/migration/debug-out.txt`, `debug-err.txt`, `debug-script.sql`, `done-debug.txt`). The comparison databases (`scratch_ref`, `scratch_after`, `scratch_ab`, `scratch_rls`, `aqar_local`) are kept; free space on D: is 1.83 GB.

## 7. Where the evidence is
`task10-rls/final-run-closure/` (this run), `final-run-last/`, `final-run-final/`, `final-run-after-rls/`, `final-run/` (earlier runs), `migration/` (red/green/negative-control logs, catalog snapshots and diffs), `*-proposal.md`, `ab-*.md`, `probe-*.md`; `task8-views/` for the views; `task9-drift/` for the drift check.
