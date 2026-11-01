# Task 5 — customer-advances UI (review notes)

Local only: isolated clean stack (API :55321), production build served on :3100. Nothing committed, pushed, deployed; the development database was not touched.

## What the screens do
* **Record receipt dialog** — "Pay a due" / "Advance, no due". The excess over a due is stated and must be confirmed; ONLINE is refused for advances; the period follows the payment date.
* **Payments register** — advance badge with the unit, credit left, "stranded" badge, **Credit** button (apply / reverse dialog).
* **Advance-account card** — inside the receipts page (no new settings page). Nothing is pre-selected: the approver must choose a liability account.
* **Unit page** — credit card; **payments table** — credit applications marked (reversed ones too); **dunning** — "holds credit" badge; **owner statement** — note that unapplied advances are not collected revenue; **receipt PDF** — "Advance credit" box.
* **Portal statement** — see below.

## Corrections made after the first screens were reviewed
1. **Default account choice** — the card used to pre-select the first liability account ("2100 Accounts Payable – Suppliers"), which would have been a silent wrong default. It now starts empty and the Approve button stays disabled until the owner picks one.
2. **Currency overlap** — in the receipt dialog the amount field is `dir="ltr"` while the currency label was anchored with logical `end-0`; in Arabic (RTL) the label sat on top of the digits. Both now use physical `right-0` / `pr-12`.

## Portal statement (per the spec)
Primary cards, **as of the end of the filter** (today when it is empty): **Arrears**, **Available credit**, **Net**.
`net = open dues − available credit`. Received / applied / left is a one-line detail under the cards, not a replacement.

Applying credit and reversing it appear as **two separate, dated information lines** (`APPLICATION`, `REVERSAL`) with a net effect of zero on the running balance; the debit/credit columns show "—" for them. They are excluded from the PDF; the Excel export lists them with empty debit/credit.

Source of the numbers: `payment_allocations_as_of` + `payment_credit_balances_as_of` (security-definer, member-scoped) and the owner's own dues, combined by the pure function `lib/portal/statement-position.ts`. The only direct read of `payment_allocations` is for the information lines (whitelisted in `tests/payment-allocation-readers-guard.test.ts` with its reason).

## Proof
Scenario (browser, Arabic and English): due 600 issued 09-01 / due 09-15; advance 1000 on 09-05; apply 400 on 09-08; reverse it on 09-10; apply 300 on 09-12.

| end of filter | arrears | credit | net |
|---|---|---|---|
| 2026-09-03 | 0 | 0 | 600 |
| 2026-09-06 | 0 | 1000 | −400 |
| 2026-09-09 | 0 | 600 | −400 |
| 2026-09-11 | 0 | 1000 | −400 |
| 2026-09-20 | 300 | 700 | −400 |

Changing the end date changes the figures; from the receipt on, the net is −400 on every date, so application and reversal move money between the due and the credit and never deduct twice. The ledger's own running balance agrees (−400). Unit test: `tests/portal-statement-position.test.ts` (7 tests); browser: `tests/e2e/customer-advances-ui-screens.spec.ts` (6 tests).

## Review round 2 (portal statement, receipt document) — what changed and why

**Correction of an earlier note.** I wrote that the statement "lists receipts of every status as payments". That was wrong. Owner RLS (`payments_select_own`, `payment_allocations_select_own`) exposes POSTED receipts only, so a receipt voided later **disappeared** from the owner's statement altogether, including the periods in which it really reduced the balance (and the balance jumped at "today" instead of at the reversal date).

**Fix (migration F, forward-only, applied to the isolated stack only):** `20261017100500_phase3f_portal_statement_history.sql` adds two readers, both strictly the signed-in owner's own rows in an active organization (`member_id = current_member_id()`; no staff branch, no trusted-backend branch), returning amounts, dates and ids only:
* `own_statement_receipts(p_org)` — the owner's POSTED and REVERSED receipts, with `reversed_on` = the date of the actual reversal journal entry.
* `own_credit_application_lines(p_org)` — the owner's credit applications with `applied_on` / `reversed_on` (including those of receipts voided later). This replaces the raw `payment_allocations` read on the statement page, so the page needs no whitelist entry any more.

**Statement ledger** (`lib/portal/statement-ledger.ts`, one module for screen, PDF and Excel): receipt = credit on its own date; voided receipt = a separate **PAYMENT_REVERSAL** debit dated at the reversal entry; application/reversal info lines = no amount in either column, effect zero. Running balance = closing balance = opening + debits − credits, and equals the net of the position cards (verified in the browser before the void date, the day before it, and on it).

**Receipt document** (`getOwnPaymentReceiptAction`): totals use the allocations **in force** (`effective_payment_allocations`); credit applications that were reversed are listed with `reversedOn`, struck through, and excluded from "Total Allocated" (`receiptAllocatedTotal`). Tested after an application and again after its reversal.

**Position cards**: a failed request now shows an error with a **Retry** button instead of an endless "…" (tested by failing the server action, then retrying).

**`portal-statement.spec.ts`** rewritten for the current passwordless login (`portalLogin`), with organizations built through the product's own functions on the isolated stack (so every receipt has its journal entry). All original assertions kept; added: the voided-receipt case and the error/retry case. The old `cleanUp` teardown test was removed with the helper: the isolated stack is disposable and a test should not delete through the audit chain.

## Still open
* `tests/e2e/owner-portal-online-payment-fawry.spec.ts` needs `FAWRY_SECURE_KEY` / `FAWRY_MERCHANT_CODE`, which are not set on the isolated stack; it was not run and is unrelated.
