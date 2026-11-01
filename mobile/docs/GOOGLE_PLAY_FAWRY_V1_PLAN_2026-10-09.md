# AqarBooks — Fawry V1 disablement plan

**Current status:** The user subsequently approved limited local execution on 9 October 2026. See GOOGLE_PLAY_FAWRY_V1_IMPLEMENTATION_2026-10-09.md for implemented changes, verification, the live-test incident, and remaining approval gates. The original planning text below is historical; no backend deployment, production migration, AAB build or Play replacement is authorized.

Read-only source audit, 9 October 2026. This document proposes changes; it does not authorize or implement them. No runtime code, configuration, database, deployment, or AAB was changed. The user confirms no active commercial Fawry agreement. Source findings do not prove deployed behavior or the contents of the current signed AAB.

## Revised scope requested by the user — approval pending

The user chose plan revision, not implementation. No push, deploy, database migration execution, production setting/data change, AAB rebuild, or Play upload is authorized. Local source/test changes may start only after this revised plan is approved. Database changes below remain a design proposal; no migration is executed locally or remotely under the current scope.

| Area | Minimal proposed change | Boundary and risk |
|---|---|---|
| Flutter | Disable the two Fawry entry points and prevent route-driven checkout for V1; reuse collector/office instructions. Retain dues, history, record_payment, receipt and other roles. | UI alone cannot protect old clients or direct RPC. Verify feature behavior and no accidental collection regression. |
| Web | First inspect actual use/consumer scope without modifying it. Prepare an initiation-only guard and consistent availability message if approved; do not broadly disable shared credential resolution, webhook or cron. | The action can make real provider calls if production prerequisites are satisfied. A global guard affects current web users; that impact must be reviewed before enabling it. Current use/pending transactions are unknown. |
| Database | Propose a default-deny initiation guard before replay/insert plus production reference-finalization/direct-write coverage. Keep schema/function contracts, ledger data and administrative record_payment unchanged where possible. | Affects direct RPC and old clients, potentially web initiation. SECURITY DEFINER/service_role paths and existing overloads require review. No data update/delete, migration execution or production change now. |

### Impact gate before any backend change

Obtain authorized read-only evidence of deployed functions/overloads, pilot/settings metadata, web usage, privileged writers and counts/status of existing online transactions without exposing customer rows or secrets. The available connector currently lacks the matching AqarBooks project. Review the evidence with the user and approve the exact affected web behavior. Do not assume Fawry is unused merely because no active commercial agreement exists.

If web initiation must remain active, do not pretend a UI/mobile flag enforces safe server denial: web and Flutter share the checkout RPC. A trusted scope design would need separate approval and tests. V1 release remains blocked until server protection and any web impact are resolved.

### Local verification before permission to rebuild

Use mocks and an isolated non-production database only if approved for test setup. Prove denial before replay/insert/finalization, no provider request, tenant/environment integrity, both mobile entry points absent, and retained dues/history/collector receipts. Prove webhook signatures/idempotency and approved prior settlement behavior. Report exact tests/results; no real payment or customer data. No AAB rebuild until these checks pass and separate permission is obtained.

### Rollback proposal

Keep changes in a focused local patch/commit without push; revert only those changes if rejected, preserving unrelated working-tree edits. Preserve existing migration/function definitions and accounting records for later review. Any eventual production rollout must first include a reviewed restoration script for changed function definitions/policy, deployed version references and observability. Execute no rollback migration now.

Rollback must not silently re-enable Fawry payment without a commercial agreement. Prefer keeping initiation denied while repairing UI/settlement regressions, or pausing release; preserve prior records and settlement controls. Re-enabling initiation requires a separate explicit decision and evidence. No transaction deletion or financial rewriting is part of rollback.

## Acceptance criteria

1. V1 cannot initiate production online payment, charge a provider, issue/finalize a new production reference, or return a previous production checkout reference through retry/replay. An old client invoking the RPC directly must also be denied.
2. Dues, payment history, ordinary collector/office collection, allocation and receipts remain available with existing permissions and accounting controls.
3. Existing production obligations, if any, are identified read-only and resolved by an approved settlement plan. No deletion of transactions, allocations, references, events, credentials, or audit history.
4. All applicable protections are verified on the deployed backend and on the final Play artifact. No security bypass, real payment test, client-held server secret, or assertion of contract exemption.

