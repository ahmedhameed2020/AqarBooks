# AqarBooks V1 — local implementation and verification, 9 October 2026

## Scope and significant exception

The user approved limited local source changes, isolated tests, store preparation and a Data safety draft. No push, deployment, production migration, AAB build/upload, Console replacement or final review submission was performed.

**A live-test scope violation occurred.** A delegated command mistakenly included `tests/payments/resolve-credentials.test.ts`, which loads `.env.local` and writes to the configured Supabase project. Its setup created two fictional organizations, a fictional property, role templates, a synthetic Auth user and a role assignment. Provider-settings attempts failed. Archive attempts ran but their outcome is unverified. No real payment was observed. See `GOOGLE_PLAY_LOCAL_TEST_SCOPE_INCIDENT_2026-10-09.md` for the precise evidence and limits. No further live query or cleanup was performed after discovery. A narrow read-only impact check is awaiting user approval. Therefore this work cannot be described as having made no database changes.

## Implemented files

| Area | Files | Result |
|---|---|---|
| Flutter | `mobile/lib/data/repository.dart`, `mobile/lib/screens/resident_screens.dart` | Settings return null; checkout rejects before network access, including previous request IDs. Home/dues CTAs removed. Legacy Fawry route gives administrative collection instructions only. Dues, history, receipts and administrative collection paths retained. |
| Web | `lib/payments/fawry-initiation-policy.ts`, `lib/actions/online-payment-checkout.ts`, `lib/payments/providers/fawry.ts` | Immutable V1 deny policy at action and provider initiation boundaries, before credentials/RPC/provider network calls. No environment flag can enable it. |
| Database proposal | `supabase/proposals/fawry_v1_initiation_denial.sql` | Outside migrations. Denies new checkout and replay, Fawry reference finalization, direct inserts/identity changes. ALWAYS trigger protects against ordinary service-role and replica-mode DML. Freezes terminal status and existing payment linkage/timestamp. First settlement and reading existing transactions remain allowed. Other-provider behavior is retained. Executed only in temporary synthetic PGlite. |
| Tests | `mobile/test/fawry_v1_test.dart`, `mobile/test/widget_test.dart`, `tests/payments/fawry-initiation.test.ts`, `tests/payments/fawry-v1-sql-proposal.test.ts`, `tests/payments/fawry-adapter.test.ts` | Denial, no network, no old-reference initiation, history/receipt availability, permissions/direct writes and settlement compatibility. Legacy adapter tests explicitly mock the policy enabled to preserve pre-existing wire/signature checks; the new suite tests the actual immutable deny policy. |
| Store | `mobile/docs/GOOGLE_PLAY_RELEASE.md`, `mobile/test/store_v1_capture_test.dart`, `mobile/store-assets/screenshots/v1-candidate/ar/` | Arabic/English Fawry claims removed from local description/release notes. Receipt screenshot candidate uses actual Flutter ReceiptDetailScreen and fictional data; dues candidate uses actual PaymentsTabScreen without Fawry. Originals retained. |
| Data safety | `mobile/docs/GOOGLE_PLAY_DATA_SAFETY_DRAFT_V1_2026-10-09.md` | Evidence-based candidate answers and unresolved sharing/SDK/contract questions; no final declaration saved. |

## Verification

| Command/check | Result |
|---|---|
| `flutter test --no-pub test/fawry_v1_test.dart test/collector_login_test.dart test/owner_portal_test.dart test/widget_test.dart --reporter expanded` | 66 passed, 0 failed, 0 skipped. |
| `flutter test --no-pub test/fawry_v1_test.dart --reporter expanded` after minimizing formatting and removing unused import | 4 passed, 0 failed, 0 skipped. |
| `flutter analyze --no-pub lib/data/repository.dart lib/screens/resident_screens.dart test/fawry_v1_test.dart test/store_v1_capture_test.dart test/widget_test.dart` | Exit 0, no issues. Capture test subsequently gained dues capture; final opt-in capture compiled and passed. |
| `flutter test --no-pub --dart-define=CAPTURE_STORE_V1=true test/store_v1_capture_test.dart --reporter expanded` | Final capture: 1 passed, 0 failed, 0 skipped. Actual widget rendering, not an Android/Play-installed capture. Normal runs skip this opt-in file. |
| `npx vitest run tests/payments/fawry-initiation.test.ts tests/payments/fawry-v1-sql-proposal.test.ts tests/payments/fawry-adapter.test.ts tests/payments/webhook-handler.test.ts tests/payments/process-event.test.ts` | Final isolated suite: 5 files, 55 passed, 0 failed, 0 skipped. Mock/in-memory only. |
| Targeted ESLint, `npx tsc --noEmit --pretty false`, focused diff/whitespace checks | Exit 0. SQL-only hardening followed typecheck; its synthetic tests and focused ESLint passed. |
| `graft build` | Exit 0; local graph refreshed. |

