# P10 — Fawry Production Collections Design

**Status:** Approved direction; implementation not started  
**Date:** 2026-09-24  
**Scope:** Fawry-first production collections, controlled refunds, settlement reconciliation, and pilot release

## 1. Intent and success criteria

AqarBooks will turn its existing Fawry sandbox flow into a production-grade collection capability for real-estate organizations. The first live release uses Fawry only. It starts with one explicitly allowlisted pilot organization, proves the complete money trail, and becomes generally available only after collection, refund, and reconciliation controls pass their release gates.

Success means:

- a member can pay one or more eligible dues through Fawry without exposing another tenant's data;
- every provider callback is authenticated, replay-safe, and traceable;
- a confirmed collection creates exactly one posted receipt and one accounting effect;
- full and partial refunds preserve the original receipt and create controlled reversing records;
- Fawry clearing, provider fees, refunds, and the bank deposit reconcile to zero unexplained difference;
- staff can explain who initiated, approved, processed, reconciled, or overrode every material transition;
- Arabic and English users receive clear pending, successful, failed, expired, refunded, and exception states;
- no customer organization is enabled until its configuration and pilot evidence are complete.

## 2. Decisions

1. **Fawry first.** Paymob remains disabled at checkout and outside this release. The provider interface stays extensible, but P10 does not pretend an unverified adapter is production-ready.
2. **One controlled pilot.** Production is enabled for one allowlisted organization before opt-in general availability.
3. **No card data enters AqarBooks.** Checkout redirects to the provider. AqarBooks stores provider references and redacted operational evidence only.
4. **The database owns financial idempotency.** UI state, provider retries, and server retries cannot create a second receipt or journal effect.
5. **Provider responses are not accounting truth by themselves.** A terminal provider event or verified provider status drives financial posting; settlement reporting later proves cash arrival.
6. **Original financial records are never rewritten or deleted.** Refunds, chargebacks, corrections, and reconciliation adjustments are linked movements.
7. **Refunds are first-class before general availability.** The pilot may initially restrict initiation to trained staff, but the data model and accounting lifecycle ship as part of P10.
8. **Settlement reconciliation is mandatory.** A successful checkout is not the end of the operational workflow.

## 3. Existing foundation to retain

The current implementation already provides:

- `online_payment_transactions` with tenant scope, provider reference, expiry, status, payment link, and unique client/provider/webhook identifiers;
- `online_payment_transaction_allocations` linking a checkout to selected dues;
- `create_online_payment_checkout_transaction` for member-scoped checkout creation;
- a Fawry provider adapter and signed webhook parsing;
- `record_online_payment` as the service-only, atomic receipt/posting boundary;
- an online-payments clearing account per property;
- provider settings stored through Vault-backed references with organization/property scope;
- staff permissions, RLS, connection verification, portal UI, concurrency tests, and an end-to-end sandbox test.

P10 extends these boundaries. It does not create a second payments ledger or bypass the existing `payments` and journal machinery.

## 4. Architecture

### 4.1 Components

- **Checkout service:** validates member, dues, property, currency, outstanding balance, provider availability, and pilot entitlement; creates a stable local attempt before calling Fawry.
- **Fawry adapter:** owns request signing, checkout creation, callback parsing, callback verification, refund submission, status inquiry, and payload redaction. Provider-specific fields do not leak into accounting functions.
- **Webhook inbox:** records a unique, redacted event envelope and processing outcome. It acknowledges known permanent failures safely and retries transient internal failures.
- **Payment posting boundary:** converts one verified successful transaction into one receipt, due allocations, and journal effect.
- **Refund service:** accepts an approved refund request, signs the Fawry call, tracks asynchronous or inquiry-confirmed outcomes, and posts the reversal only on confirmed success.
- **Settlement service:** imports provider settlement data, validates totals, matches provider references, posts bank/fee movements, and exposes exceptions.
- **Operations UI:** separates provider configuration, transaction investigation, refund approval, settlement reconciliation, and exception resolution.

### 4.2 Data flow

```text
Eligible dues
  -> local checkout attempt
  -> signed Fawry checkout
  -> provider-hosted payment
  -> verified webhook/inquiry event
  -> one posted receipt and due allocation
  -> Fawry clearing balance
  -> settlement import
  -> bank deposit + provider fee
  -> reconciled settlement
```

