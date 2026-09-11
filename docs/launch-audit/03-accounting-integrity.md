# 03 — Accounting Integrity

Audit of commit `a91d809` (master, 2026-09-07). Read-only, evidence from `supabase/migrations/20260821105505_baseline.sql` (cited as `B:<line>`), later migrations, `lib/actions/*`, `lib/finance/*`, `app/[locale]/(app)/finance/**`, and the test suites. Two P0 claims (ACC-01, ACC-02) were independently re-verified by the lead auditor against the SQL text.

## 0. Findings summary

| ID | Sev | One line |
|---|---|---|
| ACC-01 | **P0** | `void_payment` can never complete: it writes audit action `PAYMENT_REVERSED` (B:11044), which `financial_audit_logs.check_audit_action` does not allow (B:12041; re-created by `20260903172101_member_opening_balance.sql:64-71` still without it). It is also not called from any UI or server action. Customer receipts are irreversible in production. |
| ACC-02 | **P0** | `get_trial_balance` (B:4555), `get_account_ledger` (B:3794), `get_cash_flow_statement` (B:3935 area) and ~16 other sites filter `je.status = 'POSTED'`, but `reverse_journal_entry` flips the original to `REVERSED` (B:8969) and inserts the mirror as `POSTED`. Only the mirror is counted, so every reversal moves the account by −1× instead of netting to 0 in trial balance, GL, income statement, balance sheet, budget-vs-actual, and dashboard KPIs. |
| ACC-03 | **P0** | `void_payment` (B:10908-11076), even with the constraint fixed, never reverses the receipt journal entry (contrast `void_supplier_payment`, which does). |
| ACC-04 | **P1** | `cancel_installment_plan` (B:947) sets dues `VOID` without reversing Dr AR / Cr Revenue and leaves live allocations pointing at VOID dues. No generic `void_due` exists. |
| ACC-05 | **P1** | `post_payment_internal` over-allocation guard is per allocation line, not cumulative per `due_id` (B:6699-6724); `recordPaymentAction` (`lib/actions/receivables.ts:161-164`) does not de-duplicate. Two lines for the same due can over-allocate. |
| ACC-06 | **P1** | Credit notes never reduce collectible balance: `due_outstanding` (B:3300), `post_payment_internal`, `units_with_financials` (B:12505), `lib/finance/aging.ts` all ignore `credit_notes`. Credit notes also require a tax decision (`TAX_DECISION_MISSING`, B:5083), so tenants without tax enforcement (default off) have no correction path for a due. |
| ACC-07 | **P1** | Hash-chained financial audit covers only due issuance and opening balances. `PAYMENT_CREATED` is allowed by the constraint but never emitted; payments, allocations, credit notes, journal post/reverse, period changes, cashier close, deposits, commissions, purchasing write only to non-hashed `platform_audit_logs`. |
| ACC-08 | **P1** | A due with no OPEN fiscal period silently gets no journal entry (`post_due_to_ledger` returns null, B:6376-6385); credit notes likewise. Manual sweep `recognize_pending_dues` exists for dues only. |
| ACC-09 | P2 | `set_fiscal_period_status` (B:9614-9647) allows any transition (LOCKED→OPEN, CLOSED with DRAFT entries, non-sequential) with only a permission and optional reason. |
| ACC-10 | P2 | `reverse_journal_entry` inserts the reversal directly as `POSTED` (skips `post_journal_entry_internal`), and `p_reversal_date` is not checked against the reversal period's range. |
| ACC-11 | P2 | Cashier: voided receipts never produce a reversing `cash_transactions` row; non-CASH methods can land in a cash session; anyone with `cashier.sessions.close` may close another user's session; variance never journaled. |
| ACC-12 | P2 | `members_with_financials` (B:12568) aggregates only `unit_ownerships`; a tenant's opening balance (explicitly allowed on a leased unit) is invisible on the members list and rolls up under the owner. |
| ACC-13 | P2 | Six independent balance formulas (view, `aging.ts`, dashboard, portal statement, owner statement, member page) with different exclusion filters; several sum floats in JS; none subtracts credit notes. |
| ACC-14 | P2 | VAT return (`reports/vat-return/page.tsx:62-105`) sums all-time `tax_decisions` with no date range, no exclusion of reversed decisions, no credit-note offsets; not sourced from the ledger. |
| ACC-15 | P2 | Supplier-invoice WHT computed and stored but not journaled (`post_supplier_invoice`; ADR 0001 open). |
| ACC-16 | P3 | E-invoice: DB tables and claim/attempt functions exist; ETA and ZATCA adapters throw `NOT_IMPLEMENTED` (`lib/einvoice/adapters/eta.ts:40`, `zatca.ts:42`); only the fake adapter works. |
| ACC-17 | P3 | Zod accepts `method: "POS"` the DB CHECK rejects (`receivables.ts:131`); form idempotency key is `randomUUID()` per request, so a browser re-submit is not deduplicated; JS float `reduce` in UI totals (display only). |

