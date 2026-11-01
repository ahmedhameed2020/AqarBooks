# Task 8 — result of the view rewrite (migration 20261017100800), isolated stack only, 2026-10-13

**Scope done:** one forward migration `supabase/migrations/20261017100800_phase3i_view_lateral_aggregates.sql` (the two views recomputed with LATERAL totals keyed on the returned row, plus `idx_payments_member_posted`). No RLS policy, grant, global timeout, calculation or visibility rule was changed. Nothing was committed, pushed or deployed; the development database and all fixtures were left alone (`scratch_ref`, `scratch_after`, `scratch_ab` are separate scratch databases inside the stack's Postgres container, kept for comparison).

## 1. The first version of the migration was wrong for lists; it was reshaped before being accepted
The first draft (separate LATERAL for `total_due` and `total_paid`) made **single lookups ~50–100× faster but list / organization-wide queries up to ~25× SLOWER** on realistic data (1,502 units / 9,763 dues: all units of the org 72 s vs 3 s; 6.2 M vs 0.76 M buffers, `ab-scaling.md`). Cause (plan): per unit the planner started the paid-totals subquery from `payments` (sequential scan, RLS functions per row). The shipped shape reads each unit's dues **once** (`FILTER` for `total_due`, a per-due allocation lookup for `total_paid`). That is the version in the repository and on the stack.
Note: the stack had received the first draft through `stack.mjs migrate`; the final text of the same migration file was then applied to the stack with psql (every statement is idempotent: `CREATE INDEX IF NOT EXISTS`, `CREATE OR REPLACE VIEW`). The ledger version is unchanged. The migration had never left the isolated stack.

## 2. Equivalence (acceptance 1)
* `baseline.py after` vs `baseline-before.txt`: **identical** (except the title line): both views' per-row md5 over 931 / 945 rows, per-organization sums, and the rows + md5 each of 8 staff and 8 owner principals sees through RLS.
* `tests/financial-views-equivalence.integration.test.ts` (4 tests, pass): the pre-migration definitions (verbatim in `tests/helpers/legacy-financial-views.ts`) are created in a throw-away schema inside a rolled-back transaction and compared with the new views in **both directions (EXCEPT ALL)**: column names/order/types identical; all rows as table owner; 4 staff + 4 owner principals under RLS; and after voiding a due that carries an allocation (`total_paid` still counts it, `total_due` does not, as before). Fixture coverage asserted non-vacuous: reversed allocations (365 in the stack), advance payments (518), legacy receipts. The numeric-equivalence of reversed allocations and advances comes from that real fixture data, not from new synthetic rows.
* Isolation (same test): a staff principal sees **0** rows of any organization it is not an active member of, for both views (checked for 4 principals); an owner's row sets are equal to the old view's under the same RLS.

## 3. The eight page queries, before/after (acceptance 2) — `before-after-8-queries.md`, plans in `plans-stack-835-orgs.txt` / `plans-after-final.txt`
| query (839-org stack) | before median ms | after median ms | before buffers | after buffers |
|---|---|---|---|---|
| Q1 member page: units of one member | 2064 | 30 | 75236 | 2568 |
| Q2 member page: the member row | 3479 | 31 | 76743 | 2861 |
| Q3 property list: first 25 units | 2630 | 31 | 75181 | 2513 |
| Q4 property KPI strip | 2623 | 26 | 75234 | 2566 |
| Q5 members-page KPI | 2177 | 24 | 51219 | 2566 |
| Q6 members list: first 25 | 2437 | 56 | 86861 | 2904 |
| Q7 portal units (owner, RLS only) | 2243 | 556 | 91419 | 27049 |
| Q8 portal home (owner) | 2045 | 53 | 91817 | 4108 |

## 4. Organization-wide and list queries on one big organization (acceptance 3) — `ab-final.md`
Identical data (1,502 units / 9,763 dues / 2,253 members, one organization, scratch clone), old and new definitions swapped on the same database, staff session, min of 3 runs: one member 3,520 → 9 ms; one member's units 6,101 → 11 ms; **25 units (list) 2,701 vs 4,369 ms at first, then 2.9–6.2 s (old) vs 2.7–4.3 s (new) over 5 repeats each: no difference beyond noise**; all units of the org 3,007 vs 2,945 ms; 25 members 2,713 vs 3,077; all members of the org 3,526 vs 3,039 ms. **Org-wide and list queries are NOT improved** (buffers +11 % units, +20 % members): their cost is the organization's own rows × the RLS functions, which only an RLS-side change could reduce (out of scope by your constraint). What changed is that they no longer pay for other organizations' rows or for rows the page did not ask for.
Limit: synthetic copies of units/members/ownerships/dues; payments and allocations were not scaled (copied payments have no journal entry, so their allocations would not count). The paid-totals path was therefore measured only on the original organization's payments.

## 5. Waits and locks
`waits-stack.txt`: 109/109 samples of active view queries on CPU, 0 ungranted locks in 124 samples. As you noted, this does not prove the absence of contention at other times; it supports CPU time as the dominant cause of the timeouts measured.

## 6. Tests re-run
* Unit/integration set (one run, `vitest-affected-run.log`): 16 files pass, **2 files fail (7 tests)**, both classified below as not caused by this change.
* `tsc --noEmit` clean; eslint clean on the changed test files; `migration-directory-guard` updated (49 authorized migrations, hash pinned) and passing; `security-function-grants` passing (no function added).
* `stack.mjs verify` after the migration (`stack-verify-after-migration.txt`): ledger 82/82 MATCH; `db diff (public)`: no schema changes, 2 identical runs. **This one clean run does not resolve the earlier 2-of-11 unstable-diff reports: the drift-check instability stays an independent open item.**
* Playwright (`playwright/summary.txt`, one run per spec, sequential, production build on :3100; the build predates this task and no app code changed in it): `page-error-states` 2/2 (the Retry step now requires the FIRST Retry to succeed, no loop; passed), `portal-refusals` 5/5, `accounting-duplicates` 5/5, `accounting-journey` 15/15, `portal-journey` 6/6, `portal-statement` 8/8, `customer-advances-ui-screens` 6/6, `customer-advances`: **first run 1 failed + 7 not run + 2 passed; rerun 10/10** (see 7c), `owner-portal-isolation`: **1 failed in setup** (7d). This is a set of passes over several runs, not one complete green run.

## 7. Failures, each classified with evidence
a. **`membership-status-access.integration.test.ts` (6 tests) — ENVIRONMENT_OR_HARNESS.** `chart_of_accounts: error {message: ''}` while counting rows; the database log shows `canceling statement due to statement timeout` for `chart_of_accounts` selects; a plain RLS `count(*)` over `chart_of_accounts` (12,407 rows, 12,381 foreign) takes 5.4 s here. Same mechanism on another relation the migration does not touch; reproduced on an immediate rerun (5 failed).
b. **`owner-statement-settlement` "never hides a due" (1 test; it passed in an earlier run) — ENVIRONMENT_OR_HARNESS.** The test does `nSession.from("dues").select("id")` (no view): `57014`. A bare owner read of `dues` takes 4.6–6.8 s here (3 runs), near the 8 s limit. **This is a limit of the fix: base-table RLS cost is untouched.**
c. **`customer-advances` B1, first run — PRODUCTION_BUG (pre-existing), nondeterministic.** The cash line posted to account 1130 instead of 1110. The payments page loads the ASSET accounts with **no `ORDER BY`** and the dialog defaults to the first row; in 306 of 679 organizations of this stack the first unordered asset account is not the lowest code (only 225 start with 1110). Not related to the views and not timeouts (none logged in that window). Not fixed here (app code untouched); one-line fix would be `.order("code")` plus a decision on whether 1130 (receivables) should be offered as a deposit account at all. Rerun: 10/10.
d. **`owner-portal-isolation` — TEST_EXPECTATION_BUG in setup, pre-existing.** `create_resort failed: not authorized` (needs `tenant.settings.manage`) before any page read; the spec has no local change. Isolation of the views is covered here by the equivalence/isolation test and by `portal-refusals`, but this browser spec remains unrepaired.

## 8. What this does NOT fix (read before relying on it)
* The portal units page (Q7) is still ~0.5 s and any code reading `dues`, `payments` or `chart_of_accounts` directly as an owner/staff pays the per-row RLS cost on every foreign row (§7a, §7b). With ~840 test organizations those can approach the 8 s limit; whether production-sized data does is unknown. Reducing that needs an RLS-side change (e.g. a cheaper policy form) that was out of scope and needs its own approval.
* The synthetic single-organization scaling covers dues/units/members only.
* Open items unchanged: schema-drift check instability; the `ORDER BY` defect (7c); `owner-portal-isolation` setup (7d); the base-table RLS cost (§7a/§7b/§8); G-ADV-1 and the cash refund / credit transfer outside V1; Accsys conditional on the Bagoush decision.

## Files
`baseline-*.txt`, `before-after-8-queries.md`, `plans-*.txt`, `scaling-*.txt`, `ab-scaling.md` (first draft, shows the list regression), `ab-final.md` (shipped shape), `waits-stack.txt`, `diagnosis.md`, `stack-verify-after-migration.txt`, `vitest-affected-run.log`, `playwright/*`, scripts `baseline.py plans.py scaling.py ab.py ab2.py waits.py`, `old-views.sql`, `principals.txt`.
