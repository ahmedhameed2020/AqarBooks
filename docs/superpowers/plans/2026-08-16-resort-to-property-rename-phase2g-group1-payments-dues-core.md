# Resort→Property Rename: Phase 2g Group 1 (Payments/Dues/Online-Payments Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id`→`property_id` on `organization_finance_settings`, `online_payment_transactions`, `dues`, and `payments` — the first (and by design, largest) of several remaining groups inside Phase 2g, the final super-cluster. These 4 tables are renamed together, in one migration, because they are genuinely entangled at the function level (`record_online_payment` alone touches all 4; `post_payment_internal` touches both `dues` and `payments`) — splitting them further would only produce new partial edits instead of resolving the two already outstanding from Phase 2e.

**Why these 4 specifically, together:** Phase 2e (merged) surgically edited `record_online_payment` and `validate_online_payments_clearing_account` for their `chart_of_accounts` references only, explicitly leaving `online_payment_transactions`/`dues`/`organization_finance_settings` references untouched pending this phase. This migration closes both of those partial edits completely — after this PR merges, `record_online_payment` and `validate_online_payments_clearing_account` are **fully migrated**, no further edits needed for either in any future phase.

**Pre-flight discovery (verified live 2026-08-16, corrects the original scope estimate):** A fresh live re-scan (not relying on the scan done before Phase 2e/2f) found a table that didn't exist in the original inventory: **`payment_provider_settings`** (with its own `resort_id` column and ~7 dependent functions: `enable_payment_provider`, `disable_payment_provider`, `get_payment_provider_credentials`, `list_payment_provider_settings`, `record_payment_provider_verification`, `upsert_payment_provider_settings`, and the trigger `validate_payment_provider_settings_scope`). This table is **explicitly out of scope for this plan** — it appears self-contained (no entanglement found with the 4 tables in this group) and will be its own follow-up group after this one. Also confirmed via the same fresh scan: `due_schedules` (`generate_recurring_dues`, `preview_generate_recurring_dues`, `run_due_schedules`, and the `due_schedules_manage` RLS policy's `with_check` clause) is **not** entangled with any of the 4 tables in this group (no function touches both `due_schedules` and `dues`/`payments`/etc. in the same body) — also deferred to its own follow-up group. `expenses` (`record_expense`) and `financial_audit_logs` (`append_financial_audit_event`, `verify_financial_audit_chain`) remain deferred and self-contained as previously scoped.

