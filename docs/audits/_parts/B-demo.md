# B - Public demo investigation (read-only), 2026-10-09

Method: static code, migration and git analysis. Runtime NOT VERIFIED: https://aqarbooks.com/ar/demo (WebFetch only) shows the public intro with no lead form (3 projects, 156 units, 2 legal entities); entering needs a sign-in server action (lib/demo/session.ts:46) which I did not trigger. The local docker DB (supabase_db_aqarbooks) answered a few SELECTs, then the docker daemon went away. The local DB has 170 orgs and 0 is_demo orgs, so there is no local demo tenant; all demo-data conclusions are inferred from seed code, not from hosted data.

## Seeding facts
- Seed scripts (scripts/demo/*.ts: seed-demo-tenant.ts, demo-plan.ts, verify-structural.ts, apply-cam/cashier/bank-reconciliation/repair ...) exist ONLY on branch feat/public-demo-phase-1 (head a649508; last demo commit 2a32342). They are NOT on master. lib/demo/config.ts:49 still points to scripts/demo/seed-demo-tenant.ts.
- Marker: env DEMO_ORGANIZATION_ID plus organizations.is_demo (migration 20260825231151_demo_readonly_hardening_and_cashier_read.sql; lib/demo/session.ts:99-111).
- Demo principal = shared user holding the AUDITOR role (docs/superpowers/specs/2026-08-25-release-a-demo-security-hardening.md:49-57); not a platform admin (session.ts:86).
- Local AUDITOR keys (27): banking.accounts.view, cashier.transactions.read, finance.{accounts.view, assets.read, audit.read, audit.verify, bank_reconciliation.read, commissions.read, dues.read, dunning.read, einvoice.read, expenses.read, fx.read, payments.read, reports.export, reports.read, reports.view, schedules.read, service_charges.read, suppliers.read}, property.{handover.read, installments.view, lease_renewals.view, leases.view, members.view, reports.read, units.view}.
- Story constants: lib/demo/story.ts:45-48 (3 properties, 5 buildings, 156 units incl. 8 archived, 148 active). Building counts sum to 156.
- Seed plan (demo-plan.ts:276-282 notImplemented) lists as not created: issue_dues, payments, CAM levy, cashbox, cheques (record_incoming_cheque), "suppliers, expenses and supplier invoices", bank statements. Later commits added dues/payments/CAM/cashier/bank-rec, but grep across all scripts/demo finds NO code that creates expenses, suppliers, cheques, supplier invoices or fixed assets.

## 1. Revenue 4100/4400 credit balances labelled debit - PRODUCT defect (presentation logic)
- RPC get_trial_balance (supabase/migrations/20261001123000_final_hardening_sprint.sql:33-37) returns `balance` in the account's NORMAL direction: credit-normal accounts give credit minus debit, so a normal revenue balance is POSITIVE.
- Client app/[locale]/(app)/finance/reports/trial-balance/trial-balance-client.tsx:337 sets `isDebitBalance = r.balance >= 0` and :363 prints Dr/مدين when positive, Cr/دائن otherwise. It ignores normal_balance (not in the TrialBalanceRow type :25-34; page.tsx casts RPC rows). Every positive credit-normal balance (revenue, liabilities, equity) shows as Dr. Introduced in df3b317 (Aug 19).
- DB data is correct: seed sets 4400 CREDIT (story.ts:201); template 4100 is REVENUE/CREDIT (local DB). Chart of accounts shows account nature via normalBalanceLabel (lib/accounting/account-labels.ts:48; accounts-client.tsx:224,285,634), correct. General ledger shows running_balance with no side label (general-ledger-client.tsx:333): ambiguous, not wrong.
- Affects ALL tenants, not demo-specific.

## 2. Members: count 112, table empty - cause NOT PROVEN (swallowed query error is the code defect)
- Header/KPI count is a head count on `members` (app/[locale]/(app)/members/page.tsx:167,246,287). The table data comes from a different object, view members_with_financials (page.tsx:191-206; security_invoker=true confirmed locally). The view is `members LEFT JOIN` aggregates so it cannot drop rows by design.
- page.tsx:206 destructures only `{data, count}`; `error` is discarded. On any error members=null and MembersTable renders "No matching members found" (members-table.tsx:351) while the header still says 112.
- Candidates to check on hosted as the Auditor: (a) hosted view diverged/missing (member_archiving migration 20260823071129 redefines it; hosted ledger drift is documented in docs/migration-ledger-forensics-report.md); (b) privilege or RLS function error in the invoker chain (payments, unit_ownerships, dues, payment_allocations; same chain feeds units_with_financials which works on /property). Discriminator: `select count(*) from members_with_financials` and PostgREST error body as the demo principal.
- Classification: UNDETERMINED. If an error, PRODUCT/DEPLOYMENT defect, not demo data (member rows exist).

## 3. Dashboard 157 vs intro 156 - DEMO-DATA drift (+ product metric nuance)
- Intro uses the constant: app/[locale]/demo/page.tsx:59 -> DEMO_STORY.headline.units = 156. Dashboard uses a live raw count of `units` with NO archived filter (app/[locale]/(app)/dashboard/tenant-dashboard.tsx:131-134, :277).
- Seed produces exactly 156 (148 active + 8 archived) and verify-structural.ts:108-110 asserted equality at seed time. So the hosted org holds one extra units row added after verification (repair/apply-* scripts or manual). Which unit/property: NOT VERIFIED. (verify-structural.ts:122-127 already tolerates surplus members after repair.)
- Nuance: the dashboard figure includes the 8 archived units, so even a correct tenant reads 156 where 148 are active.

## 4. Nile Heights Compound shows zero units - cause NOT PROVEN; leading hypothesis duplicate/oldest property
- /property selects `resorts[0]` ordered by created_at ascending (property/page.tsx:139-156) and counts via units_with_financials where property_id = that resort (:167,184-185). `resorts` is a compatibility view over `properties` (baseline_schema.sql:12855-12876).
- Seed attaches NH units to the property whose CODE is "NH" and reuses the onboarding-created property only if its code matches (seed-demo-tenant.ts:451-485, :613). If the oldest (onboarding) property is named "Nile Heights Compound" with a different code, create_resort makes a second one and the page defaults to the empty twin. The seed verifier asserted exactly 3 properties, so this needs a post-seed change (possibly related to the extra unit in #3).
- Check: `select id, code, name, created_at from properties where organization_id=<demo>` and unit counts per property_id.
- Class: DEMO-DATA/provisioning, with a product weakness (default = oldest, not most populated).

## 5. Expenses, suppliers, PDC, audit trail empty
- Expenses/suppliers/PDC: DEMO-DATA deficiency. Pages query the right tables (expenses/page.tsx:96; suppliers/page.tsx:92; reports/pdc/page.tsx:65); Auditor holds finance.expenses.read / suppliers.read / payments.read; cheques_select_member (baseline line 16829) allows org members. The seed never creates these rows. Dashboard cheque count (tenant-dashboard.tsx:124-128) also reads empty.
- Audit trail: PRODUCT defect. reports/audit-trail/page.tsx:65 reads platform_audit_logs, whose only SELECT policy is platform-admin (baseline 17368 platform_audit_logs_select_admin). Demo principal (and every tenant user) is not a platform admin, so RLS returns [] regardless of data, while the page-level permission check passes.

## 6. CAM, fixed assets, CAPEX/OPEX "not available" - PRODUCT (hard-coded placeholder), not demo/gating
- reports/cam-allocation/page.tsx:60-66, reports/fixed-assets/page.tsx, reports/capex-opex/page.tsx return a static "Coming soon / Not available in this version." after the permission check passes; the real implementation is commented out (cam page :68). Identical for every tenant. The demo does contain CAM data (apply-cam.ts, service charges), but this report ignores it.

## Capabilities legitimately absent from the public demo
- Auditor is read-only by design and the demo is frozen; restrictions key off organizations.is_demo (is_demo_organization / is_demo_principal; RLS blocks alert_dismissals and profile writes; lease-rent sweep skips demo).
- Gates / QR visitor passes: nav needs operations.gates.view / operations.visitors.view / operations.gates.scan / operations.access_events.view (app/[locale]/(app)/layout.tsx:151-171; lib/auth/nav-permissions.ts). No operations.* key is in the Auditor set, so hidden and denied. Issuing/scanning passes are writes a shared frozen principal must not do. Maintenance (operations.maintenance.view, work_orders.view) likewise absent.
- Owner portal: /portal is for members linked via members.user_id / current_member_id() (docs/owner-portal-activation.md); staff-side invite/suspend need members.portal.invite / members.portal.manage, not in Auditor. The demo user is staff, not a member.
- Also absent: all *.manage/create/generate actions, online payment gateways (finance.online_payments.manage), import, subscription/billing (demo tenant has no subscriptions row per demo-plan.ts followUps).
- No plan/entitlement/feature-flag gating specific to the demo found in code; hosted flags NOT VERIFIED.

## Unverified / next checks (read-only on hosted)
1. members_with_financials error body as Auditor. 2. properties list, units per property, the 157th unit. 3. Row counts of expenses/suppliers/cheques for the demo org. 4. Hosted Auditor permission set vs local template.
