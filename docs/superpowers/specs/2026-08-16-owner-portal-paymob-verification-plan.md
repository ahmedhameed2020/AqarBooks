# Paymob Independent Verification Plan

**Date:** 2026-08-16
**Status:** Step 1 (contract documentation) complete. Steps 2-4 (independent HMAC known-answer test, sandbox-only integration testing, guarded integration test suite) are **BLOCKED** pending real Paymob sandbox merchant credentials — confirmed with the project owner (2026-08-16) that none are currently available. **Paymob remains production-blocked; no change to this plan alters that.** Fawry's working production/sandbox path is entirely untouched by this document.

## Why this document exists

The project owner required an independent Paymob verification track, separate from Fawry's (already complete, verified) path, before any Paymob production activation is even discussed — with an explicit requirement that any HMAC mismatch against an official example halts work rather than being patched by guesswork, and that production activation requires an explicit, deliberate step beyond just having valid env vars configured.

---

## Step 1: Contract documentation — COMPLETE

### API version and integration path

**Intention API** (`v1/intention/`) with **Unified Checkout** — Paymob's currently-recommended integration path over the legacy 3-step flow (auth token → order registration → payment key request), per `developers.paymob.com/paymob-docs/integration-paths/apis` (confirmed via search-indexed mirror; direct fetch returns `403` from every attempt across this entire project, including a fresh attempt on 2026-08-16 — Cloudflare bot protection, not a transient issue).

### Checkout endpoint

```
POST https://accept.paymob.com/v1/intention/
Authorization: Token <PAYMOB_SECRET_KEY>
Content-Type: application/json

{
  "amount": <integer, minor units (piastres)>,
  "currency": "EGP",
  "payment_methods": [<integration_id>],
  "special_reference": "<our own merchant order reference, e.g. transaction UUID>",
  "billing_data": { "email": ..., "phone_number": ..., "first_name": ..., ... },
  "notification_url": "<our webhook endpoint>",
  "redirection_url": "<our browser-redirect return page>"
}
```
Response includes `client_secret` and `intention_order_id`. `special_reference` is echoed back on the resulting transaction as `order.merchant_order_id` (or `merchant_order_id` at the top level, provider-version-dependent — confirm exact nesting once real sandbox data is available, see Open Question 1 below).

**Confirmed via Paymob's own official Postman collection** (`github.com/PaymobAccept/API-Postman-Collections`, `Intention APIs.postman_collection.json`, fetched directly, high confidence):
```json
{
  "client_secret": "egy_csk_test_...",
  "intention_order_id": 399862108,
  "special_reference": "phe4sjw11q-1122-22sas1aa",
  "extras": { "creation_extras": { "merchant_order_id": "phe4sjw11q-1122-22sas1aa" } },
  "status": "intended"
}
```

### Checkout redirect (browser-facing, NOT authoritative — see "redirect vs. webhook" below)

```
https://accept.paymob.com/unifiedcheckout/?publicKey=<PAYMOB_PUBLIC_KEY>&clientSecret=<client_secret>
```
Sandbox and production use the **same host** — test mode is distinguished only by test-prefixed keys (`egy_pk_test_...`, `egy_csk_test_...`), unlike Fawry's genuinely separate staging domain. This means there is no URL-based way to structurally guarantee sandbox-only traffic for Paymob the way `FAWRY_BASE_URL` does for Fawry — enforcement must be entirely at the credential/config layer (see Step 3).

### Callback/webhook payload — "Transaction Processed Callback"

`POST` to the `notification_url` configured at Intention-creation time, with an `hmac` **query-string parameter** on the callback URL itself (not a body field, not a header — this is the one structurally different piece from Fawry, whose signature lives inside the JSON body).