Refunds form a linked flow:

```text
Posted online receipt
  -> refund request
  -> approval
  -> signed Fawry refund
  -> confirmed success/failure
  -> reversing receipt/allocation and journal effect
  -> settlement matching
```

## 5. Data model

### 5.1 Extend `online_payment_transactions`

Add immutable-at-creation fields:

- `environment` (`SANDBOX`, `PRODUCTION`);
- `currency`;
- `provider_settings_id`;
- `provider_merchant_identifier_snapshot` (non-secret);
- `checkout_requested_at` and `checkout_created_at`;
- `last_provider_status` and `last_status_checked_at`;
- optional terminal `completed_at`.

The transaction status remains the collection-attempt lifecycle. Refund and settlement state must not overload it.

### 5.2 `online_payment_events`

Append-only provider-event inbox:

- organization, property, provider, environment, transaction;
- provider event/reference identifiers;
- event type and provider status;
- received timestamp;
- signature verification outcome;
- redacted payload and payload hash;
- processing status (`RECEIVED`, `PROCESSED`, `IGNORED`, `RETRYABLE_ERROR`, `PERMANENT_ERROR`);
- attempt count, last error code, processed timestamp.

Uniqueness is provider/environment/event identifier, with a deterministic hash fallback when the provider omits an event id.

### 5.3 `online_payment_refunds`

- organization, property, original transaction, original payment;
- amount, currency, reason code, staff note;
- state: `DRAFT`, `SUBMITTED`, `APPROVED`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `REVERSED`, `CANCELLED`;
- requested/approved/processed actors and timestamps;
- provider refund reference and idempotency key;
- failure code and safe failure message;
- reversal payment/journal references;
- optimistic version or expected-update timestamp.

Constraints prevent non-positive amounts and cumulative successful/in-flight refunds above the refundable balance. Refund rows and transitions are append-audited; terminal financial fields cannot be rewritten.

### 5.4 `online_payment_refund_transitions`

Append-only before/after state, actor, reason, source, and timestamp. Provider-driven transitions use a service actor/source and link the event row.

### 5.5 Settlements

`payment_settlements` stores provider, environment, merchant, currency, settlement period, provider batch reference, gross amount, refunds, fees, net amount, bank account, statement reference, status, importer, reviewer, and timestamps.

`payment_settlement_lines` links each provider line to a transaction, refund, fee, or unresolved exception. Provider/environment/batch/line reference is unique.

Settlement states are `IMPORTED`, `MATCHING`, `EXCEPTION`, `READY`, `POSTED`, `REVERSED`. Posting is impossible while unexplained differences remain.

## 6. State and idempotency rules

- Checkout creation accepts a stable client request id. Repeating it returns the same local attempt.
- Only one non-terminal attempt may reserve a due amount at a time. Locks and outstanding-balance rechecks prevent double booking.
- Provider reference uniqueness includes provider and environment.
- Each provider event is inserted once; processing it repeatedly returns the prior outcome.
- Only `PENDING` collection transactions can become `PAID`, `FAILED`, or `EXPIRED`. `PAID` never returns to another collection status.
- A successful event with mismatched amount, currency, merchant, provider, environment, or local reference is quarantined, not posted.
- Refund submission uses a stable idempotency key. Network uncertainty triggers inquiry before retrying a provider mutation.
- Refund posting occurs exactly once after confirmed provider success.
- Settlement import is idempotent by provider batch and line references. Posting is idempotent by settlement id.

## 7. Security and authorization

### 7.1 Permissions

- `finance.online_payments.view` — view transactions and safe provider status;
- `finance.online_payments.manage` — configure and test provider settings;
- `finance.online_payments.refund.request` — draft/submit a refund;
- `finance.online_payments.refund.approve` — approve or reject; cannot approve one's own request unless an explicit organization policy permits it;
- `finance.online_payments.reconcile` — import, match, and post settlements;
- `finance.online_payments.exceptions` — resolve quarantined events and reconciliation exceptions.

All permissions are enforced in RPC/server boundaries and scoped to organization and, where applicable, property. UI hiding is secondary.

### 7.2 Secrets

