# B1B-R6 integration suite results (isolated r6 stack)

Scope: the 27 files in the table of `docs/progress/direct-write-tests-classification.md` plus the 3 remaining direct-write files (`tests/sandbox-pilot.manual.test.ts`, `tests/supplier-invoice-fx.integration.test.ts`, `tests/tax-enforcement.integration.test.ts`). Target: the `g0r6-*` stack only, API at `http://127.0.0.1:58461` (`docker port g0r6-kong`). No secret values appear in this document. No test or migration file was edited. Nothing was committed, pushed or deployed.

## Totals

| Result | Files | Notes |
|---|---|---|
| PASS | 0 | |
| FAIL | 0 | No assertion executed; no test body ran. |
| SKIP (skipped by the suite itself) | 0 | Skipped tests below are skipped by vitest after a `beforeAll` isolation refusal, not by the suite's own skip logic. |
| BLOCKED | 30 | 20 vitest suites refused by the isolation gate; 9 Playwright e2e specs not run; 1 helper module with no test cases. |

Vitest counts across the 20 runnable files: **26 tests total, 0 passed, 0 failed, 26 skipped** (all 26 skipped after a `beforeAll` refusal). Every one of the 20 vitest runs exited with code 1 at suite level.

Stack check at run time: `g0r6-db`, `g0r6-auth`, `g0r6-storage`, `g0r6-rest`, `g0r6-kong` all up; Kong on `127.0.0.1:58461`; `GET /rest/v1/` without apikey returned 401 (as recorded in the isolation evidence).

## Per-file table

