# Phase 1.2 — separating financial read permissions inside an organization (local)

Date: 2026-10-10 · Branch `fix/phase1-financial-report-authz` · Follows Phase 1 and 1.1 reports in this folder.
Status: **implemented and verified locally only. Nothing committed, pushed or deployed; production never contacted.**
Local success is not evidence that production is fixed; see §9.

## 1. Access matrix (item 1) — what was open, to whom, and what it is now

Before: 16 finance tables had `<table>_select_member` = `is_org_member(...)`, i.e. **any active member of the organization could read them whatever their role**. `list_projects` and `project_wip_summary` (SECURITY DEFINER) gave project budgets/WIP to any member. Evidence per resource, callers (web, server actions, AI tools, alerts, **mobile**) and the keys each flow already requires: `docs/audits/_parts/E-read-matrix.md`.
No view is affected: `members_with_financials` / `units_with_financials` are `security_invoker` and read none of the 16 tables; the only invoker triggers touching them run for `finance.accounts.manage` holders, who keep read through the ALL policy.

After: each table has one permission-keyed SELECT policy; the `*_manage` ALL policies are untouched (permissive, so write-key holders keep reading). The old policies are dropped, not supplemented. `finance.reports.read` is **not** applied wholesale (bank accounts/numbers, cashboxes, cash movements and cashier sessions do not accept it).

