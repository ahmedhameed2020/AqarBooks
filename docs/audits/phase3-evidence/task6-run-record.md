# Task 6 — browser tests B1–B8 and regression (isolated stack, production build)

Stack `aqarbooks_clean` (API :55321); production build via `scripts/demo-local/build.mjs --next-only` + `start-prod.mjs`; runner `scripts/demo-local/e2e.mjs`. Development database untouched; nothing committed, pushed or deployed.

## B1–B8 (`tests/e2e/customer-advances.spec.ts`)
Final run, together with the portal and statement specs: **16 / 16 of B1–B8 and its UI screens pass** (`task6-final-e2e-B8-statement-portal.log`). First all-green run of the spec on its own: 10 / 10, 7.3 min (`task6-B1-B8-first-green-run.log`).

## Defects the browser run found, and what was done (classified, none dismissed as "test mismatch")
| # | finding | class | fix |
|---|---|---|---|
| 1 | B6: the cashier opened the receipts page and was told the advance account was not configured; the save button stayed disabled although the database would accept the advance. `organization_finance_settings` is readable only with `finance.accounts.manage`. | PRODUCTION_BUG (screen) | migration G `customer_advance_account_configured` (one boolean; no setting exposed) + 3 integration tests |
| 2 | B8 (reviewer's point): the new owner N's "arrears" were 2,800 = D1 2,000 (paid by the previous owner's receipt, invisible to N) + D2 800. A settled due was shown as new debt. | PRODUCTION_BUG (statement) | migration H `own_statement_dues` (settled AMOUNT by any receipt in force, an amount only) + `own_due_settlement_lines` (dated settlement lines without receipt or payer). N's arrears = 800, proved independently in the test from `effective_payment_allocations` |
| 3 | B8 (reviewer's point): the original member M, after the transfer, lost sight of D1 (owner RLS is by current ownership) but kept receipt R1: ledger −3,000 vs net −1,000. | PRODUCTION_BUG (statement) | same function (history route: dues charged while M owned the unit, and dues M's own receipts allocated to); B8 now asserts net = ledger closing = running balance = −1,000 **before and after** the transfer, in English and Arabic |
| 4 | `accounting-journey` S3, `accounting-bank-reconciliation` B2, `accounting-duplicates` D3 chose the fiscal period from the 5th combobox of the receipt dialog; the period now follows the payment date. | TEST_EXPECTATION_BUG (intended UI change) | the specs assert the derived period (`auto-period`) instead of choosing it |
| 5 | `portal-journey` J3 seeded a POSTED receipt with no journal entry; owner statements now count only receipts whose entry is posted. | TEST fixture not representing product data | the portal fixture gives that receipt a period, a cash account and a posted entry |
| 6 | B5: the receipt document opens in a window that loads web fonts from a public CDN; the egress guard refused it. | ENVIRONMENT_OR_HARNESS | the document is captured instead of displayed (blob read in the page) |

## Legacy receipt compatibility (added after the B8 review)
A **legacy** receipt = `advance_amount = 0` with an unallocated remainder and its own valid posted entry (Accsys-style). Test case: D1 2,000; receipt 1,000 on 10 Mar, 600 allocated, **400 unallocated**; entry Dr cash 1,000 / Cr receivables 600 / Cr unearned revenue 400; ownership moves from M to N on 20 Mar; the receipt is then voided.
* **Meaning kept**: the 400 is not reclassified as an advance (`advance_amount` stays 0, `unallocated_amount` stays 400, nothing on account 2250, no row in `payment_credit_balances` or the as-of balance function, credit card 0) and gets **no new authority**: `apply_payment_credit` by the owner (who holds allocations.manage) is refused with `NOT_AN_ADVANCE_RECEIPT` and the snapshot of payments/allocations/entries/requests is unchanged.
* **Gap found and closed**: the position's net ignored the unallocated remainder while the statement counts every receipt in full (net 1,400 vs ledger 1,000). `computePosition` now subtracts the legacy remainder (receipt − advance part − its own receipt allocations in force, as of the date; credit applications never reduce it), shown as a separate line ("older unallocated payments on account, not advance credit, cannot be applied"). The unit test `without the receipts input the net would be 1,400` documents the divergence.
* **Statement = net, before and after the void**, in the DB layer (M and N, five dates, ledger built from the same readers the page uses) and in the browser (closing = running = net = 1,000 on 31 Mar and the day before the void; 2,000 on the void date; credit 0 throughout).
* **Isolation**: N sees only the 600 that settled D1 (a dated settlement line), none of the legacy remainder or the receipt; staff, another organization's member and a foreign organization id read nothing.
* Results: `legacy-receipt-compat.integration` 8 / 8; position unit tests 14 / 14; browser (`portal-statement.spec`) 8 / 8; affected set 11 files 248 / 248; B1–B8 + advance UI screens + `portal-journey` 22 / 22 in one run after the change (`task6-legacy-affected-checks.log`, `task6-legacy-statement-e2e.log`).

## Regression
**Wording**: the regression evidence below is a set of passes spread over several runs, with two flakes declared; it is **not** one complete green run of the whole browser suite and is not described as one.
| pack | result |
|---|---|
| `accounting-void-permission` | 4 / 4 |
| `portal-refusals` | 5 / 5 (twice) |
| `portal-journey` | 6 / 6 (alone, twice); in the last combined run J4 (maintenance request form, unrelated to money) timed out once and passed on the immediate rerun alone |
| `accounting-bank-reconciliation` | 9 / 9 (after finding 4) |
| `accounting-journey` | 15 / 15 (after finding 4; one transient S1 timeout while a migration was being applied to the same stack, passed on rerun) |
| `accounting-duplicates` | 5 / 5 **when run alone**; D1 timed out twice when it was the first test of a combined run (later traced to statement timeouts on the units/members views -- see `task7-flake-analysis.md`; "cold server" retracted) and passed alone. Not explained beyond "first test after a cold start"; treat as an open flake, not as proof |
| `customer-advances-ui-screens`, `portal-statement` | 6 / 6 and 7 / 7 |

Affected unit/integration (not the full 557): 10 files, 235 / 235 — ledger, position (incl. settled amounts), statement history, **owner-statement settlement (8 tests: N, M, isolation, dated, RLS-superset)**, advance-account-configured, operation-submit, readers guard, function-grant allowlist (+ migrations F/G/H), migration directory guard (48 authorized), customer-advances actions. `tsc` clean, eslint 0 errors.

## Not done / not claimed
* The full 557-test run was not repeated.
* B4 rebuilds the five dated figures historically after all steps; the "right after each step" readings are covered by the Task 3 database tests, not by the browser.
* Only the refusal cases B7 lists were browser-tested (before-the-due application, no approved account); the remaining ~18 refusals of spec §8 are covered by the integration tests.
* The `own_statement_dues` visibility set repeats four owner-RLS routes (ownership, lease tenant, installment buyer, maintenance cost). A test asserts it never hides a due that RLS shows today, but it must be revisited if a fifth route is added.
* `owner-portal-online-payment-fawry.spec.ts` needs FAWRY keys that are not set on the isolated stack; not run, unrelated.
* Task 7 (closing documents, final bundle, gap sheet) not started.
