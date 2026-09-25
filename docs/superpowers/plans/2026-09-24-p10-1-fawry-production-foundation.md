# P10.1 Fawry Production Collection Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Fawry collection path environment-correct, replay-safe, observable, and explicitly gated for one production pilot organization without yet adding refunds or settlement posting.

**Architecture:** Extend the existing online-payment ledger instead of replacing it. The database snapshots provider environment/settings on every checkout and owns event idempotency; the Fawry adapter remains the only provider-specific boundary, while a durable webhook inbox separates receipt from financial processing. Production enablement is fail-closed and organization/property scoped.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL/RLS/RPC, Vitest, pgTAP-style SQL runtime gates, Playwright, Cloudflare Workers

**Spec:** `docs/superpowers/specs/2026-09-24-p10-fawry-production-collections-design.md`

## Global Constraints

- Fawry is the only checkout provider enabled by this plan; Paymob stays contract-tests-only.
- No card data enters AqarBooks; only provider references and redacted operational evidence may be stored.
- The database owns checkout, webhook, receipt, and journal idempotency.
- No customer organization is production-enabled; the pilot requires an explicit organization allowlist and verified production settings.
- Original receipts and journals remain immutable; refunds and settlements are later plans.
- Secrets remain Vault-backed and never enter browser props, logs, audit payloads, or ordinary SQL result sets.
- Every database change ships as a new migration; historical migrations are not edited.
- Read the relevant guide under `node_modules/next/dist/docs/` before modifying App Router code.

## Review Focus

- A validly signed callback with the wrong amount, currency, merchant, environment, or local reference must be quarantined and must not post a receipt (Task 4).
- A provider timeout after checkout submission must not trigger a blind duplicate charge attempt; the existing local attempt remains queryable (Task 3).
- Duplicate and out-of-order callbacks must produce one inbox event outcome and one financial effect (Task 4).
- A production settings row outside the pilot allowlist must remain unusable even if it is verified and enabled (Tasks 1 and 3).
- Concurrent manual payment and online callback must never over-allocate a due; any safe remainder follows the existing unallocated-credit behavior (Task 5).

---

## File structure

### New files

- `supabase/migrations/20260924090000_online_payment_production_foundation.sql` — schema, constraints, permissions, pilot gate, checkout RPC, event RPCs, and service-only processing contract.
- `tests/online-payment-production-foundation-migration.test.ts` — static migration and privilege assertions.
- `tests/online-payment-production-foundation-rls.integration.test.ts` — runtime tenant/property/pilot/event isolation matrix.
- `lib/payments/event-envelope.ts` — provider-neutral event envelope, deterministic fallback id, and redaction-safe validation.
- `lib/payments/process-event.ts` — service-only orchestration from verified inbox event to existing `record_online_payment` boundary.
- `app/api/cron/payment-events/route.ts` — authenticated retry sweep for retryable inbox events.
- `.github/workflows/payment-events.yml` — scheduled retry workflow using the existing `CRON_SECRET` convention.
- `tests/payments/event-envelope.test.ts` — amount/currency/reference/environment validation and fallback-id tests.
- `tests/payments/process-event.test.ts` — duplicate, quarantine, retryable, and terminal orchestration tests.
- `tests/e2e/fawry-production-foundation.spec.ts` — sandbox browser/API release gate with production-gate denial coverage.
- `docs/runbooks/fawry-production-pilot.md` — configuration, controlled transactions, monitoring, rollback, and evidence checklist.

### Modified files

