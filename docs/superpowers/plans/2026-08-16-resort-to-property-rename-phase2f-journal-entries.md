# Resort→Property Rename: Phase 2f (Journal Entries) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id`→`property_id` on `journal_entries` — the second of three sub-phases splitting the final "payments/dues" super-cluster (2e: `chart_of_accounts` + `user_role_assignments`, done and merged; **2f (this plan)**: `journal_entries`, the shared accounting core every other cluster already calls into; 2g last: `dues`/`due_schedules`/`payments`/`online_payment_transactions`/`organization_finance_settings`/`expenses`/`financial_audit_logs`).

**Architecture:** One migration renames the column (auto-cascades the one FK to `properties(id)`; confirmed live that no index, trigger, or RLS policy on `journal_entries` references `resort_id` by name — the table's only RLS policy, `journal_entries_select_permission`, gates on `has_permission(auth.uid(), organization_id, ...)` with no resort scoping at the row-security level at all). A second migration surgically updates 5 functions.

**Confirmed true function-level dependencies (verified via the same exhaustive `<variable>.resort_id` scan used in Phase 2e, cross-referenced against each variable's declared row type — not table-name mentions):**

1. `create_journal_entry_internal` — INSERT column list: `insert into public.journal_entries (organization_id, resort_id, fiscal_period_id, ...)` → `property_id`. Complete, single substitution.
2. `get_journal_entry_for_view` — `v_entry.resort_id` (×2, both as arguments to two `has_financial_permission(...)` calls in an `if not (... or ...)` check) → `v_entry.property_id`. Complete edit; the function's explanatory comment above this check discusses "resort_id" in prose but is not itself a code reference — see the "confirmed safe" note below on why it's left alone.
3. `post_journal_entry_internal` — `v_entry.resort_id` (×1, the value passed into `platform_audit_logs`'s already-`property_id`-named column) → `v_entry.property_id`. Complete, single substitution.
4. `reverse_journal_entry` — **three separate substitutions, matching the highest-multiplicity shape first seen in Phase 2d's `cancel_supplier_invoice`/`void_supplier_payment`:** (a) the `journal_entries` INSERT column list for the new reversal entry, (b) `v_original.resort_id` in that same INSERT's VALUES list (a row-typed field access on the *original* entry being reversed, supplying the new entry's resort scope), and (c) `v_original.resort_id` again as the value passed into `platform_audit_logs`. (a) is a bare column-list edit; (b) and (c) are the two `v_original.property_id` occurrences the exhaustive scan found.
5. `submit_journal_entry_for_review` — `v_entry.resort_id` (×1, value into `platform_audit_logs`) → `v_entry.property_id`. Complete, single substitution.

**Confirmed NOT in scope (false positives from an initial table-name-only search, excluded after reading full bodies — matches the same pattern seen in every prior phase):** `get_account_ledger`, `get_trial_balance`, `post_journal_entry` all mention `journal_entries` but never read `.resort_id` on a row typed against it.

**Confirmed safe (verified live 2026-08-16):**
- No RLS policy on `journal_entries` references `resort_id` by name (its one policy, `journal_entries_select_permission`, uses only `has_permission(auth.uid(), organization_id, ...)` — org-level, not resort-scoped at the RLS layer; resort scoping for reads happens at the function layer in `get_journal_entry_for_view` via `has_financial_permission`, which is the function being edited in this phase anyway).
- The only FK (`journal_entries_resort_id_fkey`) points at `properties(id)`, auto-updates on rename.
- No index on `resort_id` for this table.
- No triggers on this table at all.
- Zero TypeScript/TSX app-code impact: fresh grep of all 5 files across `app/`/`lib/`/`tests/` that reference `journal_entries` found zero `resort_id` column references. `lib/supabase/types.ts` still needs updating (generated-type accuracy).
- Minor, deliberately-not-fixed note: `get_journal_entry_for_view`'s existing comment block (above the `has_financial_permission` check) narrates the resort-scoping logic using the word "resort_id" in prose, referring conceptually to both `user_role_assignments.resort_id` (renamed to `property_id` in Phase 2e, already merged) and this phase's `journal_entries.resort_id`. The comment is not itself a compiled code reference, so leaving its wording as-is does not break anything — matching the precedent set for `delete_resort`'s already-slightly-stale comment in Phase 2e. Not fixed here; low priority, could be swept up if this function is touched again for another reason.

**Tech Stack:** Postgres/Supabase migration (applied live via Supabase MCP `apply_migration`), one `.ts` types file edit, Vitest integration test.

---

### Task 1: Migration — rename `resort_id` to `property_id` on `journal_entries`

**Files:**
- Create: `supabase/migrations/20260824000001_rename_resort_id_journal_entries_cluster.sql`

- [ ] **Step 1: Write and apply**

```sql
-- Phase 2f of the resort -> property domain rename. Second of three
-- sub-phases splitting the final "payments/dues" super-cluster: 2e (done,
-- merged) = chart_of_accounts + user_role_assignments, 2f (this one) =
-- journal_entries (the shared accounting core every other cluster already
-- calls into via create_journal_entry_internal/post_journal_entry_internal),
-- 2g (last, highest risk) = dues/due_schedules/payments/
-- online_payment_transactions/organization_finance_settings/expenses/
-- financial_audit_logs.

alter table public.journal_entries rename column resort_id to property_id;
```

Apply via Supabase MCP `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `rename_resort_id_journal_entries_cluster`).

- [ ] **Step 2: Verify**

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'journal_entries'
  and column_name in ('resort_id', 'property_id');
```

Expected: one row, `property_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260824000001_rename_resort_id_journal_entries_cluster.sql
git commit -m "feat: rename resort_id to property_id on journal_entries"
```

---

### Task 2: Surgically update the 5 affected functions

**Files:**
- Create: `supabase/migrations/20260824000002_update_functions_for_journal_entries_cluster.sql`

**Method (mandatory, do not deviate):** For EACH of the 5 functions below, fetch its CURRENT live definition fresh via `pg_get_functiondef` (Task 1 has already renamed the column), apply ONLY the documented substitution(s), and reassemble as `CREATE OR REPLACE FUNCTION` with the full live header/body verbatim otherwise.

**Function 1: `create_journal_entry_internal`** — one substitution: the `journal_entries` INSERT column list.
Before: `insert into public.journal_entries (\n    organization_id, resort_id, fiscal_period_id, entry_date, description,\n    source_type, idempotency_key, created_by\n  )`
After: `organization_id, property_id, fiscal_period_id, entry_date, description, ...`

**Function 2: `get_journal_entry_for_view`** — two occurrences of `v_entry.resort_id`, both inside the same `if not (... or ...)` condition:
Before:
```
  if not (
    public.has_financial_permission(v_entry.organization_id, 'finance.reports.read', v_entry.resort_id)
    or public.has_financial_permission(v_entry.organization_id, 'finance.entries.create', v_entry.resort_id)
  ) then
```
After: both `v_entry.resort_id` → `v_entry.property_id`. Leave the explanatory comment block immediately above this condition unchanged (it narrates the concept in prose, not code — see plan header).

**Function 3: `post_journal_entry_internal`** — one substitution: `v_entry.resort_id` (value into `platform_audit_logs`) → `v_entry.property_id`.
Before: `values (auth.uid(), v_entry.organization_id, v_entry.resort_id, 'journal_entry.posted', ...)`
After: `values (auth.uid(), v_entry.organization_id, v_entry.property_id, 'journal_entry.posted', ...)`

**Function 4: `reverse_journal_entry`** — three substitutions:
(a) The new-entry INSERT column list:
Before: `insert into public.journal_entries (\n    organization_id, resort_id, fiscal_period_id, entry_date, description,\n    source_type, status, reversed_entry_id, created_by, posted_by, posted_at\n  )`
After: `organization_id, property_id, fiscal_period_id, entry_date, description, ...`

(b) That same INSERT's VALUES list, `v_original.resort_id`:
Before: `values (\n    v_original.organization_id, v_original.resort_id, p_reversal_fiscal_period_id, p_reversal_date,`
After: `v_original.organization_id, v_original.property_id, p_reversal_fiscal_period_id, p_reversal_date,`

(c) The `platform_audit_logs` insert's value, `v_original.resort_id`:
Before: `values (auth.uid(), v_original.organization_id, v_original.resort_id, 'journal_entry.reversed', ...)`
After: `values (auth.uid(), v_original.organization_id, v_original.property_id, 'journal_entry.reversed', ...)`

**Function 5: `submit_journal_entry_for_review`** — one substitution: `v_entry.resort_id` (value into `platform_audit_logs`) → `v_entry.property_id`.
Before: `values (auth.uid(), v_entry.organization_id, v_entry.resort_id, 'journal_entry.submitted_for_review', ...)`
After: `values (auth.uid(), v_entry.organization_id, v_entry.property_id, 'journal_entry.submitted_for_review', ...)`

- [ ] **Step 1: Prepare all 5 statements**

Fetch fresh and transform all 5 functions per the method above.

- [ ] **Step 2: Apply**

Apply the full set of 5 `CREATE OR REPLACE FUNCTION` statements via Supabase MCP `apply_migration` (name `update_functions_for_journal_entries_cluster`) as one combined call.

- [ ] **Step 3: Verify — do not skip or rush, especially `reverse_journal_entry`'s 3-substitution shape**

```sql
select proname,
  substring(prosrc from 'insert into public\.journal_entries \(\s*([^)]*)\)') as journal_insert_cols
from pg_proc where proname in ('create_journal_entry_internal','reverse_journal_entry') and pronamespace = 'public'::regnamespace;
-- Expected: both contain "property_id" in the column list, not "resort_id"

select proname,
  (length(prosrc) - length(replace(prosrc, 'v_entry.property_id', ''))) / length('v_entry.property_id') as entry_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_entry.resort_id', ''))) / length('v_entry.resort_id') as entry_remaining_resort_id
from pg_proc where proname = 'get_journal_entry_for_view' and pronamespace = 'public'::regnamespace;
-- Expected: 2, 0

select proname,
  (length(prosrc) - length(replace(prosrc, 'v_entry.property_id', ''))) / length('v_entry.property_id') as entry_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_entry.resort_id', ''))) / length('v_entry.resort_id') as entry_remaining_resort_id
from pg_proc where proname in ('post_journal_entry_internal', 'submit_journal_entry_for_review') and pronamespace = 'public'::regnamespace;
-- Expected: 1, 0 for each

select proname,
  (length(prosrc) - length(replace(prosrc, 'v_original.property_id', ''))) / length('v_original.property_id') as original_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_original.resort_id', ''))) / length('v_original.resort_id') as original_remaining_resort_id
from pg_proc where proname = 'reverse_journal_entry' and pronamespace = 'public'::regnamespace;
-- Expected: 2, 0 (the 3rd substitution is the bare INSERT column list, already
-- checked above -- it doesn't show up in this v_original.-qualified count)
```

Also spot-check `get_account_ledger`, `get_trial_balance`, `post_journal_entry` were **not modified** (no `CREATE OR REPLACE` for them in the migration file).

- [ ] **Step 4: Write the migration file and commit**

```bash
git add supabase/migrations/20260824000002_update_functions_for_journal_entries_cluster.sql
git commit -m "feat: update 5 functions for journal_entries property_id rename"
```

---

### Task 3: Update `lib/supabase/types.ts`

**Files:**
- Modify: `lib/supabase/types.ts` — `journal_entries` table type section.

- [ ] **Step 1: Update the table type section**

Read the file first to find the exact current shape. Rename `resort_id` to `property_id` in `journal_entries`'s `Row`/`Insert`/`Update` shapes.

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
```

```bash
git add lib/supabase/types.ts
git commit -m "feat: update TS types for journal_entries property_id rename"
```

---

### Task 4: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (14th `it()` block, following test 13 from Phase 2e)

- [ ] **Step 1: Write a test proving the rename end-to-end**

As test 14, in the same style as tests 9-13: prove the INSERT-column-list shape and at least the `reverse_journal_entry` triple-substitution shape (the highest-risk edit in this phase), in one coherent flow:

1. Create an org, a resort, and a chart-of-accounts pair of accounts (debit/credit) plus an open fiscal period (check whether an existing test already has a fiscal-period setup helper pattern to follow — tests 1 and 12 both stand up fiscal periods, follow whichever is cleaner given this test doesn't also need suppliers/purchase orders).
2. Call `create_journal_entry_internal` (or a public-facing wrapper if one exists and is simpler to call under a real session — check `post_journal_entry`'s signature; if it's a thin real-session-facing wrapper around the internal function, prefer it for realism, otherwise call the internal function directly matching this file's established pattern of calling `_internal` functions directly in tests). Read back the created `journal_entries` row and assert `property_id` equals the resort id — proves the INSERT-column-list edit.
3. Call `post_journal_entry_internal` on it (requires a balanced 2+ line entry — reuse the account pair from step 1). Read back the resulting `platform_audit_logs` row for `action = 'journal_entry.posted'` and assert `property_id` — proves the single-occurrence `v_entry.property_id` edit.
4. Call `reverse_journal_entry` on the now-posted entry, under a real signed-in session holding `finance.entries.reverse` (check which role template grants this — likely TENANT_OWNER, matching prior tests' assumption, but verify against the live permission-template seed data rather than assuming). Read back the NEW reversal `journal_entries` row and assert its `property_id` equals the resort id (proves substitution (a) and (b) — the INSERT column list AND the `v_original.property_id` VALUES-list read). Also read back the `platform_audit_logs` row for `action = 'journal_entry.reversed'` and assert its `property_id` (proves substitution (c)).
5. `get_journal_entry_for_view` and `submit_journal_entry_for_review` are lower-risk (single-occurrence edits, same shape already proven twice by steps 3-4) — cover at least one of them if it fits naturally into the flow without disproportionate extra setup, but do not force it; use judgment matching the precedent set in Phase 2c/2d/2e's tests of not chasing 100% function coverage when the riskiest shapes are already proven.

Clean up per the established FK-safe pattern, then archive the org.

- [ ] **Step 2: Run and verify**

Run: `npx vitest run tests/pgtap.integration.test.ts`
Expected: all 14 tests pass.

- [ ] **Step 3: Commit**

```bash
git commit tests/pgtap.integration.test.ts -m "test: verify journal_entries property_id rename end-to-end"
```

---

## Self-Review

**Spec coverage:** Task 1 covers the single table rename. Task 2 covers all 5 genuinely-affected functions with the exact per-function substitution list, explicitly flagging `reverse_journal_entry`'s 3-substitution shape (the first time this rename effort has seen 3 substitutions split across TWO different statement types — a column list AND two value-list reads — within one function, rather than 3 identical value-list reads as in Phase 2d's `cancel_supplier_invoice`). Task 3 covers generated-type accuracy (zero app-code impact confirmed). Task 4 proves the INSERT-list shape and the triple-substitution shape end-to-end.

**Placeholder scan:** Task 2's substitutions are literal before/after snippets, consistent with every prior phase. `reverse_journal_entry`'s three-part substitution is broken out explicitly as (a)/(b)/(c) rather than described as one lump change, since it's the highest-complexity single-function edit in this phase and deserves the same explicit treatment Phase 2d gave `cancel_supplier_invoice`/`void_supplier_payment`.

**Risk note:** Unlike Phase 2e, this phase has NO partial edits — `journal_entries` is not entangled with any not-yet-renamed table in any of its 5 dependent functions (confirmed via the same exhaustive scan methodology). This makes Phase 2f simpler than 2e in one respect (no risk of over-editing into an out-of-scope table) but `journal_entries` is used by every other financial cluster (treasury, purchasing, and the still-pending payments/dues), so the main risk here is different: correctness of the underlying accounting logic itself (balanced-entry checks, fiscal-period validation, reversal semantics) is untouched by this rename, but the volume of live traffic through these 5 functions is higher than any single-table cluster touched so far in this effort, making Task 2 Step 3's verification and Task 4's live smoke test especially important before merge.