## 1. Double-entry, immutability, period locking

**Creation path.** `finance/journals/new` → `createJournalEntryAction` (`lib/actions/accounting.ts:272`) → `create_journal_entry` (B:2290, permission `finance.entries.create`) → `create_journal_entry_internal` (B:2310). All sub-ledger posters (dues, payments, credit notes, deposits, commissions, expenses, supplier invoices, depreciation) call the same internal function.

**Balance guard.** Lives in `post_journal_entry_internal` (B:6532-6618), not in a constraint: DRAFT/UNDER_REVIEW status, period `OPEN`, `entry_date` within period, ≥2 lines, `sum(debit) = sum(credit)`, no group/inactive/cross-tenant accounts, required cost centers; `entry_number` via gap-free `next_sequence_value` (B:6055); partial unique index `(organization_id, entry_number)` (B:14445). Line CHECKs (B:12217-12219) enforce one-sided non-zero lines. pgTAP phase3 tests 1, 2, 5 cover this.

**Post-posting immutability.** No trigger blocks UPDATE/DELETE on `journal_entries`/`journal_entry_lines`. Protection is RLS-by-omission: RLS enabled (B:17107, 17114) with SELECT-only policies (B:17110, 17117), while `GRANT ALL` to `authenticated` exists (B:19574-19576, 20695-20697). `service_role` bypasses this. pgTAP phase3 test 6 covers direct-write denial. A future INSERT/UPDATE policy would silently open the ledger; a defensive trigger is recommended.

**Reversal.** `reverse_journal_entry` (B:8918-8977): original must be `POSTED` (double-reversal guard), reversal period `OPEN`, mirror lines inserted, new entry inserted directly as `POSTED`, original set `REVERSED`. See ACC-02 and ACC-10.

**Period locking.** `fiscal_periods.status ∈ PLANNED/OPEN/CLOSED/LOCKED` (B:12059); enforced only at post time. `set_fiscal_period_status` (ACC-09). UI: `admin/finance/periods`.

### ACC-02 detail (independently verified)
- Expected: reports include original and reversal (net zero) or exclude both.
- Actual: `grep -n "je.status = 'POSTED'"` in the baseline returns 16 sites including B:890, 3794, 3842, 3896, 3905, 3951, 4000, 4555, 7281. `reverse_journal_entry` B:8969 `update journal_entries set status = 'REVERSED'`.
- Impact: any reversal (supplier payment void, invoice cancel, manual reversal) corrupts every ledger-sourced report and the dashboard P&L. No pgTAP case reverses an entry and asserts the trial balance is unchanged.
- Recommendation: report predicates `je.status in ('POSTED','REVERSED')`; add a pgTAP invariant test post → reverse → TB unchanged.

