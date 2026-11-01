# Final sequential run of the affected tests on the FINAL build (2026-10-14, isolated stack)

One run, sequential, nothing re-run inside the table (`summary.txt`, `driver.sh`). The build is the one made after the deposit-account ordering change (`node scripts/demo-local/build.mjs --next-only`, exit 0, `build.log`); D: free space before/after: 2.52 → 2.49 GB. Server: `start-prod.mjs` on :3100. A pass of a later re-run never replaces the first-run result of the same test; re-runs are listed separately.

## Vitest (one invocation, 23 files)
`Test Files 1 failed | 21 passed | 1 skipped (23); Tests 6 failed | 406 passed | 40 skipped (452)` — `vitest.log`.
* **Failed (1 file, 6 tests): `membership-status-access.integration.test.ts`** — see "Classification" below.
* **Skipped (1 file, 40 tests), NOT RUN: `owner-portal-access.local-sql.test.ts`** — `describe.skipIf(!enabled)`: it needs `LOCAL_PG_PORT` pointing at a local PostgreSQL, which this run did not provide. Those 40 tests are "not run", not "passed".
* Passed, among others: migration guard (49 migrations, hashes), `financial-views-equivalence` (old vs new views, isolation), `security-function-grants`, `page-read-guard`, `assert-read`, `drift-verdict` (16), `deposit-accounts` (4), all `customer-advances*` files, `owner-statement-settlement` (it failed once earlier on a 57014 read of `dues`; it passed in this run, so that flake is **not closed**), `portal-statement-history`, `member-opening-balance`, `owner-portal-functions-authz`.

## Playwright (production build, one run per spec; first-run results)
| spec | first run |
|---|---|
| `page-error-states` | 2/2 passed — in both tests the **first** Retry after restoring the grants succeeded (no retry loop in the spec) |
| `owner-portal-isolation` | **1 failed** (see below); after the spec repair: 1 passed (separate verification run, `owner-portal-isolation-after-fix.log`, 22.8 s) |
| `portal-refusals` | 5/5 |
| `accounting-duplicates` | 5/5 |
| `accounting-journey` | 15/15 |
| `portal-journey` | 6/6 |
| `portal-statement` | 8/8 |
| `customer-advances` | 10/10 on the first run (B1 failed once in the previous series, before the deposit-account ordering fix; that failure was nondeterministic, so this pass is consistent with the fix but cannot by itself prove it; the proof is the explicit ordering, `tests/deposit-accounts.test.ts`) |
| `customer-advances-ui-screens` | 6/6 |

## Classification of the failures
1. **`membership-status-access` (6 tests; 5 of 6 on an isolated re-run) — ENVIRONMENT_OR_HARNESS + RLS cost, deterministic on this stack.** Evidence: run alone, PostgREST logged `HEAD /chart_of_accounts?select=* → 500` with `{"code":"57014","message":"canceling statement due to statement timeout"}` five times (`postgrest-membership-alone.txt`), the database log shows 5 matching `ERROR: canceling statement due to statement timeout`, and each failing test ends at 8.04–8.07 s, i.e. exactly the 8 s limit of role `authenticated`. The HEAD request has no body, which is why the test's message is blank. Cause and proposed fix: `../diagnosis.md` (per-row `SECURITY DEFINER` permission checks; `chart_of_accounts` count 5.7–8.5 s on a quiet machine). **Not fixed; needs approval to change RLS.** A passing re-run would not close it.
2. **`owner-portal-isolation` — TEST_EXPECTATION_BUG, two layers, both in the spec.** (a) setup: its staff user had the `TENANT_OWNER` role but no ACTIVE `organization_memberships` row, which `has_permission` requires since Phase 1 → `create_resort` answered 42501. Repaired by inserting the membership in the spec (test data; no application permission widened). (b) Once past setup, the first run failed at the owner login: the spec typed a password on the portal login page, which is passwordless (email → code). Repaired by using the shared `portalLogin` helper and the same 240 s timeout as the other browser specs. The first-run failure stays on record; the repaired spec passed in a separate run.
3. **`customer-advances` B1 (previous series) — PRODUCTION_BUG, nondeterministic default.** Fixed: the deposit accounts are now listed in ascending code order, ties by id (`lib/finance/deposit-accounts.ts`, used in `finance/payments/page.tsx`, plus `.order("code")` in the query). The set of accounts offered is unchanged; whether receivables (1130) should be offered as a deposit account at all is a separate decision, not made here.

## Housekeeping done in this step
* npm cache cleaned only (`npm cache clean --force`; path verified as `npm config get cache` = `C:\Users\Lenovo\AppData\Local\npm-cache`): folder 23.24 → 5.83 GB, C: free 6.28 → 23.56 GB, `node_modules` untouched (`../../task8-views/npm-cache-clean.txt`). `uv`, Docker memory and containers untouched.
* Not changed: RLS, grants, the global timeout, migrations, any calculation. Not run: new load loops. Schema-drift item remains OPEN; no diff was run in this step.