- `lib/supabase/types.ts` — generated transaction/event/RPC types.
- `lib/payments/providers/types.ts` — provider environment, currency, and normalized event fields.
- `lib/payments/providers/fawry.ts` — normalized event output and provider status inquiry support needed for uncertain outcomes.
- `lib/payments/resolve-credentials.ts` — resolve by immutable settings id/environment and enforce the production pilot gate.
- `lib/actions/online-payment-checkout.ts` — select environment/settings server-side and persist the immutable snapshot.
- `lib/payments/webhook-handler.ts` — verify, enqueue, and process through the durable inbox.
- `lib/env/server.ts` — typed `PAYMENTS_PRODUCTION_PILOT_ORGANIZATION_IDS` and payment-event cron configuration.
- `app/[locale]/portal/(member)/dues/dues-checkout.tsx` — stable client request id and production-safe retry copy.
- `app/[locale]/portal/(member)/payments/portal-payments-client.tsx` — localized pending/quarantined/support states.
- `app/[locale]/(app)/finance/payment-providers/page.tsx` — honest verification/pilot readiness state.
- `app/[locale]/(app)/finance/payment-providers/payment-provider-forms.tsx` — production warning and enablement prerequisites.
- `tests/payments/fawry-adapter.test.ts` — normalized amount/currency/merchant/environment assertions.
- `tests/e2e/owner-portal-online-payment-fawry.spec.ts` — preserve the existing sandbox flow while adopting the durable inbox.
- `tests/security-function-grants.integration.test.ts` — service-only event-processing grants.
- `tests/migration-directory-guard.test.ts` — authorize the new migration.

---

### Task 1: Database contract and fail-closed pilot gate

**Files:**
- Create: `supabase/migrations/20260924090000_online_payment_production_foundation.sql`
- Create: `tests/online-payment-production-foundation-migration.test.ts`
- Create: `tests/online-payment-production-foundation-rls.integration.test.ts`
- Modify: `tests/migration-directory-guard.test.ts`
- Modify: `tests/security-function-grants.integration.test.ts`

**Interfaces:**
- Produces: `online_payment_transactions.environment`, `.currency`, `.provider_settings_id`, `.provider_merchant_identifier_snapshot`, `.checkout_requested_at`, `.checkout_created_at`, `.last_provider_status`, `.last_status_checked_at`, `.completed_at`.
- Produces: append-only `online_payment_events` and RPCs `enqueue_online_payment_event(...)`, `claim_online_payment_events(integer)`, `complete_online_payment_event(...)`.
- Produces: `create_online_payment_checkout_transaction(uuid[], text, text, uuid)` where the final arguments are environment and provider settings id; organization/member/property remain database-derived.
- Consumes: existing `payment_provider_settings`, `online_payment_transactions`, `record_online_payment`, RLS helpers, and permission infrastructure.

- [ ] **Step 1: Write the failing static migration test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join("supabase", "migrations", "20260924090000_online_payment_production_foundation.sql"),
  "utf8",
).toLowerCase();

