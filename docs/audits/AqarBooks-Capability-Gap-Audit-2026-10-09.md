# AqarBooks — Capability & Competitive Gap Audit (Daftra evaluation)

Audit date: 2026-10-09 · Mode: READ-ONLY (no product code changed, no migration applied, no production write, no deploy, no billable call)

## 0. Audited version and environments

| Item | Value |
|---|---|
| Repository | D:\Web\AqarBooks (Next.js + Supabase + Flutter `mobile/`) |
| Branch / HEAD | `master` @ `5d2804f3ac2979872e8f657da645ad5ef4c8852a` (2026-10-08, "fix(marketing): remove placeholder support phone") |
| Working tree | DIRTY, 43 entries. Tracked edits include `lib/actions/online-payment-checkout.ts`, `lib/payments/providers/fawry.ts`, `mobile/lib/**`, `tests/payments/fawry-adapter.test.ts`; new untracked `lib/payments/fawry-initiation-policy.ts` (hard-disables Fawry initiation), Play Console docs/screenshots, `supabase/proposals/`. Conclusions on payments reflect HEAD *and* working tree where they differ. |
| Local implementation | Inspected (static). |
| Merged code | `master` only. Demo seed scripts are NOT on master (branch `feat/public-demo-phase-1`). |
| Local database | A docker Supabase DB (`supabase_db_aqarbooks`, port 54322) was readable for part of the session (migrations `20260903172101` and `20261001123000` applied locally). Docker daemon then stopped. |
| Production / hosted DB | **NOT VERIFIED.** The Supabase MCP connector exposes only unrelated projects ("muhassil", "Trakova"); no AqarBooks project was reachable. Which migrations are applied in production is unknown. |
| Public demo `https://aqarbooks.com/ar/demo` | Intro page read only. Entering requires a sign-in server action that I did not trigger. All demo findings are **code-derived**, not observed on hosted data. |
| Deployed application version | NOT VERIFIED. |

**Safety note:** `.env.local` points to a *remote* Supabase project, and ~30 of the 50 `*.integration.test.ts` files use the service-role key against it. I deliberately did **not** run them (they write data). Only mocked/unit suites and local-docker suites were run.

---

## A. Executive assessment (for a tourist village / owners' association evaluating Daftra)

AqarBooks is **substantially more than the public demo shows**: double-entry journals with maker-checker states, fiscal periods, dues/receipts/cashier, credit notes, dunning, purchasing (PR→PO→bill→payment with VAT/WHT/FX), bank reconciliation, fixed assets, service-charge levies, an owner portal, maintenance/work orders, gate + QR visitor system, and a real Flutter app with five personas. Most of this is **IMPLEMENTED — RUNTIME NOT VERIFIED**; *nothing* was exercised end-to-end in this audit.

But it is **not safe to promise to this customer today** on these points:

1. **P0 security regression in repo**: `get_trial_balance` (migration `20261001123000`) is SECURITY DEFINER, granted to `authenticated`, with **no permission/tenant check** → any logged-in user of any organization can read any other organization's trial balance by passing its UUID. Confirmed from migration source (I re-read it); the baseline version had the check. If that migration is applied in production, this is a live cross-tenant financial-data leak. The test that "covers" it runs as service-role and cannot detect it.
2. **Year-end closing is a mock** (wizard toasts "unavailable in MVP"); no retained-earnings roll; no GL opening-balance tool. An accountant cannot close a year.
3. **No advance / unallocated payment**: a bank deposit that does not match a due cannot be recorded (allocations must sum exactly to the payment). This directly hurts the "Cairo office handles bank deposits" scenario.
4. **Outgoing / post-dated cheque lifecycle is absent** in practice (no action creates an outgoing cheque or posts it); only incoming cheques work.
5. **No inventory/stock** despite `inventory.*` permission keys, a STOREKEEPER role and a plan flag (placeholders only).
6. **Seats are not sold or enforced**: `max_users` exists as data (5/25/∞), nothing reads it; no per-org seat count, no add-on; pricing page numbers (3/10 users) contradict the DB (5/25).
7. **No HR / attendance (face/location) / payroll** — NOT FOUND.
8. **Permissions are organization-wide**: property-scoped role assignment is DB-capable but unused by `has_permission` and not operable from the admin UI. A "collections + expenses only" accountant needs a custom role and still receives `finance.entries.create` (also lets them draft journals and post supplier bills/payments).
9. **Online payment is not live** (Fawry initiation disabled in working tree; no merchant agreement). Collections are manual/cashier/bank-deposit.
10. Several demo-visible defects are real **product** bugs (Dr/Cr label on credit balances; swallowed members-query error; audit-trail page always empty for tenants; three report pages are placeholders yet listed in the hub).

