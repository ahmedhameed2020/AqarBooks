# Task 5, review round 2 — run record (isolated stack only)

Stack: `aqarbooks_clean` (API :55321), migration F applied with `node scripts/demo-local/stack.mjs migrate` (the development database was not touched). Production build served on :3100 with `scripts/demo-local/build.mjs --next-only` + `start-prod.mjs`.

| check | command | result |
|---|---|---|
| types | `npx tsc --noEmit -p .` | clean |
| lint | `npx eslint app lib <changed tests>` | 0 errors (627 pre-existing warnings) |
| unit + integration (affected only) | `node scripts/demo-local/run-vitest-local.mjs tests/portal-statement-ledger.test.ts tests/portal-statement-position.test.ts tests/portal-statement-history.integration.test.ts tests/operation-submit.test.ts tests/payment-allocation-readers-guard.test.ts tests/security-function-grants.integration.test.ts tests/migration-directory-guard.test.ts tests/customer-advances-actions.test.ts` | 8 files, 218 / 218 passed |
| browser, statement | `node scripts/demo-local/e2e.mjs portal-statement.spec.ts` | 7 / 7 passed |
| browser, advances UI + portal position | `node scripts/demo-local/e2e.mjs customer-advances-ui-screens.spec.ts` | 6 / 6 passed |

Notes
* The full 557-test run was **not** repeated (only the affected files above). A check that was not run is not claimed.
* Two flaky runs happened while another test run loaded the machine: the position cards were still showing the "…" placeholder when a 5-second poll expired, and the placeholder was parsed as `0`. The specs now poll for 30 s and parse a placeholder as `NaN`; a clean full run of each spec followed (advances UI 6/6, statement 7/7).
* Guard files updated for the new migration: `tests/migration-directory-guard.test.ts` (entry + count 45 → 46) and `tests/security-function-grants.integration.test.ts` (two reviewed owner-scoped functions).
* `tests/e2e/owner-portal-online-payment-fawry.spec.ts` is unrelated and cannot run here (`FAWRY_SECURE_KEY` / `FAWRY_MERCHANT_CODE` are not set on the isolated stack).