Env names: `URL` = `NEXT_PUBLIC_SUPABASE_URL`, `ANON` = `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SRK` = `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. All of these were available from the r6 folder (`keys.env`, `kong.port`). No suite contacted an external service: all URLs were set to r6 or blank.

| # | File | Kind | vitest total / passed / failed / skipped | Result | Reason (first message) |
|---|---|---|---|---|---|
| 1 | tests/credit-notes.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` (suite-level error) |
| 2 | tests/e2e/asset-disposal.spec.ts | Playwright | not run | BLOCKED | Playwright e2e (imports `@playwright/test`), needs the Next app running and a browser; outside the vitest scope |
| 3 | tests/e2e/einvoice-flow.spec.ts | Playwright | not run | BLOCKED | Same as #2 |
| 4 | tests/e2e/enterprise-suite-pillars.spec.ts | Playwright | not run | BLOCKED | Same as #2 |
| 5 | tests/e2e/finance-screens-show-their-data.spec.ts | Playwright | not run | BLOCKED | Same as #2 |
| 6 | tests/e2e/fixed-assets.spec.ts | Playwright | not run | BLOCKED | Same as #2 |
| 7 | tests/e2e/owner-portal-online-payment-fawry.spec.ts | Playwright | not run | BLOCKED | Same as #2, and it uses the Fawry payment provider (`FAWRY_MERCHANT_CODE`, `FAWRY_SECURE_KEY`). Those keys are not in the r6 folder and the provider is external, so the suite must not run. |
| 8 | tests/e2e/projects-wip.spec.ts | Playwright | not run | BLOCKED | Same as #2 |
| 9 | tests/e2e/reports-suite-flow.spec.ts | Playwright | not run | BLOCKED | Same as #2 |
| 10 | tests/e2e/supplier-invoice-fx.spec.ts | Playwright | not run | BLOCKED | Same as #2 |
| 11 | tests/final-hardening.integration.test.ts | vitest | 1 / 0 / 0 / 1 | BLOCKED | `beforeAll` throws the isolation refusal (`SUPABASE_WORKDIR is not set`); test marked skipped |
| 12 | tests/fixed-asset-disposal.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |
| 13 | tests/fixed-assets.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` (probe run, same result) |
| 14 | tests/fx-difference.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |
| 15 | tests/input-tax.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |
| 16 | tests/maintenance-accounting-bridge.integration.test.ts | vitest | 6 / 0 / 0 / 6 | BLOCKED | `beforeAll` refusal: `test target 127.0.0.1:54321 is not a known local Supabase API`. The suite runs `supabase status -o env` from the repo root, which reads the development stack. See Deviations. |
| 17 | tests/member-opening-balance.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |
| 18 | tests/output-vat.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |
| 19 | tests/pilot-rehearsal.manual.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |
| 20 | tests/project-wip.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |
| 21 | tests/record-online-payment-concurrency.integration.test.ts | vitest | 1 / 0 / 0 / 1 | BLOCKED | `beforeAll` throws the isolation refusal (`SUPABASE_WORKDIR is not set`); test marked skipped |
| 22 | tests/pgtap.integration.test.ts | vitest | 18 / 0 / 0 / 18 | BLOCKED | `beforeAll` throws the isolation refusal (`SUPABASE_WORKDIR is not set`); 18 tests marked skipped |
| 23 | tests/e2e/helpers/portal-fixture.ts | helper | no test cases | BLOCKED | Helper module, not a suite; it is run only through the specs that import it |
| 24 | tests/finance-functions-authz.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | File-level guard: `Refusing to run: SUPABASE_WORKDIR is not set` |
| 25 | tests/finance-read-permissions.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Same as #24 |
| 26 | tests/finance-report-authz.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Same as #24 |
| 27 | tests/membership-status-access.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Same as #24 |
| 28 | tests/sandbox-pilot.manual.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |
| 29 | tests/supplier-invoice-fx.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |
| 30 | tests/tax-enforcement.integration.test.ts | vitest | 0 / 0 / 0 / 0 | BLOCKED | Isolation gate: `SUPABASE_WORKDIR is not set` |

## Why every vitest suite is blocked

`tests/setup/local-only-guard.ts` (vitest `setupFiles`) and `tests/helpers/isolated-target.ts` (`assertIsolatedStack`) require, before any Supabase client or write:

1. `LOCAL_SUPABASE_API_PORTS`, `SUPABASE_WORKDIR` (a Supabase CLI project folder that contains `supabase/config.toml`), `LOCAL_DB_CONTAINER`, and the URL and service key. Set here: all except `SUPABASE_WORKDIR`.
2. The container must equal `supabase_db_<project_id>` of that workdir's config. The r6 database container is `g0r6-db`, so no workdir can satisfy this check without renaming the container, which was out of scope.

No r6 Supabase CLI project folder exists in `C:\Users\Lenovo\AppData\Local\Temp\g0-r6\`. The sanctioned runner `scripts/demo-local/run-vitest-local.mjs` targets the separate clean demo stack, not r6, so it was not used. The gate was not bypassed, and no config was fabricated.

Unblocking needs an owner decision: either a documented r6 isolation contract that the gate accepts, or a run on a stack whose container name follows the `supabase_db_<project_id>` convention.

## Env inventory (names only, no values)

| Name | Source | Available in r6 folder | Used by |
|---|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | kong.port (`http://127.0.0.1:58461`) | yes | all |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | keys.env `ANON_KEY` | yes | all |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | set to the anon key (same role) | yes (mapped) | final-hardening |
| NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY | keys.env `SERVICE_ROLE_KEY` | yes | all |
| SUPABASE_SERVICE_ROLE_KEY | keys.env `SERVICE_ROLE_KEY` | yes | all |
| LOCAL_SUPABASE_API_PORTS | `58461` | yes | gate |
| LOCAL_DB_CONTAINER | `g0r6-db` | yes | gate |
| SUPABASE_WORKDIR | none | NO | gate (missing, so refused) |
| LOCAL_SUPABASE_WORKDIR | none (set blank) | NO | not read by the 30 files (set blank only to stop dotenv filling it) |
| JOURNEY_ORG_SLUG | none (set blank) | NO | e2e helper (`accounting-fixture.ts`) |
| FAWRY_MERCHANT_CODE, FAWRY_SECURE_KEY | none (set blank) | NO | owner-portal-online-payment-fawry spec (external provider) |
| PLAYWRIGHT_BASE_URL | none (set blank) | n/a | Playwright specs (not run) |

## Deviations (disclosed)

1. **Dotenv read of `.env.local`.** The 20 vitest files call `dotenv` `loadEnv({ path: ".env.local" })` at module load. Passing every name above explicitly prevents `.env.local` from overwriting them, but the file is still opened by the suite's own code. The run log reported that dotenv injected 6 further variables from that file. Their names and values were not inspected or printed by me. No suite reached an external service, because every suite refused before any client was built.
2. **Development-stack status query.** `tests/maintenance-accounting-bridge.integration.test.ts` runs `supabase status -o env` with `cwd` at the repo root (line 53). That resolves to the development stack, which is forbidden to read. This happened twice (the batch run and a re-run). The call is read-only: no container was started, stopped or written, and its output was not printed or saved. Its result, the dev port `54321`, appears in the refusal message. Recommended follow-up: the suite should not shell out to `supabase status` before the isolation gate.
3. **Container use.** My own commands were limited to `docker ps` filtered to `g0r6-*`, `docker port g0r6-kong`, and one `curl` to `127.0.0.1:58461/rest/v1/`. No other container was inspected by me.

## Files not touched

- No test, helper, migration or config file was edited.
- The only repo file created is this document.
- The runner (`run.mjs`) and the vitest JSON and log outputs are in the session scratchpad, outside the repo. They hold no key values.

## Failures

None executed. There are no assertion failures and no HTTP status or SQLSTATE values, because no request was sent to PostgREST, GoTrue or Storage, and no SQL ran.
