# Test runs around migration D (20261017100300) and the Playwright client guard

| Run | Scope | Result | Notes |
|---|---|---|---|
| red | `customer-advances-review2` (12 tests) BEFORE migration D | 4 passed, **8 failed** | the owner lost the voided receipt before its void date (credit differed on 09-03); `PAYMENT_BEFORE_DUE` / `ALLOCATION_EXCEEDS_REMAINING_ON_DATE` not enforced by record_advance_payment; with a POSTED receipt that has no entry, record_advance_payment refused a legitimate 100 ("remaining 0.0000" from due_outstanding) while the readers said 300 owed. `migration-D-tests-red-before.log` |
| green | same file after D | **12/12** | `migration-D-review2-tests-green.log` |
| guard (simulation) | `playwright-client-guard.test.ts` | 6/6 | development URL, a *listed* development port, another stack, a hosted URL and a foreign host all refused BEFORE the constructor and before any request (spies); idempotent install; fail-closed on a read-only property; the real CommonJS supabase-js module is patchable. |
| guard (real child processes) | `isolated-target-negative-runs` | **14/14** (was 9) | 4 new REAL `npx playwright test` children (dev URL, dev port listed, other stack, hosted URL) each fail with "Refusing to run" and leave both databases' read-only fingerprints identical; 1 control child passes with the verified URL. `playwright-guard-real-child-runs.log` |
| browser | accounting-journey, void-permission, portal-journey, portal-visitor-gate-journey, portal-refusals + the skipped probe, with the guard installed in every worker | **37 passed, 1 skipped (the probe, by design)** | proves the guard does not break the real specs, which build clients through helpers and directly. `migration-D-e2e-with-playwright-guard.log` |
| full (34 files) | the whole affected set in ONE run | 518/522 — **4 failed, all in `membership-status-access.integration`**; the other 33 files passed | classified **ENVIRONMENT (shared-stack growth)**, see below. `migration-D-full-affected-run-34-files.log` |
| classification evidence | that file alone, shared stack | 17/17 but **128 s** | `migration-D-membership-file-alone-shared-stack.log` |
| classification evidence | that file on a FRESH stack (same code, 77 migrations) | **17/17 in 12.4 s** | `migration-D-membership-file-fresh-stack.log` |

Why environment: the failing assertion is a PostgREST select on `chart_of_accounts` returning an empty-message error. The authenticated role has `statement_timeout = 8s`; the database log shows 8 "canceling statement due to statement timeout" in the same window. The shared throwaway stack now holds 515 organizations / 4,779 accounts (every fixture clones a chart), and that file counts rows through per-row RLS, so it grew from ~10 s to ~120 s and crosses the 8 s limit. On a fresh stack it takes 12 s and passes. The cost of the views I changed was measured too: `units_with_financials` for an owner session 260-430 ms new vs 260 ms old (`effective_payment_allocations` 170 ms) — not the cause. Nothing was deleted to make it pass.
The first time the same file failed (migration C round) it was 1 test; it is the same mechanism growing with the fixtures.

Not claimed: a single 34-file pass. What exists: 33 files passing in the full run, plus that file passing alone and on a fresh stack.