Earlier red Flutter checks exposed expected pre-change failures plus a fake-network response/timer harness problem and a dangling-else syntax error. These were corrected and affected checks passed. The live test command had 57 tests, 53 passed and 4 failed; it is not counted as successful isolated verification. Its failures were provider permissions/missing test environment configuration, separate from the unauthorized execution scope. No live retry was attempted.

## Acceptance criteria and independent review

- Local Flutter initiation denial: demonstrated, including configured settings and a reused request ID.
- Local web initiation denial: demonstrated at both action and provider boundaries.
- SQL proposal: denies initiation, previous-reference finalization and direct-write bypass in synthetic origin/replica modes; permits first settlement and retains readable reference.
- Administrative UI, dues/history/receipt checks: passed. Actual administrative ledger integration against an isolated full database and Play-installed runtime was not run.
- Webhook/settlement source was preserved; mock tests passed. This does not certify all historical settlements in production.
- Independent Flutter review found no BLOCKER/IMPORTANT in local changes. Independent SQL review identified a terminal-status/payment-linkage weakness; it was fixed and retested.
- Source review notes a pre-existing `process-event.ts` behavior: an RPC response may be marked PROCESSED without checking its returned settlement status. This remains outside initiation disablement scope and needs separate investigation before asserting complete settlement correctness.

## Remaining risks and gates

1. The live-test incident needs authorized impact verification and a separately approved remediation plan.
2. Production backend/database and the old signed AAB are unchanged by the intended disablement. Old clients/direct RPC may still initiate Fawry. Do not ship a Flutter-only change as a complete production payment block.
3. Applying the SQL proposal would affect current web/direct-client Fawry initiation. Actual production usage, installed function signatures and pending transaction impact are unverified. Stop for explicit approval before any deployment/migration.
4. Owner/superuser DDL can disable/drop triggers; the proposal protects ordinary DML, not an unrestricted database owner.
5. Screenshot candidates are 1080×2400 actual-widget renderings with fictional data, not final Play-installed captures. Existing Console assets still include Fawry. The eight-image set must be recaptured/reviewed against approved V1 before replacement; in particular old image 02 and image 03 are unsuitable.
6. ML Kit barcode scanning 17.3.0 and DataTransport disclosures need version-specific runtime verification. Official documentation's current-version behavior cannot automatically establish this binary's telemetry. Provider sharing/service-provider exceptions, role optionality, deletion and end-to-end encryption answers remain conditional in the draft.
7. Financial features, Data safety, App access accounts and IARC remain pending their factual/legal approvals. No secrets are included in reports or screenshots.

## Rollback

- No intended deployment rollback is needed because source/security proposal changes were not deployed. The live-test incident is separate and must not be cleaned up without approval.
- Revert only the listed local code hunks/new policy and tests; do not reset the working tree or overwrite unrelated user work. Restore removed Flutter CTA/provider/checkout implementation only if deliberately re-enabling the deferred feature.
- The SQL proposal is not in the migration directory. Do not apply it or an inverse script during rollback. If deployment is later approved, capture exact pre-change function definitions, grants/triggers and prepare a reviewed inverse transaction first. Re-enabling initiation requires commercial approval, not automatic rollback.
- Preserve original store assets. Discard candidates or restore only the edited store text passages; `GOOGLE_PLAY_RELEASE.md` already had unrelated user edits.
- Keep audit/incident evidence available even if implementation code is reverted.
