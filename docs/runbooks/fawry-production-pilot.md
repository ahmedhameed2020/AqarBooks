# Fawry production pilot runbook

Status: **NO-GO by default.** This document does not enable production. P10.1 ships the foundation only; refunds, settlement posting, and general availability remain out of scope.

## Required evidence before GO

- Record the signed Fawry merchant agreement, integration guide version, notification specification version, and Fawry support contact.
- Obtain Fawry's production charge/status endpoints in writing. Configure `FAWRY_PRODUCTION_BASE_URL`; never infer it from the staging host.
- Confirm the callback URL is `https://aqarbooks.com/api/webhooks/fawry`, reachable over TLS, and registered by Fawry.
- Record the pilot organization id, property id, provider settings id, merchant identifier, currency, and clearing-account id. Two people must verify these identifiers.
- Store API/HMAC secrets only through the approved Supabase Vault/provider-settings flow. Rotate them before the pilot if they appeared in chat, logs, source, tickets, screenshots, or shell history. Never paste secrets into GitHub issues or this runbook.
- Add exactly the pilot organization id to `PAYMENTS_PRODUCTION_PILOT_ORGANIZATION_IDS` and the database pilot table during the approved change window. Keep every other organization excluded.
- Confirm the setting is `PRODUCTION`, verified, enabled, property-scoped as intended, and displays **Production pilot eligible**. A connectivity check is not production verification.

## Controlled transaction checklist

1. Announce the window and incident owner; pause unrelated payment-setting changes.
2. Use one approved low-value due and one named test payer. Record the local transaction id before leaving AqarBooks.
3. Confirm one Fawry reference, the expected merchant id, EGP amount, production environment, and signed callback.
4. Confirm one `online_payment_events` row reaches `PROCESSED`; duplicate delivery must not create another financial effect.
5. Confirm one posted receipt, allocations not exceeding the due, a balanced journal, the clearing-account debit, and an immutable audit entry.
6. Confirm the member sees the posted receipt and no raw payload, secret, phone, email, or signature appears in UI/logs.
7. Run mismatch probes only with provider-approved test tooling: wrong amount/currency/merchant/reference must be quarantined and must create no receipt.
8. Retain redacted screenshots, ids, timestamps, event/result codes, receipt number, journal id, and reviewer sign-off in the approved evidence store.

## Monitoring during the pilot

- Watch `RETRYABLE_ERROR`, `QUARANTINED`, and aged `PROCESSING`/`PENDING` counts every ten minutes.
- Alert on callback signature failures, credential-resolution failures, event enqueue failures, repeated retry exhaustion, receipt/journal imbalance, or allocation overflow.
- Compare Fawry's transaction status with AqarBooks using immutable transaction/reference ids. Do not retry a charge blindly after a timeout.
- Escalation owners: product owner, finance owner, on-call engineer, database owner, and Fawry merchant-support contact. Record names and phone numbers in the private incident directory, not Git.

## Immediate rollback / NO-GO

Stop the pilot for any signature ambiguity, mismatched amount/currency/merchant/environment/reference, duplicate financial effect, unbalanced journal, secret exposure, unexplained timeout, or missing evidence.

1. Disable the production provider setting.
2. Remove the organization from `PAYMENTS_PRODUCTION_PILOT_ORGANIZATION_IDS` and the database pilot table.
3. Preserve events, transactions, receipts, journals, and logs; do not delete or rewrite financial evidence.
4. Rotate affected Vault secrets and update Fawry callback credentials if exposure is possible.
5. Quarantine unprocessed events, suspend the retry workflow if continued processing is unsafe, and open an incident with only redacted identifiers.
6. Reconcile Fawry, clearing account, receipt, and journal evidence before deciding whether any compensating action is needed. P10.1 has no refund automation.

## Exit criteria

GO requires all local/CI/database/browser gates, an independent security/finance review, preview and Cloudflare deployment health, aligned migration histories, and written approval for the single pilot organization. General availability requires separate refund, settlement reconciliation, and pilot-execution plans.
