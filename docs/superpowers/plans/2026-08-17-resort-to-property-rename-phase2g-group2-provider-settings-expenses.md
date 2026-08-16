# Phase 2g Group 2: payment_provider_settings + expenses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id` → `property_id` on `payment_provider_settings` and `expenses`, and update every function/trigger/index that references those two columns.

**Architecture:** Two independent, self-contained tables bundled into one PR for efficiency (neither is functionally entangled with the other, nor with any other remaining deferred group — no function touches both). Same methodology as every prior phase: live research first, DDL rename with immediate verification, surgical function-body edits verified by exact occurrence-count queries, app-code/types.ts sync, integration test, two-stage + final holistic review.

**Tech Stack:** Supabase/Postgres (live project `ataslxkcflxuilpgyepm`), Next.js/TypeScript, Vitest integration tests against the live project.

---

## Pre-flight research (completed live, 2026-08-17)

### `expenses`
- Columns: `id, organization_id, resort_id, expense_category_id, description, amount, expense_date, payment_account_id, voucher_number, journal_entry_id, cashier_session_id, created_by, created_at`.
- FKs: `organization_id → organizations(id)`, `resort_id → properties(id)`, `expense_category_id → expense_categories(id)`, `payment_account_id → chart_of_accounts(id)`, `journal_entry_id → journal_entries(id)`, `cashier_session_id → cashier_sessions(id)`, `created_by → auth.users(id)`. No cross-cluster entanglement.
- RLS: 1 policy (`expenses_select_permission`), does not reference `resort_id`.
- No indexes reference `resort_id`.
- Only **one** function touches this table: `record_expense`. Confirmed live (`pg_get_functiondef`) that of its 8 `resort_id`-substring occurrences, only **1** is a genuine column reference — the `insert into public.expenses (organization_id, resort_id, ...)` column list. Everything else is the `p_resort_id` parameter name (unchanged, matches the Issue #15 convention established across all prior phases — parameter-name renames are deliberately deferred, tracked separately) or calls into other still-`p_resort_id`-parameterized functions (`create_journal_entry_internal`, `has_financial_permission`, `next_sequence_value` — confirmed live, all three still use `p_resort_id` as their own parameter name, consistent with calling them unchanged). The function's `select 1 from public.resorts where id = p_resort_id ...` compatibility-view lookup matches the precedent already established in `post_payment_internal` (Phase 2g Group 1) — not something to change.
- App code: zero references to `resort_id` under `app/[locale]/(app)/finance/expenses/`. `lib/actions/purchasing.ts:354` calls `record_expense` via `supabase.rpc("record_expense", ...)` — uses the parameter name `p_resort_id`, which is correctly unchanged.
- `lib/supabase/types.ts` (line ~795-812): `expenses.Row.resort_id: string` needs to become `property_id: string`.

### `payment_provider_settings`
- Columns: `id, organization_id, resort_id (nullable), provider, environment, merchant_identifier, public_key, api_key_secret_id, hmac_secret_id, status, enabled, verified_at, last_verification_error, created_by, updated_by, created_at, updated_at`.
- FKs: `organization_id → organizations(id)`, `resort_id → properties(id)`, `api_key_secret_id/hmac_secret_id → vault.secrets(id)`, `created_by/updated_by → auth.users(id)`. No cross-cluster entanglement. `resort_id` is nullable — `NULL` means "organization-wide" setting (not scoped to one property), confirmed via the existing `payment_provider_settings_unique_scope` index using `COALESCE(resort_id, '00000000-0000-0000-0000-000000000000'::uuid)`.
- RLS: 1 policy (`payment_provider_settings_manage`), does not reference `resort_id`.
- 1 index needs updating: `payment_provider_settings_unique_scope` — `UNIQUE (organization_id, COALESCE(resort_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, environment)`.
- 2 triggers: `trg_payment_provider_settings_updated_at` (generic `set_updated_at()`, untouched) and `trg_validate_payment_provider_settings_scope` (calls `validate_payment_provider_settings_scope()`, needs edits — see below).
- **7 functions confirmed to touch this table** via a broad, unbiased live scan (`pg_get_functiondef(...) ilike '%public.payment_provider_settings%'`) — not just the ones already known from earlier partial exploration. This scan caught 3 previously-unknown functions:
  - `upsert_payment_provider_settings(p_organization_id, p_resort_id, p_provider, p_environment, p_merchant_identifier, p_public_key, p_api_key, p_hmac_secret)` — 2 genuine column refs: the `coalesce(resort_id, ...) = coalesce(p_resort_id, ...)` lookup, and the `insert into ... (organization_id, resort_id, ...)` column list. The `vault.create_secret(...)` calls embed `p_resort_id::text` in a secret-naming string — parameter reference, unchanged.
  - `get_payment_provider_credentials(p_organization_id, p_resort_id, p_provider, p_environment)` — 3 genuine column refs: `resort_id = p_resort_id or resort_id is null`, and `order by resort_id`.
  - `list_payment_provider_settings(p_organization_id)` — SQL function (not plpgsql). Its own `RETURNS TABLE(id uuid, resort_id uuid, ...)` names a return column `resort_id`, and its body does `select id, resort_id, ... from public.payment_provider_settings`. **Zero app code anywhere currently calls this RPC** (confirmed via repo-wide grep for `payment_provider_settings`/`list_payment_provider_settings` — no matches outside the DB layer), so renaming the return column to `property_id` alongside the underlying column is safe with no consumers to break. Do both together.
  - `validate_payment_provider_settings_scope()` (the trigger function) — 2 genuine column refs: `new.resort_id is not null` and `id = new.resort_id` (the latter against the `public.resorts` compatibility view, matching precedent).
  - `enable_payment_provider(p_settings_id)`, `disable_payment_provider(p_settings_id)`, `record_payment_provider_verification(p_settings_id, p_success, p_error_message)` — all three key entirely off `id`/`organization_id` via `select ... into ... from public.payment_provider_settings where id = p_settings_id`. **Zero `resort_id` references in any of the three.** Confirmed touching the table (so listed explicitly, not silently skipped) but require no edits.
- App code: zero references anywhere (`payment_provider_settings`/`paymentProviderSettings`/`PaymentProviderSettings` — no matches). Not wired into any UI yet.
- Not present in `lib/supabase/types.ts` (RPC-only table, matching the `organization_finance_settings`/`online_payment_transactions` precedent from Phase 2g Group 1 — nothing to change there).

---

## Task 1: Rename columns (DDL)

**Files:**
- Create: `supabase/migrations/20260827000001_rename_resort_id_provider_settings_expenses_cluster.sql`

- [ ] **Step 1: Apply the rename migration live**

```sql
alter table public.payment_provider_settings rename column resort_id to property_id;
alter table public.expenses rename column resort_id to property_id;
```

- [ ] **Step 2: Verify live via `information_schema.columns`**

Both tables must show `property_id`, zero rows show `resort_id`, for `table_name in ('payment_provider_settings','expenses')`.

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/20260827000001_rename_resort_id_provider_settings_expenses_cluster.sql
git commit -m "feat: rename resort_id to property_id on payment_provider_settings and expenses"
```

## Task 2: Update the index, trigger function, and 4 functions with genuine column refs

**Files:**
- Create: `supabase/migrations/20260827000002_update_functions_for_provider_settings_expenses_cluster.sql`

- [ ] **Step 1: Rebuild `payment_provider_settings_unique_scope`**

```sql
drop index if exists public.payment_provider_settings_unique_scope;
create unique index payment_provider_settings_unique_scope
  on public.payment_provider_settings
  using btree (organization_id, coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, environment);
```

(Index name kept as-is — matches the established Issue #15 precedent of not renaming index/constraint names as part of column-rename phases; that's tracked separately.)

- [ ] **Step 2: `CREATE OR REPLACE FUNCTION public.validate_payment_provider_settings_scope()`**

Same body, with `new.resort_id` → `new.property_id` in both the `is not null` check and the `id = new.resort_id` lookup (which stays against `public.resorts`, per precedent):

```sql
create or replace function public.validate_payment_provider_settings_scope()
 returns trigger
 language plpgsql
as $function$
begin
  if new.property_id is not null and not exists (
    select 1 from public.resorts where id = new.property_id and organization_id = new.organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  return new;
end;
$function$;
```

- [ ] **Step 3: `CREATE OR REPLACE FUNCTION public.record_expense(...)`**

Same body as live, with only the `insert into public.expenses (...)` column list changed: `organization_id, resort_id, expense_category_id, ...` → `organization_id, property_id, expense_category_id, ...`. Every other `resort_id` occurrence (the `p_resort_id` parameter itself, its uses, calls to `create_journal_entry_internal`/`has_financial_permission`/`next_sequence_value`, and `public.resorts` lookup) stays unchanged.

- [ ] **Step 4: `CREATE OR REPLACE FUNCTION public.upsert_payment_provider_settings(...)`**

Same body, with the 2 genuine column refs changed: the `coalesce(resort_id, ...) = coalesce(p_resort_id, ...)` lookup becomes `coalesce(property_id, ...) = coalesce(p_resort_id, ...)`, and the `insert into public.payment_provider_settings (organization_id, resort_id, ...)` column list becomes `(organization_id, property_id, ...)`. The `vault.create_secret` calls' `p_resort_id::text` usages stay unchanged (parameter reference, not a column).

- [ ] **Step 5: `CREATE OR REPLACE FUNCTION public.get_payment_provider_credentials(...)`**

Same body, with the 3 genuine column refs changed: `(resort_id = p_resort_id or resort_id is null)` → `(property_id = p_resort_id or property_id is null)`, and `order by resort_id nulls last` → `order by property_id nulls last`.

- [ ] **Step 6: `CREATE OR REPLACE FUNCTION public.list_payment_provider_settings(...)`**

Same body, with both the `RETURNS TABLE(id uuid, resort_id uuid, ...)` column name and the `select id, resort_id, ...` reference changed to `property_id` (safe — zero current callers, confirmed above).

- [ ] **Step 7: Verify all 6 items live**

For each of: the index, `validate_payment_provider_settings_scope`, `record_expense`, `upsert_payment_provider_settings`, `get_payment_provider_credentials`, `list_payment_provider_settings` — re-fetch via `pg_get_indexdef`/`pg_get_functiondef` and confirm exact occurrence counts match what's expected (the specific genuine substitutions made, and confirm the still-present `p_resort_id` parameter-name occurrences are unchanged in count).

Also re-verify `enable_payment_provider`, `disable_payment_provider`, `record_payment_provider_verification` are still byte-identical to their pre-migration definitions (confirms they were correctly left untouched).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260827000002_update_functions_for_provider_settings_expenses_cluster.sql
git commit -m "feat: update index/trigger/functions for payment_provider_settings and expenses property_id rename"
```

## Task 3: Update `lib/supabase/types.ts`

**Files:**
- Modify: `lib/supabase/types.ts` (the `expenses` table's `Row.resort_id` field, around line 799)

- [ ] **Step 1:** Change `resort_id: string;` to `property_id: string;` inside `expenses.Row`. Do not add a `payment_provider_settings` entry (RPC-only, matches precedent).

- [ ] **Step 2:** `npx tsc --noEmit` — must be clean.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/types.ts
git commit -m "feat: update expenses TypeScript type for property_id rename"
```

## Task 4: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (new `it()` block)

- [ ] **Step 1:** Write a test that, under a real member/admin session (matching the existing test file's setup patterns), proves:
  - `record_expense` succeeds and the resulting `expenses` row has the correct `property_id` (not `resort_id`).
  - `upsert_payment_provider_settings` (service-role `admin` client, since it manages secrets via `vault.*`) succeeds for both a property-scoped setting (`p_resort_id` set) and an org-wide setting (`p_resort_id` null), and the resulting rows show the correct `property_id`/`NULL`.
  - `list_payment_provider_settings` returns rows with a `property_id` field (not `resort_id`), covering both the scoped and null cases from above — this also confirms the `RETURNS TABLE` rename didn't break anything.
  - `get_payment_provider_credentials` resolves the property-scoped row in preference to the org-wide row when both exist for the same org/provider/environment (proves the `order by property_id nulls last` still works after rename).
  - `validate_payment_provider_settings_scope` rejects a `property_id` that doesn't belong to the organization (proves the trigger's rename is correct) — assert the specific `RESORT_NOT_IN_ORGANIZATION` error.
  - Include cleanup for every row created (`expenses`, `payment_provider_settings`, and their `vault.secrets` rows via the settings' `api_key_secret_id`/`hmac_secret_id`, plus any `journal_entries`/`journal_entry_lines` created transitively by `record_expense`).

- [ ] **Step 2:** Run `npx vitest run tests/pgtap.integration.test.ts` — must pass, including all prior tests (no regressions).

- [ ] **Step 3: Commit**

```bash
git add tests/pgtap.integration.test.ts
git commit -m "test: verify payment_provider_settings/expenses property_id rename end-to-end"
```

## Self-Review

- **Spec coverage:** DDL rename (Task 1), all touched functions/trigger/index (Task 2), app-code/types sync (Task 3), integration proof (Task 4) — all pre-flight findings above are covered by a task.
- **Placeholder scan:** none — every step shows the actual before/after SQL or the exact field/line to change.
- **Type consistency:** `property_id` used consistently as the column name across all tasks; parameter name `p_resort_id` deliberately left unchanged everywhere per the Issue #15 convention, consistently.