| Resource | Read keys (any of; + the table's manage key) | Intended readers (templates) | Business reason |
|---|---|---|---|
| chart_of_accounts | accounts.view, reports.read, entries.create, dues.issue, receivables.dues.create, **receivables.payments.create**, expenses.read, suppliers.read, assets.read/manage, service_charges.read/manage, einvoice.read/manage, commissions.read/manage, budgets.manage, banking.accounts.view, cashier.transactions.read, maintenance costs.manage/post/owner_charge, property.leases.manage, property.installments.manage | ACCOUNTANT, FM, AUDITOR, GM, CASHIER, COLLECTOR, PM | account pickers on the pages those keys open; holders of reports.read already see every account in the trial balance |
| fiscal_years | periods.manage, reports.read, accounts.view | FM, ACCOUNTANT, CASHIER, AUDITOR | context only |
| fiscal_periods | periods.manage, reports.read, accounts.view, payments.read, **receivables.payments.create**, dues.read/issue, expenses.read, suppliers.read, einvoice.read, assets.read, entries.create, banking.accounts.view, cashier.transactions.read, maintenance costs.post, budgets.manage | + COLLECTOR, PM | mobile/web collection needs the open period |
| journal_entry_lines | (visible journal header) AND reports.read / entries.create / entries.review / accounts.view / audit.read | ACCOUNTANT, FM, AUDITOR, CASHIER | mirrors `journal_entries` |
| cost_centers | accounts.view, reports.read | accounting | |
| budgets | reports.read | accounting, CASHIER, VIEWER, GM | budget pages accept reports.read |
| banks / bank_accounts | banking.accounts.view, bank_reconciliation.read/manage, banking.cheques.manage, banking.reconciliations.manage, audit.read | ACCOUNTANT, FM, AUDITOR, GM | **account numbers: no reports/payments key** |
| cashboxes | cashier.transactions.read, sessions.open/close, transactions.create, **receivables.payments.create**, payments.create | CASHIER, COLLECTOR, ACCOUNTANT, FM, GM | mobile collector reads `gl_account_id` for every collection |
| cash_transactions | cashier.transactions.read, reconciliations.approve, audit.read | CASHIER, FM, GM, AUDITOR, VIEWER | |
| cashier_sessions | cashier.transactions.read, sessions.open/close, reconciliations.approve, audit.read **OR own session** (`opened_by = auth.uid()`) | CASHIER + the collector's own row | collector home / recordCollection |
| cheques / cheque_status_history | banking.accounts.view, banking.cheques.manage, reports.read, **payments.read**, cashier.transactions.read, audit.read | ACCOUNTANT, FM, GM, AUDITOR, CASHIER, COLLECTOR, PM, VIEWER | PDC register, follow-up, mobile manager attention |
| due_types | dues.read/issue, receivables.dues.create, service_charges.read, einvoice.read, property.units.view, property.members.view, property.reports.read, maintenance owner_charge | accountants, COLLECTOR, PM, VIEWER, AUDITOR | labels on unit/member/dues lists (lowest sensitivity) |
| expense_categories | expenses.read, suppliers.read, maintenance costs.manage/post | ACCOUNTANT, FM, AUDITOR, PM, GM | |
| projects (table) / **list_projects** (RPC) | accounts.view, reports.read (+ manage) — RPC was membership-only, now the same keys | accountants, CASHIER | RPC no longer bypasses the table policy |

Mechanism: `public.has_any_permission(org, keys[])` (SECURITY DEFINER, identity only from `auth.uid()` — no user-id parameter, so it cannot probe other users; ACTIVE membership + tenant-scoped role, or platform admin; not executable by `anon`).
Operational data kept membership-based on purpose (gate, maintenance and owner flows need it): `units`, `properties`, `buildings`, `zones`, `members`, `unit_ownerships` — see §8.

## 2. What changed (migration `20261009140000_phase1_2_finance_read_permissions.sql`)
1. `has_any_permission` + 16 policy replacements (above). 2. `list_projects` guard. 3. `post_fx_difference`, `post_supplier_invoice_in_currency` guards (§4). 4. `run_due_schedules()` withdrawn from clients. 5. 3-argument `replace_role_permissions_atomic` re-created as a **fail-closed shim** (§7).
App changes (so tightened reads cannot break or mislead): `tenant-dashboard.tsx` (+ `lib/dashboard/finance-visibility.ts`), work-order page loads cost reference data only for holders of the matching cost key, `lib/actions/roles.ts` maps a missing function to `role_service_upgrading`.

## 3. Proof by persona — real signed-in sessions (item 3)
`tests/finance-read-permissions.integration.test.ts` (35 tests; fixtures via service key, **every access assertion through a user session**). Personas: ACCOUNTANT, COLLECTOR, CASHIER, PROPERTY_MANAGER (shipped templates), custom gate-operator and technician, an owner (portal member), invited, suspended, and another organization's accountant/collector.
- Per table, exactly the expected personas read (≥1 row) and everyone else reads 0 — for all 16 tables × 11 personas; other organization: 0 rows of organization A while still reading its own (positive control); bank account numbers visible to the accountant only.
- **Accountant** reads what the accounting flows need (and `list_projects`, trial balance). **Collector** reads cashbox GL account, open period, ASSET accounts, due types and **its own** open session — not another user's session, cash movements, banks, bank accounts, budgets, projects, ledger lines, fiscal years, cost centers, expense categories — and `get_trial_balance` is refused. **Guard and technician**: 0 rows in all 16 tables, `get_trial_balance`/`list_projects`/`get_cash_position` refused, yet they still read properties and units. **Owner**: reads only their own due and unit (and themself); 0 rows in all finance tables; finance RPCs refused. **Invited / suspended / other-org**: nothing of organization A, `list_projects` refused.
- Structure: the 16 tables have only `*_manage` + one `*_select_permission` policy; none reads via `is_org_member` (except the explicit own-session branch); `has_any_permission` takes no user id and is not executable by anon.
- **Negative controls (old behaviour must be detected):** (a) restore the old `*_select_member` policies instead of the new ones → **20 of 35 fail**; (b) add the old policies **alongside** the new ones (multiple permissive policies re-opening access) → **20 of 35 fail**; restored → 35/35.

## 4. Remaining finance functions (item 4) — decided from bodies, callers and behaviour, not text search
Structural sweep: SECURITY DEFINER functions that reach the posting internals or the audit writer — 28 matched, 26 of them executable by `authenticated`; **only `post_fx_difference` had no identity/permission check** (the other two unguarded matches, `post_due_to_ledger` and `record_online_payment`, are not client-executable).

| Function | Finding | Action | Proof |
|---|---|---|---|
| `post_fx_difference` | No check at all; posted a balanced journal entry for **any organization id** from any signed-in user. No application caller; reached legitimately only via `settle_supplier_invoice_fx_difference` (requires `finance.entries.create`). | Guarded with `has_financial_permission(org, 'finance.entries.create', property)` — same authority as its legitimate caller, so that path is unchanged | refused for another org's accountant, a collector, invited, suspended, anon — **no entry created**; authorized accountant: POSTED, balanced, right org |
| `post_supplier_invoice_in_currency` | The posting is protected by the inner `post_supplier_invoice`; the wrapper's pre-reads (org lookup, exchange-rate probe) ran first, so a non-member could tell whether an organization exists and holds a rate (`ORGANIZATION_NOT_FOUND` / `EXCHANGE_RATE_MISSING` vs `42501`). App uses it, so **not revoked** | Authorize first | non-member gets the identical `42501 FORBIDDEN_FINANCE_PERMISSION` for real org / nonexistent org / base currency; authorized accountant passes the guard and meets the business rule |
| `run_due_schedules()` | Cron batch over all organizations; no application, test or function calls it (scheduling is external/privileged); a user could call it and `generate_recurring_dues` would then authorize them per organization, aborting on the first foreign organization | Withdrawn from clients; `service_role` keeps it | user/anon `42501`; grants checked (not executed — it would generate dues in dev data) |

Negative control: restoring the old bodies/grants → **5 of 9 tests fail**, including another organization's accountant posting a journal entry into organization A.

## 5. Dashboard (item 5)
Before: every member ran every finance query (period, trial balance ×7, dues, payments, sessions, journal entries, cheques) and a denied/failed query rendered as **0** — e.g. "Total Revenue 0", "No overdue dues 🎉", cheques 0. Now `lib/dashboard/finance-visibility.ts` maps permissions (same sets as the RLS policies) to sections; a section is **not queried** when denied, a failed query shows an error panel (`role="alert"`), and receivables require **both** dues.read and payments.read (outstanding = dues minus allocations of POSTED payments; with only one the figure would silently be wrong). The fabricated "+8.4% vs last month" was removed from the revenue card.
`tests/tenant-dashboard-access.test.tsx` renders the real component (7 tests): a viewer without finance keys triggers **no** finance query and never `get_trial_balance`, shows no figure and no "no collections/no overdue" text; an accountant sees exactly the permitted sections; partial permissions (dues without payments) show no receivables; a failed trial balance/dues query shows an error, not 0. Against the original component **7 of 7 fail**.

## 6. Owner-portal suite (item 6)
Problem: the 40 `owner-portal-access.local-sql` tests need a stubbed scratch PostgreSQL (not the Supabase container I tried before). Fixed with `scripts/local-db/run-sql-tests.mjs`: creates a scratch cluster (PostgreSQL 18.6 from the local scoop install), replays **all migrations from empty** (including the three new ones), runs the suite, stops and deletes the cluster. **40/40 pass.** As requested, absence of an `is_org_member` dependency in the portal migration is not treated as proof: the owner is also exercised against the tightened tables in the persona suite (owner reads only their own dues/unit/self; 0 rows in all 16 finance tables; finance RPCs refused). Pre-existing note: the owner receipt embed of `due_types` already returned empty (owners are not organization members); unchanged.

## 7. `replace_role_permissions_atomic` rollout plan (item 7)
Plan: `docs/runbooks/role-permissions-signature-rollout.md`. Compatibility keeps authorization: the 3-argument form is **not** restored with logic — a call with no actor cannot be authorized — it exists only as a shim that raises `SIGNATURE_RETIRED`, touches no data, and is executable by `service_role` only. New build against an old database (4-arg missing) returns `role_service_upgrading` and never falls back.
Tested locally on a real scratch PostgreSQL (`tests/role-permissions-rollout.local-sql.test.ts`, 4 tests) with the three migrations applied one by one: old build before migrations (works) → after 120000 (works) → after 130000 (old build: "does not exist", data untouched; new build: works, outsider refused) → after 140000 (old build: `SIGNATURE_RETIRED`, shim has no DML, `authenticated`/`anon` get permission denied on both signatures, new build works); new-build-first (fails closed, no change); contract step (drop shim → only the guarded function); out-of-order 140000-before-130000 (never leaves an unguarded 3-arg). App side: 3 new mocked tests (actor passed; `PGRST202`/`42883` → `role_service_upgrading`, single call, no second signature).

## 8. Results (actual runs, local stack)
| Run | Result |
|---|---|
| 24 integration files against the local API (Phase 1/1.1/1.2 suites + 17 earlier-phase finance suites incl. `final-hardening`, `member-opening-balance`, `dunning`, `chart-of-accounts-rls`) | **24 files, 245 tests passed, 0 failed** |
| Final re-run after revert/re-apply of the controls: finance-read-permissions, finance-functions-authz, security-function-grants, revoked-function-matrix, role-permissions-authz, membership-status-access, finance-report-authz | 7 files, 123 passed |
| Unit/mocked (67 files, incl. dashboard 7, platform-tenant-authorization 50, migration guard 81, local-target guard, financial-audit-actions) | **67 files, 620 passed** |
| Local-SQL on scratch PostgreSQL 18.6: owner-portal 40 + rollout 4 | **44 passed** |
| `tsc --noEmit`; eslint on touched files | no errors (3 pre-existing unused-import warnings) |
| Rest of the integration folder (33 files not in the list above) | 28 pass; **5 files fail — identical failure set with Phase 1.2 reverted** (see below) |

**The 5 pre-existing failing files (not caused by 1.2: the same tests fail with the Phase 1.2 database objects reverted; none touches objects changed by the three migrations):**
| File | Cause | Class |
|---|---|---|
| `amenity-bookings-rls` (4–5 tests) | `notifications_source_type_check` was rewritten by `20260925182911_gate_notifications.sql` from a list without the amenity-booking source types (the same defect pattern as `check_audit_action`): amenity decisions/cancellations fail `23514`. A second symptom: PostgREST reports `decide_amenity_booking` / `cancel_amenity_booking` as not found even though they exist and are executable by `authenticated`, also after a schema reload (cause not established). | **PRODUCT regression** (pre-dates this work) + unexplained local PostgREST symptom |
| `member-portal-invitation` (3) | fixture assigns TENANT_OWNER but inserts **no active `organization_memberships` row**; `has_permission` has required one since the baseline hardening → `FORBIDDEN_PORTAL_INVITE` | stale TEST fixture |
| `demo-principal-capability` (suite) | "exactly one organization must carry is_demo = true" — the local DB has none | ENVIRONMENT (no demo tenant locally) |
| `onboarding` (1) | expects service_role provisioning not to be refused with `42501`; the function refuses | stale TEST expectation vs closed-provisioning migration |
| `pgtap` #15 | calls the 2-argument `create_online_payment_checkout_transaction`; `20260924072325` replaces it with a 5-argument version, but the dev DB still holds only the baseline 2-argument function although its ledger lists the migration | dev-DB DRIFT (ledger vs schema) |
Not changed here (out of scope).

## 9. Limits — what is NOT proven
- **Production:** unknown which of `20261001123000`, `…04120000` and the three new migrations are applied; nothing was run there. Local passing is not evidence of production state.
- Behavioural effects to verify with real users before release: pages that load account/period pickers for people without the relevant keys now get empty selects (PM unit lease/installment tabs for non-managers; bank names on the PDC register for roles without `banking.*`/`bank_reconciliation.*` keys); layout cheque alerts and dashboard counters disappear for gate/technician (intended).
- The key sets come from the shipped templates and the code survey. **Custom roles in production that relied on membership-only reads may lose pickers** — audit custom roles before release.
- Playwright e2e and the mobile app were not run; the mobile collector/manager read paths are covered at the database level (cashboxes, open period, own session, cheques) by the persona suite, not by the Flutter app.
- Clean replay on a Supabase image (`supabase db push`) was not repeated for the new migration; replay on the scratch cluster (stubs) and the dev DB apply cleanly.

## 10. Further gaps found (not fixed; scope not expanded)
1. **Same defect class, other constraint:** `notifications_source_type_check` lost amenity values (above). Any constraint rewritten by successive migrations from a partial list should be audited (grep `drop constraint .*check`).
2. `app/api/ai/journal-propose` has no permission check (org id from request body) and the AI "ask" tools rely on RLS alone — they now return empty for non-accounting members, but the route should check a permission explicitly.
3. `/finance/reports/cash-flow-forecast` checks a non-existent key `finance.treasury.read`.
4. Operational tables with contact data (`members`, `member_documents`, `member_activity_log`, `unit_ownerships`) remain readable by every active member; needs a decision per persona (gate/technician genuinely need names).
5. Dashboard still contains fabricated figures: occupancy 82/8/10 %, `occupancyRatePct: 88.5`, `previousMonthCollectionRatePct: 78` fed to the AI insights card.
6. Property-scoped roles remain unsupported (`user_role_assignments.property_id` is ignored by `has_permission`/`has_any_permission`).
7. Auth sessions are not revoked on suspension; `has_permission(p_user_id, …)` can still be called with any user id.
8. Dev DB ledger drift: `20261004120000` unrecorded and its schema absent in the dev stack; ledger rows for the three new migrations were inserted by hand.

## 11. Files
New: `supabase/migrations/20261009140000_phase1_2_finance_read_permissions.sql`, `lib/dashboard/finance-visibility.ts`, `scripts/local-db/run-sql-tests.mjs`, `docs/runbooks/role-permissions-signature-rollout.md`, `docs/audits/_parts/E-read-matrix.md`, tests: `finance-read-permissions.integration`, `finance-functions-authz.integration`, `tenant-dashboard-access.test.tsx`, `role-permissions-rollout.local-sql`.
Changed: `app/[locale]/(app)/dashboard/tenant-dashboard.tsx`, `app/[locale]/(app)/operations/maintenance/work-orders/[workOrderId]/page.tsx`, `lib/actions/roles.ts`, `tests/{migration-directory-guard,security-function-grants.integration,revoked-function-matrix.integration,platform-tenant-authorization}.test.ts`. User changes (Fawry, mobile, docs) untouched; nothing committed.

Stopped after local execution as requested.
