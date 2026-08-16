# Resort→Property Rename: Phase 2e (Chart of Accounts + Role Scoping) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id`→`property_id` on `chart_of_accounts` and `user_role_assignments` — the first of three sub-phases carving up the final "payments/dues" super-cluster, chosen to go first specifically because both tables turned out (after a full live audit) to be near-universal/authorization-adjacent but genuinely **small** in actual edit surface, the same rationale that justified isolating `platform_audit_logs` before treasury/purchasing.

**Why this split exists:** A naive "payments/dues" grouping (`payments`, `dues`, `due_schedules`, plus everything that touches them) turns out to also entangle `chart_of_accounts` (10 functions merely *mention* it, most as false positives), `journal_entries` (the shared accounting core every other cluster already calls into), and `user_role_assignments` (backs `has_permission`, called by 49 of 124 RLS policies). Rather than one enormous, hard-to-review PR, this work is split into three sub-phases in increasing order of risk:

- **Phase 2e (this plan):** `chart_of_accounts` + `user_role_assignments`
- **Phase 2f (next):** `journal_entries`
- **Phase 2g (last):** `dues`, `due_schedules`, `payments`, `online_payment_transactions`, `organization_finance_settings`, `expenses`, `financial_audit_logs`

**Critical risk-reduction finding (verified live 2026-08-16):** `has_permission` — the function backing 49 of the system's 124 RLS policies — does **not** reference `resort_id` anywhere in its body (it joins `user_role_assignments` only on `user_id`/`organization_id`/`role_id`). Only `has_financial_permission` (used exclusively inside function bodies, **zero** RLS policy callers, confirmed by querying `pg_policy` directly) reads `user_role_assignments.resort_id`. This means renaming `user_role_assignments.resort_id` has **zero RLS blast radius** — the intuitive fear ("this backs authorization, so it's system-wide risk") does not hold for this specific column, confirmed by direct live inspection rather than assumption.

