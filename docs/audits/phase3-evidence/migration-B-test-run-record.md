# Record of the test runs around migration B (so no number is quoted without its run)

| Run | Scope | Result | Notes |
|---|---|---|---|
| 1 | 22 files (the affected set after migration B) | **315 passed, 1 FAILED** of 316 | The failure was `security-function-grants` "authenticated-executable SECURITY DEFINER set matches the approved baseline exactly": it correctly flagged the four new public functions (apply_payment_credit, record_advance_payment, reverse_credit_application, set_default_customer_advance_account). Log: `migration-B-affected-vitest.log`. |
| 2 | only `security-function-grants` (4 tests), after adding the four reviewed names to the allowlist with a written reason | 4/4 passed | Log: `migration-B-grants-test-rerun.log`. This was a partial re-run, not the whole set. |
| 3 | **the whole affected set again, in one run, after task 4** (27 files = the previous 22 + `customer-advances-actions`, `customer-advances-actions.integration`, `operation-key` + the schema/readers files) | **416 of 416 passed** | Log: `task4-full-affected-run.log`. This is the first run in which the complete set, including the baseline test, passed together. |

"316/316" was never a result: run 1 was 315/316; run 2 covered one file; run 3 is the complete re-run (416/416 because it also contains the task-4 tests).