**Bottom line:** credible foundation and wider than Daftra in real-estate operations (gates, QR, portal, maintenance), but weaker on year-end close, advances, outgoing cheques, inventory, HR, and seat licensing. Do not demo/promise the P0 items until fixed and verified on a real environment.

---

## B. Capability inventory

Legend: **IRNV** = IMPLEMENTED — RUNTIME NOT VERIFIED · **PARTIAL** · **BACKEND ONLY** · **UI ONLY/MOCK** · **NOT FOUND** · **NV** = not verified. No row is VERIFIED END-TO-END. Priority = importance for *this* customer. Full path/test detail: Appendices C and D.

### B1. Accounting
| Capability | Class | Key evidence | Limitation | Pri |
|---|---|---|---|---|
| Chart of accounts | IRNV | `finance/accounts`, `lib/actions/accounting.ts`, triggers `lock_coa_after_use`; `tests/chart-of-accounts-rls.integration.test.ts` | edit one by one | P1 |
| CoA templates / import | PARTIAL | `clone_chart_of_accounts_template`; only RESORT_STANDARD (24 accts) | no owners'-association template, no CoA import/export, no report builder → weak on "accounting-code/report design assistance" | P1 |
| Manual journals, review, post | IRNV | `create_journal_entry`, `post_journal_entry_internal`; `supabase/tests/phase3_journal_integrity.sql` | no attachments/recurring; no creator≠poster rule | P1 |
| Reversal | IRNV | `reverse_journal_entry`, `void_payment`, `cancel_supplier_invoice` | reversal posts in *current* open period only | P2 |
| Fiscal years/periods | IRNV | `admin/finance/periods`; states PLANNED/OPEN/CLOSED/LOCKED | status flag only; no tests | P1 |
| Opening balances | PARTIAL | member receivable opening balance (`20260903172101`, tested); GL/supplier opening balances NOT FOUND | manual journal only | P1 |
| Year-end closing | **UI ONLY/MOCK** | `periods-client.tsx` wizard toasts "unavailable" | no closing entry, no retained-earnings roll | **P0/P1** |
| Cost centers | PARTIAL (trap) | table + `requires_cost_center` enforced at posting | no UI/action to create, no field in forms → flagged account cannot be posted from UI | P1 |
| Trial balance | IRNV + **P0 SECURITY DEFECT** | `20261001123000` L5-57 | cross-tenant read; sums date range only (no carry-forward) | **P0** |
| GL, income statement, balance sheet, cash flow | IRNV | `get_account_ledger`, PDF/Excel export | no closing roll; e2e only | P1 |
| Budgets / budget-vs-actual | IRNV | `finance/budgets` | no versions/approval | P2 |
| CAM / fixed-assets / CAPEX-OPEX **reports** | UI ONLY (placeholder) | static "Coming soon" | still listed in reports hub; stale e2e asserts old mock | P2 |
| Fixed assets (register, depreciation, disposal) | IRNV | `fixed-assets.ts`; tests exist (service-role) | — | P2 |
| FX, e-invoice/VAT | IRNV / PARTIAL | `exchange_rates`, `zatca.ts`; ETA adapter throws NOT_IMPLEMENTED | Egypt e-invoice (ETA) not live | P1 |
| Legacy Access/Accsys import | BACKEND ONLY | `accsys_stage.*` migrations | operator-run SQL, no UI | P1 if migrating history |