- API and HMAC secrets remain Vault-backed and never appear in browser props, logs, database result sets for ordinary users, or audit payloads.
- Production and sandbox credentials are distinct records.
- A transaction permanently records which settings record and environment it used.
- Secret or merchant changes invalidate verification and require re-verification before enablement.
- Logs use fixed error codes and redacted identifiers.

### 7.3 Webhooks

- Read raw request bytes once and verify using the exact provider algorithm.
- Resolve credentials from the transaction's immutable environment/settings reference.
- Reject invalid signatures before state mutation.
- Validate timestamp/nonce when the provider supplies them; otherwise rely on signed content, event uniqueness, and strict state transitions.
- Apply request-size limits, content-type checks, timeouts, structured redacted logging, and rate controls that do not block legitimate provider retries.
- Unknown references receive a non-enumerating response and an operational alert.

## 8. Accounting

### 8.1 Successful collection

On confirmed payment:

- debit Fawry clearing;
- credit the receivable through the existing receipt/allocation machinery;
- link the online transaction to the posted payment and source journal;
- preserve due-level allocations selected at checkout, capped by the balance at posting time.

If a concurrent manual payment changes the available balance, the online payment is posted safely with any remainder treated according to the existing unallocated-credit policy; it is never silently discarded or over-allocated.

### 8.2 Refund

On confirmed refund:

- create a linked reversal payment/document, never edit the original receipt;
- reverse the applicable due allocations so the receivable is reinstated when the underlying obligation remains;
- debit receivable or the configured customer-credit/refund account according to the documented business reason;
- credit Fawry clearing (or the bank account only when the provider demonstrably draws it there);
- link every journal line to the original payment, refund record, member, property, and unit dimensions.

The refund workflow requires an open accounting period. If the original period is closed, the reversal posts in the current open period with the original document reference; closed periods are not reopened automatically.

### 8.3 Settlement and fees

On settlement posting:

- debit bank for net cash received;
- debit payment-processing-fee expense for provider fees and applicable tax components;
- credit Fawry clearing for the gross settled collection less provider-funded refund movements, using balanced lines derived from the settlement report.

The system does not infer fees from the difference without preserving provider evidence. Unknown differences remain exceptions.

### 8.4 Chargebacks/disputes

Fawry capabilities and the merchant contract determine available dispute events. The schema reserves event and adjustment types, but P10 does not fabricate automated chargeback behavior unsupported by the provider. Any real chargeback movement is recorded as a linked financial adjustment with evidence, permission, and audit trail.

## 9. Provider capability contract

The adapter advertises capabilities rather than forcing every provider into the same behavior:

- create checkout;
- parse and verify events;
- inquire transaction status;
- submit full/partial refund;
- inquire refund status;
- obtain or import settlement data;
- supported currencies, refund limits, and terminal states.

Fawry's production URLs, signature formats, response codes, and refund behavior must be pinned to the merchant's contracted API documentation during implementation. A successful connectivity probe alone must not mark production credentials verified; verification requires a provider-supported credential check or an explicitly labeled controlled transaction test.

## 10. Error handling and recovery

- Permanent malformed or unauthenticated callbacks are recorded safely and never retried internally.
- Database/provider timeouts become retryable work with bounded exponential backoff and a dead-letter operational state.
- A provider timeout after a mutation never causes a blind second mutation; inquiry resolves uncertainty first.
- Staff see stable business error codes and remediation steps, not provider secrets or raw responses.
- Scheduled jobs expire abandoned checkouts, retry eligible event processing, inquire uncertain refunds, and alert on aged exceptions.
- Manual exception resolution requires a reason, evidence reference, permission, and audit entry; it cannot directly forge `PAID`.

## 11. UX and reporting

### Member portal

- show eligible dues, total, provider, currency, and redirect expectation before checkout;
- show pending instructions/reference when supported;
- show payment history and safe failure/retry guidance;
- show refund progress without internal risk or provider details;
- maintain Arabic RTL and English LTR parity, localized dates/numbers, responsive layouts, loading, empty, error, and permission states.

### Staff operations

- transaction search by receipt, provider reference, member, unit, property, status, date, and amount;
- a chronological event/audit timeline;
- dual-control refund queue;
- settlement workspace with matched, unmatched, duplicate, amount mismatch, and missing-event exceptions;
- drill-through from settlement to transaction, receipt, allocations, journal, refund, member, and unit;
- CSV/PDF evidence exports that exclude secrets and sensitive raw payloads.