**Confirmed true function-level dependencies (verified via an exhaustive scan — not table-name mentions, but every literal `<variable>.resort_id` occurrence across all functions in the database, cross-referenced against each variable's declared row type):**

1. `has_financial_permission` — `ura.resort_id` (×2, in one WHERE-clause condition) → `ura.property_id`. Complete edit (this function calls nothing else that touches `resort_id`).
2. `add_organization_member` — `on conflict (user_id, role_id, organization_id, resort_id) do nothing` → `property_id`. Complete edit (calls only `has_permission` and `organization_is_active`, both confirmed to never reference `resort_id`).
3. `create_organization_onboarding` — direct `insert into public.user_role_assignments (user_id, role_id, organization_id, resort_id, created_by)` → `property_id`. Complete edit (calls only `clone_tenant_role_templates`, confirmed to never reference `resort_id` — it only touches `roles`/`role_permissions`/`role_templates`/`role_template_permissions`). Note: this function ALSO builds a `jsonb_build_object(..., 'resort_id', v_resort_id, ...)` for its own return value and for a `platform_audit_logs.safe_change_summary` entry — that `'resort_id'` is a **JSON key string**, not a column reference, and `v_resort_id` there is a `resorts.id` value, completely unrelated to `user_role_assignments.resort_id`. Do not touch it.
4. **`record_online_payment` — PARTIAL edit only.** This function touches FOUR different not-yet-fully-renamed tables' `resort_id` columns in one body: `v_clearing_account.resort_id` (×2, `chart_of_accounts` — **in scope for this phase**), `v_txn.resort_id` (×6, `online_payment_transactions`), `v_due.resort_id` (×1, `dues`), and `ofs.resort_id` (×1, `organization_finance_settings`) — the latter three belong to **Phase 2g** and must be left completely untouched here. This function was already edited once before (Phase 2b-3, for its `platform_audit_logs` insert) and will need **at least one more edit after this phase** (Phase 2g) before it's fully migrated. **This must be stated explicitly in this phase's PR description** so a reviewer looking at this PR alone doesn't conclude the function is "done."
5. **`validate_online_payments_clearing_account` (a trigger function on `organization_finance_settings`) — PARTIAL edit only.** Touches `v_account.resort_id` (×2, `chart_of_accounts` — **in scope for this phase**) and `new.resort_id` (×2, the trigger row on `organization_finance_settings` itself — **belongs to Phase 2g**, leave untouched). **Must be stated explicitly in the PR description**, same as above.

**Confirmed NOT in scope (false positives from an initial table-name-only search, excluded after reading full bodies):** `check_coa_no_loop`, `clone_chart_of_accounts_template`, `create_cashbox`, `get_account_ledger`, `get_trial_balance`, `post_journal_entry_internal` (mentions `chart_of_accounts` but never reads `.resort_id` on it), `post_supplier_invoice` (same). `create_cashbox` and `post_supplier_invoice` are from already-merged clusters (Phase 2c/2d) — confirmed they need **no follow-up** from this phase.

**Confirmed safe (verified live 2026-08-16):**
- `has_permission` itself needs zero edit (see above) — the 49 RLS policies calling it are entirely unaffected.
- Only ONE RLS policy in the whole system references `resort_id` directly in its own definition text (not via `has_permission`): `due_schedules_manage` on `due_schedules` — out of scope for this phase, belongs to Phase 2g.
- No RLS policy on `chart_of_accounts` or `user_role_assignments` references `resort_id` by name.
- FK constraints (`chart_of_accounts_resort_id_fkey`, `user_role_assignments_resort_id_fkey`) both point at `properties(id)`, auto-update on rename. The unique constraint `user_role_assignments_user_id_role_id_organization_id_resor_key` (`UNIQUE (user_id, role_id, organization_id, resort_id)`) also auto-updates its definition — but `add_organization_member`'s `ON CONFLICT` clause explicitly lists column names as literal text and must be edited to match (Postgres does not auto-rewrite `ON CONFLICT` target lists).
- All 5 triggers on `chart_of_accounts` (`trg_chart_of_accounts_updated_at`, `trg_coa_audit_log`, `trg_coa_lock_after_use`, `trg_coa_no_loop`, `trg_coa_prevent_delete_used`) checked — none reference `resort_id`.
- Zero TypeScript/TSX app-code impact: fresh grep of all 14 files across `app/`/`lib/`/`tests/` that reference either table found zero `resort_id` column references (only RPC `p_resort_id` parameters, unaffected). `lib/supabase/types.ts` still needs updating (generated-type accuracy).
- One pre-existing, unrelated, trivial finding: `delete_resort`'s own comment text says "resort_id" (referring to `platform_audit_logs.resort_id`, which was renamed to `property_id` back in Phase 2b-3) — stale wording, not a functional bug (the code itself never references that column, only the comment's prose is outdated). Not fixed here; far lower severity than the Issue #10 test bug, not worth a dedicated follow-up on its own, but can be swept up opportunistically if `delete_resort` is ever touched for another reason.

**Tech Stack:** Postgres/Supabase migration (applied live via Supabase MCP `apply_migration`), one `.ts` types file edit, Vitest integration test.

---

### Task 1: Migration — rename `resort_id` to `property_id` on `chart_of_accounts` and `user_role_assignments`

**Files:**
- Create: `supabase/migrations/20260823000001_rename_resort_id_coa_roles_cluster.sql`

- [ ] **Step 1: Write and apply**

```sql
-- Phase 2e of the resort -> property domain rename. First of three
-- sub-phases splitting the final "payments/dues" super-cluster by risk:
-- 2e (this one) = chart_of_accounts + user_role_assignments (near-universal
-- but small edit surface, has_permission itself confirmed untouched by this
-- column), 2f = journal_entries (shared accounting core), 2g (last, highest
-- risk) = dues/due_schedules/payments/online_payment_transactions/
-- organization_finance_settings/expenses/financial_audit_logs.

alter table public.chart_of_accounts rename column resort_id to property_id;
alter table public.user_role_assignments rename column resort_id to property_id;
```

Apply via Supabase MCP `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `rename_resort_id_coa_roles_cluster`).

- [ ] **Step 2: Verify**

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('chart_of_accounts', 'user_role_assignments')
  and column_name in ('resort_id', 'property_id')
order by table_name;
```

Expected: 2 rows, each `property_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260823000001_rename_resort_id_coa_roles_cluster.sql
git commit -m "feat: rename resort_id to property_id on chart_of_accounts and user_role_assignments"
```

---

### Task 2: Surgically update the 5 affected functions (2 partial, 3 complete)