### B2. Collections
| Capability | Class | Evidence / limitation | Pri |
|---|---|---|---|
| Dues, recurring, installments, lease rent | IRNV | `issue_dues`, `run_due_schedules`; `phase4_receivables_integrity.sql` | P0 (core) |
| Payments + receipts + partial payments | IRNV | `record_payment` → `post_payment_internal` (idempotency, advisory lock, allocations) | P0 |
| **Advance / overpayment / credit balance** | **NOT FOUND** | allocations must sum exactly to amount | **P0** |
| Payment reversal (void) | IRNV | `void_payment` (fixed `20261001123000`) + UI `payments-client.tsx handleVoid` | P1 |
| Refunds (non-deposit) | NOT FOUND | only lease deposit events | P1 |
| Credit notes | IRNV | `issue_credit_note`; test exists | P2 |
| Cashier sessions / Z-report | IRNV | `cashier.*`; `phase5_treasury_integrity.sql` | P0 (village accountant) |
| Incoming cheques (RECEIVED→DEPOSITED→CLEARED) | IRNV | `record_incoming_cheque`, `clear_incoming_cheque`; revenue only on clearance | P1 |
| **Outgoing / post-dated cheques** | **NOT FOUND (practically)** | `set_cheque_status` allows states but nothing creates/posts an OUTGOING cheque; PDC & forecast reports read rows that can't exist | **P1** |
| Dunning | IRNV | policy + stages; delivery recorded manually | P2 |
| Service charges / levies | PARTIAL | AREA/EQUAL/CUSTOM allocation; no meter billing/reserve fund; no dedicated test | P1 |

### B3. Banking
| Capability | Class | Notes | Pri |
|---|---|---|---|
| Bank/account master | IRNV | org-level, GL-linked | P1 |
| Direct deposits | PARTIAL | allocation to dues mandatory; no suspense/unidentified deposit, no deposit-specific permission | **P0 for Cairo office** |
| Transfers | NOT FOUND | manual journal only | P1 |
| Reconciliation | IRNV (controlled workflow) | DRAFT→RECONCILED, zero-difference check, reopen; no adjustment journals, no OFX/MT940, no dedicated test | P1 |

### B4. Purchasing & expenses
| Capability | Class | Notes | Pri |
|---|---|---|---|
| Suppliers | IRNV | tax no., IBAN, terms | P1 |
| PR → PO with approvals | IRNV | `phase6_purchasing_integrity.sql` | P2 |
| Supplier bills (VAT/WHT/FX), supplier payments | IRNV | post immediately; no approval, no attachments, no 3-way match | P1 |
| Expenses | IRNV | posts immediately; no approval/attachment | P0 (village accountant) |
| **Inventory / materials** | **NOT FOUND** | permission/role/flag placeholders only | P1 (scope TBC) |

### B5. Property
| Capability | Class | Notes |
|---|---|---|
| Projects, zones, buildings, units | IRNV | `max_units/max_resorts` not enforced |
| Members, archiving, opening balance | IRNV | |
| Ownership shares | IRNV | trigger caps total at ≤100%; never requires =100; owner statement ignores `share_percentage` (co-owners each credited full unit collection) |
| Bulk import (units/members) | IRNV | financial history not importable via UI |

### B6. Owner/customer portal
| Capability | Class | Gate |
|---|---|---|
| Activation (email link or client-ID + temp password) | IRNV | `members.portal.invite/manage`; Resend needed; migration `20261004120000` applied in prod: NV |
| Login, balances, dues, statement, payment history, receipts, documents | IRNV | not plan-gated; org TRIAL/ACTIVE |
| Online payment | IRNV at HEAD; **DISABLED in working tree** | no merchant agreement; Paymob contract-test only |
| Maintenance requests, visitors/QR, vehicles, amenities, leases, notifications | IRNV | plan PROFESSIONAL+ or `tenant_feature_flags` (no UI to set flags) |

### B7. Maintenance
Requests, work orders (assign to user XOR supplier, SLA, status machine), photo attachments, cost → expense / supplier invoice / owner-charge bridge: **IRNV**. Limits: work-order read is org-wide by RLS ("my tasks" is client filtering); no technician role template; a field technician needs `.manage`.

### B8. Gates / security
Gate setup, trusted device enrolment, QR passes (≤30 days, hash-only secrets, single/multi-use, revoke), entry/exit decisions with append-only ledger, occupancy, exceptions with separate approval, supervision evidence, long-stay policy, owner entry notifications: **IRNV** (merged to master; many local tests). Limits: **fail-closed offline** (service worker caches 4 static assets; connectivity loss = no QR admission); hardware adapter is NOOP (cannot open a barrier); completion features require per-org `gate_completion_policy` opt-in; handoff doc states it is not a production-readiness certificate. Gate setup requires `visitor_management` (PROFESSIONAL+).

