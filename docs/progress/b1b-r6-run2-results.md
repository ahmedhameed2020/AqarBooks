# B1B-R6 run 2: integration suites and C4 on the isolated r6 stack

Scope: the disposable r6 stack only (containers g0r6-db, g0r6-kong and their r6 network). No production, development or other project container was used. Verdict for Batch 1B: **still blocked** (see the end).

## Isolation contract (new, explicit)

- The general gate (`tests/helpers/isolated-target.ts`) requires `supabase_db_<project_id>`; the r6 stack is plain containers, so it cannot satisfy that name rule.
- A separate contract is selected ONLY with `ISOLATED_CONTRACT=r6` (`tests/helpers/isolated-target-r6.ts`). It proves: exact container names (`g0r6-db`, `g0r6-kong`), database attached to `g0r6-internal` only with no published port, API attached to `g0r6-internal` with exactly one `127.0.0.1` binding, the client URL equal to that binding, no development or clean-stack port, and the same database through SQL and the API (live, read-only).
- Negative tests: `tests/r6-isolation-contract.test.ts` (13 cases: wrong container names, published database port, bridge network, 0.0.0.0 binding, second binding, development and clean-stack ports, non-loopback URL, port mismatch, stopped database, different databases, empty declaration, missing flag). Result: all pass.
- `tests/maintenance-accounting-bridge.integration.test.ts` no longer calls `supabase status`. It calls the gate and reads the URL and keys from explicit settings; any missing setting stops the test.

## Integration suites (the 30 files of the plan)

Runner: `C:\Users\Lenovo\AppData\Local\Temp\g0-r6-run\run-r6.mjs` (outside the repository). It sets the r6 values explicitly and overrides every name that `.env.local` would inject (set to the r6 value or blank), so no development value reaches a test. Keys are read from the r6 secret folder and never printed.

| # | File | Result |
|---|---|---|
| 1 | tests/credit-notes.integration.test.ts | PASS 7/7 |
| 2 | tests/final-hardening.integration.test.ts | PASS 1/1 |
| 3 | tests/fixed-asset-disposal.integration.test.ts | PASS 7/7 |
| 4 | tests/fixed-assets.integration.test.ts | PASS 6/6 |
| 5 | tests/fx-difference.integration.test.ts | PASS 7/7 |
| 6 | tests/input-tax.integration.test.ts | PASS 13/13 |
| 7 | tests/maintenance-accounting-bridge.integration.test.ts | PASS 6/6 (after the `supabase status` removal) |
| 8 | tests/member-opening-balance.integration.test.ts | PASS 9/9 |
| 9 | tests/output-vat.integration.test.ts | PASS 9/9 |
| 10 | tests/pilot-rehearsal.manual.test.ts | PASS 9/9 |
| 11 | tests/project-wip.integration.test.ts | PASS 8/8 |
| 12 | tests/record-online-payment-concurrency.integration.test.ts | PASS 1/1 |
| 13 | tests/pgtap.integration.test.ts | PASS 18/18 |
| 14 | tests/supplier-invoice-fx.integration.test.ts | PASS 8/8 |
| 15 | tests/tax-enforcement.integration.test.ts | PASS 11/11 |
| 16 | tests/sandbox-pilot.manual.test.ts | **FAIL** 3 passed, 6 failed (tax-rule assertions: `TAX_ENFORCEMENT_NOT_READY: RULE_MISSING`, `null` snapshots). Likely a missing seeded tax rule in r6, not verified. Not fixed. |
| 17 | tests/finance-functions-authz.integration.test.ts | BLOCKED: file-level guard requires `SUPABASE_WORKDIR` (a Supabase CLI project folder); not provided by the r6 contract |
| 18 | tests/finance-read-permissions.integration.test.ts | BLOCKED: same |
| 19 | tests/finance-report-authz.integration.test.ts | BLOCKED: same |
| 20 | tests/membership-status-access.integration.test.ts | BLOCKED: same |
| 21–29 | e2e Playwright specs (asset-disposal, einvoice-flow, enterprise-suite-pillars, finance-screens-show-their-data, fixed-assets, owner-portal-online-payment-fawry, projects-wip, reports-suite-flow, supplier-invoice-fx) | BLOCKED: Playwright needs a running app and a browser; not run in this scope. The Fawry spec also needs external provider keys, which are not in the r6 folder. |
| 30 | tests/e2e/helpers/portal-fixture.ts | helper module, no test cases |

Totals for the 20 vitest files: 15 PASS (all tests of those files), 1 FAIL file (sandbox-pilot, 6 failed assertions), 4 BLOCKED. Totals for the 9 e2e specs: BLOCKED. The integration gate itself was not weakened.

## C4 at the API level (PostgREST on r6)

Draft `DRAFT` entry in the open January 2040, target date in the closed February 2040. Calls through the r6 loopback API only:

- **service_role PATCH** of `entry_date` into the closed period: HTTP 400, `P0001 FISCAL_PERIOD_NOT_OPEN`. Row unchanged (2040-01-10). The guard is reached and refuses.
- **authenticated PATCH** (the member, signed in with GoTrue, role with finance permissions): HTTP 200 with `[]` (zero rows, no error). Row unchanged. The row-level policies block the update silently.
- **Application path:** the static check in `tests/draft-update-no-false-success.test.ts` shows that no application code updates `journal_entries` directly; all writes go through RPCs that check `error`. So the silent zero-row result cannot reach a success message in the UI.

## S9 (run before the Docker restart)

PASS, recorded in `docs/progress/b1b-r6-s9-audit-rollback.md`: failure of `append_financial_audit_event` blocks opening and closing; no partial rows; function definitions unchanged after ROLLBACK.

## Environment events (reported, not hidden)

- Docker Desktop was started by the owner's approval. The engine restart brought up the existing `aqarbooks`/`aqarbooks_clean` containers through their own restart policies. I did not start or stop them by hand.
- The earlier rehearsal containers (`g0rehearsal-b1b-20261024`, `-r2`, `-r3`, `-r5`) are exited with code 255 after the engine restart. They were not restarted.
- Vector containers remain exited. No Vector action was taken.
- r6 containers were started again by me with `docker start` (they had no restart policy). Their state is recorded above.

## Verdict

Batch 1B: **blocked**. Reasons: four integration files are blocked by the `SUPABASE_WORKDIR` file guard, one integration file fails on tax-rule fixtures, the nine Playwright specs were not run, and the owner has not yet accepted the r6 contract. C4 and S9 pass at their stated scope.
