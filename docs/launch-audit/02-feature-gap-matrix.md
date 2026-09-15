# 02 — Feature Gap Matrix

Legend: **READY** = wired UI → action → DB with authorization and no known correctness defect on the happy path; **PARTIAL** = usable but materially incomplete; **BROKEN** = exists but cannot work or corrupts data; **MISSING** = promised or expected, not present; **NRIL** = not required for initial launch; **UNKNOWN** = needs live verification. A route existing is not READY.

| # | Capability | Status | Evidence | Required action |
|---|---|---|---|---|
| 1 | Multi-tenant organizations, RLS on all tables | READY (DB) / **BROKEN (app authz)** | 101/101 tables RLS; `has_permission` policies; but SEC-01 lets any member become platform admin via `lib/actions/users.ts` | Fix SEC-01/02 before any external user |
| 2 | Properties, buildings, zones | READY | `admin/resorts/*`, `manage-structure-dialog.tsx` → `tenant.ts`, `property.ts` | — |
| 3 | Units create/edit/archive/delete | READY | `unit-lifecycle.ts`, dialogs with AlertDialog | — |
| 4 | Members create/edit/archive/export | READY | `member-lifecycle.ts`, `member-profile.ts`, `members-export.ts` | — |
| 5 | Ownership & tenancy links | READY (DB gap) | link/unlink dialogs; `unit_ownerships` has no uniqueness / >100% guard (DB-08) | Add unique/overlap constraints |
| 6 | Leases | READY | create/activate/end/cancel RPCs | Dead `setUnitLeaseBillingRecipientAction` |
| 7 | Lease rent generation (scheduled) | **BROKEN (ops)** | Route + RPC correct; `CRON_SECRET` unset in CI → never executed (WF-18) | Configure secret in GitHub and Cloudflare; fail the workflow when unset |
| 8 | Dues — single | READY (with ACC-08 caveat) | `issue_dues` + posting trigger | Refuse or surface "no open period" |
| 9 | Dues — bulk | PARTIAL | action sends one unit id to array RPC | Multi-select |
| 10 | Dues — recurring non-rent | MISSING | `finance.schedules.*` seeded; no UI | Decide scope |
| 11 | Due void / cancel | MISSING | no `void_due`; only credit note (orphaned, tax-gated) | Add void with GL reversal, or documented credit-note policy |
| 12 | Member opening balances | READY | `record_member_opening_balance` → equity; test | Show tenant balances (ACC-12) |
| 13 | Chart-of-accounts opening balances | MISSING | no function; manual JV only; no retained-earnings close | Year-end close + opening JV feature |
| 14 | Payments + allocation | READY (defects) | `record_payment`; per-request idempotency key (WF-03); duplicate due over-allocation (ACC-05) | Fix both |
| 15 | Receipt printing/PDF | READY | `payment-receipt-pdf.ts` | — |
| 16 | Payment reversal / refund | **BROKEN** | `void_payment` fails on audit CHECK, no GL reversal, no UI (ACC-01/03, WF-01) | P0 fix |
| 17 | Credit notes | PARTIAL | works only under tax enforcement; orphan page; does not reduce collectible balance (ACC-06) | Wire nav; reconcile balances |
| 18 | Cashier sessions | READY (gaps) | open/close/reconcile; Z-report; variance not journaled, voids not reflected (ACC-11) | Post variance; tie session to resort/opener |
| 19 | Journal entries, maker-checker, posting | READY | DRAFT→review→POSTED with balance checks | — |
| 20 | Journal reversal | **BROKEN (reports)** | reversal works; all ledger reports then double-count (ACC-02) | P0 fix |
| 21 | Fiscal periods / locking | PARTIAL | post-time enforcement; arbitrary transitions (ACC-09) | Transition rules |
| 22 | Trial balance / GL / P&L / balance sheet / cash flow | PARTIAL | ledger-sourced but ACC-02; no retained-earnings roll | Fix ACC-02; year-end close |
| 23 | Aging, rent roll, owner statement, member/unit statements | READY (consistency risk) | operational-table formulas independent of ledger (ACC-13) | Single balance function |
| 24 | VAT return | PARTIAL | all-time `tax_decisions`, no period, not ledger-sourced (ACC-14) | Rebuild from ledger/period |
| 25 | Tax rules, mapping, enforcement | READY | versioned immutable rules; tests | Enforcement off by default — document |
| 26 | E-invoicing (ETA/ZATCA) | PARTIAL | pipeline + fake adapter; real adapters NOT_IMPLEMENTED | Relabel as readiness; do not sell |
| 27 | Service charges / levies | READY | rounding proven; no cancel function | Add confirm on issue |
| 28 | Broker commissions | READY | accrue/pay/voucher; no cancel | — |
| 29 | Security deposits | READY | events with guards; ADR 0002 open item | — |
| 30 | Unit handover + snags | READY | no accounting effect by design | — |
| 31 | Suppliers / expenses / purchasing | READY | WHT stored not journaled (ACC-15); supplier-payment void no UI | — |
| 32 | Bank accounts, cheques (PDC), reconciliation | READY | finalize gated on balanced | — |
| 33 | Budgets, fixed assets, projects/WIP, FX, dunning | READY | dunning delivery is manual | Marketing wording |
| 34 | Import (CSV + AI map), per-screen exports | READY / PARTIAL | no tenant-wide export | Soften "100% export" claim |
| 35 | Admin users & roles | **BROKEN (authz)** | wired but unauthorized (SEC-01/02); 16 dead permission keys in matrix | Fix authz; prune keys |
| 36 | Member portal (invite, OTP login, dues, receipts, docs, statement) | READY | E2E isolation + statement specs | Fix `/en/` hardcode in short links |
| 37 | Online payments — Fawry | PARTIAL | sandbox URL always; provider-settings tests need live DB | Env-aware URL before real money |
| 38 | Online payments — Paymob | UI WITHOUT BACKEND | settings accept; checkout rejects; no webhook | Hide |
| 39 | Notifications / alerts + daily digest | PARTIAL | app alerts work; digest cron never executed (WF-18) | Configure secret |
| 40 | Assisted onboarding (get-started → approval → provisioning) | MISSING on master (DB only) | schema live; UI only in PR #28 | Merge rebased #28 or retire schema |
| 41 | Self-service signup | NRIL (retired by design) | `signUpAction` refuses; `/auth/register` explainer | — |
| 42 | Plans / subscriptions / entitlements | PARTIAL (UI only) | `get_entitlement` has 0 callers; no limits enforced | Enforce or do not sell tiers by capacity |
| 43 | Platform super-admin console | PARTIAL | orgs/status/subscription; leads & audit read-only; no owner assignment UI | — |
| 44 | Demo tenant | READY (risk) | hardened DB-side; app-side guards unused (SEC-04) | Add `denyIfDemo` to admin-client actions |
| 45 | AI features (7 routes) + governance | PARTIAL / cosmetic | auth only; governance page does not persist; audit tables missing (DB-06) | Gate + persist or label preview |
| 46 | Maintenance / service requests / inventory / gate | MISSING | landing cards and `inventory.*` keys only; no tables or routes | Remove claims or mark roadmap |
| 47 | Automated late fees, sinking reserve, intercompany consolidation, anomaly alerts, ticketing | MISSING | 0 code hits (WF-09) | Remove from pricing page |
| 48 | Financial audit trail (hash chain) | PARTIAL | covers dues/opening balance only (ACC-07) | Extend to payments/reversals/periods/roles |
| 49 | Backup / restore | PARTIAL / UNKNOWN | `lib/backup/*` format + unit tests; no proven restore (see 09) | Restore rehearsal |
| 50 | Error / not-found / loading boundaries | MISSING | none under `app/` | Add at `[locale]` and `(app)` |
| 51 | Cloudflare deployment | READY (paid plan) | build + dry-run OK; 4.27 MiB gzip requires Workers Paid | Document plan dependency |
| 52 | Migration reproducibility | **BROKEN** | 15 applied migrations absent from Git (DB-01) | Export ledger statements |