### B9. Roles / permissions
12 system templates (no gate-operator, technician, demo, or owner role; owners are `members` rows). Custom roles via `/admin/roles` limited to keys present in templates; atomic replace is fixed. **Property scoping not enforced.** Suspension: `has_permission` does not check membership status and no session revocation was found — **verify at runtime (P0 if confirmed)**.

### B10. Mobile / PWA / notifications / integrations / AI
- Flutter app real (resident, manager, collector, technician, gate personas); no push, no geolocation/face packages. `preview_main.dart` is a mock gallery. Google Play 1.0.0 draft, Egypt only, **not submitted**; AAB/listing/screenshot still carry Fawry claims.
- PWA: gate scanner only.
- Email via Resend (optional); WhatsApp = `wa.me` deep links only; SMS/push NOT FOUND.
- AI: routes exist; **governance page is a static shell**, kill switch in-memory and unwired, `ai_audit_logs` has no migration (writes silently no-op).

### B11. HR / attendance / payroll
**NOT FOUND** (no tables, screens, permissions, packages; grep evidence in Appendix D).

### B12. Trial, subscription, seats, onboarding, support
Trial = status flag, no expiry/limits/conversion. Subscriptions manual (`assign_subscription`), no billing, `period_end` unenforced. **User limits not enforced; flexible paid seats NOT FOUND.** Onboarding is assisted (entity types include TOURIST_VILLAGE, OWNERS_ASSOCIATION), approved by platform admin. Support/training: contact form + support email only; no in-app help or training content.

---

## C. Role / demo / portal visibility matrix

Demo principal = shared user with the **AUDITOR** role (27 read/view keys locally, no `operations.*`, no `*.manage/create`), org flagged `is_demo`, writes blocked by RLS/`denyIfDemo`. Hosted keys/flags: NV.

| Feature | Route / surface | Required permission | Entitlement / flag | Demo? | Customer (owner)? | Staff? | Evidence |
|---|---|---|---|---|---|---|---|
| Finance reports (TB, GL, IS, BS) | `/finance/reports/*` | `finance.reports.read` | — | yes (read) | no | yes | Auditor keys |
| Dues, payments, cashier | `/finance/dues|payments|cashier` | `finance.dues.read`, `receivables.payments.create`, `cashier.*` | — | read only | own dues via portal | yes | |
| Expenses / suppliers / PDC | `/finance/expenses|suppliers`, reports/pdc | `finance.expenses.read`, `suppliers.read`, `payments.read` | — | pages visible, **empty** (no seed data) | no | yes | B-demo |
| Audit trail | `/finance/reports/audit-trail` | `finance.audit.read` | — | visible, **always empty** (platform-admin-only RLS) | no | empty for tenants too | page.tsx:65 |
| Roles / users | `/admin/roles|users` | `tenant.roles.manage`, `tenant.users.manage` | `max_users` unenforced | write-blocked | no | yes | layout |
| Gate scanner | `/operations/gate` | `operations.gates.scan` + trusted device | `visitor_management` | **not shown (by design)** | no | gate operator | layout L151-171 |
| Gate setup / devices / ledger / occupancy | `/operations/gates*`, `access-events` | `operations.gates.*`, `access_events.view` | `visitor_management` (+ `gate_completion_policy`) | not shown (by design) | owner gets entry notification (opt-in) | managers | migrations 2026092* |
| QR visitor passes (issue) | `/portal/visitors`, staff `/operations/visitors` | owner session / `operations.visitors.*` | `visitor_management` | not shown | yes (PRO+) | yes | |
| Maintenance / work orders | `/operations/maintenance*`, `/portal/maintenance` | `operations.maintenance.*`, `work_orders.*` | `maintenance_module` | not shown | yes (PRO+) | yes | |
| Owner portal (dues, statement, payments, documents) | `/portal` | member session | none | not shown (demo user is staff) | yes | no | owner-portal-activation.md |
| Online payment | portal / `finance.payment-providers` | `finance.online_payments.manage` | provider settings, pilot allowlist | no | **currently unavailable** | admin | fawry-initiation-policy.ts |
| Vehicles / amenities / leases | `/portal/*`, `/operations/*` | various | `unit_experience`, `amenity_bookings`, `lease_lifecycle` | not shown | PRO+ | yes | |
| AI governance | `/admin/ai-governance` | `tenant.settings.manage` | — | shell | no | yes | |
| Platform admin / leads | `/platform/*` | `is_platform_admin` | — | no | no | platform staff only | middleware |
| Mobile personas | Play app | per-persona permission keys | server entitlements | n/a | resident | manager/collector/technician/gate | mobile/README.md |