**Files:**
- Create: `supabase/migrations/20260823000002_update_functions_for_coa_roles_cluster.sql`

**Method (mandatory, do not deviate):** For EACH of the 5 functions below, fetch its CURRENT live definition fresh via `pg_get_functiondef` (Task 1 has already renamed the columns), apply ONLY the documented substitution(s), and reassemble as `CREATE OR REPLACE FUNCTION` with the full live header/body verbatim otherwise. For the two PARTIAL-edit functions, this is the highest-risk step in this phase: it is easy to accidentally touch the wrong occurrence. Verify occurrence counts explicitly (see Step 3).

**Function 1: `has_financial_permission`** — COMPLETE edit. One WHERE-clause condition, two occurrences of `ura.resort_id`:

Before:
```
      AND (
        ura.resort_id IS NULL
        OR p_resort_id IS NULL
        OR ura.resort_id = p_resort_id
      )
```
After:
```
      AND (
        ura.property_id IS NULL
        OR p_resort_id IS NULL
        OR ura.property_id = p_resort_id
      )
```
(`p_resort_id` is the function's own parameter name — stays unchanged, per the standing rule that parameter names are never renamed in this effort.)

**Function 2: `add_organization_member`** — COMPLETE edit. One substitution:

Before: `on conflict (user_id, role_id, organization_id, resort_id) do nothing;`
After: `on conflict (user_id, role_id, organization_id, property_id) do nothing;`

**Function 3: `create_organization_onboarding`** — COMPLETE edit. One substitution (do NOT touch the unrelated `'resort_id', v_resort_id` JSON-key occurrences elsewhere in this function — those refer to `resorts.id`, a completely different concept):

Before: `INSERT INTO public.user_role_assignments (\r\n    user_id, role_id, organization_id, resort_id, created_by\r\n  ) VALUES (v_actor_id, v_owner_role_id, v_org_id, NULL, v_actor_id);`
After: `INSERT INTO public.user_role_assignments (\r\n    user_id, role_id, organization_id, property_id, created_by\r\n  ) VALUES (v_actor_id, v_owner_role_id, v_org_id, NULL, v_actor_id);`

**Function 4: `record_online_payment`** — **PARTIAL edit.** Exactly two occurrences of `v_clearing_account.resort_id` change to `v_clearing_account.property_id`. Every other `resort_id` occurrence in this function (`v_txn.resort_id` ×6, `v_due.resort_id` ×1, `ofs.resort_id` ×1) is **out of scope for this phase** and must be left completely untouched — those belong to Phase 2g (`online_payment_transactions`, `dues`, `organization_finance_settings` respectively). This function has already been edited once (Phase 2b-3) and will be edited again in Phase 2g.

**Function 5: `validate_online_payments_clearing_account`** — **PARTIAL edit.** Exactly two occurrences of `v_account.resort_id` change to `v_account.property_id`. The two occurrences of `new.resort_id` (the trigger row, referring to `organization_finance_settings.resort_id`) are **out of scope for this phase** and must be left completely untouched — that belongs to Phase 2g.

- [ ] **Step 1: Prepare all 5 statements**

Fetch fresh and transform all 5 functions per the method above.

- [ ] **Step 2: Apply**

Apply the full set of 5 `CREATE OR REPLACE FUNCTION` statements via Supabase MCP `apply_migration` (name `update_functions_for_coa_roles_cluster`) as one combined call.

- [ ] **Step 3: Verify — do not skip or rush, especially the two partial edits**

```sql
select proname,
  (length(prosrc) - length(replace(prosrc, 'ura.property_id', ''))) / length('ura.property_id') as ura_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'ura.resort_id', ''))) / length('ura.resort_id') as ura_remaining_resort_id
from pg_proc where proname = 'has_financial_permission' and pronamespace = 'public'::regnamespace;
-- Expected: 2, 0

select proname,
  (length(prosrc) - length(replace(prosrc, 'v_clearing_account.property_id', ''))) / length('v_clearing_account.property_id') as clearing_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_clearing_account.resort_id', ''))) / length('v_clearing_account.resort_id') as clearing_remaining_resort_id,
  (length(prosrc) - length(replace(prosrc, 'v_txn.resort_id', ''))) / length('v_txn.resort_id') as txn_untouched_count,
  (length(prosrc) - length(replace(prosrc, 'v_due.resort_id', ''))) / length('v_due.resort_id') as due_untouched_count,
  (length(prosrc) - length(replace(prosrc, 'ofs.resort_id', ''))) / length('ofs.resort_id') as ofs_untouched_count
from pg_proc where proname = 'record_online_payment' and pronamespace = 'public'::regnamespace;
-- Expected: clearing_property_id_count = 2, clearing_remaining_resort_id = 0,
-- txn_untouched_count = 6, due_untouched_count = 1, ofs_untouched_count = 1
-- (the last three MUST still show their ORIGINAL resort_id counts -- if any
-- of them is 0, that means Phase 2g's future work was accidentally done
-- early and inconsistently, or a substitution over-matched)

select proname,
  (length(prosrc) - length(replace(prosrc, 'v_account.property_id', ''))) / length('v_account.property_id') as account_property_id_count,
  (length(prosrc) - length(replace(prosrc, 'v_account.resort_id', ''))) / length('v_account.resort_id') as account_remaining_resort_id,
  (length(prosrc) - length(replace(prosrc, 'new.resort_id', ''))) / length('new.resort_id') as new_untouched_count
from pg_proc where proname = 'validate_online_payments_clearing_account' and pronamespace = 'public'::regnamespace;
-- Expected: account_property_id_count = 2, account_remaining_resort_id = 0,
-- new_untouched_count = 2 (must NOT be 0)
```

Also confirm `add_organization_member`'s `ON CONFLICT` list and `create_organization_onboarding`'s INSERT list via direct `prosrc` inspection (`ilike '%organization_id, property_id, created_by%'` / `ilike '%organization_id, property_id, created_by)%'` as appropriate — check the exact live text since formatting/whitespace may differ from what's shown above).

- [ ] **Step 4: Write the migration file and commit**

```bash
git add supabase/migrations/20260823000002_update_functions_for_coa_roles_cluster.sql
git commit -m "feat: update 5 functions for chart_of_accounts/user_role_assignments property_id rename (2 partial, 3 complete -- see migration header)"
```

---

### Task 3: Update `lib/supabase/types.ts`

**Files:**
- Modify: `lib/supabase/types.ts` — `chart_of_accounts` and `user_role_assignments` table type sections.

- [ ] **Step 1: Update the 2 table type sections**

Read the file first to find the exact current shape for each table. Rename `resort_id` to `property_id` in each table's `Row`/`Insert`/`Update` shapes as they exist (mechanical edit, same pattern as every prior phase's `types.ts` fix).

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
```

Expected: no errors.

```bash
git add lib/supabase/types.ts
git commit -m "feat: update TS types for chart_of_accounts/user_role_assignments property_id rename"
```

---

### Task 4: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (13th `it()` block, following test 12 from Phase 2d)

- [ ] **Step 1: Write a test proving the rename end-to-end**

As test 13, in the same style as tests 9-12: prove at least the two COMPLETE-edit functions work correctly post-rename, since those are directly testable end-to-end without needing the not-yet-renamed tables that `record_online_payment`/`validate_online_payments_clearing_account` also touch:

1. Create an org (this alone exercises `clone_tenant_role_templates`, unaffected but a dependency).
2. Call `add_organization_member` to invite a second user with a specific role — under a real signed-in session holding `tenant.users.manage` (the org creator/TENANT_OWNER, matching the pattern from prior tests). This proves the `ON CONFLICT (..., property_id)` edit: if the column list still said `resort_id`, the INSERT would fail with `column "resort_id" does not exist` the moment a duplicate-key scenario is hit, OR more directly, simply calling the function successfully at all doesn't strictly prove the ON CONFLICT clause is correct (a first insert never hits the conflict path) — so this test must explicitly call `add_organization_member` TWICE for the same user (same org, same role) to force the `ON CONFLICT` path to execute, and assert the second call does not error and does not create a duplicate row (`select count(*) from user_role_assignments where user_id = ... and role_id = ... and organization_id = ...` should be `1` after both calls).
3. Read back the resulting `user_role_assignments` row via `admin.from("user_role_assignments").select("id, property_id").eq(...).single()` and assert `property_id` is `null` (since `add_organization_member` never sets a resort scope) — this at minimum proves the column exists under its new name and the row is queryable.
4. For `has_financial_permission`: call any already-migrated function from an earlier phase that uses it with a real resort scope (e.g. `create_purchase_request`, from Phase 2d, which calls `has_financial_permission(p_organization_id, 'purchasing.requests.create', p_resort_id)`) under a session whose `user_role_assignments` row has a **non-null** `property_id` matching that resort — this is the actual proof that `has_financial_permission`'s resort-scoped permission check still works post-rename (a broken `ura.property_id` reference here would cause EVERY resort-scoped permission check in the system to silently deny, not error — an important distinction to call out in the test's comments). To set up a non-null-scoped role assignment, insert one directly via `admin.from("user_role_assignments").insert({..., property_id: resortId})` for a role holding the relevant permission (or grant the permission narrowly — use judgment on the simplest correct setup), then call `create_purchase_request` under that user's session and assert it succeeds.
5. Do NOT attempt to test `create_organization_onboarding`, `record_online_payment`, or `validate_online_payments_clearing_account` in this test — `create_organization_onboarding` requires a completely fresh (no existing membership) auth user which complicates cleanup significantly for marginal additional coverage beyond what's already proven by `add_organization_member`'s identical edit shape; `record_online_payment`/`validate_online_payments_clearing_account` are PARTIAL edits whose full correctness can't be proven until Phase 2g completes the remaining tables they touch — attempting to test them now would either require standing up the entire online-payment flow prematurely or would give false confidence by only exercising the already-correct `platform_audit_logs`/other paths while silently not exercising the `chart_of_accounts` edit at all (since a full `record_online_payment` call only reads `v_clearing_account.resort_id`/`property_id` deep in a specific branch — verify this reasoning against the live function body before writing the test; if a targeted assertion IS feasible without requiring Phase 2g's tables, use judgment to include it, but do not force it if it requires faking around not-yet-renamed columns).

Clean up per the established FK-safe pattern, then archive the org.

- [ ] **Step 2: Run and verify**

Run: `npx vitest run tests/pgtap.integration.test.ts`
Expected: all 13 tests pass.

- [ ] **Step 3: Commit**

```bash
git commit tests/pgtap.integration.test.ts -m "test: verify chart_of_accounts/user_role_assignments property_id rename end-to-end"
```

---

## Self-Review

**Spec coverage:** Task 1 covers both table renames. Task 2 covers all 5 genuinely-affected functions, explicitly distinguishing the 2 PARTIAL edits (which must NOT touch other tables' still-`resort_id` columns) from the 3 COMPLETE edits, with verification queries specifically designed to catch both under-editing (missed occurrence) AND over-editing (touched something out of scope) for the partial-edit functions. Task 3 covers generated-type accuracy (zero app-code impact confirmed). Task 4 proves the 2 complete edits end-to-end and explicitly declines to force-test the 2 partial edits until their remaining halves land in Phase 2g, with reasoning documented rather than silently skipped.

**Placeholder scan:** Task 2's substitutions are literal before/after snippets, consistent with the precedent set in Phase 2c/2d for functions whose full bodies are large. Given only 5 functions here (vs 6-9 in prior phases) and 2 of them being single-line substitutions, this plan includes MORE literal detail than Phase 2c/2d's plans did, since the partial-edit risk warranted it.

**Risk note — the defining risk of this phase:** the two PARTIAL edits (`record_online_payment`, `validate_online_payments_clearing_account`) are a NEW risk shape for this rename effort — not "will I miss an edit" but "will I over-edit into a table that isn't renamed yet." Over-editing here is worse than a missed edit: it wouldn't just fail loudly on next use (like a genuinely missed `.resort_id`→`.property_id` rename does), it would silently reference a column that doesn't exist YET on `online_payment_transactions`/`dues`/`organization_finance_settings` (since Task 1's DDL only touches `chart_of_accounts`/`user_role_assignments`) — meaning `CREATE OR REPLACE FUNCTION` would fail to even compile if `v_txn.property_id` were referenced before `online_payment_transactions.property_id` exists, which is actually a *safety net* (Postgres would reject the migration at apply time rather than silently accepting a wrong reference) — but Task 2 Step 3's verification queries exist specifically to catch this class of mistake with certainty rather than relying on that safety net alone, since a careless accidental swap (editing `v_txn.resort_id` to `v_clearing_account.property_id`-shaped text, e.g. a find-replace typo) could theoretically still compile if done carelessly enough.