describe("online payment production foundation migration", () => {
  it("snapshots environment, currency, settings, and merchant on every transaction", () => {
    for (const column of ["environment", "currency", "provider_settings_id", "provider_merchant_identifier_snapshot"]) {
      expect(migration).toContain(`add column ${column}`);
    }
    expect(migration).toContain("environment in ('sandbox', 'production')");
    expect(migration).toContain("foreign key (provider_settings_id)");
  });

  it("creates an append-only, replay-safe event inbox", () => {
    expect(migration).toContain("create table public.online_payment_events");
    expect(migration).toContain("payload_hash");
    expect(migration).toContain("retryable_error");
    expect(migration).toMatch(/unique[\s\S]+provider[\s\S]+environment[\s\S]+event_identifier/);
    expect(migration).toContain("online_payment_events_append_only");
  });

  it("keeps claiming and completion service-only", () => {
    expect(migration).toMatch(/revoke all on function public\.claim_online_payment_events[\s\S]+from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.claim_online_payment_events[\s\S]+to service_role/);
  });
});
```

- [ ] **Step 2: Run the new static test and verify it fails because the migration does not exist**

Run: `npx vitest run tests/online-payment-production-foundation-migration.test.ts`

Expected: FAIL with `ENOENT` for the new migration.

- [ ] **Step 3: Write the migration with additive columns, backfill, constraints, event inbox, RLS, triggers, and RPC grants**

Use `environment = 'SANDBOX'`, `currency = organizations.default_currency`, and the uniquely matching enabled sandbox settings row for safe legacy backfill. If a legacy row cannot resolve a settings record, leave `provider_settings_id` nullable only for that legacy row; require it in the new checkout RPC. New production rows must never rely on fallback environment variables.

Core event contract:

```sql
create table public.online_payment_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  transaction_id uuid references public.online_payment_transactions(id),
  provider text not null check (provider in ('FAWRY')),
  environment text not null check (environment in ('SANDBOX','PRODUCTION')),
  event_identifier text not null,
  event_type text not null,
  provider_status text,
  signature_verified boolean not null,
  redacted_payload jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  processing_status text not null default 'RECEIVED'
    check (processing_status in ('RECEIVED','PROCESSING','PROCESSED','IGNORED','QUARANTINED','RETRYABLE_ERROR','PERMANENT_ERROR')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, event_identifier)
);
```

The trigger permits only the controlled processing fields to change and forbids payload, scope, signature, or identity rewrites. The checkout RPC locks selected dues and rejects mismatched settings organization/property/provider/environment/status.

- [ ] **Step 4: Write the runtime RLS matrix**

Cover: owning member can select only their transaction and safe event projection; another member and another organization see nothing; authenticated users cannot insert/update/delete events directly; property-scoped staff see only in-scope safe metadata; service role can enqueue/claim/complete; suspended organizations cannot create checkout; production checkout fails outside the pilot allowlist even when settings are enabled.

- [ ] **Step 5: Reset the local database and run the database gates**

Run:

```powershell
npx supabase db reset
npx vitest run tests/online-payment-production-foundation-migration.test.ts tests/security-function-grants.integration.test.ts tests/migration-directory-guard.test.ts
npx vitest run tests/online-payment-production-foundation-rls.integration.test.ts --maxWorkers=1
```

Expected: reset succeeds; every listed test passes.

- [ ] **Step 6: Commit the database contract**

```powershell
git add supabase/migrations tests/online-payment-production-foundation-migration.test.ts tests/online-payment-production-foundation-rls.integration.test.ts tests/migration-directory-guard.test.ts tests/security-function-grants.integration.test.ts
git commit -m "feat(payments): add production collection database contract"
```

---

### Task 2: Provider-neutral event contract and Fawry normalization

**Files:**
- Create: `lib/payments/event-envelope.ts`
- Create: `tests/payments/event-envelope.test.ts`
- Modify: `lib/payments/providers/types.ts`
- Modify: `lib/payments/providers/fawry.ts`
- Modify: `tests/payments/fawry-adapter.test.ts`

**Interfaces:**
- Produces: `PaymentEnvironment = "SANDBOX" | "PRODUCTION"`.
- Produces: `NormalizedPaymentEvent` with `eventIdentifier`, `merchantOrderRef`, `providerReference`, `status`, `providerStatus`, `amount`, `currency`, `merchantIdentifier`, and `occurredAt`.
- Produces: `validateEventAgainstTransaction(event, transaction): { ok: true } | { ok: false; code: EventMismatchCode }`.
- Produces: `fallbackEventIdentifier(provider, environment, rawBody): string` using SHA-256.

- [ ] **Step 1: Add failing normalization and mismatch tests**

```ts
it.each([
  ["amount", { amount: 99 }, "AMOUNT_MISMATCH"],
  ["currency", { currency: "USD" }, "CURRENCY_MISMATCH"],
  ["merchant", { merchantIdentifier: "other" }, "MERCHANT_MISMATCH"],
  ["environment", { environment: "PRODUCTION" }, "ENVIRONMENT_MISMATCH"],
])("quarantines %s mismatch", (_label, patch, code) => {
  expect(validateEventAgainstTransaction({ ...event, ...patch }, transaction)).toEqual({ ok: false, code });
});
```

Add a known-answer test proving identical raw bodies generate the same fallback id and any byte change generates a different id.

- [ ] **Step 2: Run tests and verify the missing exports fail**

Run: `npx vitest run tests/payments/event-envelope.test.ts tests/payments/fawry-adapter.test.ts`

Expected: FAIL because the normalized contract and helpers do not exist.

- [ ] **Step 3: Implement the minimal normalized contract**

Keep signature verification on raw bytes. Normalize decimal amounts to the project's four-decimal database precision before comparison, require the transaction currency, and never include signatures, secure keys, emails, phones, or unredacted bodies in `NormalizedPaymentEvent`.

- [ ] **Step 4: Run the provider tests**

Run: `npx vitest run tests/payments/event-envelope.test.ts tests/payments/fawry-adapter.test.ts tests/payments/provider-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the provider event contract**

```powershell
git add lib/payments/providers lib/payments/event-envelope.ts tests/payments
git commit -m "feat(payments): normalize provider events"
```

---

### Task 3: Environment-correct checkout and pilot enablement

