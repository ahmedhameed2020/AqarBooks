# Phase 1 — Financial-report authorization & tenant isolation (local)

> **Updated in Phase 1.1** (`Phase1.1-Roles-Membership-Audit-Report-2026-10-09.md`): function counts corrected (16 changed functions: `get_trial_balance` + 13 helpers + role replacement + ownership trigger); `replace_role_permissions_atomic` now re-verifies the acting user in the database; the 9 Oct statement that suspension left permissions intact was wrong (`invited` was the real gap in `is_org_member`).

Date: 2026-10-09 · Branch: `fix/phase1-financial-report-authz` (from `master` @ `5d2804f`) · Status: **implemented and tested locally; not committed, not deployed, production never contacted.**

## 1. Problem

`supabase/migrations/20261001123000_final_hardening_sprint.sql` rewrote `get_trial_balance` as `LANGUAGE sql SECURITY DEFINER` and dropped the baseline's `has_permission(... 'finance.reports.read')` check, while `EXECUTE` stayed granted to `authenticated`. Any signed-in user could read any organization's trial balance by passing its UUID. The existing integration test calls the function as `service_role`, so it could not see this.

Sweeping the local database for the same class of defect (SECURITY DEFINER, executable by `authenticated`, no identity/membership/permission check) found more:

| Finding | Severity |
|---|---|
| `get_trial_balance` — cross-tenant read of balances | **P0** |
| `replace_role_permissions_atomic` — no caller authorization; `REVOKE … FROM PUBLIC, anon` in 20261001123000 never removed Supabase's default `authenticated` grant, so any signed-in user could rewrite the permission set of any custom role in any organization | **P0** (found by the existing grant-baseline test, which was already failing at HEAD) |
| 13 finance helpers taking only an org/document id with no check: `due_outstanding`, `creditable_remaining`, `depreciable_remaining`, `depreciation_for_period`, `resolve_due_buyer`, `project_wip_summary`, `check_fx_readiness`, `check_asset_disposal_readiness`, `resolve_input_tax_account`, `resolve_output_tax_account`, `get_exchange_rate`, `convert_to_base`, `compute_input_tax_split` — none called by the app, any policy, view, default or invoker-context function | P1 |
| `financial_audit_logs` SELECT policy allowed *every* active org member (gate operator, technician…) to read the financial audit chain | P1 (same-org) |
| `enforce_unit_ownership_total` (trigger function) executable by `anon` | P2 hygiene |

## 2. What changed

New forward-only migration `supabase/migrations/20261009120000_phase1_financial_report_authz.sql` (no old migration edited):

1. `get_trial_balance` recreated as `plpgsql SECURITY DEFINER`, `search_path=public`: identity only from `auth.uid()`; rejects unauthenticated, `NULL` org, non-members, **suspended/invited memberships** and users without `finance.reports.read` (via `has_permission`, which requires `organization_memberships.status = 'active'`; platform admin allowed); `service_role` bypass kept (trusted server key, same as `verify_financial_audit_chain`). The corrected POSTED-only / in-period / non-group semantics are preserved. `anon` revoked.
2. The 13 helpers: `EXECUTE` revoked from `PUBLIC, anon, authenticated`, granted to `service_role` (still reachable from other SECURITY DEFINER functions, which run as owner).
3. `financial_audit_logs`: SELECT policy now requires `finance.audit.read` or `finance.reports.read`.
4. `replace_role_permissions_atomic`: revoked from `authenticated` (the app calls it only through the server-side admin client in `lib/actions/roles.ts`); `enforce_unit_ownership_total` revoked from clients.