## 2. Issue due
Paths: `issue_dues` (B:5208), `generate_lease_rent_dues` (B:3514 → superseded by `20260825124312` and `20260825182109`), `generate_recurring_dues` (B:3588), `issue_service_charge_levy` (B:5336), `create_installment_plan` (B:2168), `record_member_opening_balance` (20260903). Posting via `AFTER INSERT` triggers `trg_dues_01_tax_decision` (B:14829) then `trg_dues_post_to_ledger` (B:14833) → `post_due_to_ledger` (B:6341): Dr receivable / Cr `due_types.default_revenue_account_id`, with VAT split when an active tax decision exists (B:6392-6411). Idempotency key `due:<id>`; atomic with the insert (tax-enforcement test confirms full rollback).

Duplicate protection: `issue_dues` advisory lock + heuristic skip on (unit, type, issue_date, description) (B:5254-5261); lease rent `lease_rent_generation_runs` unique (B:3557); recurring advisory lock per schedule; opening balance advisory lock + one-per-member-unit; service charge `FOR UPDATE` + DRAFT status; installment `UNIT_HAS_ACTIVE_PLAN`. `dues` itself has no natural-key unique constraint.

VAT: `dues` has no VAT columns; VAT exists only through `tax_decisions` when `organizations.tax_enforcement_enabled` (default false, B:12703).

## 3. Receive payment
`finance/payments/record-payment-form.tsx` → `recordPaymentAction` (`receivables.ts:139`) → `record_payment` (B:8092, `receivables.payments.create`, resort-scoped) → `post_payment_internal` (B:6621). Cashier path `payDueFromCashierAction` (`treasury.ts:111`). Online: Fawry webhook → `record_online_payment` (B:7923).

- Cashier validation (B:6656-6669): session in org, `OPEN`, cashbox GL account = deposit account. Not checked: session belongs to `p_resort_id`; actor is `opened_by`; method is CASH.
- Receipt numbering: `next_sequence_value(org, null, 'receipt')` (B:6750); partial unique indexes on `(org, receipt_number)` and legacy `(org, receipt_no)` (B:14597, 14601). Org-wide advisory lock `record_payment_<org>` (B:6683) serializes all payments per org (correct; throughput ceiling).
- Allocation: per-line `FOR UPDATE`, org/resort match, not VOID, `amount <= remaining` (B:6706-6721); `Σ allocations = p_amount` (B:6726). See ACC-05.
- Journal: Dr deposit account / Cr each due's receivable (B:6730-6746), posted inline.
- Idempotency: unique index `idx_payments_idempotency` + double check + unique-violation fallback (B:6671-6694, 6752-6775). `tests/record-online-payment-concurrency.integration.test.ts:200` proves one payment for two simultaneous webhooks. Server actions mint a new key per request (ACC-17).

## 4. Reversal / refund / hard delete
- ACC-01/ACC-03 as above. `tests/pgtap.integration.test.ts:2530-2600` asserts the 23514 failure and cites GitHub issue #13. `grep void_payment app lib components` → no caller.
- Double-reversal guards: status checks, `prevent_unreverse_*` triggers (B:7075-7139), `trg_credit_note_immutable`, `trg_tax_decision_immutable`, `ALREADY_CANCELLED` on invoices. OK.
- Hard delete: no `FOR DELETE` policies on dues/payments/allocations/journal tables; no `delete from` on them in SQL. `lib/actions` `.delete()` touches only `budgets`, `units` (dependency-guarded), `members`, `users`, `roles`, `alerts`. Risk: `organizations`/`properties` FKs cascade into dues, payments, journal_entries (B:15385, 15405, 16062, 16072, 15712, 15727); a service-role property delete wipes financial history. No code path found that deletes properties.

