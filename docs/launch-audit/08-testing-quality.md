# 08 — Testing & Quality

## 1. Validation commands run in this session (commit `a91d809`)

| Command | Result | Notes |
|---|---|---|
| `npm ci` (npm 10.9.7) | **FAIL** `EUSAGE` — lockfile out of sync (`@swc/helpers`) | Matches the trap documented in `deploy.yml`; CI installs npm 11 first |
| `npx npm@11 ci` | PASS | 648 packages |
| `npx tsc --noEmit` | PASS (exit 0) | `tests/` excluded by `tsconfig.json` |
| `npx eslint .` | **FAIL** — 3,771 problems (162 errors, 3,609 warnings) | Errors: 84 `no-explicit-any`, 16 `require()` imports, 14 "components created during render", 10 refs-during-render, 10 setState-in-effect, 8 `@ts-nocheck` (all in tests), 6 impure-render, 5 unescaped entities |
| `vitest run` on credential-free suites (16 files) | 13 pass / **3 fail**; 146 tests pass, 11 skipped | Failing: `tests/payments/resolve-credentials`, `payment-provider-settings-reverify`, `payment-provider-verification-race` — they are labelled "real Supabase, no mocks" and need `.env.local` |
| `npx opennextjs-cloudflare build` | PASS | 180 static pages; worker saved |
| `npx wrangler deploy --dry-run` | PASS | **Total upload 21,501 KiB / gzip 4,265.87 KiB**; one binding (`ASSETS`) |
| `npm run test:all` / E2E / pgTAP | **NOT RUN** | Require the production Supabase service-role key and a running app; running them creates and deletes rows in production (see QA-07) |
| GitHub Actions `deploy.yml` | last 6 runs on master: success | Production is deployed from `a91d809` |
| GitHub Actions `lease-rent.yml`, `alert-digest.yml` | 16 and 19 runs, all "success" | Every run exits early: `CRON_SECRET is not set; no rent was generated` (verified in job logs) |

## 2. Runners and environment
| Runner | Config | Env required | Notes |
|---|---|---|---|
| vitest | `vitest.config.ts` (30 s timeout, no setup, no env gating) | Integration files load `.env.local` and need `NEXT_PUBLIC_SUPABASE_URL`, anon key, `SUPABASE_SERVICE_ROLE_KEY` (+ `DEMO_*`, `FAWRY_*`/`PAYMOB_*`, `GEMINI_API_KEY`) | No `describe.skipIf`; without `.env.local` every integration file crashes instead of skipping |
| Playwright | `playwright.config.ts` (`tests/e2e`, base URL `:3100`, workers=1) | Running app + service-role key to the same project; `@playwright/test` is a devDependency | Specs create/delete auth users (78 / 52 call sites) |
| SQL scripts | `supabase/tests/*.sql` | Pasted into the SQL editor by hand | Not wired to any npm script; headers say so |
| CI | `.github/workflows/deploy.yml` | — | Runs **zero** tests by explicit decision |

## 3. Inventory (classification: U unit · I integration/live DB · M manual · E Playwright · S SQL script · F fixture)
| File | Type | What it asserts | Weakness |
|---|---|---|---|
| `backup-hashing`, `backup-restore-target-guard`, `backup-storage-completeness`, `backup-table-classification`, `backup-verification-gates` | U | pure decision logic of `lib/backup/*`; prod ref hard-denied as restore target | table count (104) asserted against itself |
| `demo-lead-qualification`, `pricing-calculations`, `payment-permission-key-guard`, `migration-directory-guard` | U | zod allow-lists; discount math; source grep; migration dir allowlist + hashes | file-system only |
| `payments/fawry-adapter`, `paymob-adapter`, `provider-contract`, `webhook-handler` | U | status mapping, HMAC, redaction, 401 on bad signature, uniform 200 on unknown ref; documents that replay is not deduped at route level | good |
| `payments/resolve-credentials`, `payment-provider-settings-reverify`, `payment-provider-verification-race` | I | tenant creds precedence; re-verify on merchant change; stale probe race | need live DB |
| `ai-certification.eval` | I (Gemini) | dataset sizes; provenance `deploymentSha` defined | always true (hard-coded fallback `"c2e4770"`) |
| `chart-of-accounts-rls` | I | ACCOUNTANT blocked; **cross-org owner cannot read/modify COA** | one of two TS cross-tenant tests |
| `credit-notes`, `buyer-identity`, `einvoice-*` (3), `exchange-rates`, `fixed-assets`, `fixed-asset-disposal`, `fx-difference`, `input-tax`, `output-vat`, `project-wip`, `purchasing-invoice-vat-wht`, `supplier-invoice-fx`, `revenue-classification`, `tax-decision-contract`, `tax-enforcement`, `tax-mapping-review`, `dunning` | I | domain invariants (balanced lines, refusals by role, immutability, org isolation for tax objects) | good depth for tax/FX/assets |
| `member-opening-balance`, `member-portal-invitation`, `demo-entry-rate-limit`, `demo-principal-capability` | I | equity posting; invitation lifecycle; rate limit; demo has zero write capability | |
| `onboarding.integration` | I | `authenticated` cannot call `create_organization_onboarding`; service_role can | no retry/idempotency/partial-failure |
| `record-online-payment-concurrency` | I | two concurrent webhooks → one payment | **only concurrency test** |
| `security-function-grants` | I | anon executes nothing; internals revoked; SECDEF set == allowlist | allowlist stale (SEC-03) |
| `pgtap.integration` | I | test 1 unbalanced entry; tests 2-5 insert an org and assert `org.id` defined; tests 6-18 property_id-rename regressions; test 15 **asserts the `void_payment` bug** (expects 23514); hard-deletes audit rows via service role (:2607-2618) | misleading name |
| `pilot-rehearsal.manual`, `sandbox-pilot.manual` | M | tax-enforcement runbook | |
| `e2e/*` (30 specs) | E | permission gates, invite flow, portal isolation, Fawry 8 scenarios (dup webhook, RLS, cross-resort refused), einvoice settings isolation, responsive public pages, production gate (targets prod host) | several rendering/row-count only (`finance-screens-show-their-data`, `new-finance-screens-smoke`, `enterprise-suite-pillars`, `reports-suite-flow`); `admin-team-invite-flow.spec.ts:106` role-change block is `if (isVisible())`-guarded and cannot fail |
| `supabase/tests/phase3..7_*.sql`, `*_with_financials_integrity.sql`, `phase_owner_portal_*.sql` (7), `phase_payment_provider_settings.sql` | S | journal balance/immutability/reversal statuses, receivables waterfall, cashier lifecycle, expense engine, trial balance totals, view arithmetic + `security_invoker`, portal RLS/concurrency | manual; phase3 does not check the trial balance after reversal; hard-code real UUIDs |
| `supabase/tests/add_self_to_org.sql`, `separate_test_accounts.sql` | F | production data mutation scripts (make a personal account TENANT_OWNER) | not tests |

