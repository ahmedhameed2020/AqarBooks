# 11 — Remediation Plan

Ordered by dependency, not only severity. Nothing here has been implemented; this is the proposed program. Each item: finding, dependency, risk if skipped, implementation direction, tests required, verification criteria.

## Wave 0 — Immediate P0 blockers (before any external user, including demo visitors)

| # | Finding | Depends on | Risk | Direction | Tests required | Verified when |
|---|---|---|---|---|---|---|
| 0.1 | SEC-01 / SEC-02 / SEC-04 / SEC-05 / OBS-02 — tenant admin actions | — | Platform takeover from any tenant or demo session | In `lib/actions/users.ts`, `roles.ts`, `tenant.ts`: require `has_permission(uid, org, 'tenant.users.manage' / 'tenant.roles.manage')` with active membership; verify `role.organization_id === organizationId` and reject `is_system`/platform roles; forbid self-target; call `denyIfDemo`; move invite creation after the permission check; write `platform_audit_logs`. Harden `is_platform_admin` to `ura.organization_id IS NULL`; add a CHECK/trigger forbidding platform roles in org-scoped assignments. Query production for existing platform-role rows with non-null org. | Negative integration tests as CASHIER/AUDITOR for all six actions; pgTAP for the constraint; E2E role change that can fail | Tests green; production query returns 0 rows |
| 0.2 | ACC-02 / RPT-01 — reversal double-count | — | Every financial report wrong after the first reversal | Change the ~16 `je.status = 'POSTED'` predicates to `in ('POSTED','REVERSED')` (or keep originals POSTED with `reversed_by`); one migration | pgTAP: post → reverse → trial balance, GL, cash flow unchanged | Test green; manual TB check on a reversed entry in staging |
| 0.3 | ACC-01 / ACC-03 / WF-01 — payment void | 0.2 | Receipts irreversible | Migration adding `PAYMENT_REVERSED` (and supplier equivalents) to `check_audit_action`; make `void_payment` call `reverse_journal_entry` on `payments.journal_entry_id` and reverse the `cash_transactions` row; `voidPaymentAction` + AlertDialog with reason on payments/cashier/expenses pages gated on `finance.payments.void` | Replace `pgtap:2566` negative case with positive; test balance, aging, TB, cashier expected total return to pre-payment values; double-void refused | UI void works in staging; suites green |
| 0.4 | DB-01 / DB-02 — migration history | — | Production unrebuildable; only copy of 15 migrations at risk | Read-only export of `version,name,statements` for the 15 ledger-only rows into a protected artifact; list the live ledger; reconcile with the 18 files; record which are reconstructed | Ledger-vs-files integration test | Artifact hash recorded; ledger listing attached |
| 0.5 | DR-01 — backup/restore | 0.4 | Unrecoverable data loss | Confirm/enable PITR; document RPO/RTO; schedule off-platform `pg_dump` + storage copy to R2; run one restore rehearsal onto a Supabase branch including schema bootstrap from Git | Restore drill record | Drill recorded with timings |
| 0.6 | DEP-04 — cron secret | — | No rent dues, no digests, badge green | Set `CRON_SECRET` in GitHub and Cloudflare; make workflows fail when unset; backfill missed rent periods after confirming with the customer | Job log shows HTTP 200 | Runs generate dues in staging |

## Wave 1 — Required before first paying customer