**Confirmed true function-level dependencies (verified via the exhaustive `<variable>.resort_id` scan plus a direct-INSERT-column-list scan, cross-referenced against each variable's declared row type — not table-name mentions):**

1. **`create_online_payment_checkout_transaction`** — `v_due.resort_id` (×2: initial assignment from the first matched due, and the cross-resort mismatch comparison for subsequent dues) → `v_due.property_id` (`dues`); plus the `online_payment_transactions` INSERT column list → `property_id`.
2. **`issue_dues`** — the `dues` INSERT column list → `property_id`. (`p_resort_id` parameter and its use in `append_financial_audit_event(p_resort_id := p_resort_id, ...)` stay unchanged — parameter passthrough, not a column reference.)
3. **`post_payment_internal`** — `v_due.resort_id` (×1, the due/payment resort-match guard) → `v_due.property_id` (`dues`); plus the `payments` INSERT column list → `property_id`.
4. **`record_online_payment` — completing its Phase 2e partial edit.** `v_txn.resort_id` (×6: the clearing-account lookup's `WHERE` clause, the clearing-account mismatch check, the failure-message `format()` call, the due-scope mismatch check, the `post_payment_internal` call's `p_resort_id =>` argument, and the `platform_audit_logs` insert's value) → `v_txn.property_id` (`online_payment_transactions`); `ofs.resort_id` (×1, same `WHERE` clause) → `ofs.property_id` (`organization_finance_settings`); `v_due.resort_id` (×1, the due-scope mismatch check) → `v_due.property_id` (`dues`). The already-completed `v_clearing_account.property_id` (×2, from Phase 2e) is untouched by this migration — already correct.
5. **`record_payment` (9-argument legacy overload, no `p_ip_address`/`p_user_agent`)** — the `payments` INSERT column list → `property_id`. (Distinct overload from the wrapper below — has its own full implementation, does not call `post_payment_internal`.)
6. **`record_payment` (11-argument overload, with `p_ip_address`/`p_user_agent`, uses `has_financial_permission`/`append_financial_audit_event`)** — the `payments` INSERT column list → `property_id`. (Also a distinct, separate implementation.)
7. **`validate_online_payments_clearing_account` (trigger on `organization_finance_settings`) — completing its Phase 2e partial edit.** `new.resort_id` (×2: the resort-membership existence check, and the clearing-account resort-mismatch comparison) → `new.property_id` (`organization_finance_settings`). The already-completed `v_account.property_id` (×2, from Phase 2e) is untouched.
8. **`void_payment`** — `v_payment.resort_id` (×2: the resort-scoped `has_financial_permission` check, and the `append_financial_audit_event` call's `p_resort_id :=` argument) → `v_payment.property_id` (`payments`).
9. **`forbid_online_txn_mutation_after_pending` (trigger on `online_payment_transactions`)** — `new.resort_id`/`old.resort_id` (×1 each, in the immutability comparison) → `new.property_id`/`old.property_id`.

**NOT in scope, confirmed via full-body reads (false positives / correctly untouched):** `due_ids_have_pending_online_checkout` and `expire_stale_online_payment_transactions` mention `online_payment_transactions` but never read `.resort_id`. `run_due_schedules` and `archive_unit` mention `dues` but never read `.resort_id` on it. The third `record_payment` overload (12 args, delegates to `post_payment_internal`) never touches `resort_id` itself — only passes `p_resort_id` through as a value, and `post_payment_internal`'s own edit (item 3 above) is what actually matters.

**Confirmed safe (verified live 2026-08-16):**
- No RLS policy on any of the 4 tables references `resort_id` by name (`dues`, `payments`, `online_payment_transactions` policies are member/org-scoped only; `organization_finance_settings`'s policy uses `has_permission`, no resort filter).
- FK constraints (`dues_resort_id_fkey`, `payments_resort_id_fkey`, `online_payment_transactions_resort_id_fkey`, `organization_finance_settings_resort_id_fkey`) all point at `properties(id)`, auto-update on rename.
- `organization_finance_settings` has a `UNIQUE (organization_id, resort_id)` constraint — auto-updates its definition on rename. Confirmed via live search that **no function targets this constraint via a literal `ON CONFLICT (organization_id, resort_id)` clause** (unlike Phase 2e's `add_organization_member`), so no additional edit is needed for it.
- The only index on `resort_id` across these 4 tables is the auto-generated unique-constraint-backing index on `organization_finance_settings` — auto-updates.
- Triggers checked on all 4 tables: `trg_prevent_unreverse_payment` (payments, status-only, no `resort_id`), `trg_online_txn_updated_at`/`trg_organization_finance_settings_updated_at` (generic `set_updated_at`, no `resort_id`) confirmed clean. `trg_online_txn_immutable` (→ `forbid_online_txn_mutation_after_pending`) and `trg_validate_online_payments_clearing_account` (→ `validate_online_payments_clearing_account`) are the two that DO need edits — covered above.
- App-code impact (confirmed via fresh grep of all 14 files referencing these 4 tables across `app/`/`lib/`): **exactly one** real hit — `app/[locale]/(app)/property/page.tsx:168`, a direct `.from("payments").select("amount").eq("resort_id", resort.id)` query. Every other occurrence across the 14 files is either an RPC `p_resort_id` parameter (unaffected) or unrelated to these 4 tables.

**Tech Stack:** Postgres/Supabase migration (applied live via Supabase MCP `apply_migration`), one `.tsx` app-code edit, one `.ts` types file edit, Vitest integration test.

---

### Task 1: Migration — rename `resort_id` to `property_id` on the 4 tables

**Files:**
- Create: `supabase/migrations/20260825000001_rename_resort_id_payments_dues_core_cluster.sql`

- [ ] **Step 1: Write and apply**

```sql
-- Phase 2g Group 1 of the resort -> property domain rename. First (and by
-- design, largest) group inside the final super-cluster: organization_
-- finance_settings, online_payment_transactions, dues, payments. Renamed
-- together because record_online_payment alone touches all 4 (completing
-- its Phase 2e partial edit) and post_payment_internal touches both dues
-- and payments in one body. payment_provider_settings (newly discovered,
-- self-contained), due_schedules (self-contained), expenses, and
-- financial_audit_logs are deliberately deferred to follow-up groups.

alter table public.organization_finance_settings rename column resort_id to property_id;
alter table public.online_payment_transactions rename column resort_id to property_id;
alter table public.dues rename column resort_id to property_id;
alter table public.payments rename column resort_id to property_id;
```

Apply via Supabase MCP `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `rename_resort_id_payments_dues_core_cluster`).

- [ ] **Step 2: Verify**

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('organization_finance_settings', 'online_payment_transactions', 'dues', 'payments')
  and column_name in ('resort_id', 'property_id')
order by table_name;
```

Expected: 4 rows, each `property_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260825000001_rename_resort_id_payments_dues_core_cluster.sql
git commit -m "feat: rename resort_id to property_id on organization_finance_settings/online_payment_transactions/dues/payments"
```

---

### Task 2: Surgically update the 9 affected functions

**Files:**
- Create: `supabase/migrations/20260825000002_update_functions_for_payments_dues_core_cluster.sql`

**Method (mandatory, do not deviate):** For EACH of the 9 functions below, fetch its CURRENT live definition fresh via `pg_get_functiondef` (Task 1 has already renamed the columns), apply ONLY the documented substitution(s), and reassemble as `CREATE OR REPLACE FUNCTION` with the full live header/body verbatim otherwise. Items 4 and 7 (`record_online_payment`, `validate_online_payments_clearing_account`) are **completions** of Phase 2e's partial edits — their `chart_of_accounts`-related substitutions (`v_clearing_account.property_id`, `v_account.property_id`) are already correct from Phase 2e and must be left exactly as they are; only the NEW substitutions documented here are applied.

**Function 1: `create_online_payment_checkout_transaction`**
(a) `v_due.resort_id` → `v_due.property_id`, both occurrences:
```
      v_resort_id := v_due.resort_id;
    elsif v_due.resort_id <> v_resort_id then
```
becomes
```
      v_resort_id := v_due.property_id;
    elsif v_due.property_id <> v_resort_id then
```
(b) The `online_payment_transactions` INSERT column list:
Before: `insert into public.online_payment_transactions (\n    organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at\n  )`
After: `organization_id, property_id, member_id, client_request_id, provider, amount, expires_at`

**Function 2: `issue_dues`** — the `dues` INSERT column list:
Before: `INSERT INTO public.dues (\n        organization_id,\n        resort_id,\n        unit_id,`
After: `organization_id,\n        property_id,\n        unit_id,`

**Function 3: `post_payment_internal`**
(a) `v_due.resort_id <> p_resort_id` → `v_due.property_id <> p_resort_id`
(b) The `payments` INSERT column list:
Before: `insert into public.payments (\n      organization_id, resort_id, member_id, unit_id, amount, method, payment_date,`
After: `organization_id, property_id, member_id, unit_id, amount, method, payment_date,`

**Function 4: `record_online_payment`** (completing Phase 2e's partial edit) — six occurrences:
1. `where ofs.organization_id = v_txn.organization_id and ofs.resort_id = v_txn.resort_id` → `ofs.property_id = v_txn.property_id`
2. `or (v_clearing_account.property_id is not null and v_clearing_account.property_id <> v_txn.resort_id)` → `<> v_txn.property_id` (only the `v_txn` side changes; `v_clearing_account.property_id` is already correct from Phase 2e)
3. `v_failure_message := format('No valid online-payments clearing account configured for resort %s', v_txn.resort_id);` → `v_txn.property_id`
4. `if v_due.id is null or v_due.organization_id <> v_txn.organization_id or v_due.resort_id <> v_txn.resort_id then` → `v_due.property_id`, `v_txn.property_id`
5. `p_resort_id => v_txn.resort_id,` (in the `post_payment_internal(...)` call) → `v_txn.property_id`
6. `values (null, v_txn.organization_id, v_txn.resort_id, 'online_payment.posted', ...)` → `v_txn.property_id`

**Function 5: `record_payment` (9-arg overload)** — the `payments` INSERT column list:
Before: `INSERT INTO public.payments (\r\n      organization_id,\r\n      resort_id,\r\n      member_id,`
After: `organization_id,\r\n      property_id,\r\n      member_id,`

**Function 6: `record_payment` (11-arg overload)** — the `payments` INSERT column list (same shape as Function 5, verify the exact live text since this is a separate function body — do not assume it's byte-identical to the 9-arg overload beyond the column list itself).

**Function 7: `validate_online_payments_clearing_account`** (completing Phase 2e's partial edit) — two occurrences of `new.resort_id`:
```
    select 1 from public.resorts where id = new.resort_id and organization_id = new.organization_id
  ...
  if v_account.property_id is not null and v_account.property_id <> new.resort_id then
```
becomes
```
    select 1 from public.resorts where id = new.property_id and organization_id = new.organization_id
  ...
  if v_account.property_id is not null and v_account.property_id <> new.property_id then
```

**Function 8: `void_payment`** — two occurrences of `v_payment.resort_id`:
1. `if not public.has_financial_permission(p_organization_id, 'finance.payments.void', v_payment.resort_id) then` → `v_payment.property_id`
2. `p_resort_id := v_payment.resort_id,` (in the `append_financial_audit_event(...)` call) → `v_payment.property_id`

**Function 9: `forbid_online_txn_mutation_after_pending`** — one occurrence each of `new.resort_id`/`old.resort_id`:
Before: `new.resort_id <> old.resort_id or`
After: `new.property_id <> old.property_id or`

- [ ] **Step 1: Prepare all 9 statements**

Fetch fresh and transform all 9 functions (2 are separate `record_payment` overloads — apply `CREATE OR REPLACE FUNCTION` to each using its own distinct argument list, Postgres resolves by signature).

- [ ] **Step 2: Apply**

Apply the full set of 9 `CREATE OR REPLACE FUNCTION` statements via Supabase MCP `apply_migration` (name `update_functions_for_payments_dues_core_cluster`) as one combined call.

- [ ] **Step 3: Verify — do not skip or rush. This is the largest single verification pass in this rename effort so far.**

```sql
-- Function 1
select proname,
  substring(prosrc from 'insert into public\.online_payment_transactions \(\s*([^)]*)\)') as opt_insert,
  (length(prosrc) - length(replace(prosrc, 'v_due.property_id', ''))) / length('v_due.property_id') as due_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_due.resort_id', ''))) / length('v_due.resort_id') as due_remaining_resort_id
from pg_proc where proname = 'create_online_payment_checkout_transaction' and pronamespace = 'public'::regnamespace;
-- Expected: opt_insert contains "property_id"; due_property_id_count = 2, due_remaining_resort_id = 0

-- Function 2
select proname, substring(prosrc from 'INSERT INTO public\.dues \(\s*([^)]*)\)') as dues_insert
from pg_proc where proname = 'issue_dues' and pronamespace = 'public'::regnamespace;
-- Expected: contains "property_id"

-- Function 3
select proname,
  substring(prosrc from 'insert into public\.payments \(\s*([^)]*)\)') as payments_insert,
  (length(prosrc) - length(replace(prosrc, 'v_due.property_id', ''))) / length('v_due.property_id') as due_property_id_count
from pg_proc where proname = 'post_payment_internal' and pronamespace = 'public'::regnamespace;
-- Expected: payments_insert contains "property_id"; due_property_id_count = 1

-- Function 4 (the big one)
select proname,
  (length(prosrc) - length(replace(prosrc, 'v_txn.property_id', ''))) / length('v_txn.property_id') as txn_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_txn.resort_id', ''))) / length('v_txn.resort_id') as txn_remaining_resort_id,
  (length(prosrc) - length(replace(prosrc, 'ofs.property_id', ''))) / length('ofs.property_id') as ofs_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_due.property_id', ''))) / length('v_due.property_id') as due_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_clearing_account.property_id', ''))) / length('v_clearing_account.property_id') as clearing_property_id_count_should_still_be_2
from pg_proc where proname = 'record_online_payment' and pronamespace = 'public'::regnamespace;
-- Expected: txn_property_id_count = 6, txn_remaining_resort_id = 0, ofs_property_id_count = 1,
-- due_property_id_count = 1, clearing_property_id_count_should_still_be_2 = 2 (untouched from Phase 2e)

-- Functions 5 & 6 (both record_payment overloads)
select proname, pg_get_function_identity_arguments(oid) as args,
  substring(prosrc from '(?:insert into|INSERT INTO) public\.payments \(\s*([^)]*)\)') as payments_insert
from pg_proc where proname = 'record_payment' and pronamespace = 'public'::regnamespace
order by args;
-- Expected: exactly 3 rows (3 overloads); the two matching the 9-arg and
-- 11-arg signatures both show "property_id" in their payments_insert; the
-- 12-arg wrapper overload shows NULL (it has no direct payments INSERT)

-- Function 7
select proname,
  (length(prosrc) - length(replace(prosrc, 'new.property_id', ''))) / length('new.property_id') as new_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'new.resort_id', ''))) / length('new.resort_id') as new_remaining_resort_id,
  (length(prosrc) - length(replace(prosrc, 'v_account.property_id', ''))) / length('v_account.property_id') as account_property_id_count_should_still_be_2
from pg_proc where proname = 'validate_online_payments_clearing_account' and pronamespace = 'public'::regnamespace;
-- Expected: new_property_id_count = 2, new_remaining_resort_id = 0, account_property_id_count_should_still_be_2 = 2

-- Function 8
select proname,
  (length(prosrc) - length(replace(prosrc, 'v_payment.property_id', ''))) / length('v_payment.property_id') as payment_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_payment.resort_id', ''))) / length('v_payment.resort_id') as payment_remaining_resort_id
from pg_proc where proname = 'void_payment' and pronamespace = 'public'::regnamespace;
-- Expected: 2, 0

-- Function 9
select proname,
  (length(prosrc) - length(replace(prosrc, 'new.property_id', ''))) / length('new.property_id') as new_count,
  (length(prosrc) - length(replace(prosrc, 'old.property_id', ''))) / length('old.property_id') as old_count,
  (length(prosrc) - length(replace(prosrc, 'new.resort_id', ''))) / length('new.resort_id') as new_remaining,
  (length(prosrc) - length(replace(prosrc, 'old.resort_id', ''))) / length('old.resort_id') as old_remaining
from pg_proc where proname = 'forbid_online_txn_mutation_after_pending' and pronamespace = 'public'::regnamespace;
-- Expected: 1, 1, 0, 0
```

Also spot-check the confirmed-untouched functions (`due_ids_have_pending_online_checkout`, `expire_stale_online_payment_transactions`, `run_due_schedules`, `archive_unit`, the 12-arg `record_payment` wrapper) have no `CREATE OR REPLACE` in the migration file and their live bodies are unchanged.

- [ ] **Step 4: Write the migration file and commit**

```bash
git add supabase/migrations/20260825000002_update_functions_for_payments_dues_core_cluster.sql
git commit -m "feat: update 9 functions for payments/dues/online-payments core property_id rename (completes both Phase 2e partial edits)"
```

---

### Task 3: Update app code and `lib/supabase/types.ts`

**Files:**
- Modify: `app/[locale]/(app)/property/page.tsx:168`
- Modify: `lib/supabase/types.ts` — `organization_finance_settings`, `online_payment_transactions`, `dues`, `payments` table type sections.

- [ ] **Step 1: Update the app-code query**

In `app/[locale]/(app)/property/page.tsx`, change:
```typescript
    supabase
      .from("payments")
      .select("amount")
      .eq("resort_id", resort.id)
      .eq("status", "POSTED")
      .gte("payment_date", monthStart),
```
to:
```typescript
    supabase
      .from("payments")
      .select("amount")
      .eq("property_id", resort.id)
      .eq("status", "POSTED")
      .gte("payment_date", monthStart),
```

- [ ] **Step 2: Update the 4 table type sections**

Read `lib/supabase/types.ts` first to find the exact current shape for each of the 4 tables. Rename `resort_id` to `property_id` in each table's `Row`/`Insert`/`Update` shapes as they exist.

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
```

```bash
git add "app/[locale]/(app)/property/page.tsx" lib/supabase/types.ts
git commit -m "feat: update app code and TS types for payments/dues/online-payments core property_id rename"
```

---

### Task 4: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (15th `it()` block, following test 14 from Phase 2f)

- [ ] **Step 1: Write a test proving the rename end-to-end**

As test 15, in the same style as tests 9-14. Given the scale of this group, prioritize proving: (a) the fully-completed `record_online_payment` (the highest-value proof, since it closes out a 2-phase-old partial edit spanning 4 tables total including `chart_of_accounts`), and (b) at least one of the two `record_payment` overloads' INSERT edits and `void_payment`'s edit.

Minimum required flow:
1. Create an org, a resort, a member with a unit/ownership, a due (via `issue_dues`, proving its INSERT edit), a GL clearing account, `organization_finance_settings` configured with that clearing account (proving the ability to read back `organization_finance_settings.property_id` if the test chooses to insert it directly rather than via the trigger's own INSERT path — check whether `organization_finance_settings` rows are typically created via a dedicated RPC or direct insert in existing app code/tests, and match that), and an open fiscal period.
2. Call `create_online_payment_checkout_transaction` for the due, under the member's own session (check `current_member_id()`'s mechanism — this may require a member-portal-style session distinct from the TENANT_OWNER pattern used elsewhere; check tests involving `member_id`/portal sessions if any exist in this file, or the owner-portal test suite referenced elsewhere in this repo, for the correct session-setup pattern). Read back the created `online_payment_transactions` row and assert `property_id` — proves substitution 1.
3. Call `record_online_payment` (likely callable by service-role/webhook context — check its actual permission model; it may not require `auth.uid()` at all, matching a webhook-triggered flow) to settle the transaction. Read back: the `payments` row's `property_id` (proves `post_payment_internal`'s edit, function 3), the `dues` row's updated status, and the `platform_audit_logs` row for `action = 'online_payment.posted'` asserting `property_id` (proves the full `record_online_payment` completion, function 4). This one call, if it succeeds at all post-rename, is strong evidence the entire chain (`ofs`/`v_txn`/`v_due`/`v_clearing_account` all correctly renamed) works — a single missed substitution anywhere in this chain would surface as a hard `column ... does not exist` error.
4. Call `void_payment` on the resulting payment under a real signed-in TENANT_OWNER session holding `finance.payments.void`. Read back the `platform_audit_logs` row for `action = 'PAYMENT_REVERSED'` and assert `property_id` — proves function 8.
5. If a coherent, low-cost path exists to also call one of the `record_payment` overloads directly (functions 5/6) rather than only through `record_online_payment`'s call into `post_payment_internal`, include it — but do not force elaborate additional setup only for that; use judgment matching the precedent set in every prior phase's test of proving the highest-risk shapes first and not chasing 100% function coverage.

Clean up per the established FK-safe pattern (this test creates more interlinked rows than any prior test in this file — plan the deletion order carefully: `platform_audit_logs` → `payment_allocations`/`online_payment_transaction_allocations` → `payments` → `online_payment_transactions` → `dues` → `organization_finance_settings` → GL accounts (if deletable) → `journal_entries`/`journal_entry_lines` created by the payment posting → `unit_ownerships`/`units` if created → `resort` → role assignments → memberships → auth users → archive org), asserting `error` is `null` at each meaningful step.

- [ ] **Step 2: Run and verify**

Run: `npx vitest run tests/pgtap.integration.test.ts`
Expected: all 15 tests pass.

- [ ] **Step 3: Commit**

```bash
git commit tests/pgtap.integration.test.ts -m "test: verify payments/dues/online-payments core property_id rename end-to-end"
```

---

## Self-Review

**Spec coverage:** Task 1 covers all 4 table renames in one batch (confirmed no ordering dependency between them — a single combined `ALTER TABLE` migration is safe). Task 2 covers all 9 genuinely-affected functions, explicitly marking functions 4 and 7 as *completions* of Phase 2e's partial edits (with verification queries that also re-confirm the Phase-2e-completed substitutions are untouched, not just that the new ones landed). Task 3 covers the single real app-code impact found in this entire rename effort's largest table group, plus generated-type accuracy. Task 4 proves the highest-value chain (`record_online_payment`'s full completion) end-to-end.

**Placeholder scan:** Task 2's substitutions are literal before/after snippets per function, consistent with every prior phase, scaled up for this group's larger function count (9, the most in any single phase so far) and higher average substitution count per function (`record_online_payment` alone has 6).

**Risk note:** This is the largest and most consequential migration in the entire rename effort — it touches the core payment-recording and due-issuance paths of a live financial system, and it is the migration that FINALLY closes two partial edits that have been open since Phase 2e (`record_online_payment`, `validate_online_payments_clearing_account`). The verification step (Task 2 Step 3) is correspondingly the most extensive written so far, and deliberately re-checks the Phase-2e-completed substitutions weren't accidentally touched or broken by this pass, not just that the new substitutions landed. Task 4's test is scoped to prove the highest-value, highest-risk chain first (the full `record_online_payment` completion) rather than attempting exhaustive coverage of all 9 functions in one test, matching the judgment-based coverage precedent set in every prior phase.
