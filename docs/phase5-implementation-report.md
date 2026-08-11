# RESORTOS — Phase 5 Implementation Report

**Scope:** Treasury (cashboxes, cashier sessions) and Banking (banks, bank accounts, cheques). First phase to wire `payments.method` to a real cashbox instead of a bare enum, and to exercise the cheque lifecycle end to end.
**Verdict: CONTROLLED PILOT READY** — full cashier + cheque invariant suite ran live and passed (6/6), including a bug caught and fixed against the live database before it shipped.

---

## 1. What was built

### Database (7 migrations, applied)
| File | Contents |
|---|---|
| `20260810000028_cashier_tables.sql` | `cashboxes`, `cashier_sessions` (one `OPEN` session per cashbox, enforced by a partial unique index), `cash_transactions` |
| `20260810000029_cashier_engine.sql` | `open_cashier_session`, `close_cashier_session` (computes expected balance and variance), `reconcile_cashier_session` |
| `20260810000030_record_payment_cashier_session.sql` | Extended `record_payment` with an optional `p_cashier_session_id` — validates the session is open and that the deposit account actually matches that session's cashbox, then logs a `cash_transaction` |
| `20260810000031_banks_cheques_tables.sql` | `banks`, `bank_accounts`, `cheques`, `cheque_status_history` |
| `20260810000032_cheque_engine.sql` | `record_incoming_cheque`, `set_cheque_status` (state-machine-checked transitions), `clear_incoming_cheque` (clears by calling `record_payment` internally) |
| `20260810000033_treasury_banking_rls.sql` | RLS for all 7 new tables, default-deny |
| `20260810000034_cleanup_stale_record_payment.sql` | **Bug fix** — see §3 |

### Cashier, precisely
A cashbox can have at most one `OPEN` session (DB-enforced via a partial unique index, not app logic). `record_payment` now optionally takes a session ID: if given, it re-validates the session is actually open *and* that the deposit account matches that specific cashbox's GL account — so a cashier physically can't post cash into the wrong box — then records a `cash_transaction`. `close_cashier_session` computes `expected = opening + receipts − payments` from those transactions and stores `variance = actual − expected` unconditionally (never silently discarded, matching spec §18). A separate `reconcile_cashier_session` (gated by `cashier.reconciliations.approve`, a different permission) is the supervisor sign-off step, `CLOSED → RECONCILED`.

### Cheques, precisely
Every status change goes through `set_cheque_status`, which checks the transition against a hard-coded legal-transition table (`RECEIVED→DEPOSITED/CANCELLED`, `DEPOSITED→RETURNED`, `DRAFT→ISSUED`, `ISSUED→CLEARED/CANCELLED/RETURNED`) and logs `cheque_status_history` — there's no path to change a cheque's status without leaving a record of who, when, and what the transition was. Clearing an **incoming** cheque is deliberately not in that generic transition table: `clear_incoming_cheque` is its own function because it needs allocation data, and it clears by calling `record_payment` internally, so a cleared cheque produces the exact same ledger entry a direct payment would.

**Scope cut, stated plainly:** outgoing cheques (paying suppliers) track status only — no GL posting — because the Suppliers module (Phase 6) doesn't exist yet, so there's no AP account to credit at issuance. That integration is explicitly Phase 6's job.

### UI
- `/finance/cashier` — cashbox creation, open/close session, and a "pay a due" quick form scoped to the currently open session
- `/finance/banks` — banks, bank accounts, incoming cheque recording, status transition controls, and a clear-cheque form (only shown once a cheque is `DEPOSITED`)

## 2. Database integrity tests executed — all PASS

Self-contained SQL suite (`supabase/tests/phase5_treasury_integrity.sql`) covering spec §38 "Cashier" plus the cheque lifecycle. Results land in a temp table and are `SELECT`ed at the end (this Supabase dashboard's SQL Editor doesn't surface `RAISE NOTICE` output in an easily visible panel, so the test format was adjusted mid-phase to return a results table instead — noted for future test scripts). **You ran it live; all 6 passed:**

| # | Test | Result |
|---|---|---|
| 1 | No transaction without an open session (payment attempted through a closed session) | PASS |
| 2 | Deposit account must match the session's own cashbox | PASS |
| 3 | Closing computes and records the variance (opening 100 + receipts 50, actual 200 → variance 50) | PASS |
| 4a | A closed session cannot be closed again | PASS |
| 4b | A closed session is immutable via direct client write | PASS |
| 5 | Illegal cheque transition rejected (`RECEIVED → CLEARED` skipping `DEPOSITED`) | PASS |
| 6 | Full valid cheque lifecycle (received → deposited → cleared) produces a real payment and pays the due | PASS |

## 3. Caught and fixed this phase

**A stale, duplicate `record_payment` overload from Phase 4.** While verifying migration state (prompted by a "relation already exists" error from an accidental re-run of the combined script), found that the Phase 4 idempotency migration (`20260810000027`) had used `CREATE OR REPLACE` while *adding* a parameter — Postgres treats a changed argument list as a new overload, not a replacement, so the original pre-idempotency 10-argument `record_payment` was silently left behind alongside the correct one. Harmless in practice (nothing called the old signature), but it's exactly the kind of drift that causes real ambiguity later. Dropped in `20260810000034`.

## 4. Verification executed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass |
| `npm run lint` | ✅ Pass |
| `npm run build` | ✅ Pass, 45 routes |
| Live database integrity suite | ✅ 6/6 PASS |

## 5. Known limitations / explicit scope cuts

- **Outgoing cheques have no GL integration** — tracked but not posted, pending Phase 6 (Suppliers/Expenses).
- **No bank reconciliation UI** (`bank_reconciliations` from the master spec) — not built this phase; cheque clearing and the GL are the reconciliation surface for now.
- **`cash_transactions` only records RECEIPT so far** — a `PAYMENT` type exists in the CHECK constraint but nothing produces one yet (cash disbursements are Phase 6 territory: petty cash / supplier payments via cashbox).
- **Single-resort scope** in the cashier/banks UI, same standing simplification as Phases 2 and 4.
- **`reconcile_cashier_session` has no UI yet** — the function and permission gate (`cashier.reconciliations.approve`) exist and are tested implicitly by the state machine, but there's no supervisor-facing screen to call it.

## 6. Next step (Phase 6 — not started)

Suppliers, Expenses, and Purchasing: supplier records, expense categories, purchase requests → orders → receipts → supplier invoices → supplier payments — which will finally give outgoing cheques and cash payments a GL destination (Accounts Payable) and close the loop this phase left open. **Waiting for your go-ahead before starting.**
