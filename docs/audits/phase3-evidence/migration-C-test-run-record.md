# Test runs around migration C (20261017100200)

| Run | Scope | Result | Classification / action |
|---|---|---|---|
| red | `customer-advances-integrity` (16) BEFORE the migration | 4 passed, **12 failed** | Proves the reviewer's four findings on a real database: the -400 application was accepted (no refusal), the due was over-applied on a past date, an application before the due's issue date was accepted, unposted receipts were counted (`[1,1,1]`), a key moved between operations. Log `migration-C-tests-red-before.log`. |
| green-1 | same file after the migration | 15/16 | 1 failure = TEST_EXPECTATION_BUG: the test paid E3 (already part-applied) by a 500 receipt; fixed by using a fresh due. |
| green-2 | same file | **16/16** | `migration-C-integrity-tests-green.log` |
| full-1 | the whole affected set (28 files) | 434/436 — **2 failed** | (a) `customer-advances-actions.integration` expected 2 registry rows, found 5: the registry now also records the 3 receipts — TEST_EXPECTATION_BUG caused by the intended unification, fixed. (b) `membership-status-access` "activation ... suspension removes it" failed with an empty-message transport error on a select; classified **FLAKY / environment**: the file alone passes 17/17 (`migration-C-membership-file-alone.log`) and it passes in full-2; not reproduced, cause not proven. Log `migration-C-run1-2-failures.log`. |
| full-2 | the whole affected set again, in ONE run | **28 files, 436/436** | `migration-C-full-affected-run.log` — the first complete pass after C. |
| browser | accounting-journey, void-permission, duplicates, receivable-default, portal-journey, portal-refusals (production build) | **40/40** | `migration-C-e2e-regression.log` |

Also: `tsc` clean; eslint 0 errors; ledger 76/76, `db diff (public)` no changes; dev database still 456 organizations.