Tests / guards:
- **New** `tests/finance-report-authz.integration.test.ts` (29 tests, local-only guard, fixtures seeded with the local key, **every authorization assertion made through real user sessions or anon, never `service_role`**): authorized read with exact figures (draft excluded, prior-year excluded, opening-balance entry included, debits = credits, credit-normal balance sign); period filtering; org B accountant sees only B's figures; A→B and B→A denied; no-membership, wrong-permission, no-role, **suspended**, **invited**, `NULL` org, random org, and anon all denied (`42501`); each of the 13 revoked helpers denied to an authorized accountant and to anon (the first version of the test covered 12 — `compute_input_tax_split` was missing; corrected in Phase 1.1, which derives the list from the migrations); audit-log row visibility.
- `tests/security-function-grants.integration.test.ts`: the 13 helpers moved to the internal denylist / out of the authenticated allowlist (as that file's own instructions require).
- `tests/migration-directory-guard.test.ts`: new migration registered (bytes/sha256, count 27→28).
- `tests/{dunning,exchange-rates,fx-difference,project-wip}.integration.test.ts`: 8 assertions that called the now-internal helpers through an authenticated session changed to the server client. These tests were encoding the old exposure; they test business logic, not authorization.

## 3. Results (commands run, local stack only)

| Check | Result |
|---|---|
| Negative control: re-apply the pre-fix definitions/grants/policy locally, run the new test | **22 of 29 fail** (incl. org A reading org B) → test detects the defect; fix re-applied → **29/29 pass** |
| `npx vitest run tests/finance-report-authz.integration.test.ts` (plain command) | 29 passed |
| `tests/security-function-grants.integration.test.ts` | 4 passed (it failed at HEAD on `replace_role_permissions_atomic` / `enforce_unit_ownership_total`) |
| 18 related integration files against **local** DB (env overridden to the local API; tax, FX, fixed assets, credit notes, input/output VAT, supplier invoices, COA RLS, opening balance, dunning, final-hardening…) | 139 passed, **7 failed — the same 7 fail on the pre-fix state** (see §5) |
| Unit/mocked suites (65 files) + `migration-directory-guard` | 586 passed; guard fixed (79/79) |
| `npx tsc --noEmit`, `eslint` on touched tests | clean |

Not run: Playwright e2e; the other ~30 integration files (repo default points them at the remote project — I overrode the env instead of running them as-is); a from-scratch replay of all migrations on an empty database (would require `db reset`, which would wipe the local data you asked me not to clean).

## 4. Proven locally vs. needs deployment-side verification

**Proven locally (user sessions, local Postgres + PostgREST):** the six required scenarios — authorized user reads own org; org A user cannot read org B; user without permission denied; suspended user denied; unauthenticated denied; plus invited/NULL/random-org cases; trial-balance correctness (period, drafts, opening-balance entry, debit/credit, normal-balance sign).

**Needs verification in the deployed environment (NOT VERIFIED):**
1. Whether `20261001123000` is applied in production (if yes, the cross-tenant read and the role-permission exposure are live until this migration is applied). Run `supabase migration list` on the real project.
2. After applying `20261009120000`: re-run the same user-session checks against a staging project, and inspect `pg_proc`/ACLs for the 14 changed functions.
3. Supabase default privileges in production (the `authenticated` default grant that undid the earlier REVOKE).
4. Local ledger: I inserted the migration's row into the local `schema_migrations` by hand; use the normal `supabase migration` flow elsewhere.
5. Behaviour of already-issued JWTs for banned/deleted auth users (see §5).

## 5. Other gaps found (not fixed; scope not expanded)

1. **`check_audit_action` regression (P0/P1, product):** 20261001123000 recreated the constraint with 11 actions only, dropping e.g. `OPENING_BALANCE_RECORDED` (added by 20260903172101) and the dunning-delivery action. Result: `record_member_opening_balance` and dunning delivery fail with `23514`. These are 6 of the 7 pre-existing local failures (`member-opening-balance`, `dunning` "REFUSES to mark delivered"). Customer-relevant: opening balances are unusable on any database where that migration is applied.
2. Pre-existing failure `purchasing-invoice-vat-wht` (VAT line missing → `NaN`) and the `UNIT_OWNERSHIP_TOTAL_EXCEEDED` error in the opening-balance test fixture (test sets 200% ownership; trigger from 20261001123000) — unclassified; need triage (PRODUCTION_BUG vs TEST_EXPECTATION_BUG).
3. `is_org_member()` uses `status <> 'suspended'`, so **`invited` users count as members** for every policy built on it (chart of accounts, fiscal periods, journal-line policy, `list_projects`, …). `has_permission()` correctly requires `active`.
4. `has_permission(p_user_id, …)` is executable by any signed-in user with an arbitrary `p_user_id` (permission probing); `has_permission` does not check organization status (`has_financial_permission` does).
5. `verify_financial_audit_chain`: `auth.role()` NULL (direct DB session without JWT) passes the guard; not reachable through the API.
6. No session/JWT revocation when a user is suspended or banned (`lib/actions/users.ts`): DB permissions stop immediately via `has_permission`, but auth sessions remain until expiry. **Correction to the 9 Oct audit:** its claim that suspension may leave permissions intact was wrong for `has_permission` (the local definition checks `status = 'active'`); the residual risk is `is_org_member`-based policies (item 3) and token lifetime.
7. `get_trial_balance` is period-only: it does not carry prior-period balances forward (no opening-balance column); the balance sheet works around this by summing from 1900-01-01. Year-end closing remains unimplemented (Phase 2 candidate).
8. Dashboard (`tenant-dashboard.tsx`) ignores the RPC error, so a user without `finance.reports.read` sees silent zeros instead of a message (same as the baseline design, presentation only).
9. Other SECURITY DEFINER functions callable by `authenticated` without an in-body identity check, outside finance reports and not changed here: `get_entitlement`, `*_enabled(org)` feature checks, `get_owned_unit_lease_renewal_status`, `post_fx_difference`, `post_supplier_invoice_in_currency`, `run_due_schedules` (their wrappers/regex hits suggest inner guards or internal use, but each needs a line-by-line review).
10. Process: the integration suites default to the remote project in `.env.local` and write data; the grant-baseline test was already red at HEAD and the migration-directory guard needs hand-edited hashes/counts per migration.

## 6. State left behind

- Branch `fix/phase1-financial-report-authz`; nothing committed or pushed. Pre-existing uncommitted work (Fawry/mobile/docs) untouched.
- Docker Desktop was started to run the local stack; local DB crash-recovered cleanly. Prior test data (≈170 orgs) not touched; my fixtures (random UUIDs, append-only journals) remain in the local DB.
- Changed/new files: `supabase/migrations/20261009120000_phase1_financial_report_authz.sql`, `tests/finance-report-authz.integration.test.ts`, `tests/security-function-grants.integration.test.ts`, `tests/migration-directory-guard.test.ts`, `tests/{dunning,exchange-rates,fx-difference,project-wip}.integration.test.ts`, this report.

Stopped here. Deployment is a separate phase.