## Source inventory

| Path | Evidence | Consequence |
|---|---|---|
| `mobile/lib/data/repository.dart:1368–1375` | Selects first FAWRY setting with enabled=true; no explicit environment/status/verified_at/property filter here | UI availability is not a trustworthy global policy; RLS may restrict rows, but deployed policy must be checked |
| `mobile/lib/screens/resident_screens.dart:508–536,868–961` | Two Fawry entry points | Both must be unavailable in V1 |
| `mobile/lib/data/repository.dart:1378–1399` | Calls checkout SQL RPC directly with client-supplied setting/environment | Web-server allowlist alone cannot protect old mobile clients |
| `mobile/lib/screens/resident_screens.dart:1017–1027,1086–1133` | Opening screen initiates checkout; displays reference and says code ready | New RPC result has null reference, mapped to an em dash; screen wording does not prove a usable provider code |
| `mobile/lib/screens/resident_screens.dart:768–838` | Dues remain; absent setting shows collector/office payment instruction | Reuse existing administrative payment explanation |
| `mobile/lib/data/repository.dart:1628–1680` | Collection uses separate record_payment RPC | Do not disable or repurpose this path |
| `app/[locale]/portal/(member)/dues/dues-checkout.tsx:129–151` | handlePay calls createOnlinePaymentCheckoutAction | Web caller also needs availability/message alignment |
| `lib/actions/online-payment-checkout.ts:31–110,120–156` | Auth/scope validation, credential selection, SQL checkout, provider charge, reference finalization | Early deny before credential access or mutation; guard provider call independently |
| `lib/payments/providers/fawry.ts:142–178` | POST to Fawry charge endpoint using credentials.baseUrl | Provider boundary requires a trusted initiation guard, independent of UI |
| `lib/payments/resolve-credentials.ts:55–88,121–157` | Server Pilot allowlist and enabled/verified scoped setting | Existing controls are conditional, not proof of commercial-contract default-deny |
| `lib/env/server.ts:15–28` | PAYMENTS_PRODUCTION_PILOT_ORGANIZATION_IDS defaults empty; production URL defaults empty | Local defaults do not establish production values |
| `lib/payments/resolve-credentials.ts:207–283` | Legacy resolver/fallback; graph shows tests as callers, not production callers | Include adapter defense; no blanket proof that graph exhausts dynamic consumers |
| `app/api/webhooks/fawry/route.ts:1–4`; `lib/payments/webhook-handler.ts:21–48` | Webhook uses same scoped credential resolver, then signature verification | A blanket resolver/settings shutdown can interrupt legitimate prior settlement |
| `app/api/cron/payment-events/route.ts:16–47`; `lib/payments/process-event.ts:112–120` | Retries events and records online payments | Preserve approved settlement processing and idempotency |

SQL evidence is in `supabase/migrations/20260924072325_online_payment_production_foundation.sql`:

- Lines 344–426: SECURITY DEFINER checkout validates portal membership, dues ownership/scope, active organization, matching enabled verified settings.
- Lines 429–435: production requires a valid row in online_payment_production_pilots. This is independent of the web environment allowlist.
- Lines 437–456: replay can return an existing provider_reference.
- Lines 466–480: creates transaction/allocations; returns null reference for new checkout. No provider charge takes place within this inspected RPC.
- Lines 319–339: mark_online_payment_checkout_created writes reference; no global production initiation guard.
- Lines 489–497: finalization is service_role-only; checkout is callable by authenticated and service_role. The service_role remains a privileged boundary requiring explicit policy and direct-write coverage.

Settings/secrets referenced by name only: PAYMENTS_PRODUCTION_PILOT_ORGANIZATION_IDS, FAWRY_PRODUCTION_BASE_URL, FAWRY_MERCHANT_CODE, FAWRY_SECURE_KEY, FAWRY_BASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, and Vault secret references in payment_provider_settings. No values were retrieved for this audit.

## Proposed implementation after explicit approval