**Files:**
- Modify: `lib/payments/resolve-credentials.ts`
- Modify: `lib/actions/online-payment-checkout.ts`
- Modify: `lib/env/server.ts`
- Modify: `lib/supabase/types.ts`
- Modify: `app/[locale]/portal/(member)/dues/dues-checkout.tsx`
- Modify: `tests/payments/resolve-credentials.test.ts`
- Create: `tests/online-payment-checkout-production.test.ts`

**Interfaces:**
- Consumes: the Task 1 checkout RPC and immutable settings/environment fields.
- Produces: `resolveProviderCredentialsBySettings(settingsId, expectedScope)` with an exact organization/property/provider/environment match.
- Produces: checkout input `{ dueIds: string[]; provider: "FAWRY"; clientRequestId: string }`.

- [ ] **Step 1: Write failing checkout tests**

Assert that the action no longer contains a hardcoded `"SANDBOX"`, refuses production outside `PAYMENTS_PRODUCTION_PILOT_ORGANIZATION_IDS`, refuses unverified/disabled settings, chooses the property-specific setting before the organization-wide fallback, and passes the stable client request id to the RPC.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run tests/online-payment-checkout-production.test.ts tests/payments/resolve-credentials.test.ts`

Expected: FAIL on the hardcoded sandbox resolver and missing pilot gate.

- [ ] **Step 3: Implement server-side settings selection and immutable snapshots**

Parse the allowlist as comma-separated UUIDs in `lib/env/server.ts`. The server derives organization/property from the authenticated member and selected dues, finds exactly one enabled verified Fawry row, and calls the new checkout RPC with the settings id and environment. Production resolution additionally requires allowlist membership. Do not accept environment or settings id from the browser.

- [ ] **Step 4: Add stable client request behavior**

Generate one UUID when the member begins a checkout submission and reuse it for retries of the same selected-due set. A changed selection receives a new UUID. The action returns the existing redirect/reference for an idempotent replay when available; it never creates a second attempt merely because the provider request timed out.

- [ ] **Step 5: Run action, type, lint, and regression tests**

```powershell
npx vitest run tests/online-payment-checkout-production.test.ts tests/payments/resolve-credentials.test.ts tests/payments/fawry-adapter.test.ts
npx tsc --noEmit
npx eslint "lib/actions/online-payment-checkout.ts" "lib/payments/resolve-credentials.ts" "lib/env/server.ts" "app/[locale]/portal/(member)/dues/dues-checkout.tsx"
```

Expected: PASS with no new warnings.

- [ ] **Step 6: Commit checkout hardening**

```powershell
git add lib app tests
git commit -m "feat(payments): make Fawry checkout environment-correct"
```

---

### Task 4: Durable webhook inbox and deterministic processing

**Files:**
- Create: `lib/payments/process-event.ts`
- Create: `tests/payments/process-event.test.ts`
- Modify: `lib/payments/webhook-handler.ts`
- Modify: `app/api/webhooks/fawry/route.ts`
- Modify: `tests/e2e/owner-portal-online-payment-fawry.spec.ts`

**Interfaces:**
- Consumes: Task 1 event RPCs and Task 2 normalized event validation.
- Produces: `processPaymentEvent(eventId: string): Promise<PaymentEventProcessResult>` where the result is `PROCESSED`, `IDEMPOTENT`, `IGNORED`, `QUARANTINED`, or `RETRYABLE_ERROR` with a fixed code.

- [ ] **Step 1: Write failing orchestration tests**

Test a valid success, duplicate delivery, out-of-order pending after paid, invalid signature, unknown reference, amount mismatch, provider timeout/configuration failure, and a database posting failure. Assert mismatches never call `record_online_payment`; duplicate success returns the prior result; retryable failures set `next_attempt_at`; raw payload and secrets never appear in logs.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run tests/payments/process-event.test.ts tests/payments/event-envelope.test.ts`

Expected: FAIL because the durable processor does not exist.

- [ ] **Step 3: Change the route to verify, enqueue, and process**

The route performs: parse reference → read immutable transaction scope/settings → verify signature → normalize → enqueue event → call `processPaymentEvent`. Invalid signatures return `401` without an inbox mutation. Unknown references return the existing non-enumerating response and a structured alert. A durable successfully enqueued event receives `200` even if inline processing becomes retryable; the retry worker owns recovery.

