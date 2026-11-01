# Test runs around migration E (20261017100400) and the port-1 fix

| Run | Scope | Result | Notes |
|---|---|---|---|
| red (SQL) | `customer-advances-review3` (9 tests) BEFORE the migration | 6 passed, **3 failed** | an `authenticated` request with NO subject was handed the receipt status ("POSTED") by the helper and rows by the as-of functions (identity-less trust); `is_trusted_backend()` did not exist; the function bodies still contained `auth.uid() IS NULL`. `migration-E-tests-red-before.log` |
| green (SQL) | same file after E | **10/10** | adds: no identity, a stranger's subject, anon (denied), service_role / admin / staff still served, **suspended owner gets nothing and gets everything back on reactivation (same session)**, N / other organization / the ledger closed, staff can still apply credit during the suspension. `migration-E-review3-tests-green.log` |
| red (port 1) | `client-guard-port1.test.ts` against the real `assertClientUrlIsVerifiedTarget` | 18 passed, **6 failed** | the real function accepted `http://example-project.supabase.co:1`, `http://10.1.2.3:1`, `192.168.0.10:1`, `0.0.0.0:1`, `127.0.0.1.evil.example:1`, `user:pw@127.0.0.1:1` (the earlier tests used the pure `evaluateClientTarget`, which has the host check). `port1-loopback-tests-red-before.log` |
| green (port 1) | same + playwright/client guard files | **40/40** | the exception is loopback-only (127.0.0.1, localhost, [::1]; http; no credentials); non-loopback refusals are asserted on the real function AND on the real wrapper with zero calls to the constructor and to fetch. `port1-loopback-tests-green.log` |
| **full set on a FRESH isolated stack** | 36 files, ONE run, `hardware-stack.mjs run` (project aqarbooks_hw, 78 migrations, no leftovers) | **557/557 passed** (439 s) | includes `membership-status-access` (the shared-stack timeout victim), the 14 negative runs with the 4 real Playwright children, and every file of the customer-advances work. `migration-E-full-affected-run-fresh-stack-36-files.log` |
| browser smoke with the final guard | portal-refusals, accounting-void-permission + the skipped probe | 9 passed, 1 skipped (by design) | `migration-E-e2e-smoke.log` |

The shared stack was NOT cleaned or reset; its fixtures and the +20 rows stay (`snapshot-diff-plus20-rows.md`). The fresh stack was created
only for this run and stopped afterwards. `tsc` clean; eslint 0 errors; ledger 78/78 on the shared stack with no drift; development database
still 456 organizations. Raw measurements for the membership-file diagnosis: `membership-diagnosis-raw-measurements.txt`.