1. Define one trusted server/database policy that defaults to deny production initiation for V1. If sandbox remains, restrict it to an isolated test organization; do not render sandbox as a real customer payment route.
2. Add the database denial inside checkout before replay lookup/return and before inserts. Preserve authentication/scope checks and existing signatures/contracts where practical. Check all deployed overloads, grants, and callers; do not assume the local migration history equals production.
3. Deny in the web action before credential selection/RPC. Deny at the Fawry adapter before outbound charge. Make environment trustworthy at this boundary: currently ProviderCredentials supplies baseUrl rather than a clear immutable environment; do not infer safety from arbitrary client input or URL string alone. Bind environment from verified server transaction/settings or prevent all V1 Fawry charge initiation.
4. Deny production reference finalization in the database. Enumerate direct writes, relevant grants, triggers, privileged workers and service_role consumers before selecting enforcement. RLS alone cannot constrain bypassrls/service_role. A narrowly scoped trigger/policy or reduced privileged write surface may be needed; design it without blocking verified prior webhook reconciliation. Do not revoke broad table/function access that ordinary collection depends on.
5. Separate initiation permission from settlement credential resolution. Do not put a global deny into the shared resolver without assessing webhook effects. If pending production transactions exist, approve a narrowly bounded authenticated, signed, idempotent settlement workflow first. Keep original records/credentials needed for verified prior obligations; do not issue new references.
6. Disable both Flutter entry points, prevent route-driven checkout calls, and render existing collector/office instruction. Preserve dues/history/record_payment and their permissions. An old AAB must be blocked by the server even if UI is cached.
7. Update final store descriptions/screenshots to match V1. Obtain approval before rebuilding/replacing the AAB, then verify the actual Play-installed artifact.

## Focused verification plan

- DB denial with enabled verified production setting plus valid Pilot, authenticated owner, service_role-mediated owner context, direct RPC, and every deployed overload: no new transaction/allocations or reference returned.
- Existing client_request_id with stored production reference: deny without returning it. Check policy ordering before replay.
- Reference finalization and direct privileged write paths: no new production reference through approved initiation boundaries; verify no accidental settlement failure.
- Action/adapter: no credential retrieval, RPC mutation or outbound Charge when denied; scope/environment cannot be forged; no legacy fallback can reach real charge.
- Flutter/web: both entry points unavailable, no checkout invocation, correct administrative payment message; history, dues, collector/office collection, allocations and receipts still work.
- Webhook/cron: existing signed settlement, invalid signatures, duplicate events and retries retain approved behavior without generating a new reference. No real charge test.
- Test the final Play-installed AAB and an old client against deployed denial. Source-only tests do not establish installed binary behavior.

Existing candidate suites: mobile/test/owner_portal_test.dart; mobile/test/widget_test.dart; tests/payments/fawry-adapter.test.ts; tests/payments/resolve-credentials.test.ts; tests/payments/webhook-handler.test.ts; tests/e2e/owner-portal-online-payment-fawry.spec.ts; tests/security-function-grants.integration.test.ts. Tests were not run: this task changed documentation only, and implementation is not authorized.

## Adversarial review and production evidence still needed

- BLOCKER before release: no verification of deployed SQL, settings/Pilot rows, web environment or current signed AAB contents. The connected Supabase account lists no matching AqarBooks project. No database query was performed.
- IMPORTANT: simply emptying the web allowlist misses direct mobile RPC; simply hiding UI misses old clients; simply disabling settings can break prior webhook credential resolution; simply blocking new inserts misses replay/reference finalization.
- IMPORTANT: a service-role-only function is not itself proof of global denial. Inventory privileged writes, transaction/event consumers and deployed overloads before claiming all paths covered.
- IMPORTANT: source and signed AAB may differ; record build provenance/hash, entry point/backend configuration and verify installed Play release without exposing keys. A production backend guard is required even with a replacement AAB.
- IMPORTANT: current mobile code can show an em dash as a ready reference after creating a pending transaction. Do not advertise that flow as operational Fawry payment.
- Source inventory covers indexed callers plus inspected unindexed SQL. Dynamic/unindexed/deployed consumers remain an explicit verification requirement; no claim that every runtime caller has been proven.

Graft reported 489,383 tokens saved for the source audit (13 calls with savings; two additional no-result calls). No dollar estimate was supplied.
