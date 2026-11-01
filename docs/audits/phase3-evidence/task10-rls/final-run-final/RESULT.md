# Full run on the FINAL state (2026-10-14/15, isolated stack)

State: both RLS migrations applied (`20261017100900`, `20261017101000`), production build of 2026-10-14 (no app code changed since), migration guard at 51. Two Vitest records exist and both are kept; Playwright ran once.

## 1. Vitest, first invocation (all files in ONE parallel vitest process) — `vitest.log`
`Test Files 7 failed | 18 passed (25); Tests 4 failed | 367 passed | 91 skipped (462)`.
* **Five `customer-advances*` files failed in their fixture setup**: `Database error creating new user` (actions), `membership: canceling statement due to statement timeout` (integrity), `sign-in failed … Processing this request timed out` (review2, schema, advances). Plus `customer-advances-review3` (2 tests: one `57014`, one count mismatch) and `membership-status-access` (2, `journal_entry_lines`).
* **Classification: ENVIRONMENT (overload caused by the run design).** You asked for a sequential run; this invocation ran 25 files in parallel, now including the heavy old-vs-new equivalence suites and the local-sql suite that clones a 130 MB database. Auth (GoTrue) and the database timed out while fixtures were created. This is by elimination and by the next record, not by a profile. The first-run failures stay on record.
* The 91 skipped tests are the suites that crashed before running (51 in the five setup failures) plus the 40 local-sql tests, which this time did not skip (env set) but were interrupted by the same overload.

## 2. Vitest, strictly sequential: one vitest process per file, one after the other (`--each`; `vitest-each.log`, `driver-each.sh`)
**All files pass except `membership-status-access`.**
| file | tests |
|---|---|
| `owner-portal-access.local-sql` (the 40 formerly skipped, port 55322 = the isolated stack) | **40/40 pass** |
| `customer-advances-actions` (unit 84 + integration 8), `-integrity` 16, `-review2` 12, `-review3` 10, `customer-advances.integration` 39, `-schema` 16, `advance-account-configured` 3 | all pass |
| `owner-statement-settlement` | 8/8 (the flake did not recur; not closed as a flake) |
| `portal-statement-history` 7, `member-opening-balance` 9, `owner-portal-functions-authz` 15, `payment-allocation-readers` 9, `tenant-dashboard-access` 8 | all pass |
| `rls-set-based-policies-equivalence` | **6/6** (incl. invited, suspended, platform admin, plans, catalog) |
| `rls-journal-entry-lines-equivalence` (proposal test) | 2/2 |
| `financial-views-equivalence` 4, `security-function-grants` 4, `migration-directory-guard` 102, `page-read-guard` 19, `assert-read` 4, `drift-verdict` 16, `deposit-accounts` 4 | all pass |
| **`membership-status-access`** | **FAIL**: 1 of 17 failed in one execution, 2 of 17 in the other (the file appears twice in my list) |
Notes: `tests/helpers/legacy-financial-views.ts` shows "no test summary" only because my file-selection `grep` picked up a helper that is not a test; some files appear twice because my grep list and my explicit list overlap (each ran twice, both passed).

## 3. The 40 formerly skipped tests
Run with `LOCAL_PG_PORT=55322` (verified to map to `supabase_db_aqarbooks_clean`; the development database is 54322 and was never used), `PG_BIN` = the scoop PostgreSQL, the stack's default local password, and a template database `aqar_local` that I created as a clone of the stack's migrated database (the test's own `create database … template aqar_local`). **First execution: 39 passed, 1 failed** (`authorizes sign-out for the identity but never writes to managed Auth tables`: `null value in column "id" of relation "sessions"` — the test's own setup inserts into `auth.sessions (user_id)`, which works in the throwaway stub schema of `scripts/local-db` (id has a default) but not in the real GoTrue schema (`id NOT NULL`, no default): TEST_EXPECTATION_BUG against a real Supabase schema). The setup now supplies the id; the whole file then passed 40/40, both on its own (`migration/owner-portal-access-local-sql-rerun-after-setup-fix.log`) and in section 2. The first failure is recorded in `migration/owner-portal-access-local-sql-run.log`. Limit: the template is the stack's database, not a replay on a bare PostgreSQL, so this proves the suite on the real Supabase schema, not on the stub.

## 4. Playwright (production build, one run per spec, sequential, first run only) — `summary.txt`
`page-error-states` 2/2 (first Retry succeeded in both), `owner-portal-isolation` 1/1, `portal-refusals` 5/5, `accounting-duplicates` 5/5, `accounting-journey` 15/15, `portal-journey` 6/6, `portal-statement` 8/8, `customer-advances` 10/10, `customer-advances-ui-screens` 6/6. No browser failure in this run.

## 5. What is still red and why
**`membership-status-access`** (1–2 of 17): HTTP 500 / `57014` on `HEAD /journal_entry_lines` (every execution) and once on `HEAD /fiscal_years`. Before the RLS migrations this file failed on `chart_of_accounts` (5–6 of 17); `chart_of_accounts` and `fiscal_periods` no longer fail. `journal_entry_lines` needs the pair (lines + `journal_entries`) proposed in `../journal-entry-lines-proposal.md` (apply nothing without approval; rewriting the lines policy alone gives no gain); `fiscal_years` (1.6–4.2 s in the probes, one timeout at 8 s under load) is not in any approved scope.

## 6. Migrations of this step
`20261017101000_rls_admin_check_once.sql` (5,355 bytes): the platform-admin check of the five approved policies as an uncorrelated InitPlan. Proofs: catalog — every admin sub-select contains no table column (7 occurrences, test); plans — `InitPlan … Result (actual rows=1 loops=1)` or `(never executed)` (short-circuit), no `is_platform_admin` in a scan Filter, for a regular user, the platform admin and a stranger (test); red before / green after with the same test (`migration/red-before-refinement-on-stack.log`: the 2 new assertions failed, the 4 equivalence ones passed; `migration/green-after-refinement-on-stack.log`: 6/6); catalog diff = exactly the 5 policies (10 lines) (`migration/catalog-diff-refinement.txt`).

## 7. Disclosed
* Four temporary debug files remain in `migration/` (`debug-*`, `done-debug.txt`): the environment's safety check refused my cleanup command, so I left them.
* Early in this step my test script had regex/escaping mistakes that made the new suite fail at collection; they were test bugs, fixed before any result above. Abandoned runs again left `psql` sessions in `scratch_rls`; I terminated them (that database only).
* Open and unchanged: the schema-drift item, G-ADV-1 / cash refund / credit transfer outside V1, Accsys (conditional on Bagoush), the `dues` owner-route policies.