## 5. Opening balances
Member: `ensure_opening_balance_due_type` creates a 39xx EQUITY account + due type; `record_member_opening_balance` inserts an `OPENING_BALANCE` due → Dr receivable / Cr equity. Hash-chained audit `OPENING_BALANCE_RECORDED`. `tests/member-opening-balance.integration.test.ts:221` asserts equity posting. Correct. Gap ACC-12.
Chart-of-accounts opening balances: no feature; balance sheet uses `get_trial_balance('1900-01-01', asOf)` and computes current earnings in TS (`balance-sheet/page.tsx:57-59`); no year-end close / retained-earnings roll.

## 6. Cashier sessions
`open_cashier_session` (B:6100): one OPEN per cashbox (partial unique B:14253). `close_cashier_session` (B:1710): expected = opening + Σ RECEIPT − Σ PAYMENT from `cash_transactions`; variance stored, not journaled; closer ≠ opener not checked. `reconcile_cashier_session` (B:7380) is a status flip + note. `cashier/page.tsx:276-279` sums in JS.

## 7. Deposits, commissions, service charges, handover
- Security deposit `record_lease_deposit_event` (B:7769): Dr settlement / Cr liability; reverse on REFUNDED/DEDUCTED; `DEPOSIT_EXCEEDS_HELD`; requires OPEN period. Matches ADR 0002.
- Commissions `accrue_commission` (B:244), `pay_commission` (B:6167): Dr expense / Cr payable / Cr WHT; no cancel function.
- Service charges: rounding proven; levy inserts plain dues; `CANCELLED` status has no function.
- Unit handover `complete_unit_handover` (B:1760): no journal impact.
- Supplier invoice: VAT split via `compute_input_tax_split`; WHT stored not posted (ACC-15).

## 8. Balance formula inventory (ACC-13)
| Site | Formula | Excludes |
|---|---|---|
| `units_with_financials` (B:12505) | Σ dues(status≠VOID) − Σ alloc where payment POSTED | ignores `reversed_at`, credit notes |
| `members_with_financials` (B:12568) | Σ unit balances over active ownerships | tenants |
| `due_outstanding` (B:3300) | amount − alloc(POSTED, reversed_at null) | credit notes |
| `lib/finance/aging.ts` | amount − alloc(payment in posted set) | JS float |
| `tenant-dashboard.tsx:163-176` | own map; `status ∉ PAID/VOID/DRAFT`; collected = issued − outstanding | JS float |
| `portal/statement/page.tsx:67-95` | dues≠VOID and POSTED payments; running balance in client | — |
| `owner-statement/page.tsx:76-91` | own join | — |
| `members/[memberId]/page.tsx:131` | Σ `units_with_financials.balance` | — |
None is sourced from `journal_entry_lines`, so the AR control account can diverge from member balances (ACC-04, ACC-06, ACC-08).

## 9. Reports
| Report | Source | Notes |
|---|---|---|
| Trial balance, GL, income statement, balance sheet, budget-vs-actual, dashboard P&L | `get_trial_balance` / `get_account_ledger` | ACC-02 |
| Cash flow | `get_cash_flow_statement` | ACC-02 |
| Aging, rent roll, owner statement, dashboard AR | operational tables | independent of ledger |
| VAT return | `tax_decisions` + `input_tax_decisions` | ACC-14 |

## 10. Tax / VAT
Rule versioning (`tax_rule_versions`, `trg_tax_rule_immutable` B:10384, `resolve_tax_rule` B:8868, decisions snapshot the rule hash and are immutable) is solid; credit-note test proves new legislation does not alter old notes. Enforcement per org with readiness gate (`check_tax_enforcement_readiness`) and `TAX_REVIEW_REQUIRED` refusal; tests in `tax-enforcement.integration.test.ts`. Off by default. Inclusive handling: GROSS basis, VAT = gross×r/(100+r) rounded to `currency_decimals`; CHECK `gross = base + vat` (B:13257); NET basis rejected. E-invoicing: ACC-16; ADRs 0001-0004, 0006-0008 all recorded as open.

