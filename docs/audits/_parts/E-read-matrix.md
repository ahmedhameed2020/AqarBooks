# E - Read-path matrix for finance tables (user-session reads only)

Generated read-only from: local DB (`pg_policies`, `role_template_permissions`, `pg_proc`, view defs) and a code sweep of `app/**`, `lib/**`, `components/**`, `app/api/**`, `mobile/lib/**`.

Template abbreviations: ACCT=ACCOUNTANT, AUD=AUDITOR, CSH=CASHIER, COL=COLLECTOR, FM=FINANCE_MANAGER, GM=GENERAL_MANAGER, PM=PROPERTY_MANAGER, VIEW=VIEWER, PUR=PURCHASING_MANAGER, STORE=STOREKEEPER (STORE holds no finance/read key at all). TENANT_OWNER holds every key; TENANT_ADMIN only where relevant. Paths below abbreviate `app/[locale]/(app)/` as `app/.../`.

## 0. Global findings (read first)

1. Every table has `<table>_select_member` = `is_org_member(auth.uid(), organization_id)` (journal_entry_lines and cheque_status_history go through the parent). Writes are `*_manage` ALL policies (key listed per resource). **An ALL policy also grants SELECT**, so anyone holding the manage key keeps read access whatever read policy you choose; the new read policy only needs to add the non-manager keys.
2. **No view reads any of the 16 tables.** `units_with_financials` and `members_with_financials` are `security_invoker=true` and read only units, buildings, zones, dues, payment_allocations, payments, unit_ownerships, members (members_with_financials also reads units_with_financials). They are unaffected by this RLS work.
3. **Only two SECURITY INVOKER functions touch these tables**, both triggers: `check_coa_no_loop` (on chart_of_accounts) and `validate_online_payments_clearing_account` (BEFORE INSERT/UPDATE on `organization_finance_settings`, reads chart_of_accounts for the designated accounts). The writer needs `finance.accounts.manage` (policy `organization_finance_settings_manage`), who keeps CoA read through the ALL policy. OK. The other 62 functions mentioning these tables are SECURITY DEFINER and bypass RLS.
4. `list_projects(uuid)` is SECURITY DEFINER and gated by `is_org_member` only (it does not read through RLS). Tightening `projects` RLS does NOT tighten this RPC. `project_wip_summary(uuid)` is DEFINER with no check at all.
5. Owner-portal users (members.user_id) are NOT in `organization_memberships` (158 members have user_id, only 8 also have a staff membership), so `is_org_member()` is already false for them. Anything in the owner portal that embeds these tables through the user session already returns null today (see due_types).
6. Three callers have no real permission gate and rely only on `is_org_member` RLS, so tightening RLS is what actually enforces access: `app/api/ai/journal-propose/route.ts` (no permission check, org id taken from request body), the AI "ask" tools (`lib/ai/tools/*`; route passes a hard-coded permission array), and `/dashboard` + `/finance/reports` (unkeyed nav items).
7. `/finance/reports/cash-flow-forecast` also checks `finance.treasury.read`, which does NOT exist in `permissions`; only `finance.reports.read` can grant access.
8. No browser client (`createBrowserClient`) code reads any of the 16 tables. All web reads are server user-session (`createClient()` in `lib/supabase/server`). Admin client reads of these tables are out of scope (only `lib/alerts/digest.ts` cron and `lib/actions/member-lifecycle.ts` counts).
9. No code reader exists for `cost_centers` or `cheque_status_history`.

## 1. chart_of_accounts

**Policies:** `chart_of_accounts_select_member` SELECT `is_org_member(auth.uid(), organization_id)`; `chart_of_accounts_manage` ALL `has_permission(auth.uid(), organization_id, 'finance.accounts.manage') AND organization_is_active(organization_id)` (same expression as WITH CHECK).
**Write key:** finance.accounts.manage (FM only).