## 4. Critical gap analysis
| Area | Covered? | Evidence |
|---|---|---|
| Cross-tenant isolation | Partial: COA, e-invoice profiles, tax mapping/enforcement, demo, portal (E2E). **No staff-session test that dues/payments/journals/members/units of org B are invisible to org A.** | `pgtap.integration` never asserts a second org is invisible |
| Double-entry equality | manual SQL only (phase3 T1, phase7 Dr=Cr); no automated assertion per posting RPC | |
| Duplicate payment/due submission | not covered; structurally impossible to dedupe from UI (per-request key, `receivables.ts`) | QA-04 |
| Double / concurrent reversal | not covered; `reverse_journal_entry` reads the original without `FOR UPDATE` or advisory lock | QA-03 |
| Reversal nets to zero in reports | not covered — and it does not (ACC-02) | |
| Concurrent posting | only `record_online_payment` | |
| Onboarding retry | not covered | |
| Authorization failures on finance RPCs | reasonably covered ("refuses CASHIER/reader") | |
| Role escalation | **not covered**; the one E2E cannot fail | QA-05 / SEC-01 |
| Cashier reconciliation | manual SQL only; `reconcile_cashier_session` has no app caller | |
| Refund/reversal of receipts | test enshrines the failure | QA-01 |
| Tax enforcement, opening balances | well covered | |
| Migration drift (ledger vs files) | file-system only; nothing queries the ledger | QA-06 |
| Destructive financial editing | no app path; tests themselves run 442 `.delete()` and 52 `auth.admin.deleteUser` against the configured project | QA-07 |

## 5. Findings
| ID | Sev | Finding |
|---|---|---|
| QA-01 | **P0** | Payment void path is dead and the suite enshrines it: `pgtap.integration.test.ts:2566-2574` expects `23514`; fixing ACC-01 will fail this test unless it is rewritten. Add positive void tests (balance, aging, TB return to pre-payment values). |
| QA-05 | **P0** | Role escalation (SEC-01) has no permission check, no audit row, and no test that can fail. Add a negative integration test as CASHIER. |
| QA-02 | P1 | `pgtap.integration` tests 2-5 ("Receivables", "Treasury", "Purchasing", "Reports & Audit Chain") are placeholders (`:163-226`: insert org, expect id, archive). `npm run test:sql` is green while those invariants are unverified. |
| QA-03 | P1 | No double/concurrent reversal test; add `FOR UPDATE` + partial unique index on `reversed_entry_id` + two-client test. |
| QA-04 | P1 | Server-generated idempotency key makes the DB replay branch unreachable; no test submits the same form twice. |
| QA-07 | P1 | Integration/E2E suites run against production with the service role and hard-delete rows (`deploy.yml` comment; `docs/security-remediation-2026-08-20.md` §7; `pgtap.integration:2607-2618` deletes `financial_audit_logs`, breaking chain semantics; `separate_test_accounts.sql` rewires a personal account). `test:all` is therefore effectively never run and ~30 integration files decay silently. Point tests at a Supabase branch/local stack, fail fast if the host equals the production ref (reuse `lib/backup/restore-target-guard.ts`), run on PRs. |
| QA-06 | P2 | Migration guard is file-only; `supabase/migrations/README.md` stale. Add a nightly ledger-vs-files comparison. |
| QA-08 | P2 | AI certification test has an always-true provenance assertion and needs a live Gemini key. |
| QA-09 | P2 | ESLint: 162 errors on master; no lint gate in CI. |
| QA-10 | P2 | No CI test stage at all; PRs are merged on green *deploy* only. |
| QA-11 | P3 | Rendering-only E2E specs give false confidence (`finance-screens-show-their-data`, `new-finance-screens-smoke`, `enterprise-suite-pillars`, `reports-suite-flow`); responsive specs cover public pages only (WF-10). |