## 11. Rounding / currency
All money columns `numeric(19,4)`; VAT/commission/service-charge rounding via `currency_decimals` (B:2944). JS `z.coerce.number()` sends doubles; Postgres numeric cast rounds. UI totals use float `reduce` (display only). `Number(...)` parsing in `bank-reconciliation.ts:93` is locale-sensitive (Arabic digits: UNKNOWN).

## 12. Financial audit trail
Emitters of `append_financial_audit_event`: `issue_dues` (B:5302), lease rent (B:3547/3575 and successors), recurring (B:3646/3739), installment plan (B:2273), opening balance, `void_payment` (fails). Not emitted for payments, allocations, credit notes, journal create/post/reverse, period changes, cashier, deposits, commissions, service-charge issue, purchasing, expenses, tax-enforcement toggles. `verify_financial_audit_chain` (B:10857) exists; EXECUTE revoked from `authenticated` (B:21167). See ACC-07.

## Invariant table
| Invariant | Enforced where | Evidence | Status |
|---|---|---|---|
| Σdebit = Σcredit per posted entry | `post_journal_entry_internal` | B:6570-6576; phase3 T1 | Enforced (function) |
| ≥2 lines, one-sided non-zero lines | function + CHECKs | B:6567, 12217-12219 | Enforced |
| Posted entries immutable | RLS by omission | B:17110/17117; phase3 T6 | Enforced for app roles; no trigger; service_role bypass |
| Entry number unique per org | partial unique index | B:14445 | Enforced |
| Post only into OPEN period, date in range | function | B:6560-6565 | Enforced |
| Reversal-neutral ledger reports | — | B:4555, 3794, 8969 | **Broken (ACC-02)** |
| One reversal per entry | status check | B:8929 | Enforced |
| Period transitions controlled | `set_fiscal_period_status` | B:9614 | Weak (ACC-09) |
| Due posted atomically with insert | AFTER INSERT trigger | B:14833 | Enforced when OPEN period exists; silent skip otherwise (ACC-08) |
| No duplicate dues | advisory lock + heuristics | B:5237, 5254, 3557 | Partial |
| Allocation ≤ remaining per due | function | B:6706-6721; phase4 T2 | **Bypassable via duplicate due_id (ACC-05)** |
| Σallocations = payment amount | function | B:6726 | Enforced |
| Payment idempotent per key | unique index + checks | B:14589, 6671-6694 | Enforced (server-action keys per request) |
| Receipt numbers unique, gap-free | sequence row + unique index | B:6055, 14597/14601 | Enforced |
| Payment reversible with GL reversal | `void_payment` | B:11042 vs 12041 | **Broken (ACC-01, ACC-03)** |
| Un-reverse impossible | triggers | B:7075-7139 | Enforced |
| Credit note ≤ original, immutable, VAT proportional | function + trigger + CHECK | B:5092-5115, 10253, 11610 | Enforced (only under tax enforcement) |
| Credit notes reduce collectible balance | — | B:3300, 6706, 12505 | **Not enforced (ACC-06)** |
| VOID due removes GL recognition | — | B:947 | **Not enforced (ACC-04)** |
| Opening balance hits equity not revenue | `ensure_opening_balance_due_type` | 20260903:105-112 | Enforced |
| Cashier expected = opening + receipts − payments | `close_cashier_session` | B:1735-1741 | Enforced; voids not reflected |
| Deposit refunds ≤ held | function | B:7822 | Enforced |
| Tax rules immutable & versioned | triggers | B:10384, 10370 | Enforced |
| Financial audit chain covers all money movements | — | B:12041 + emitter list | **Partial (ACC-07)** |
| Hard delete of financial rows impossible | RLS omission | grep | Enforced for app roles; org/property cascades exist |
| Reports agree with ledger | — | §8-9 | Sub-ledger reports independent; VAT return not ledger-sourced |
