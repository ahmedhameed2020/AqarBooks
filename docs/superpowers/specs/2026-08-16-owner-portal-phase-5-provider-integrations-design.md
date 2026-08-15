# Owner Portal — Phase 5 (Paymob/Fawry Provider Integrations) Design — FOR REVIEW, NO CODE YET

**Date:** 2026-08-16
**Status:** Draft, pending project-owner review. **No implementation plan or code exists yet.**
**Depends on:** Phase 4 (`post_payment_internal`, `record_online_payment`, `organization_finance_settings`, `ONLINE` method — complete, verified, closed 2026-08-16; see `docs/superpowers/specs/2026-08-15-owner-portal-phase-4-accounting-core-design.md`'s "Status: Phase 4 complete" section).

## Scope of this document

Covers, at the design level only: provider adapter interface, Paymob adapter, Fawry adapter, sandbox configuration, webhook routes, signature verification, webhook replay protection, checkout creation, redirect/status polling, and the end-to-end test plan. **No code, no migration, no route handler is written as part of this document** — that begins only after this design is approved and turned into a task-broken-down implementation plan (matching the process used for Phase 4).

## Source material and a confidence caveat that matters

Provider API facts below come from live research against each provider's own documentation (full source list at the end). **Fawry's facts are high-confidence** — `developer.fawrystaging.com`'s docs were fetched directly and read in full. **Several Paymob facts are medium-confidence** — `developers.paymob.com` returned HTTP 403 (bot protection) to direct fetches during this research pass, so the HMAC field order, exact production endpoint paths, and test card numbers below are reconstructed from search-indexed doc mirrors and third-party integration guides (Odoo's official Paymob payment-provider module docs, Paymob's own GitHub SDKs/Postman collection), not read verbatim from the primary source in this session.

**This has a direct scope consequence, not just an academic footnote:** before Task 2 (Paymob adapter) of the eventual implementation plan writes a single line of signature-verification code, its first step must be an explicit live-docs verification pass (either successfully fetching `developers.paymob.com`'s webhook/HMAC page through a different path, or downloading Paymob's own Postman collection from `github.com/PaymobAccept/API-Postman-Collections` and reading its example payloads directly) to confirm the HMAC field list/order below is exactly correct — a wrong field order produces a signature that will never validate, and this is exactly the kind of bug that's invisible until the first real webhook arrives. This document proceeds with the current best-available facts, flagged, rather than blocking on that re-verification now.

---

## 1. Normalized provider adapter interface

The two providers differ enough (nested vs. flat payloads, HMAC-SHA512 with one fixed field order vs. SHA-256 with a different formula per endpoint, same-host-test-keys vs. separate-staging-domain) that the adapter interface normalizes at the boundary rather than trying to unify raw payload shapes:

```typescript
// lib/payments/providers/types.ts (Phase 5, not yet written)
interface PaymentProviderAdapter {
  readonly providerId: "PAYMOB" | "FAWRY";

  createCheckout(input: {
    transactionId: string;       // our online_payment_transactions.id
    amount: number;              // EGP major units
    memberEmail: string;
    memberPhone: string | null;
    merchantOrderRef: string;    // = transactionId, our idempotency anchor on their side
  }): Promise<{
    redirectUrl: string;         // where we send the browser
    providerReference: string | null; // if the provider issues one at creation time
  }>;

  // Raw request in, normalized fields out. Does NOT verify the signature --
  // that's a separate, mandatory prior step (see §5). Parsing is separate
  // from trusting.
  parseWebhookPayload(rawBody: string, headers: Record<string, string>): {
    merchantOrderRef: string;    // maps back to online_payment_transactions.id
    providerTransactionId: string;
    status: "SUCCESS" | "FAILED" | "PENDING";
    amountMinor: number;         // smallest currency unit, normalized
    currency: string;
    webhookEventId: string;      // provider's own event/notification identifier for replay dedup
  };

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>, secret: string): boolean;
}
```

`merchantOrderRef` is always our own `online_payment_transactions.id` (a UUID) — never a provider-generated identifier — so both adapters can map an inbound webhook straight back to a transaction row without an extra lookup table.

---

## 2. Paymob adapter

**API surface (Intention API, Paymob's current recommended integration path over the legacy 3-step auth-token/order/payment-key flow):**
- Create Intention: `POST https://accept.paymob.com/v1/intention/`, `Authorization: Token <SECRET_KEY>`, body `{ amount, currency, payment_methods, ... }` → returns `client_secret`.
- Checkout: browser navigates to Unified Checkout — `https://accept.paymob.com/unifiedcheckout/?publicKey=<public_key>&clientSecret=<client_secret>`.
- Webhook ("Transaction Processed Callback"): Paymob POSTs a transaction JSON to our configured callback URL, with an `hmac` query-string parameter.

**HMAC verification (medium confidence, flagged above for re-verification before implementation):** HMAC-SHA512, keyed with a dashboard-issued **HMAC secret** (distinct from the API key and the Intention public/secret keys), computed over these fields concatenated in this exact order, values taken as returned by Paymob (booleans as lowercase `true`/`false` strings): `amount_cents, created_at, currency, error_occured, has_parent_transaction, id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded, is_standalone_payment, is_voided, order.id, owner, pending, source_data.pan, source_data.sub_type, source_data.type, success`.

**Sandbox:** no separate base URL — same `accept.paymob.com` host, test-mode credentials (`egy_pk_test_...` / `egy_csk_test_...` prefixed keys) against a Paymob-provisioned test merchant account.

**Normalization mapping:** `merchantOrderRef` ← the `merchant_order_id` field we set at intention-creation time (must be set to our `online_payment_transactions.id` when creating the intention — confirm this field name exists in the Intention API request body during the live-docs re-verification pass, since it wasn't independently confirmed this session); `providerTransactionId` ← `id`; `status` ← derived from `success`/`pending`/`is_voided`/`is_refunded` (SUCCESS iff `success = true` and not voided/refunded; FAILED iff `success = false` and not pending; else PENDING); `amountMinor` ← `amount_cents` (already minor-unit, no conversion needed); `webhookEventId` ← `id` (Paymob's transaction id doubles as the event identifier — confirm no separate event-id field exists during re-verification, since using a mutable transaction id as the replay-dedup key is only safe if Paymob never re-sends this exact `id` for a genuinely different event).

---

## 3. Fawry adapter

**API surface (Charge Request + FawryPay Hosted Checkout, directly confirmed from `developer.fawrystaging.com`):**
- Charge Request: `POST https://atfawry.fawrystaging.com/ECommerceWeb/Fawry/payments/charge` (staging; production host follows the same path convention on Fawry's production domain — confirm the literal production string during Task 3's live-docs pass, since it wasn't read verbatim this session) → returns a redirect URL for Hosted Checkout.
- Status check: a separate "Get Payment Status v2" endpoint, signed independently (see below).
- Webhook: Fawry POSTs a server-to-server notification to our configured callback URL on status change, expects HTTP 200 ack, and retries on non-200 — this retry behavior is itself Fawry's own replay mechanism, so our webhook handler being idempotent (§6) isn't optional hardening, it's load-bearing against Fawry's own documented retry semantics.

**Signature formulas — confirmed to differ PER ENDPOINT, a real characteristic of this API, not an oversight to unify away:**
- Charge Request: `SHA256(merchantCode + merchantRefNum + merchant_cust_prof_id + payment_method + amount + secureKey)`
- Card/3DS payment: adds card fields before `secureKey`.
- Payment-status GET: `SHA256(merchantCode + merchantRefNumber + secureKey)`
- **Server notification (webhook) — the one this phase actually needs to verify inbound**: `SHA256(fawryRefNumber + merchantRefNum + paymentAmount + orderAmount + orderStatus + paymentMethod + paymentRefNumber + secureKey)`, where `paymentAmount`/`orderAmount` are 2-decimal strings (e.g. `"250.00"`), compared against the payload's `messageSignature` field.

**Sandbox:** a genuinely separate staging domain, `atfawry.fawrystaging.com`, with its own staging merchant credentials — not just test-flavored keys on the production host (unlike Paymob).

**Normalization mapping:** `merchantOrderRef` ← `merchantRefNumber` (set to `online_payment_transactions.id` at charge-request time); `providerTransactionId` ← `fawryRefNumber`; `status` ← mapped from `orderStatus`/`paymentStatus` (exact enum values to be confirmed during Task 3, likely `PAID`/`UNPAID`/`FAILED`/`EXPIRED` or similar — do not guess the exact strings without checking a real sandbox notification payload first); `amountMinor` ← `paymentAmount` converted from its 2-decimal string to minor units; `webhookEventId` ← `fawryRefNumber` (Fawry's own reference number for this specific payment event).

---

## 4. Sandbox configuration

Both adapters are configured with **sandbox-only credentials for all of Phase 5** — the project owner's original constraint from the initial design phase ("ابنوها بمفاتيح تجريبية/وهمية الآن") still applies and is reaffirmed here. Concretely:

- Environment variables, server-only (never `NEXT_PUBLIC_*`, never referenced from any client component or bundled JS): `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `FAWRY_MERCHANT_CODE`, `FAWRY_SECURE_KEY`, `FAWRY_BASE_URL` (defaults to the staging domain; a production value is a Phase 6+ concern, not configured now).
- A provider-selection/base-URL switch lives in each adapter's own module (Paymob: same host regardless of mode, just different key prefixes; Fawry: literally different `FAWRY_BASE_URL` for staging vs. production) — not a shared "environment" flag, since the two providers' sandbox models are structurally different (confirmed by research, see §"Cross-provider adapter implications" below).
- No real credentials are requested, generated, or committed as part of this phase. If real credentials are needed for later end-to-end sandbox testing (Task 6), the project owner provisions and shares them out-of-band — they are never invented or placeholder-guessed into a committed file.

---

## 5. Webhook routes

Two Next.js route handlers, `app/api/webhooks/paymob/route.ts` and `app/api/webhooks/fawry/route.ts` (or a shared `app/api/webhooks/[provider]/route.ts` — a real implementation-time decision, not resolved here since it doesn't affect security properties either way). Each follows the identical sequence, mirroring the hardening the original brainstorming-phase security review already specified for this exact feature:

1. **Read the raw request body as text/bytes, not parsed JSON** — the HMAC/SHA-256 signature is computed over the exact bytes Paymob/Fawry sent; re-serializing a parsed-then-stringified JSON object risks a byte-for-byte mismatch (different key order, whitespace) that would make every signature check fail. Next.js route handlers must read `request.text()` before any `JSON.parse`.
2. **Verify the signature FIRST, before touching the database at all** — constant-time comparison (`crypto.timingSafeEqual`, not `===`, to avoid a timing side-channel on the comparison itself), using the provider-specific formula from §2/§3. On failure: return a generic `401`, log only `{ provider, signature_verified: false }` — never log the raw body or any field from it (per the original design's explicit constraint against ever logging sensitive payloads).
3. **Only after signature verification passes**, parse the normalized fields via `parseWebhookPayload` and look up the `online_payment_transactions` row by `merchantOrderRef`.
4. **If no matching transaction is found**: return a generic `200 OK` with no distinguishing body — never a `404` or an error message that would let an attacker probe for the existence of a `merchantOrderRef`/transaction id by observing response differences. Log `{ provider, unknown_reference: true }` server-side only.
5. **Call `record_online_payment`** (Phase 4, already built and verified) via the **service-role client only**, passing the transaction id, the provider's `webhookEventId`, and the redacted `provider_payload` (see §6 for what "redacted" means here). This is the exact point where Phase 4's all-or-nothing/idempotent-replay guarantees take over — the webhook route itself does no accounting logic, no allocation math, no due-status updates; it is purely: verify signature → parse → call the one already-hardened RPC.
6. **Respond `200`** regardless of whether `record_online_payment` returned `PAID`, `FAILED`, or the retryable `PENDING`/`OPEN_PERIOD_REQUIRED` state — from the provider's perspective, "we received and processed your notification" is true in all three cases; a `FAILED`/`PENDING` result is a durable fact we recorded, not a delivery failure on our end. Only a genuine unexpected exception (e.g., a database connectivity failure) should produce a non-200, so the provider's own retry mechanism (confirmed for Fawry, likely similar for Paymob) re-delivers.

**No credentials in the client bundle:** every one of `PAYMOB_SECRET_KEY`/`PAYMOB_HMAC_SECRET`/`FAWRY_SECURE_KEY` is read only inside these server-side route handlers (and the checkout-creation server action, §7) — never passed as a prop, never referenced in a `"use client"` file, never embedded in the redirect URL beyond what the provider's own public key requires (Paymob's Unified Checkout URL legitimately includes the **public** key, which is not secret by design — this is different from leaking the secret/HMAC keys).

---

## 6. Signature verification and webhook replay protection

**Signature verification** is exactly the per-provider formulas in §2/§3, implemented as the adapter's `verifyWebhookSignature`. Both a valid-signature and an invalid-signature test case are required for each provider (§9) — an invalid-signature payload must be rejected with `401` and must NOT reach `record_online_payment` at all (verifiable by asserting the transaction row is untouched afterward, the same "fresh separate SELECT" discipline established in Phase 4's test suite).

**Replay protection layers, redundant by design (matching Phase 4's own "defense in depth, not the only guard" philosophy):**
1. **HTTP layer**: before calling `record_online_payment`, check whether `online_payment_transactions.webhook_event_id` already equals the inbound `webhookEventId` for a row already in a terminal state — if so, short-circuit and return `200` without calling the RPC again. This is an optimization, not the safety mechanism, since:
2. **Database layer (already built in Phase 4)**: the unique partial index `idx_online_txn_webhook_event (provider, webhook_event_id) where webhook_event_id is not null` (Phase 3 schema) plus `record_online_payment`'s own `FOR UPDATE`-then-`PAID`-short-circuit logic (Phase 4) is the actual, transaction-safe guarantee — even if two webhook deliveries for the same event race each other past the HTTP-layer check, the database layer serializes them correctly and both return the same `payment_id`. This was independently verified with a real two-connection concurrency test in Phase 4 (Task 6) — Phase 5 does not need to re-prove this property, only correctly wire the webhook route to call the already-hardened RPC.

**Redaction, not full logging:** `provider_payload` (the `jsonb` column already on `online_payment_transactions` since Phase 3) stores the webhook body with sensitive fields stripped before insert — specifically, for Paymob: `source_data.pan` (card PAN, even if partially masked by Paymob already, is not our data to retain further) and any 3DS-related fields; for Fawry: nothing in the confirmed notification payload appears to carry raw card data (Fawry's card fields only appear in the request-signing formula for the *charge* endpoint, not the *notification*), but the redaction function should be provider-aware and explicit about what it strips rather than storing everything by default. This directly implements the original design's constraint: log/store `{provider, signature_verified, webhook_event_id}` characteristics, never the full raw payload verbatim if it could carry card data.

---

## 7. Checkout creation

A server action (e.g. `lib/actions/online-payment-checkout.ts`), called from the owner-portal dues page after the member selects which dues to pay:

1. Validate the member's selection server-side (RLS already restricts which dues a member can even see, per Phase 2 — but the action must still re-derive the total from the selected `due_id`s, never trust a client-submitted amount).
2. Insert the `online_payment_transactions` row (`status = 'PENDING'`, `expires_at` = now + a short TTL, `client_request_id` generated fresh) and its `online_payment_transaction_allocations` rows, in the SAME database transaction, enforcing the invariant Phase 3 documented but couldn't enforce via a DB constraint (sum of allocations = transaction amount) — this is the "Phase 4's checkout server action must enforce this" note from Phase 3's schema migration, now finally actionable since this is where that code lives.
3. Call the selected provider's `createCheckout(...)`.
4. Store the returned `providerReference` on the transaction row if the provider issues one at creation time (Paymob's Intention API does; confirm Fawry's Charge Request response shape during Task 3).
5. Return the `redirectUrl` to the client, which navigates the browser there.

---

## 8. Redirect handling — explicitly NOT proof of payment

Both providers' own documented models (Paymob: HMAC-signed server callback exists specifically because the redirect isn't trustworthy; Fawry: explicit separation between `returnUrl` and the server-to-server notification, with the notification framed as the durable channel) confirm the design's starting assumption. The redirect landing page (e.g. `app/[locale]/portal/(member)/payments/return/page.tsx`) does exactly one thing:

- **Polls the transaction's current status via a narrow, portal-RLS-scoped read** (the member can already read their own `online_payment_transactions` rows per Phase 3's RLS — no new read path needed) — shows "payment received" only once the transaction's `status` column itself says `PAID` (i.e., only once the webhook has actually landed and `record_online_payment` has actually run), never based on any query parameter the redirect URL itself carries.
- If the webhook hasn't landed yet when the member's browser returns (a real, expected race — the webhook can arrive after the redirect), the page shows a "processing" state and polls (short interval, capped retry count) until the transaction resolves to a terminal state or the poll budget is exhausted, at which point it tells the member to check back / contactsupport rather than either falsely confirming or falsely denying.
- **No redirect query parameter is ever trusted as an assertion of payment success** — even if Paymob/Fawry include a `success=true`-shaped param in the redirect URL (both providers do, per standard practice for a redirect UX), the landing page code path never reads it for anything beyond perhaps a cosmetic "we're checking..." message; the actual status comes only from the database row the webhook wrote.

---

## 9. End-to-end test plan

Mirroring Phase 4's testing discipline (pgTAP-equivalent + Vitest + a real two-connection concern where relevant), scoped for Phase 5's actual surface (HTTP routes and provider adapters, not new SQL functions — Phase 4's SQL layer is already proven):

**Per-provider adapter unit tests** (Vitest, no network calls — the adapter's `parseWebhookPayload`/`verifyWebhookSignature` are pure functions once given a fixture payload):
- A valid, provider-shaped fixture payload (as close to real as the confidence-flagged research allows — Fawry's fixture can be built with high confidence from the directly-fetched notification schema; Paymob's fixture must be re-confirmed against Paymob's own Postman collection or re-verified docs before being treated as "real" rather than "best guess," per §"Source material" above) → `verifyWebhookSignature` returns `true` with the correct secret, `parseWebhookPayload` extracts the expected normalized fields.
- The same fixture with ONE byte flipped in the signature → `verifyWebhookSignature` returns `false`.
- The same fixture with a correct signature but a tampered `amount`/`status` field (signature computed over the ORIGINAL values, payload then mutated before verification) → `verifyWebhookSignature` returns `false`, proving the signature genuinely covers the fields it claims to, not just a fixed prefix.

**Webhook route integration tests** (Vitest, hitting the actual Next.js route handler or the underlying logic it delegates to):
- Valid signature, known `merchantOrderRef` matching a real `PENDING` transaction → `200`, transaction becomes `PAID`, exactly one `payments` row (reusing Phase 4's own verification pattern: fresh separate `select` after the call, not trusting the HTTP response body alone).
- Valid signature, UNKNOWN `merchantOrderRef` → `200` (not 404), response body carries no distinguishing information, server-side log shows `unknown_reference: true` and nothing else sensitive.
- Invalid signature → `401`, and a fresh separate `select` confirms the (if any) matching transaction row is completely untouched — this is the single most important assertion in this whole test suite, mirroring exactly how Phase 4 proved its non-raising failure paths actually persist, applied here in the opposite direction (proving an untrusted request genuinely changes nothing).
- Duplicate delivery of the exact same valid webhook (same `webhookEventId`) → both calls `200`, second call is a no-op (zero new writes), same `payment_id` — this is Phase 4's idempotent-replay guarantee, re-verified at the HTTP layer to confirm the webhook route doesn't accidentally bypass it (e.g., by transforming the payload in a way that changes the effective idempotency key).
- Redaction check: after a webhook with a card-data-bearing fixture (Paymob) is processed, query `online_payment_transactions.provider_payload` and assert the redacted fields are genuinely absent, not merely masked-looking.

**Checkout creation tests**: allocation-sum-matches-amount invariant enforced (insert of a mismatched transaction+allocations pair is rejected), selecting dues outside the member's own ownership is rejected (reusing/extending the exact RLS-based checks already proven in Phase 2/4).

**One real end-to-end Playwright test per provider**, run against SANDBOX credentials only (per §4): member selects dues → checkout → provider's sandbox hosted-checkout page (a real external page, meaning this test is the one place in this whole project that talks to a live third-party sandbox rather than only the Supabase project) → simulate the provider's webhook call back to a locally-exposed endpoint (or, more practically for CI, directly invoke the webhook route handler with a real sandbox-obtained payload rather than driving the actual third-party redirect through Playwright, which would be flaky and slow) → assert the portal's payments page shows the new `ONLINE`-method payment. The exact mechanics of this test (real browser drive of the provider's hosted page vs. a hybrid where only the initial redirect is checked and the webhook is simulated) is a decision for the implementation-time task, not resolved here — flagging it as an open question for the task-breakdown plan rather than guessing now.

---

## Explicit answers to every condition from the project owner's Phase 5 approval message

| Condition | How this design addresses it |
|---|---|
| نسخة API محددة لكل مزود | Paymob: Intention API (`v1/intention/` + Unified Checkout). Fawry: Charge Request + Hosted Checkout (`ECommerceWeb/Fawry/payments/charge`). Both cited with source URLs. |
| payload fixtures حقيقية أو موثقة | Fawry: high-confidence, from directly-fetched docs. Paymob: medium-confidence, flagged for mandatory re-verification (§ "Source material") before Task 2 writes any signature code. |
| اختبار توقيع صحيح وخاطئ | §9, three dedicated cases per provider (valid, corrupted signature, corrupted payload with stale signature). |
| عدم اعتبار redirect دليل دفع | §8 — redirect page polls the DB-backed transaction status only, never trusts a query parameter. |
| عدم تسجيل payload الحساسة كاملًا | §6 "Redaction, not full logging" — provider-aware stripping before storing `provider_payload`; unknown-reference/signature-failure logs carry only booleans/flags. |
| timeout وretry | Fawry's own documented retry-on-non-200 is relied on directly (§5 step 6); Paymob's webhook route follows the identical 200-unless-genuine-exception rule so its (likely similar, to be confirmed) retry behavior is equally respected. Provider API *calls* (checkout creation) need their own timeout/retry handling — noted as an implementation-time detail for Task 2/3, not fully specified here since it doesn't affect security/correctness properties this design document is scoped to. |
| webhook_event_id وprovider reference | Both already exist as columns on `online_payment_transactions` since Phase 3; §5/§6 specify exactly how Phase 5 populates them. |
| عدم كشف وجود transaction عند webhook مجهول | §5 step 4 — generic `200`, no distinguishing response, server-side-only logging. |
| service-role بعد التحقق فقط | §5 step 5 — `record_online_payment` (already `service_role`-only per Phase 4) is called only after signature verification passes; the webhook route itself needs no elevated grant beyond what it already has as server-side Next.js code using the service-role client. |
| عدم وضع credentials في client bundle | §4/§5 — all secrets server-only env vars, never `NEXT_PUBLIC_*`, never in a `"use client"` file; only Paymob's legitimately-public key appears in the checkout redirect URL. |
| فشل كل allocations ككتلة واحدة | Already fully implemented and independently verified in Phase 4 (`record_online_payment`'s all-or-nothing due-validation loop) — Phase 5 adds no new allocation logic, only calls the existing RPC. |
| نجاح webhook مكرر بإرجاع نفس payment_id | Already fully implemented and independently verified (two-connection concurrency test) in Phase 4 — §6 confirms Phase 5's webhook route doesn't bypass this guarantee. |

---

## What happens after this is approved

Once approved (with any corrections, especially around the flagged Paymob confidence gaps), the next step is a task-broken-down implementation plan (`docs/superpowers/plans/...`), executed the same way as Phase 4: implementer → spec-compliance review → code-quality review per task. The first task in that plan should be the Paymob live-docs re-verification pass (§"Source material") before any Paymob-specific code is written, since that's the one piece of this design resting on medium- rather than high-confidence facts.

## Sources consulted for this design

- https://developers.paymob.com/paymob-docs/integration-paths/apis
- https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac
- https://developers.paymob.com/paymob-docs/developers/intention-apis/create-intention
- https://docs.paymob.pk/docs/hmac-calculation
- https://apis.io/apis/paymob/paymob-intentions-api/
- https://github.com/PaymobAccept/paymob-js
- https://github.com/PaymobAccept/API-Postman-Collections
- https://www.odoo.com/documentation/19.0/applications/finance/payment_providers/paymob.html
- https://developer.fawrystaging.com/docs/express-checkout/fawrypay-hosted-checkout
- https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis
- https://developer.fawrystaging.com/docs/payment-notifications/server-notification-v2
- https://developer.fawrystaging.com/docs/sdks/payment-notifications/get-payment-status-v2
- https://developer.fawrystaging.com/docs/server-apis/create-payment-3ds-apis