| # | Finding | Depends on | Direction | Tests | Verified when |
|---|---|---|---|---|---|
| 1.1 | ACC-05, QA-04, WF-03 | 0.3 | Aggregate allocations by `due_id` in `post_payment_internal`; client-side idempotency key per form mount passed as hidden field | pgTAP duplicate-due case; double-submit test yields one payment | green |
| 1.2 | ACC-06, WF-02, WF-06, ACC-04 | 0.2 | Add `void_due` (pre-payment only or with allocation reversal) that reverses recognition; make `due_outstanding`, views, aging, payment guard subtract non-reversed credit notes; allow credit notes without tax enforcement (zero-VAT decision path); fix `cancel_installment_plan`; add credit-notes nav entry | pgTAP for each; reconciliation test AR control = Σ balances | green |
| 1.3 | ACC-08 | 0.2 | Refuse `NO_OPEN_FISCAL_PERIOD` on due/credit-note creation, or register deferral explicitly with a sweep for both | test | green |
| 1.4 | RPT-02/03/04, ACC-13, ACC-14 | 1.2 | One SQL function for outstanding balance used by view, aging, dashboard, statements, portal; exclude REVERSED payments and VOID/DRAFT dues consistently; property P&L and VAT return from the ledger with period filters | reconciliation tests across surfaces | dashboards, statements, portal agree |
| 1.5 | ACC-07 | 0.3 | Emit `PAYMENT_CREATED`, `PAYMENT_ALLOCATION_CREATED`, void, journal post/reverse, period change, role change into the hash chain; schedule `verify_financial_audit_chain` | chain verification test | scheduled job green |
| 1.6 | QA-03 | 0.2 | `SELECT … FOR UPDATE` in `reverse_journal_entry`; partial unique index on reversed entry id; validate reversal date in period | two-client concurrency test | green |
| 1.7 | QA-07, QA-02, QA-10, QA-09 | — | Point integration/E2E at a Supabase branch/local stack; refuse production ref; run `test:all`, lint, tsc in CI on PRs; replace pgTAP placeholders; fix 162 lint errors | CI config | PR checks green |
| 1.8 | ONB-01/02, PR-04, PR-06/07, ONB-05/08/09 | 0.1 | Rebase and merge PR #28 (or retire schema by migration + ADR); add FAILED retry; align initial status/currency; make owner invite atomic; friendly slug-collision errors | `test:onboarding-request` on staging; E2E submit→approve→login | staging run recorded |
| 1.9 | PR-01/02/08 | — | Close PR #19 and #29 with rationale | — | GitHub |
| 1.10 | WF-04, WF-05, DB-06, SEC-11/12 | 0.1 | Gate AI routes with `has_permission` + kill switch, derive org from session, per-user rate limit; persist governance toggles to `tenant_feature_flags`; add or remove AI audit tables | route tests | green |
| 1.11 | DEP-01/02/03/05, DEP-06 | — | Rollback runbook + `workflow_dispatch` SHA redeploy; preview env; `/api/health` with release SHA and secret presence; smoke-check it; `engines`/README npm 11 | CI | rollback rehearsed once |
| 1.12 | OBS-01, OBS-03/04 | — | Sentry (Workers SDK) or Logpush + alert; request id; paginated/filterable audit pages with actor | — | alert fires on test error |
| 1.13 | WF-08, WF-07, SEC-14 (if online payments in scope) | — | Env-aware Fawry base URL; block PRODUCTION toggle until verified; hide Paymob | provider tests | staging settlement test |
| 1.14 | DB-03, DOC-01/02, QA-06 | 0.4 | Sign successor ADR; documented migration process (file-first, preview-branch apply, guard update); README with architecture/env/test docs; `.env.example`; nightly ledger drift check | — | docs merged |
| 1.15 | WF-09, ONB-06/07 | — | Remove unimplemented pricing/landing claims; enforce plan limits or drop capacity tiers; unify plan names | copy review | pricing page matches matrix |
| 1.16 | SEC-06, SEC-07, SEC-13 | — | Validate callback `next`; make suspension revoke `has_permission`; add storage bucket/policies to migrations | tests | green |
| 1.17 | PERF-01/02 | — | Server-side pagination with visible totals from SQL; org-scoped, bounded support queries; move balance math to SQL | load test with 5k dues | p95 < 1 s on 5k-due tenant |
| 1.18 | WF-11/12, ONB-03 | — | `error.tsx`, `not-found.tsx`, `loading.tsx` in both locales; fix `/property/units` link; locale-aware short links; dashboard CTA | E2E | green |

## Wave 2 — Required before wider rollout
| # | Finding | Direction |
|---|---|---|
| 2.1 | ACC-09/10/11/12 | Period transition rules with audit; reversal through `post_journal_entry_internal`; cashier session tied to resort/opener, variance journaled, voids reflected; tenant balances on members list |
| 2.2 | ACC-15, ACC-16 | Journal WHT per ADR 0001 decision; e-invoice adapters or relabel as readiness |
| 2.3 | DB-05/07/08/09/10 | Regenerate types; archive hygiene; unique/overlap constraints on `unit_ownerships`; org column + unique on `payment_allocations`; org indexes on 14 tables; consolidate receipt columns |
| 2.4 | SEC-03, SEC-08, SEC-09, SEC-17 | Reconcile grants allowlist and run in CI; revoke anon table grants; unify platform-admin trust model; security headers |
| 2.5 | QA-11, WF-10, WF-14/15 | Authenticated/portal responsive E2E; confirmation dialogs on levy/reverse/cashier variance; toasts on journal pages |
| 2.6 | PERF-03/04/05 | Server-side filtering; dynamic `exceljs` import; dashboard query consolidation |
| 2.7 | DR-02/03, OBS-05 | Storage backup; scheduled chain verification |
| 2.8 | ONB-04/10, WF-16 | Lead inbox with status and plan intent; contact requests view |
| 2.9 | DOC-03/04 | Runbooks; accounting model doc with status-exclusion matrix; ADR index |

## Wave 3 — Post-launch improvements
| # | Finding | Direction |
|---|---|---|
| 3.1 | SEC-15/16/18/19, DB-11/12, ONB-11/12, PR-05/09/10, WF-13/17, QA-08, DOC-05 | Hygiene: untrack env file, IP-keyed public form limits, drop dead RPC/action, config pins, docs refresh |
| 3.2 | Feature completion | Bulk due issue, recurring non-rent schedules, COA opening balances + year-end close, tenant-wide export, Paymob, maintenance/inventory modules or removal of claims, AI governance persistence |
| 3.3 | Permission hygiene | Seed the 6 checked-but-missing keys or drop fallbacks; hide the 16 dead keys from the roles matrix |