Payload shape (from the same official GitHub source used for the HMAC field list, cross-referenced against the design doc's earlier research):
```json
{
  "type": "TRANSACTION",
  "obj": {
    "id": 47782394705,
    "amount_cents": 100202,
    "currency": "EGP",
    "created_at": "2026-03-25T18:39:44.719228",
    "success": true,
    "pending": false,
    "is_voided": false,
    "is_refunded": false,
    "is_3d_secure": true,
    "is_auth": false,
    "is_capture": false,
    "is_standalone_payment": true,
    "has_parent_transaction": false,
    "integration_id": 25567066741,
    "owner": 2346,
    "error_occured": false,
    "order": { "id": 46700123, "merchant_order_id": "<our special_reference>" },
    "source_data": { "pan": "2346", "sub_type": "MasterCard", "type": "card" }
  }
}
```

### HMAC verification algorithm — CONFIRMED, independently, twice

**HMAC-SHA512**, keyed with a merchant-specific **HMAC secret** (dashboard-issued, distinct from the API key and the Intention public/secret keys), computed over these 20 fields, read from `obj`, concatenated **with no separator**, in **exactly** this order:

```
amount_cents, created_at, currency, error_occured, has_parent_transaction, id,
integration_id, is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment,
is_voided, order.id, owner, pending, source_data.pan, source_data.sub_type,
source_data.type, success
```

Boolean values are stringified as literal lowercase `true`/`false`; the resulting SHA-512 hex digest (lowercase) is compared against the `hmac` query parameter. **This field order was verified from two independent sources**: (a) Paymob's own official GitHub org repo `PaymobAccept/Paymob-AI-Integration-Skill` (`skills/paymob-integration/references/hmac-verification.md`), directly re-fetched twice (2026-08-16, once during the earlier Phase 5 research, once again while re-confirming a suspicious "this repo doesn't exist" claim from a different automated pass — the repo's existence and ownership by the real `PaymobAccept` GitHub org were independently confirmed via a direct `api.github.com` call, not just trusted); (b) matches the field order already implemented in `paymobAdapter` (`lib/payments/providers/paymob.ts`), which was itself derived from the same source.

**What is still NOT confirmed, and why Steps 2-4 are blocked**: that same official document explicitly states its one worked example provides the concatenated input string only, "to validate your concatenation logic" — it does **not** publish a computed HMAC-SHA512 output for that example. There is no source reachable from this project — not `developers.paymob.com` (blocked), not the GitHub skill repo, not the Postman collection (no HMAC description field) — that provides a complete `(input, secret, expected-hash)` known-answer triple. **This is the exact gap Step 2 exists to close, and it cannot be closed without a real Paymob sandbox account producing one genuine signed callback.**

### Success/failure state derivation

No single `status` enum field (unlike Fawry's `orderStatus`) — derived from four independent booleans on `obj`:
- `success: true`, `pending: false`, `is_voided: false`, `is_refunded: false` → payment succeeded.
- `pending: true` → still processing.
- `is_voided: true` → transaction voided (treated as `FAILED` in this codebase's adapter — genuine non-payment, distinct from a refund of received funds).
- `is_refunded: true` → payment previously succeeded, then reversed (treated as `PENDING`/excluded-from-settlement in this codebase's adapter, per the same "never conflate a refund with a genuine failure" policy applied to Fawry's `REFUNDED`/`PARTIAL_REFUNDED` states — see the Fawry status-model revision in the main Phase 5 design doc).

### `provider_reference` extraction

At checkout-creation time: `intention_order_id` from the Intention API's response (confirmed real field, Postman collection example above).
At webhook-receipt time: our own merchant order reference round-trips back as `obj.order.merchant_order_id` (matching what we sent as `special_reference`) — this is how the webhook handler maps an inbound callback back to our `online_payment_transactions.id`, exactly mirroring Fawry's `merchantRefNumber` round-trip.

### Redirect vs. webhook — redirect is NEVER authoritative

Two separate URLs configured at Intention-creation time: `notification_url` (server-to-server "Transaction Processed Callback," HMAC-signed, the only authoritative source) and `redirection_url` (browser redirect after checkout, cards/wallets only, **not authenticated/signed**, must never be trusted as proof of payment). This mirrors exactly the design already implemented for Fawry in `app/[locale]/portal/(member)/payments/return/payment-status-poller.tsx` — that component already reads only the database's `online_payment_transactions.status` column, never a query parameter, so **no code change is needed there** to accommodate Paymob later; the existing redirect-handling design already generalizes correctly to a second provider.

---

## Steps 2-4: BLOCKED — explicit statement, not a silent skip

### Step 2: Independent HMAC known-answer test — BLOCKED

Cannot be performed. A genuine known-answer test requires a real `(input, secret, expected-hash)` triple that only exists if: (a) Paymob publishes one (checked repeatedly, not published as of 2026-08-16), or (b) a real Paymob sandbox merchant account produces one actual signed callback we can capture and use as ground truth. Neither is available. **Per the project owner's explicit instruction, no algorithm changes are made on guesswork in the absence of this.** The existing self-generated-fixture tests in `tests/payments/paymob-adapter.test.ts` (Task 3, already committed) remain exactly what they are — proof of internal consistency (the adapter's sign/verify paths agree with each other and are sensitive to field identity/order), explicitly labeled as NOT vendor-verified, and this status is unchanged by this document.

### Step 3: Sandbox-only integration testing — BLOCKED

Cannot be performed without real `PAYMOB_SANDBOX_API_KEY`/`PAYMOB_SANDBOX_HMAC_SECRET`/an integration ID from an actual Paymob merchant sandbox account. No checkout was created against Paymob's live host at any point in this project — `paymobAdapter.createCheckout`'s unconditional guard throw (verified: fires before any env var is even read) has never been bypassed, on any branch.

### Step 4: Guarded end-to-end integration test — BLOCKED

Same dependency as Step 3 — cannot construct a real `PENDING → signed callback → record_online_payment → PAID` flow without a real signed callback to POST.

---

## Production activation requirement — reaffirmed, made more explicit

Per the project owner's explicit instruction in this round: **passing environment variables alone must never be sufficient to activate Paymob for production.** The current `PAYMOB_ADAPTER_NOT_ENABLED_FOR_PRODUCTION` guard already satisfies the weaker property (fires unconditionally, before any env var is read — confirmed live, Task 3's review). The stronger property the project owner now requires — an explicit, deliberate release-configuration or feature-flag step, not just "the guard happens to still be in the code" — is **not yet implemented** as its own artifact and is added to the roadmap below as a concrete follow-up: when Step 2 eventually succeeds (real KAT obtained), removing the guard should ALSO require flipping an explicit flag (e.g. `PAYMOB_PRODUCTION_ENABLED=true` checked in addition to removing the throw, or a code-level constant that must be deliberately changed alongside a changelog entry) — not just deleting the guard line as a side effect of "the tests finally pass." This is deferred until Step 2 actually succeeds, since building the flag mechanism now, for a code path that still can't be tested, would be premature.

## What this plan does NOT touch

- Fawry's adapter, checkout RPC, webhook route, or any of its tests — entirely unmodified by this document or the (blocked) verification attempt.
- `lib/actions/purchasing.ts`'s `post_supplier_invoice` RPC-signature mismatch — explicitly out of scope, tracked as its own separate item (see the main Phase 5 design doc's baseline-cleanup section) — not touched, not guessed at, as instructed.
- No new code was written as part of this document — Steps 1's findings were already substantially known from Phase 5's original design/Task 3 research; this document formalizes and re-verifies them as their own artifact, per the project owner's explicit request to "ثبّت... في وثيقة" (pin down... in a document) before any further Paymob code work.

## Next step

This plan stays at "Step 1 complete, Steps 2-4 blocked" until real Paymob sandbox merchant credentials become available. When they do: obtain one real signed callback first (Step 2's actual unblocking event), verify it against the adapter's current implementation, and only then proceed to Steps 3-4. Do not skip ahead to sandbox integration testing (Step 3) before Step 2's known-answer test passes — a working checkout flow that happens to produce webhooks the adapter can't verify would be a worse outcome than staying blocked, since it could mask exactly the kind of HMAC bug this whole verification track exists to catch.