- [ ] **Step 4: Implement deterministic event processing**

Claim one event atomically. Validate amount/currency/merchant/provider/environment/reference. Quarantine mismatches. Ignore non-success provider states while preserving the event. On success call the existing service-only `record_online_payment`; store only fixed result/error codes. Completion uses the event's expected current status to reject stale workers.

- [ ] **Step 5: Extend the end-to-end sandbox spec**

Assert one signed successful callback creates one payment and processed event; the same callback replay changes neither count; an altered amount is quarantined with zero payment; an out-of-order callback cannot move a paid transaction; cross-organization reads return nothing.

- [ ] **Step 6: Run webhook, concurrency, and E2E gates**

```powershell
npx vitest run tests/payments/process-event.test.ts tests/payments/event-envelope.test.ts tests/record-online-payment-concurrency.integration.test.ts --maxWorkers=1
npx playwright test tests/e2e/owner-portal-online-payment-fawry.spec.ts
npx tsc --noEmit
```

Expected: all tests pass; the E2E fixture cleans up.

- [ ] **Step 7: Commit the durable webhook path**

```powershell
git add lib/payments app/api/webhooks tests
git commit -m "feat(payments): process Fawry callbacks through a durable inbox"
```

---

### Task 5: Retry sweep and concurrency regression gate

**Files:**
- Create: `app/api/cron/payment-events/route.ts`
- Create: `.github/workflows/payment-events.yml`
- Create: `tests/payment-events-cron.test.ts`
- Modify: `tests/record-online-payment-concurrency.integration.test.ts`
- Modify: `lib/env/server.ts`

**Interfaces:**
- Consumes: `claim_online_payment_events(limit)` and `processPaymentEvent(eventId)`.
- Produces: authenticated `POST /api/cron/payment-events` returning `{ claimed, processed, idempotent, quarantined, retryable, failed }`.

- [ ] **Step 1: Write failing cron/security tests**

Assert missing/wrong bearer secret returns `401`, unavailable deployment secret returns `503`, a valid request caps the batch size, and the response exposes counts but no event payloads or provider messages.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run tests/payment-events-cron.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the bounded retry route and workflow**

Follow `app/api/cron/lease-expiry/route.ts` and `.github/workflows/lease-expiry.yml` for constant-time secret checking, `CRON_SECRET`, timeout, permissions, and failure semantics. Claim at most 50 due events per run and process sequentially or with a small fixed concurrency that cannot exhaust database connections.

- [ ] **Step 4: Add the manual/online race regression**

Race a staff `record_payment` call against processing a successful online event for the same due. Assert total allocations never exceed the due, both journal entries remain balanced when both receipts legitimately exist, and any excess is retained as unallocated credit according to the existing contract.

- [ ] **Step 5: Run cron and concurrency gates**

```powershell
npx vitest run tests/payment-events-cron.test.ts tests/record-online-payment-concurrency.integration.test.ts --maxWorkers=1
npx tsc --noEmit
npx eslint "app/api/cron/payment-events/route.ts"
```

Expected: PASS.

- [ ] **Step 6: Commit retry automation**

```powershell
git add app/api/cron/payment-events .github/workflows/payment-events.yml tests lib/env/server.ts
git commit -m "feat(payments): retry durable provider events"
```

---

### Task 6: Honest readiness UX and bilingual operational states

**Files:**
- Modify: `app/[locale]/(app)/finance/payment-providers/page.tsx`
- Modify: `app/[locale]/(app)/finance/payment-providers/payment-provider-forms.tsx`
- Modify: `app/[locale]/portal/(member)/payments/portal-payments-client.tsx`
- Create: `tests/payment-provider-readiness-ui.test.ts`
- Create: `tests/e2e/fawry-production-foundation.spec.ts`

**Interfaces:**
- Consumes: safe provider settings readiness fields and transaction/event status projections.
- Produces: no new mutation surface; this task renders existing guarded actions and safe status.

- [ ] **Step 1: Write failing static UI tests**

Assert the settings page distinguishes `Connectivity checked` from `Production transaction verified`, displays sandbox/production and pilot eligibility, and never claims Fawry credentials are valid from a bare-host reachability probe. Assert portal copy provides a support path for quarantined/aged pending attempts without exposing provider payloads.