**Legitimately absent from the public demo (do not count as missing):** gates, QR passes, maintenance, owner portal, provisioning, imports, billing — the demo user is a frozen read-only staff Auditor with no `operations.*` or `members.portal.*` keys and is not a `members` row. These must be shown via a separate seeded sandbox with appropriate roles/flags.

---

## D. Historical finding reconciliation

Fix source for items 1, 2, 4, 5, 6: **incremental migration** `supabase/migrations/20261001123000_final_hardening_sprint.sql` (commit `c6e67a9`), baseline file not edited. Applied locally: yes. **Production: NOT VERIFIED.**

| # | Historical issue | Current code evidence | Migration | Deployment verified? | Test evidence | Status |
|---|---|---|---|---|---|---|
| 1 | `get_trial_balance` included draft/out-of-period lines | Baseline filters sat in a LEFT JOIN `ON` (ineffective). New def uses `EXISTS(... status='POSTED' AND entry_date BETWEEN …)` | 20261001123000 L5-57 | local yes / prod NV | `final-hardening.integration.test.ts` (service-role) | Filter **FIXED (local)**. **NEW BLOCKER:** auth check dropped; SECURITY DEFINER + `authenticated` grant → cross-tenant read. **OPEN** |
| 2 | `void_payment` / `PAYMENT_REVERSED` violated `check_audit_action`; no UI | Constraint recreated incl. PAYMENT_REVERSED; `void_payment` rewritten; UI `payments-client.tsx` L141-160 → `voidPaymentAction` | 20261001123000 L60-67, L215-317 | local yes / prod NV | final-hardening tests (service-role + outsider denial) | FIXED (local). Caveat: posts in current open period only |
| 3 | Owner/member statement invalid field queries | Columns used by owner-statement, portal statement and member page all exist in local schema | none (app code) | n/a | **no direct test**; e2e not run | FIXED-IN-REPO-ONLY (not executed). Open: owner statement ignores `share_percentage`/`end_date` (co-owners over-credited) |
| 4 | Non-atomic role permission replacement | `replace_role_permissions_atomic` called from `lib/actions/roles.ts` L173 | 20261001123000 L134-177 | local yes / prod NV | final-hardening L231-233 rollback test | FIXED (local); fn relies on service-role-only grant |
| 5 | Audit-chain read across orgs | `verify_financial_audit_chain` now requires auth + `finance.audit.read`/`reports.read` | 20261001123000 L76-130 | local yes / prod NV | string tests + positive path; **no cross-org denial test** | FIXED (local, by definition). `financial_audit_logs` RLS lets any active org member read own-org rows (same-org breadth, IMPORTANT/MINOR) |
| 6 | Ownership percentage bypass | trigger `enforce_unit_ownership_total` (advisory lock, overlapping ranges, ≤100) | 20261001123000 L182-210 | local yes / prod NV | final-hardening ownership section | FIXED (local). Not "must equal 100" |
| 7 | Mock CAM / fixed-assets / CAPEX-OPEX | Fabricated numbers replaced with static "Coming soon"; old code left commented | none | n/a | `e2e/reports-suite-flow.spec.ts` L170-186 still asserts old mock (stale) | FIXED-IN-REPO-ONLY: no fake numbers, **real reports not built**, still listed in hub |
| 8 | Opening balances / year-end closing | Member opening balance works (RPC, dialog, 11-case test). Period close is a status flag; no closing entries; BS sums TB from 1900-01-01 | 20260903172101 (member OB only) | local yes / prod NV | `member-opening-balance.integration.test.ts` | Member OB FIXED; **year-end closing & GL opening balances OPEN (not implemented)** |

An edited baseline alone proves nothing for an existing DB: here fixes live in an incremental migration, so they exist in a given database only once `20261001123000` is applied there. Run `supabase migration list` against the real AqarBooks project.