| file:line | client | page / flow | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/accounts/page.tsx:45 | server user | Chart of accounts tree | finance.accounts.view | ACCT, AUD, FM |
| lib/actions/accounting.ts:117,133 | server user | account update / reparent loop check | finance.accounts.manage | FM |
| app/.../admin/finance/accounting-accounts/page.tsx:63 | server user | designated accounts | finance.accounts.manage | FM |
| app/.../finance/projects/page.tsx:48 | server user | projects form pickers | nav finance.accounts.manage (page only computes canManage) | FM |
| app/.../finance/journals/[id]/page.tsx:68 | server user | entry view, all accounts (no org filter) | finance.accounts.view | ACCT, AUD, FM |
| app/.../finance/journals/new/page.tsx:50 | server user | new entry | finance.entries.create | ACCT, FM |
| app/.../finance/banks/page.tsx:105 | server user | bank GL link | banking.accounts.view | AUD, FM, GM |
| app/.../finance/cashier/page.tsx:117 | server user | cashier | cashier.transactions.read | AUD, CSH, FM, GM, VIEW |
| app/.../finance/dues/page.tsx:97 | server user | issue-due form, all active accounts | finance.dues.read (issue = finance.dues.issue) | read: ACCT, AUD, CSH, COL, FM, GM, PM, VIEW; issue: ACCT, FM, GM |
| app/.../finance/payments/page.tsx:101 | server user | record-receipt deposit account (ASSET, non-group) | finance.payments.read (record = receivables.payments.create) | read: as dues.read; create: ACCT, CSH, COL, FM, GM |
| app/.../finance/expenses/page.tsx:86 | server user | expense voucher | finance.expenses.read | ACCT, AUD, FM |
| app/.../finance/suppliers/page.tsx:97 | server user | supplier invoice / payment forms | finance.suppliers.read | ACCT, AUD, FM, GM, PUR |
| app/.../finance/service-charges/page.tsx:99 | server user | service charges | finance.service_charges.manage OR .read | ACCT, AUD, FM, PM (read) |
| app/.../finance/einvoice/page.tsx:126 | server user | e-invoice | finance.einvoice.manage OR .read | ACCT, AUD, FM |
| app/.../finance/commissions/page.tsx:110; lib/actions/commissions.ts:172 | server user | pickers; default ASSET account on first settings row | finance.commissions.manage OR .read | ACCT, AUD, FM, PM (read) |
| app/.../finance/assets/page.tsx:66 | server user | fixed assets | finance.assets.manage OR .read | ACCT, AUD, FM, PM (read) |
| app/.../finance/budgets/page.tsx:114 | server user | budgets grid | finance.budgets.manage OR finance.reports.read | FM; ACCT, AUD, CSH, GM, VIEW |
| app/.../finance/reports/general-ledger/page.tsx:51 | server user | GL account picker | finance.reports.read | ACCT, AUD, CSH, FM, GM, VIEW |
| app/.../finance/reports/fixed-assets/page.tsx:73 | server user | fixed-asset report | finance.reports.read OR finance.audit.read | above + AUD, FM |
| app/.../property/[unitId]/tab-lease.tsx:49,60 | server user | unit lease tab: ASSET accounts + REVENUE/EXPENSE accounts for deposit panel (loaded unconditionally) | page guard property.units.view; actions need property.leases.manage | view: AUD, COL, GM, PM, VIEW; manage: PM |
| app/.../property/[unitId]/tab-installments.tsx:48 | server user | installment plan ASSET accounts (unconditional) | property.units.view; actions need property.installments.manage | PM |
| app/.../members/[memberId]/page.tsx:154 | server user | opening-balance dialog (only if canIssueDues) | finance.dues.issue | ACCT, FM, GM |
| lib/actions/receivables.ts:78 | server user | issueDueAction fallback receivable account | finance.dues.issue / receivables.dues.create | ACCT, FM, GM |
| app/.../operations/maintenance/work-orders/[workOrderId]/page.tsx:116,117,120 | server user | work-order page: EXPENSE, ASSET (payment), ASSET (receivable) accounts, loaded for every work_orders.view holder even without cost keys | page operations.work_orders.view; cost forms need operations.maintenance.costs.manage / .post / .owner_charge | manage: GM, PM; post: ACCT, FM, GM; owner_charge: ACCT, FM, GM |
| app/api/ai/journal-propose/route.ts:29 | server user | AI journal proposal; no permission check, orgId from request body | none (RLS only) | any member today |
| lib/ai/tools/executor.ts:152 | server user | AI get_cash_position tool | none enforced | any member today |
| trigger functions (see section 0) | invoker | writers only | finance.accounts.manage | FM |
| mobile/lib/** | - | no direct reads (collector uses cashboxes.gl_account_id) | - | - |

**Non-finance personas that read it:** work-order page (technician / PM / GM: id, code, names of EXPENSE and ASSET accounts); unit-page lease and installment tabs (PM and every property.units.view holder: code, names, category); web collector / cashier payments page. Gate scanner, owner portal, owner receipts/statements: no reads.

**Recommended read set (OR with manage via ALL):** finance.accounts.view, finance.reports.read, finance.entries.create, finance.dues.issue, receivables.dues.create, receivables.payments.create (collector/cashier deposit picker), finance.expenses.read, finance.suppliers.read, finance.assets.read, finance.service_charges.read, finance.einvoice.read, finance.commissions.read, finance.budgets.manage, banking.accounts.view, cashier.transactions.read, operations.maintenance.costs.manage, operations.maintenance.costs.post, operations.maintenance.owner_charge, property.leases.manage, property.installments.manage. Cleaner alternative: keep the policy to the accountant family (accounts.view, reports.read, entries.create, dues.issue, budgets.manage, banking.accounts.view, cashier.transactions.read) and serve collector / PM / maintenance pickers through a narrow DEFINER RPC (for example list_postable_accounts(org, category[])).

**Risks:** COL and CSH (no accounts.view) lose the deposit-account picker on `/finance/payments` unless receivables.payments.create is in the set. PM loses lease-deposit and installment account pickers unless property.leases.manage / property.installments.manage are in the set. Work-order cost forms show empty selects for PM/GM unless the three maintenance cost keys are included (better: gate the three queries on canManageCosts / canPostCosts / canChargeOwner, already computed on the page). PUR (suppliers.read only) loses the account picker on suppliers page unless suppliers.read is included. `journal-propose` and the AI cash tool return empty for non-accounting members (desired).

## 2. fiscal_years

**Policies:** `fiscal_years_select_member` is_org_member; `fiscal_years_manage` ALL finance.periods.manage AND organization_is_active. Write key finance.periods.manage (FM).

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../admin/finance/periods/page.tsx:56 | server user | fiscal periods admin | finance.periods.manage | FM |
| mobile / owner portal / gate | - | none | - | - |

**Recommended read set:** finance.periods.manage (already via ALL) plus finance.reports.read and finance.accounts.view for context. Effectively only FM reads it; could be manage-only.
**Risks:** none found (create_fiscal_year RPC is DEFINER).

## 3. fiscal_periods

**Policies:** `fiscal_periods_select_member` is_org_member; `fiscal_periods_manage` ALL finance.periods.manage AND organization_is_active. Write key finance.periods.manage.

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../admin/finance/periods/page.tsx:61 | server user | periods admin | finance.periods.manage | FM |
| app/.../dashboard/tenant-dashboard.tsx:81 | server user | /dashboard for every org member (current OPEN period for trial-balance widgets) | none (get_trial_balance RPC checks has_permission itself) | everyone |
| app/.../finance/reports/page.tsx:42 | server user | reports hub (unkeyed nav) | none | everyone |
| app/.../finance/reports/income-statement/page.tsx:52; budget-vs-actual/page.tsx:57; cash-flow/page.tsx:58 | server user | default period | finance.reports.read | ACCT, AUD, CSH, FM, GM, VIEW |
| app/.../finance/budgets/page.tsx:78 | server user | budgets | finance.budgets.manage OR finance.reports.read | FM; ACCT, AUD, CSH, GM, VIEW |
| app/.../finance/payments/page.tsx:107 | server user | record receipt (OPEN period) | finance.payments.read / receivables.payments.create | COL, CSH, ACCT, FM, GM |
| app/.../finance/dues/page.tsx:104 | server user | issue due | finance.dues.read / finance.dues.issue | see dues |
| app/.../finance/expenses/page.tsx:91; suppliers/page.tsx:119; einvoice/page.tsx:133; assets/page.tsx:74; banks/page.tsx:123; cashier/page.tsx:125 | server user | forms needing OPEN period | finance.expenses.read / suppliers.read / einvoice.* / assets.* / banking.accounts.view / cashier.transactions.read | see each |
| app/.../finance/journals/new/page.tsx:57; journals/[id]/page.tsx:70 | server user | journal | finance.entries.create / finance.accounts.view | ACCT, FM / ACCT, AUD, FM |
| app/.../operations/maintenance/work-orders/[workOrderId]/page.tsx:118 | server user | cost posting period (unconditional) | operations.work_orders.view; post needs operations.maintenance.costs.post | ACCT, FM, GM |
| lib/ai/tools/entity-resolver.ts:97 | server user | AI entity resolver | none | any member today |
| mobile/lib/data/repository.dart:1649 | mobile | Collector `recordCollection`: OPEN period for `record_payment` | persona collector = receivables.payments.create | ACCT, CSH, COL, FM, GM |

**Non-finance personas:** the dashboard (any member including gate / technician) and the mobile collector. Gate scanner, owner portal / PDFs: no reads.
**Recommended read set (OR manage):** finance.reports.read, finance.accounts.view, finance.payments.read, receivables.payments.create, finance.dues.read, finance.expenses.read, finance.suppliers.read, finance.einvoice.read, finance.assets.read, finance.entries.create, banking.accounts.view, cashier.transactions.read, operations.maintenance.costs.post. Smaller alternative: DEFINER `current_open_period(org)` RPC for collector and dashboard.
**Risks:** the mobile collector fails every collection with `no_open_period` unless receivables.payments.create is in the set. Dashboard `currentPeriod` becomes null for non-finance members, trial-balance widgets are skipped (they would be denied by get_trial_balance anyway, no crash). Reports hub period picker empty for users without keys.

## 4. journal_entry_lines

**Policy:** `journal_entry_lines_select_member` SELECT `EXISTS (select 1 from journal_entries je where je.id = journal_entry_lines.journal_entry_id AND is_org_member(auth.uid(), je.organization_id))`. No write policy (RPC-only).

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/journals/page.tsx:90 (embed `journal_entries!inner(organization_id)`) | server user | journals list, per-entry debit/credit totals | finance.accounts.view | ACCT, AUD, FM |
| app/.../finance/journals/[id]/page.tsx:64 | server user | entry detail lines | finance.accounts.view | ACCT, AUD, FM |
| mobile / portal / PDF / gate | - | none | - | - |

Reports (trial balance, GL, ledger) use DEFINER RPCs.
**Recommended read set:** finance.accounts.view, finance.entries.review, finance.entries.create, finance.reports.read, finance.audit.read. Mirror whatever you choose for `journal_entries` so header and lines agree.
**Risks:** if lines are tightened but journal_entries is not, the journals list silently shows zero totals. No non-finance persona reads it.

## 5. cost_centers

**Policies:** `cost_centers_select_member` is_org_member; `cost_centers_manage` ALL finance.accounts.manage (no `organization_is_active` clause, unlike siblings).
**Callers:** none anywhere (app, lib, components, mobile).
**Recommended read set:** finance.accounts.view, finance.reports.read (+ manage via ALL). **Risks:** none known (CoA `requires_cost_center` exists but no UI reads cost_centers yet).

## 6. budgets

**Policies:** `budgets_select_member` is_org_member; `budgets_manage` ALL finance.budgets.manage AND organization_is_active. Write key finance.budgets.manage (FM).

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/budgets/page.tsx:122 | server user | budgets grid | finance.budgets.manage OR finance.reports.read | FM; ACCT, AUD, CSH, GM, VIEW |
| app/.../finance/reports/budget-vs-actual/page.tsx:93 | server user | budget vs actual | finance.reports.read | ACCT, AUD, CSH, FM, GM, VIEW |
| lib/actions/accounting.ts:404,414 | server user | delete / upsert (write) | finance.budgets.manage | FM |

**Recommended read set:** finance.reports.read (+ manage via ALL). **Risks:** none; no non-finance persona reads it.

## 7. banks

**Policies:** `banks_select_member` is_org_member; `banks_manage` ALL finance.accounts.manage AND organization_is_active.

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/banks/page.tsx:95 | server user | bank accounts | banking.accounts.view | AUD, FM, GM |
| app/.../finance/banks/reconciliation/page.tsx:95 | server user | reconciliation | finance.bank_reconciliation.manage OR .read | ACCT, AUD, FM |
| app/.../finance/reports/pdc/page.tsx:67 (embed `bank_accounts(banks(name_ar, name_en))` on cheques) | server user | PDC register | finance.reports.read OR finance.payments.read | ACCT, AUD, CSH, COL, FM, GM, PM, VIEW |
| lib/actions/treasury.ts:220 | server user | insert (write) | finance.accounts.manage | FM |

**Recommended read set:** banking.accounts.view, finance.bank_reconciliation.read, finance.bank_reconciliation.manage, finance.reports.read, banking.cheques.manage, banking.reconciliations.manage.
**Risks:** PDC register: COL / PM / VIEW / GM reaching the page through finance.payments.read lose the bank name in each row (embed becomes null; the code tolerates null). Decide whether PDC should require finance.reports.read only.

## 8. bank_accounts

**Policies:** `bank_accounts_select_member` is_org_member; `bank_accounts_manage` ALL finance.accounts.manage AND organization_is_active.

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/banks/page.tsx:100 | server user | bank accounts | banking.accounts.view | AUD, FM, GM |
| app/.../finance/banks/reconciliation/page.tsx:89 | server user | account picker | bank_reconciliation.manage / .read | ACCT, AUD, FM |
| app/.../finance/banks/reconciliation/[statementId]/page.tsx:62 | server user | statement header (account_name, account_number) | same | ACCT, AUD, FM |
| app/.../finance/reports/pdc/page.tsx:67 (embed via cheques.bank_account_id) | server user | PDC register | finance.reports.read OR finance.payments.read | see banks |
| lib/ai/tools/executor.ts:147,218; lib/ai/tools/entity-resolver.ts:83 (`account_name, account_number`) | server user | AI assistant | none enforced | any member today |
| lib/actions/treasury.ts:188 | server user | insert (write) | finance.accounts.manage | FM |

**Recommended read set:** banking.accounts.view, finance.bank_reconciliation.read, finance.bank_reconciliation.manage, finance.reports.read, banking.cheques.manage. Account numbers are sensitive; avoid letting finance.payments.read alone grant them.
**Risks:** PDC embed caveat as for banks; AI cash tool returns empty for non-finance users (desired). Owner portal, mobile, gate: none.

## 9. cashboxes

**Policies:** `cashboxes_select_member` is_org_member; `cashboxes_manage` ALL finance.accounts.manage AND organization_is_active.

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/cashier/page.tsx:101 | server user | cashier | cashier.transactions.read | AUD, CSH, FM, GM, VIEW |
| lib/actions/treasury.ts:29 | server user | insert (write) | finance.accounts.manage | FM |
| mobile/lib/data/repository.dart:1383 (`cashboxes()`: id, name, property_id, gl_account_id) | mobile | open-session picker (collector_screens.dart:275) and deposit-account fallback in `recordCollection` (repository.dart:1636) | persona collector = receivables.payments.create; session open = cashier.sessions.open | collection: ACCT, CSH, COL, FM, GM; open session: CSH |
| mobile/lib/data/repository.dart:1629 (`gl_account_id` of the session cashbox) | mobile | recordCollection | receivables.payments.create | same |

**Non-finance persona:** the mobile COLLECTOR (COL has no cashier.*, banking.* or accounts.view) reads cashboxes to find the GL deposit account for every collection. Hard dependency.
**Recommended read set:** cashier.transactions.read, cashier.sessions.open, cashier.sessions.close, cashier.transactions.create, receivables.payments.create, finance.payments.create (+ manage via ALL).
**Risks:** omit receivables.payments.create and COL cannot collect (`no_deposit_account`) and cashier cannot open a session.

## 10. cash_transactions

**Policy:** `cash_transactions_select_member` is_org_member. No write policy (RPC only).

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/cashier/page.tsx:111 | server user | cashier movements | cashier.transactions.read | AUD, CSH, FM, GM, VIEW |
| mobile | - | none | - | - |

**Recommended read set:** cashier.transactions.read, cashier.reconciliations.approve, finance.audit.read. **Risks:** none beyond the cashier page.

## 11. cashier_sessions

**Policy:** `cashier_sessions_select_member` is_org_member. No write policy.

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/cashier/page.tsx:106 | server user | cashier | cashier.transactions.read | AUD, CSH, FM, GM, VIEW |
| app/.../dashboard/tenant-dashboard.tsx:117 | server user | /dashboard for every member, `count head` of OPEN sessions | none | everyone |
| mobile/lib/data/repository.dart:1392 (`opened_by = me`, status OPEN) | mobile | collector home `cashierSessionProvider` (collector_screens.dart:18, try/catch returns null) and recordCollection | persona collector | COL, CSH (+ ACCT, FM, GM) |

**Recommended read set:** cashier.transactions.read, cashier.sessions.open, cashier.sessions.close, cashier.reconciliations.approve, finance.audit.read, plus an own-session branch `opened_by = auth.uid()` so any collector reads their own open session.
**Risks:** dashboard open-session KPI shows 0 for non-cashier members (silent); mobile COL home hides the session chip.

## 12. cheques

**Policy:** `cheques_select_member` is_org_member. No write policy (RPCs record_incoming_cheque, set_cheque_status, clear_incoming_cheque are DEFINER).

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/banks/page.tsx:118 | server user | cheques tab | banking.accounts.view (actions need banking.cheques.manage) | AUD, FM, GM |
| app/.../finance/reports/pdc/page.tsx:65 (embeds members(full_name), bank_accounts(banks)) | server user | PDC register | finance.reports.read OR finance.payments.read | ACCT, AUD, CSH, COL, FM, GM, PM, VIEW |
| app/.../finance/reports/cash-flow-forecast/page.tsx:74 | server user | 90-day forecast | finance.reports.read (finance.treasury.read does not exist) | ACCT, AUD, CSH, FM, GM, VIEW |
| app/.../dashboard/tenant-dashboard.tsx:127 | server user | dashboard count of RECEIVED/DEPOSITED | none | everyone |
| lib/alerts/operational-alerts.ts:162, called from app/.../layout.tsx:83 on every page render and from notifications page | server user | header alert "cheques due soon" (amount, due_date, direction) | none by design: the code comment says alerts only reach someone allowed to read the data, RLS is the gate | every member today |
| mobile/lib/data/repository.dart:1705 | mobile | Manager "needs attention" (id, amount, status, due_date; try/catch swallow) | persona manager = operations.maintenance.manage / work_orders.assign / visitors.manage | PM, GM |

**Non-finance personas:** mobile operations MANAGER (PM, GM) sees cheque attention items; layout alerts and dashboard run for gate operators and technicians too (they currently get cheque alerts; they should not).
**Recommended read set:** banking.accounts.view, banking.cheques.manage, finance.reports.read, finance.payments.read (only if PDC should stay open to COL/PM), cashier.transactions.read, finance.audit.read.
**Risks:** without finance.payments.read, COL / PM lose the PDC register page. PM mobile manager loses cheque attention items silently (PM holds finance.payments.read only; GM holds banking.accounts.view). Web header alerts disappear for non-finance members (intended). Dashboard count becomes 0 for non-finance.

## 13. cheque_status_history

**Policy:** `cheque_status_history_select_member` SELECT `EXISTS (select 1 from cheques c where c.id = cheque_id AND is_org_member(auth.uid(), c.organization_id))`. It is the only policy that reads another of the 16 tables inside its qual, so it must be rewritten explicitly (it will not inherit a new cheques policy by itself because it calls is_org_member directly).
**Callers:** none. **Recommended:** same set as cheques. **Risks:** none.

## 14. due_types

**Policies:** `due_types_select_member` is_org_member; `due_types_manage` ALL finance.accounts.manage AND organization_is_active. Write: lib/actions/receivables.ts:29 insert.

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/dues/page.tsx:95 | server user | dues list + issue form | finance.dues.read | ACCT, AUD, CSH, COL, FM, GM, PM, VIEW |
| app/.../finance/service-charges/page.tsx:94 | server user | service charges (also default_revenue_account_id) | finance.service_charges.manage / .read | ACCT, AUD, FM, PM (read) |
| app/.../finance/einvoice/page.tsx:121 | server user | e-invoice | finance.einvoice.* | ACCT, AUD, FM |
| lib/actions/receivables.ts:66 | server user | issueDueAction reads default_revenue_account_id | finance.dues.issue / receivables.dues.create | ACCT, FM, GM |
| app/.../property/page.tsx:46 | server user | units list dues name lookup | page has no deny (nav property.units.manage); data pages property.units.view | AUD, COL, GM, PM, VIEW |
| app/.../property/dues-table.tsx:70 | server user | DuesTable on unit and member pages | property.units.view / property.members.view | AUD, COL, GM, PM, VIEW |
| app/.../property/[unitId]/page.tsx:73 | server user | unit page type names | property.units.view | AUD, COL, GM, PM, VIEW |
| app/.../property/[unitId]/tab-lease.tsx:47; tab-installments.tsx:46 | server user | unit tabs (unconditional) | property.units.view (+ leases / installments manage) | PM |
| app/.../members/page.tsx:80 | server user | members list dues | nav property.members.manage (no deny in page) | PM |
| app/.../members/[memberId]/page.tsx:172 | server user | member dues names | property.members.view / manage | AUD, COL, GM, PM, VIEW |
| app/.../finance/reports/owner-statement/page.tsx:77 (embed `due_types(name_ar, name_en)` on dues) | server user | owner statement | property.reports.read | ACCT, AUD, CSH, COL, FM, GM, PM, VIEW |
| app/.../operations/maintenance/work-orders/[workOrderId]/page.tsx:119 | server user | owner-charge form (unconditional) | operations.work_orders.view; charge = operations.maintenance.owner_charge | ACCT, FM, GM |
| lib/actions/member-portal-receipts.ts:53 (embed `payment_allocations -> dues -> due_types(name_ar, name_en)`) | server user (owner session) | owner portal receipt print | getPortalMemberContext; owner is not an org member | owner |

**Owner portal:** the receipt embed reads `due_types`. An owner has no organization_memberships row, so `due_types_select_member` is already false for them and the receipt line `description` is already empty today (`?? ""`). Tightening RLS cannot make it worse; if line descriptions are wanted, fix it with a portal-safe path (DEFINER function or an own-dues policy) in the same migration. Other owner-portal pages (home, units, payments, statement, profile) and mobile resident screens do not read due_types.
**Non-finance personas:** PM / COL / VIEW / GM / AUD (property and member dues lists), technician (work-order page, unconditional), owner (receipt, already blocked).
**Recommended read set:** finance.dues.read, finance.dues.issue, receivables.dues.create, finance.service_charges.read, finance.einvoice.read, property.units.view, property.members.view, property.reports.read, operations.maintenance.owner_charge. Lowest-sensitivity table (labels only); drop property.* view keys and every property / member dues list shows blank type.
**Risks:** blank due-type column on unit / member / property dues lists for PM / COL / AUD / VIEW without the property.* keys; blank type on owner statement without property.reports.read.

## 15. expense_categories

**Policies:** `expense_categories_select_member` is_org_member; `expense_categories_manage` ALL finance.accounts.manage AND organization_is_active. Write: lib/actions/purchasing.ts:92.

| file:line | client | page | guard -> keys | templates |
|---|---|---|---|---|
| app/.../finance/expenses/page.tsx:82 | server user | expense vouchers (+ default_expense_account_id) | finance.expenses.read | ACCT, AUD, FM |
| app/.../operations/maintenance/work-orders/[workOrderId]/page.tsx:115 | server user | work-order cost form (unconditional; id, name_ar, name_en) | operations.work_orders.view; cost manage = operations.maintenance.costs.manage | GM, PM |
| mobile / portal / gate | - | none | - | - |

**Recommended read set:** finance.expenses.read, operations.maintenance.costs.manage, operations.maintenance.costs.post, finance.suppliers.read (+ manage via ALL).
**Risks:** PM / GM cost-form category list empty without the maintenance keys; technician sees nothing (they should not).

## 16. projects (table) and RPC list_projects

**Policies:** `projects_select_member` is_org_member; `projects_manage` ALL finance.accounts.manage (no organization_is_active clause).
**Direct table readers:** none (lib/actions/projects.ts:48 only upserts; capitalise_project_cost / release_project_wip RPCs are DEFINER).
**RPC list_projects(p_organization_id):** DEFINER, STABLE; gate `is_org_member(auth.uid(), org)` only, raises `FORBIDDEN_FINANCE_PERMISSION` (42501); returns id, code, names, status, accounts_set, budget_amount, capitalised, released, wip_balance, budget_variance. Only caller: app/.../finance/projects/page.tsx:46 (server user), nav key finance.accounts.manage (FM). Mobile / portal / gate / PDFs: none.
**Recommended:** table read finance.accounts.view, finance.reports.read (+ manage via ALL). RPC: change its internal check to `has_permission(.., 'finance.accounts.view') OR has_permission(.., 'finance.accounts.manage')`. **Risks:** if the RPC gate stays as is, tightening the table is bypassable through list_projects (budget and WIP balances visible to any member). No non-finance persona legitimately reads it.

## 17. Views and RPCs requested

| object | type | reads | security | notes |
|---|---|---|---|---|
| members_with_financials | view | members, units_with_financials, unit_ownerships, payments | security_invoker=true | None of the 16 tables. Callers: web members list/export, owner portal home/profile, mobile homeSummary (repository.dart:667). Unaffected. |
| units_with_financials | view | units, buildings, zones, dues, payment_allocations, payments, unit_ownerships, members | security_invoker=true | None of the 16 tables. Callers: web property / members pages, units export, admin/resorts, owner portal units/statement/payments, mobile (repository.dart:692,1483,1541). Unaffected. |
| list_projects | RPC | projects, project_wip_summary | DEFINER, is_org_member gate | section 16 |
| get_trial_balance, get_cash_position, get_account_ledger, get_cash_flow_statement | RPC | ledger tables | DEFINER with has_permission | dashboard and reports; unaffected by table RLS |

## 18. Non-finance persona summary

- **Gate operator (web scanner, mobile gate):** reads none of the 16 tables directly. Indirectly: layout alerts (cheques) and /dashboard (fiscal_periods, cashier_sessions, cheques counts) degrade silently.
- **Maintenance technician:** the work-order page (`operations.work_orders.view`) loads expense_categories, chart_of_accounts (x3), fiscal_periods and due_types unconditionally even when `work_order_cost_staff_can_*` are false. Gate those queries on the cost booleans the page already computes. Mobile technician: none.
- **Property / operations manager (PM, GM, mobile manager):** PM unit-page lease and installment tabs (CoA + due_types), property / member dues lists (due_types), work-order cost forms, PDC page (cheques, bank names), mobile manager attention (cheques).
- **Collector / cashier (mobile and web):** cashboxes (gl_account_id), fiscal_periods, cashier_sessions (own), chart_of_accounts (ASSET) and due_types on web payments / dues pages. COL has no cashier.*, banking.* or accounts.view, so read policies must include receivables.payments.create or finance.payments.read for these.
- **Owner portal / resident (web and mobile):** only the receipt embed of `due_types` (already null for owners). No bank_accounts, cashboxes, CoA or fiscal_periods reads. Staff owner-statement page embeds due_types; no owner-facing PDF reads the other tables.
