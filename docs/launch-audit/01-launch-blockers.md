# 01 — Launch Blockers (P0 and P1 only)

Commit audited: `a91d809` (master, deployed to production per Actions run #85). Full evidence in the referenced reports. Duplicates across auditors are merged (e.g. QA-01 = ACC-01, RPT-01 = ACC-02, QA-05 = SEC-01, WF-18 = DEP-04).

## P0 — Launch blockers (6)

| ID | Area | Finding | Evidence | Report |
|---|---|---|---|---|
| SEC-01 | Security / multi-tenancy | Any user with any membership row in any tenant (or the shared public-demo principal) can assign themselves the global `PLATFORM_SUPER_ADMIN` role through a service-role write; `is_platform_admin` ignores the assignment's organization; `has_permission` short-circuits on it. Full cross-tenant read/write and platform takeover. | `lib/actions/users.ts:134-185`; `lib/auth/org-context.ts:4-13`; `baseline.sql:5009-5021`, `:21790`, `:17496`; grep: no permission/demo guard in `users.ts`/`roles.ts` | 04 |
| ACC-01 | Accounting | `void_payment` can never succeed (writes audit action `PAYMENT_REVERSED`, disallowed by `check_audit_action`, still absent after the 2026-09-03 migration) and has no UI. Customer receipts are irreversible; the pgTAP suite asserts the failure. | `baseline.sql:11044`, `:12041`; `20260903172101_member_opening_balance.sql:64-71`; `tests/pgtap.integration.test.ts:2530-2600` | 03, 08 |
| ACC-02 | Accounting / reporting | After any journal reversal, every ledger report (trial balance, GL, income statement, balance sheet, cash flow, budget-vs-actual, dashboard P&L) moves by −1× instead of netting to zero, because reports filter `je.status='POSTED'` while the original is set `REVERSED`. | `baseline.sql:4555`, `:3794`, `:3951`, `:4000`, `:7281`, `:8969` | 03, 09 |
| ACC-03 | Accounting | `void_payment`, once reachable, never reverses the receipt journal entry (contrast `void_supplier_payment`) → GL cash/AR diverge from the sub-ledger. | `baseline.sql:10908-11076` | 03 |
| DB-01 | Database / migrations | 15 applied production migrations (`20260829104638..20260831205217`) exist in no git ref; their DDL is unrecoverable from the repository. Production cannot be rebuilt from Git. | `tests/migration-directory-guard.test.ts:108-116`; commit `2a6d7d6`; `git log --all -S` | 05 |
| DR-01 | Business continuity | No runnable backup or restore exists; `lib/backup/*` is decision logic only; recovery drills recorded as NOT RUN; RPO/RTO undecided; PITR status unknown. | `docs/backup-recovery/phase1-implementation-report.md` §11 and status; ADR 0006 line 85 | 09 |

## P1 — Must fix before public launch (35)

| ID | Area | Finding | Report |
|---|---|---|---|
| SEC-02 | Security | Any member can rewrite any role's permissions (incl. other tenants' and template roles), create roles, suspend/remove colleagues, create confirmed auth users (`roles.ts:17-152`, `users.ts:188-262`). | 04 |
| SEC-04 | Security (conditional on demo enabled in prod) | Demo read-only guarantee is DB-only; `denyIfDemo` never called; combined with SEC-01/02 an anonymous demo visitor can escalate. | 04 |
| ACC-04 | Accounting | `cancel_installment_plan` voids dues without reversing recognition; allocations left pointing at VOID dues. | 03 |
| ACC-05 | Accounting | Over-allocation via duplicate `due_id` in one payment (per-line, not cumulative check). | 03 |
| ACC-06 | Accounting | Credit notes never reduce collectible balance; and are impossible without tax enforcement → no correction path for most tenants. | 03 |
| ACC-07 | Audit trail | Hash-chained audit covers dues/opening balances only; payments, reversals, periods, cashier, deposits, commissions, purchasing unrecorded there. | 03 |
| ACC-08 | Accounting | Dues/credit notes with no OPEN period silently get no journal entry. | 03 |
| DB-02 | Migrations | Live ledger unverifiable; all "applied" claims rest on docs. | 05 |
| DB-03 | Migrations | Apply-to-production-first process structurally produces drift; successor ADR unsigned. | 05 |
| ONB-01 | Onboarding | No end-to-end signup path on master; every customer requires manual admin provisioning + invite. | 07 |
| ONB-02 | Onboarding | `onboarding_requests` schema and approval RPCs live in production with no application code. | 07 |
| PR-01 | PRs | PR #19 shares no history with master; merge would revert ~1.6 M lines. Close. | 10 |
| PR-02 | PRs | PR #19's esm.sh runtime loader is a supply-chain risk and moot. Reject. | 10 |
| PR-04 | PRs | PR #28 is the only implementation of the live onboarding schema; rebase and merge, or drop the schema. | 10 |
| WF-01 | Workflows | Payment void has no server action or UI (and is broken, ACC-01/03). | 06 |
| WF-02 | Workflows | No due void/cancel path at all. | 06 |
| WF-04 | Workflows / security | AI API routes bypass permissions and the kill switch; any authenticated user can query financial data. | 06 |
| WF-08 | Payments (conditional on online payments in launch scope) | Fawry base URL is always sandbox regardless of the PRODUCTION toggle. | 06 |
| DEP-04 | Operations | Scheduled rent generation and alert digest have never run in production (`CRON_SECRET` unset; workflows green). | 09 |
| QA-02 | Testing | `pgtap.integration` receivables/treasury/purchasing/reports cases are placeholders. | 08 |
| QA-03 | Testing / integrity | No double/concurrent reversal test; `reverse_journal_entry` lacks a row lock. | 08 |
| QA-04 | Testing / integrity | Per-request idempotency key; duplicate receipt on retry; no test. | 08 |
| QA-07 | Testing | Integration/E2E suites run against production with service role and hard-delete rows. | 08 |
| DEP-01 | Deployment | No rollback procedure. | 09 |
| DEP-02 | Deployment | No preview/staging environment; deployment doc stale. | 09 |
| DEP-03 | Deployment | Placeholder env fallbacks let a mis-configured deploy pass the smoke check. | 09 |
| OBS-01 | Observability | No error reporting/alerting. | 09 |
| OBS-02 | Observability | Permission/role/membership changes unaudited. | 09 |
| PERF-01 | Performance | Silent 300-row truncation on dues/payments/journals/expenses/suppliers lists and exports. | 09 |
| PERF-02 | Performance | Unbounded, un-scoped `payment_allocations`/`dues`/`journal_entry_lines` scans per render. | 09 |
| RPT-02 | Reporting | Four divergent "outstanding" formulas vs the SQL view. | 09 |
| RPT-03 | Reporting | Property P&L not ledger-based; includes VOID/DRAFT dues and cancelled invoices. | 09 |
| RPT-04 | Reporting | Portal statement shows REVERSED payments; unrecognized dues and unallocated payments make AR sub-ledger ≠ AR control. | 09 |
| DOC-01 | Documentation | README boilerplate; no setup/test docs; no `.env.example`. | 09 |
| DOC-02 | Documentation | Migration process, cron secret, demo env, npm 11, Workers Paid live only in comments. | 09 |

## Highest-risk UNKNOWNs (verification required)
1. Whether the 17 post-baseline migrations are actually recorded in the production ledger, and the names/SQL of the 15 ledger-only migrations (DB-01/02).
2. Whether the public demo is enabled in production (turns SEC-01 from "any tenant user" into "anyone on the internet").
3. Whether any production `user_role_assignments` row already carries the platform role with a non-null organization (i.e. whether SEC-01 has already been exercised).
4. Whether `npm run test:security` is green against production (SEC-03 says it cannot be).
5. Supabase plan-level backup/PITR status and storage policies in production (DR-01, SEC-13).
6. Supabase Auth configuration (redirect allow-list, leaked-password protection, SMTP for invitations).