---

## E. Demo discrepancy root causes (code-derived; hosted data NOT observed)

| Observation | Root cause | Class | Confidence |
|---|---|---|---|
| Revenue 4100/4400 credit movement labelled debit | `get_trial_balance` returns balance in the account's *normal* direction (credit-normal ⇒ positive). `trial-balance-client.tsx:337/363` treats `balance >= 0` as Dr and ignores `normal_balance`. Affects **all** tenants. DB data is correct. | **PRODUCT defect** (presentation) | High |
| Members: count 112, empty table | Count is from `members`; rows from view `members_with_financials`. `members/page.tsx:206` discards `error`, so any query failure renders "no matching members". Underlying error not observed (candidates: hosted view drift per ledger-drift forensics; privilege/RLS error in the invoker chain). | Code defect (swallowed error) + **UNDETERMINED** trigger | Medium |
| Dashboard 157 vs intro 156 | Intro uses constant 156 (`story.ts`); dashboard live-counts `units` with no archived filter. Seed yields exactly 156 (148 active + 8 archived); hosted has one extra row added after verification. Metric also counts the 8 archived units. | **Demo-data drift** + metric wording | Medium-High |
| Nile Heights Compound = 0 units | `/property` defaults to the *oldest* property; seed attaches units to the property whose code is "NH" and reuses an onboarding property only if code matches → likely an empty twin with another code. | Demo-data/provisioning (+ weak default) | Medium (not proven) |
| Expenses, suppliers, cheque portfolio empty | Seed never creates expenses, suppliers, supplier invoices or cheques; pages query correct tables and Auditor has read keys. | **Demo-data deficiency** | High |
| Audit-trail empty | Page reads `platform_audit_logs`, whose only SELECT policy is platform admin → `[]` for every tenant user even with a passing page permission. | **PRODUCT defect** | High |
| CAM, fixed assets, CAPEX/OPEX "not available" | Hard-coded placeholder after permission check, identical for all tenants; demo does contain CAM data but report ignores it. | **PRODUCT (unimplemented)** | High |

Separation: *demo-data deficiencies* = 156/157 drift, Nile Heights, empty expenses/suppliers/cheques. *Missing/defective product* = Dr/Cr label, swallowed members error, audit-trail source, three stub reports. The seed script referenced by `lib/demo/config.ts` is not on master, so the demo cannot be re-seeded from the audited commit.

Discriminating read-only checks on hosted (not run): `select count(*) from members_with_financials` + PostgREST error as the demo principal; list properties by code/created_at with unit counts; row counts for expenses/suppliers/cheques; hosted Auditor key set.

---

## F. Customer-specific gap analysis

Reference: Daftra quoted on the supplied call (call-specific, **not independently verified**): base EGP 23,520/yr incl. one administrator; extra user EGP 3,528/yr; extra financial branch EGP 11,760/yr; 3 users total EGP 30,576 (= 23,520 + 2×3,528 ✔); 3 extra users + admin EGP 34,104 (= 23,520 + 3×3,528 ✔). No AqarBooks pricing or support promise is inferred from code; note the pricing page figures (3/10 users) conflict with DB seeds (5/25).

| Customer need | AqarBooks today | Gap | Pri |
|---|---|---|---|
| Village accountant: collections + expenses | Cashier, dues, payments, expenses, receipt PDF exist (IRNV) | Needs custom role; `finance.entries.create` coupling gives journal-draft + supplier bill/payment rights; no approval/attachment on expenses | P1 |
| Cairo office: bank deposits + general bills | Bank accounts, deposits-as-payments, supplier bills, reconciliation exist | **Unallocated/advance deposits impossible**; no suspense account; no transfers; no deposit-specific permission | **P0** |
| One financial entity, separation only if needed | One `organizations` row; `properties` = sites; bank/cash org-level | Meets "one entity". No true branch/entity or consolidation (Daftra charges per branch) — acceptable | P2 |
| Accounting-code / report design help | Editable CoA, one template | No association template, no import/export, no report builder, cost centers unusable | P1 |
| Precise user permissions | ~100+ keys, custom roles | Org-wide only; no UI for property-scoped assignment; suspension semantics unverified; no technician/gate roles | P1 (P0 if suspension flaw confirmed) |
| Accountants trial the system before approval | TRIAL status, public read-only demo | Trial never expires and has no limits/sandbox; demo shows defects (Dr/Cr, empty pages); no safe writeable sandbox flow | P1 |
| Training & replacement when employee leaves | Invite/suspend/remove, audit | No record-reassignment tool; no training content/help center | P1 |
| Flexible paid user count (3 total vs 3 additional) | `max_users` data only | **Not enforced, not per-org, no add-on billing** | P1 (commercial) |
| Written technical + financial proposal | — | Needs owner input; capabilities in §G/H usable as base | P1 |
| *To confirm:* full HR, location/face attendance, penalties | NOT FOUND | Entire module absent — likely out of scope unless confirmed | P2 (scope) |
| *To confirm:* inventory | NOT FOUND (placeholders) | Absent | P1 if required |
| *To confirm:* outgoing/post-dated cheques | Not functional | Absent | P1 |