- [ ] **Step 2: Run the UI test and verify failure**

Run: `npx vitest run tests/payment-provider-readiness-ui.test.ts`

Expected: FAIL on missing readiness labels and pilot state.

- [ ] **Step 3: Implement localized readiness and transaction states**

Add Arabic/English copy for: sandbox only, production pilot eligible/ineligible, connectivity checked, controlled transaction required, pending provider confirmation, payment posted, expired, failed safely, under review, and contact support. Do not add refund UI in P10.1.

- [ ] **Step 4: Add browser coverage**

Use sandbox fixtures only. Verify English desktop and Arabic mobile: eligible dues → Fawry CTA → pending/posted history, production settings outside the allowlist remain blocked, no horizontal overflow, accessible headings/buttons, and no console errors. Do not call a real Fawry endpoint from CI.

- [ ] **Step 5: Run UI and browser gates**

```powershell
npx vitest run tests/payment-provider-readiness-ui.test.ts
npx playwright test tests/e2e/fawry-production-foundation.spec.ts
npx tsc --noEmit
npx eslint "app/[locale]/(app)/finance/payment-providers/page.tsx" "app/[locale]/(app)/finance/payment-providers/payment-provider-forms.tsx" "app/[locale]/portal/(member)/payments/portal-payments-client.tsx"
```

Expected: PASS with no new warnings or browser console errors.

- [ ] **Step 6: Commit the readiness UX**

```powershell
git add app tests
git commit -m "feat(payments): expose Fawry pilot readiness safely"
```

---

### Task 7: Pilot runbook, full verification, review, and release boundary

**Files:**
- Create: `docs/runbooks/fawry-production-pilot.md`
- Modify: issue #48 only after evidence exists.

**Interfaces:**
- Consumes: all P10.1 tasks.
- Produces: an auditable go/no-go checklist; no production enablement by documentation alone.

- [ ] **Step 1: Write the runbook with exact preflight and rollback checks**

Include: merchant contract/document versions; production endpoints; Vault secret rotation; organization/property/settings ids; clearing account; pilot allowlist; callback URL; controlled low-value scenarios; expected receipt/journal/event evidence; dashboards/alerts; disabling the provider; removing allowlist eligibility; incident contacts; and evidence retention. Explicitly state that production secrets are entered only through approved secret/Vault paths and never committed or pasted into issues.

- [ ] **Step 2: Run the complete local database and application gate**

```powershell
npx supabase db reset
npx vitest run tests/online-payment-production-foundation-migration.test.ts tests/online-payment-production-foundation-rls.integration.test.ts tests/payment-events-cron.test.ts tests/payment-provider-readiness-ui.test.ts tests/payments tests/record-online-payment-concurrency.integration.test.ts --maxWorkers=1
npx playwright test tests/e2e/owner-portal-online-payment-fawry.spec.ts tests/e2e/fawry-production-foundation.spec.ts
npx tsc --noEmit
npm run build:next
git diff --check
```

Expected: every command succeeds. Scoped ESLint runs on every changed TS/TSX file; no new warnings are accepted.

- [ ] **Step 3: Request independent branch review**

Review specifically: secret boundaries, SECURITY DEFINER authorization, pilot fail-closed behavior, webhook acknowledgment semantics, event claiming concurrency, amount/currency/merchant matching, manual-payment race, and journal balance.

- [ ] **Step 4: Fix every blocker and rerun the affected plus full gates**

Do not waive P0/P1 findings. A changed migration requires a fresh database reset and all database gates.

- [ ] **Step 5: Open a draft PR with evidence and explicit non-goals**

The PR states: Fawry only, refund/settlement not yet included, no organization enabled, no production secret added, no production database migration applied. Attach command results and reviewer outcome.

- [ ] **Step 6: Merge and deploy only after CI and preview pass**

Watch Cloudflare build/deploy and route smoke checks. Apply the reviewed migration through the normal production migration path, verify local/remote migration history alignment, and keep the production allowlist empty unless the owner separately supplies the pilot organization and real Fawry onboarding is complete.

- [ ] **Step 7: Update roadmap evidence**

Mark only P10.1 foundation complete. Leave refund, settlement, pilot execution, and general availability unchecked until their own plans and evidence pass.
