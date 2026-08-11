# RESORTOS — Phase 4 Implementation Report

**Scope:** Property structure, members/ownership, dues, payments, allocations — the first module that produces `RECEIPT_VOUCHER` entries through the Phase 3 journal engine.
**Verdict: CONTROLLED PILOT READY** — full payments invariant suite (spec §38 "Payments") ran live and passed, including a cross-tenant isolation test against a second real organization.

---

## 1. What was built

### Database (5 migrations, applied)
| File | Contents |
|---|---|
| `20260810000023_property_tables.sql` | `zones`, `buildings`, `units`, `members`, `unit_ownerships` |
| `20260810000024_receivables_tables.sql` | `due_types`, `dues`, `payments`, `payment_allocations` — no client INSERT/UPDATE/DELETE policy, same pattern as the journal engine |
| `20260810000025_receivables_engine.sql` | `issue_due()`, `record_payment()` |
| `20260810000026_property_receivables_rls.sql` | RLS for all 9 new tables |
| `20260810000027_payment_idempotency.sql` | Added `idempotency_key` to `payments` + `record_payment` (caught in review, see §3) |

### The receivables engine, precisely
Both entry points create **and post** a journal entry in the same transaction as the domain row — there is no code path where a due or payment exists without its accounting effect.

- **`issue_due(...)`** — validates the due type and unit belong to the org, then posts `Dr <receivable account> / Cr <due type's revenue account>` for the full amount (accrual recognition at issuance, not at payment — the standard pattern for HOA/resort dues), and inserts the `ISSUED` due linked to that entry.
- **`record_payment(...)`** — validates every allocation against the due's *actual remaining balance* (sum of prior `POSTED` payment allocations, not the due's face amount) before touching anything, requires allocations to sum exactly to the payment amount (no partial-allocation/advance-credit path yet — see §4), aggregates credit lines by receivable account (so dues on different accounts still net to one balanced entry), assigns a receipt number via the same `next_sequence_value()` used for journal numbering, and updates each due's status to `PARTIALLY_PAID` or `PAID` based on the new total.

### UI
- `/property` — units list + create form (single-resort scope, see §4)
- `/members` — members list, create form, ownership linking (member ↔ unit with a share %)
- `/finance/dues` — due-type setup (name + revenue account), issue-due form, list with computed remaining balance
- `/finance/payments` — record-payment form with dynamic multi-due allocation and a live "allocated vs total" check, payment list

## 2. Database integrity tests executed — all PASS

Self-contained SQL suite (`supabase/tests/phase4_receivables_integrity.sql`) — creates an ephemeral org, resort, cloned COA, fiscal period, unit, and due type, then runs spec §38's "Payments" checklist. **You ran it live; all 5 passed:**

| # | Test | Result |
|---|---|---|
| 1 | Partial payment works, due moves to `PARTIALLY_PAID` | PASS |
| 2 | Over-allocation (exceeding remaining balance) is rejected | PASS |
| 3 | Multi-due allocation in one payment pays both dues in full | PASS |
| 4 | Cross-tenant allocation is rejected (tried paying another org's due) | PASS |
| 5 | Duplicate payment retry (same idempotency key) returns the same payment, no duplicate | PASS |

Test 4 is the first cross-tenant isolation test actually run in this project (earlier phases flagged this as an open gap) — it created a second real organization and confirmed `record_payment` refuses to touch a due that doesn't belong to the calling org. Both ephemeral test orgs were archived, not deleted, at the end.

## 3. Caught during this phase (before shipping, not after)

**`record_payment` initially had no idempotency key.** Spec §38 explicitly requires "duplicate retry does not duplicate payment," and the first draft of the function didn't have it — caught in self-review against the spec before the test suite ran, not by a failing test. Fixed in `20260810000027` by mirroring the journal engine's `(organization_id, idempotency_key)` pattern.

## 4. Verification executed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass |
| `npm run lint` | ✅ Pass |
| `npm run build` | ✅ Pass, 41 routes |
| Live database integrity suite | ✅ 5/5 PASS |

## 5. Known limitations / explicit scope cuts

- **No due installments.** A due is a single payable amount; splitting into installments isn't built. Straightforward to add later as N linked dues.
- **No advance/unallocated credit.** A payment's allocations must sum to exactly the payment amount — overpayment or prepaying before a due exists isn't supported yet.
- **No waivers/adjustments** (`member_account_adjustments` from the master spec) — deferred with the above; a due's balance today is purely `amount - sum(posted allocations)`.
- **`/property` and `/finance/dues`/`/finance/payments` assume a single resort** (the org's first-created one, same simplification as the org-switcher gap from Phase 2). Multi-resort selection isn't wired into these forms yet.
- **No aging/collection reports yet** — those are Phase 7 (Reports & Dashboards) territory; this phase only had to prove the underlying ledger is correct, which the test suite confirms.
- **Floors are an attribute, not a table** — a deliberate simplification from the full Zone→Building→Floor→Unit hierarchy (documented in the migration comment), since a standalone floors table added no behavior this phase needed.

## 6. Next step (Phase 5 — not started)

Treasury and Banking: cashboxes, cashier sessions (open/close/reconcile), banks, bank accounts, and cheques — which will finally let `payments.method` actually connect to a real cashbox instead of a bare enum, and produce the `PAYMENT_VOUCHER` side of the journal that hasn't been exercised yet. **Waiting for your go-ahead before starting.**