### Findings registry (priority)
- **P0:** (1) restore authorization in `get_trial_balance` + cross-org negative test; (2) advance/unallocated payment support; (3) year-end close / GL opening balances; (4) confirm suspended-user semantics (U1) and cross-tenant exposure of other SECURITY DEFINER functions rewritten without checks.
- **P1:** outgoing cheque lifecycle; seat/entitlement enforcement + pricing/DB reconciliation; property-scoped role UI + `has_permission` scope; cost-center UI; inventory (if in scope); CoA template/import; bank-rec adjustments/import; swallowed-error and Dr/Cr label fixes; audit-trail data source; trial expiry; gate offline policy decision; Fawry-free payment story for V1.
- **P2:** stub reports removal from hub; wrong permission keys on ap-aging; AI governance shell; WhatsApp API/SMS/push; co-owner statement semantics; stale e2e.

---

## G. What we can demonstrate and promise today (with evidence level)

**Can demonstrate** (on a prepared test tenant, not the current public demo — and only after the P0 security item is fixed or confirmed absent in the target DB):
- Chart of accounts, manual journal create → review → post → reverse, fiscal periods, GL/IS/BS exports (code + `phase3`/`phase7` SQL tests; *service-role, not runtime-verified here*).
- Dues → payment → receipt PDF → void; cashier open/close with Z-report; credit notes; dunning.
- Purchasing PR→PO→bill (VAT/WHT)→payment; expenses; suppliers.
- Incoming cheque lifecycle; bank reconciliation workflow.
- Service-charge levy allocation by area/equal/custom.
- Owner portal (dues, statement, receipts), maintenance requests/work orders, QR visitor passes and gate scanning (PROFESSIONAL+ flags), mobile app personas (needs real devices/backends).

**Can state as fact:** one organization with multiple sites; custom roles; audit hash-chain verify RPC; QR secrets stored hashed; gate ledger append-only; owner seats do not consume staff seats (data model).

**Must not promise yet:** year-end closing; advance/overpayment handling; outgoing cheques; inventory; HR/attendance/payroll; online payment/Fawry; seat limits/add-ons; push/SMS; ETA e-invoice; barrier hardware control; offline gate operation; CAM/capex/fixed-asset *reports*; AI governance controls; property-scoped permissions.

---

## H. Needs validation, completion, or scope clarification

1. **Production state**: run `supabase migration list` / function-definition checks on the real AqarBooks project (was it `20261001123000`, `20261004120000` applied? is `get_trial_balance` exposed?).
2. **Runtime verification** of every IRNV workflow in a disposable local environment (this audit executed none): collections→receipt→void, journal post/reverse, supplier bill→payment, bank rec, QR pass issue→scan→revoke→expired, portal activation.
3. Non-service-role authorization tests for finance RPCs (existing integration tests bypass auth).
4. Suspended-user permission behaviour; technician-must-be-assignee on `transition_work_order`.
5. Hosted demo data checks listed in §E.
6. Customer scope: HR/attendance, inventory scope, outgoing cheque lifecycle, whether historical data must be migrated (Accsys toolkit is operator-run).
7. Gate operations at a remote village: connectivity SLA vs fail-closed design; device/hardware expectations.
8. Commercial: seat model, plan limits, pricing page vs DB, training/support commitments (not derivable from code).
9. Play Store release: Fawry claims in AAB/listing; Data Safety.
10. Governance: `ai_audit_logs` missing migration; incident doc shows a local test run once hit a real Supabase project — enforce local-only test guards.