### Reports

- collections by provider/property/date/status;
- Fawry clearing movement and aging;
- settlement reconciliation summary/detail;
- refunds and failed refunds;
- unresolved exceptions and processing latency;
- provider fees and effective collection cost.

## 12. Observability and audit

Track structured, secret-free metrics:

- checkout creation/success/failure rates;
- webhook signature failures, duplicates, processing latency, retries, and dead letters;
- time from provider success to posted receipt;
- refund success/failure/age;
- unmatched settlement count/value and clearing age;
- pilot organization error budget.

Every privileged action records actor, organization/property, source IP/request correlation where available, old/new state, reason, related references, and timestamp. Alerts cover repeated signature failures, posting errors, aged pending transactions, aged refunds, settlement differences, and clearing balances beyond the expected settlement window.

## 13. Rollout

### Phase P10.1 — Production-safe collection foundation

- add environment/settings snapshots and the event inbox;
- remove hardcoded sandbox resolution;
- harden callback validation and event processing;
- add production enablement gates and an organization allowlist;
- run local reset, RLS, concurrency, adapter, webhook, and accounting tests.

### Phase P10.2 — Controlled pilot

- configure one isolated pilot merchant/property and clearing account;
- perform low-value controlled successful, failed, duplicate, expired, and amount-mismatch scenarios;
- verify receipt, allocations, journal, audit, logs, and portal/staff UX;
- keep all other organizations disabled.

### Phase P10.3 — Refund lifecycle

- ship dual-control full/partial refunds, inquiry/recovery, reversal accounting, and refund reporting;
- verify closed-period behavior, cumulative limits, concurrency, retries, failures, and reversals.

### Phase P10.4 — Settlement reconciliation

- ingest the provider-supported settlement source;
- match collections, refunds, and fees;
- post bank/fee entries and resolve exceptions;
- prove the clearing balance reconciles for the pilot period.

### Phase P10.5 — General availability

- require verified production credentials, finance settings, permissions, notification contacts, and completed runbook;
- make enablement explicit and reversible per organization/property;
- publish monitoring, incident, secret-rotation, refund, and reconciliation runbooks;
- enable additional organizations only after readiness checks pass.

Paymob remains a future, separately reviewed provider implementation.

## 14. Testing and release gates

Required evidence includes:

- migration replay from a clean database and aligned migration history;
- static privilege and migration guards;
- runtime RLS across member, staff roles, property scope, other tenant, anon, suspended organization, and service role;
- signature known-answer tests and altered-payload rejection;
- duplicate/out-of-order/concurrent webhook tests;
- amount, currency, merchant, provider, environment, and reference mismatch quarantine;
- checkout double-click, network timeout, provider rejection, and abandoned-checkout expiry;
- concurrent manual/online payment allocation safety;
- full/partial/cumulative/concurrent refund tests and closed-period behavior;
- settlement duplicate import, partial batch, fee/tax, mismatch, reversal, and balanced-posting tests;
- Arabic/English desktop/mobile browser QA;
- a sandbox end-to-end run and a controlled production pilot with real provider evidence;
- TypeScript, scoped lint, production build, Cloudflare preview, deployment smoke, and post-deploy monitoring.

General availability is blocked by any unexplained ledger difference, unbounded secret exposure, cross-tenant access, duplicate financial effect, missing reversal trace, or unreconciled pilot settlement.

## 15. Non-goals

- Paymob production activation;
- storing or processing card details;
- recurring auto-debit mandates;
- multi-currency conversion inside a single transaction;
- automatic write-offs;
- reopening closed periods automatically;
- unsupported provider chargeback automation;
- replacing the existing receipts, dues, journals, or bank-reconciliation ledgers.

## 16. External references

- Fawry Refund API: https://developer.fawrystaging.com/docs/server-apis/refund-issue-api
- Adyen online-payments integration checklist: https://docs.adyen.com/online-payments/integration-checklist
- Adyen refund lifecycle: https://docs.adyen.com/online-payments/refund
- Adyen dispute notifications: https://docs.adyen.com/risk-management/disputes-api/dispute-notifications

These references establish lifecycle patterns; the implemented Fawry contract must follow the merchant-specific Fawry documentation and credentials supplied for the pilot.