---

## I. Recommended next steps and acceptance criteria (no implementation yet)

| # | Step | Acceptance criteria |
|---|---|---|
| 1 | Production audit of applied migrations and RPC grants | Written inventory of applied migrations vs repo; `get_trial_balance` definition in prod captured |
| 2 | Fix `get_trial_balance` authorization (new migration, not baseline edit) | Authenticated user of org A gets `42501` for org B id and for lacking `finance.reports.read`; authorized user still gets correct POSTED-only, in-period result; test uses an authenticated (non-service-role) client; same sweep of every function rewritten in `20261001123000` and other SECURITY DEFINER finance RPCs |
| 3 | Advance/unallocated payments | Deposit with no due records an unapplied credit on the member ledger, journals balance, appears in statement, can later be applied; idempotent; audited |
| 4 | Year-end close + GL opening balances | Closing entries zero P&L into retained earnings, locks the year, opening balances carried forward; reopening is permissioned and audited; BS correct without 1900-01-01 workaround |
| 5 | Outgoing cheque lifecycle (if confirmed) | Issue linked to supplier payment, GL effect on issue/clear/return, PDC & forecast report match |
| 6 | Seat/entitlement enforcement and pricing reconciliation | Invite blocked beyond per-org limit; limit editable per org; pricing page = DB; add-on semantics defined |
| 7 | Permission scoping + user lifecycle | Property-scoped assignment usable in UI and honoured by `has_permission`; suspended user loses access immediately (session revoked); reassignment tool |
| 8 | Demo and report hygiene | Dr/Cr label by normal balance; surface `members` view errors; audit-trail reads tenant-visible source; hide or implement 3 stub reports; seed script on master; fix 156/157 and default property; add expenses/suppliers/cheques sample data |
| 9 | Customer-ready sandbox | Writable disposable tenant with PROFESSIONAL flags, village-accountant and Cairo-office roles, so accountants can try before committee approval |
| 10 | Proposal inputs | CoA template for tourist village / association; training & replacement process; HR/inventory scope decision |

---

## J. Verification performed (exact commands, outcomes, limits)

| Check | Command (abridged) | Result |
|---|---|---|
| Unit/mocked suites (65 files, no remote DB; Supabase env vars overridden to dummy `http://127.0.0.1:1`) | `npx vitest run <65 non-integration files>` | **578 passed, 51 skipped, 0 assertion failures; 63 files passed, 1 skipped, 1 file failed** — `tests/gate-hardware-outbox-migration.test.ts` `beforeAll` timed out at 10 s (local Docker DB harness). Classified **ENVIRONMENT_OR_HARNESS** on evidence: rerun with `--hookTimeout=120000` exited 0 (323 s; ran against the local docker DB, since stopped). |
| Typecheck | `npx tsc --noEmit -p .` | no errors reported |
| Lint | `npx eslint app lib --quiet` | no errors reported (warnings suppressed by `--quiet`) |
| Remote-DB integration tests (~30 files) and Playwright e2e | **not run** | would write to the remote Supabase project in `.env.local` / need a running app → **NOT RUN** |
| Local-DB tests under `supabase/tests/*.sql`, `pgtap.integration.test.ts` | **not run** (uses `.env.local` remote) | NOT RUN |
| Hosted demo | intro page only | runtime observations NOT VERIFIED |

Also note: existing "integration" tests prove arithmetic and idempotency but, being service-role, **do not prove authorization**; "RLS enabled" is not treated as proof of correct policies.

---

## Appendices (evidence detail, same folder)
- `docs/audits/_parts/A-historical.md` — historical findings with line references
- `docs/audits/_parts/B-demo.md` — demo discrepancy tracing
- `docs/audits/_parts/C-finance.md` — finance inventory incl. test names
- `docs/audits/_parts/D-ops.md` — operations/portal/gates/roles inventory and full visibility matrix

*Findings are tied to commit `5d2804f` and the environments listed in §0. Subagent static-analysis claims were spot-checked where noted (get_trial_balance migration re-read directly); remaining line-level citations rely on the appendix authors and should be re-checked before being quoted to the customer.*
