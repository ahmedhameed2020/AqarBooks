# Resort→Property Rename: Phase 2b-3 (platform_audit_logs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id`→`property_id` on `platform_audit_logs` — the near-universal connector table (referenced by 24 of 88 functions). Isolating this now, per explicit user direction, prevents further drift accumulating on top of it while other clusters (treasury, purchasing, receivables) are tackled later.

**Architecture:** `ALTER TABLE platform_audit_logs RENAME COLUMN resort_id TO property_id` (auto-cascades to RLS/constraints/indexes), then **surgical** updates to exactly 24 functions. Critical constraint on the surgical edit: **only the `resort_id` token inside each function's `insert into public.platform_audit_logs (...)` column list changes.** Every other `resort_id` reference in the same function body — on `cashboxes`, `cashier_sessions`, `journal_entries`, `purchase_requests`, `purchase_orders`, `supplier_invoices`, `dues`, `payments`, `online_payment_transactions`, `organization_finance_settings`, `chart_of_accounts`, etc. — belongs to a table NOT part of this migration and must be left completely untouched. This has been confirmed by reading all 24 live function bodies during planning: e.g. `create_cashbox` inserts into both `cashboxes` (with `resort_id`, stays) and `platform_audit_logs` (with `resort_id`, changes) in the same function — the rule is table-scoped, not function-scoped.

**Confirmed function list (24, verified live via `pg_get_functiondef` on 2026-08-16 — 3 functions initially matched a text search for "resort_id" but were confirmed NOT to need changes, since their only `resort_id` occurrence is their own `p_resort_id` parameter name, not a `platform_audit_logs` column reference: `add_organization_member`, `create_organization_onboarding`, `delete_resort`):**

`approve_purchase_order`, `archive_unit`, `cancel_supplier_invoice`, `close_cashier_session`, `create_cashbox`, `create_journal_entry_internal`, `create_purchase_request`, `create_resort`, `decide_purchase_request`, `open_cashier_session`, `post_journal_entry_internal`, `post_payment_internal`, `post_supplier_invoice`, `reconcile_cashier_session`, `record_expense`, `record_online_payment`, `record_supplier_payment`, `restore_unit`, `reverse_journal_entry`, `set_purchase_order_status`, `submit_journal_entry_for_review`, `update_resort`, `update_unit`, `void_supplier_payment`.

**Confirmed safe:** zero TS/TSX app code references `resort_id` on `platform_audit_logs` (full-text search, 2026-08-16). RLS policies (`platform_audit_logs_insert_admin`, `platform_audit_logs_select_admin`) use only `is_platform_admin(auth.uid())`, no `resort_id` text reference. DB-only migration.

**Tech Stack:** Postgres/Supabase migration (applied live via Supabase MCP `apply_migration`), Vitest integration test.

---

### Task 1: Migration — rename `resort_id` to `property_id` on `platform_audit_logs`

**Files:**
- Create: `supabase/migrations/20260820000001_rename_resort_id_platform_audit_logs.sql`

- [ ] **Step 1: Write and apply**

```sql
-- Phase 2b-3 of the resort -> property domain rename. platform_audit_logs
-- is the near-universal audit-log target -- 24 functions insert into it.
-- Isolated deliberately, per 2026-08-16 direction, before other clusters
-- (treasury, purchasing, receivables) accumulate further drift that would
-- make this table harder to isolate later.

alter table public.platform_audit_logs rename column resort_id to property_id;
```

Apply via Supabase MCP `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `rename_resort_id_platform_audit_logs`).

- [ ] **Step 2: Verify**

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'platform_audit_logs'
  and column_name in ('resort_id', 'property_id');
```

Expected: one row, `property_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260820000001_rename_resort_id_platform_audit_logs.sql
git commit -m "feat: rename resort_id to property_id on platform_audit_logs"
```

---

### Task 2: Surgically update the 24 affected functions

**Files:**
- Create: `supabase/migrations/20260820000002_update_functions_for_platform_audit_logs.sql`

**Method (mandatory, do not deviate):** For EACH of the 24 functions listed above:
1. Fetch its CURRENT live definition via `pg_get_functiondef` (project_id `ataslxkcflxuilpgyepm`) — do not use any cached/remembered version, fetch fresh, since Task 1 has already renamed the column and other work may have touched these functions since planning.
2. Find the `insert into public.platform_audit_logs (` statement in the body. It will always have the shape `insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, ...)` — change ONLY the `resort_id` token in THIS column list to `property_id`.
3. Do not change anything else in the function: not the `VALUES (...)` list (those are value expressions like `v_order.resort_id` or `p_resort_id`, not column names — they stay exactly as-is, since the variable/parameter itself isn't being renamed, only the target column it's being inserted into), not any other table's `resort_id` reference anywhere else in the same body, not parameter names, not comments, not whitespace/formatting.
4. Reassemble as a `CREATE OR REPLACE FUNCTION` statement using the function's full live definition (matched header: `RETURNS`, `LANGUAGE`, `SECURITY DEFINER`/absence, `SET search_path`, etc. — copy verbatim from the fetched definition) with only that one substitution applied.

- [ ] **Step 1: Prepare all 24 statements**

Fetch and transform all 24 functions per the method above. Concatenate into one migration file. This is a large, repetitive, mechanical task — go function by function, methodically, and do not skip the "fetch fresh" step for any of them even though several were already read during planning (state may have changed).

- [ ] **Step 2: Apply**

Apply the full set of 24 `CREATE OR REPLACE FUNCTION` statements via Supabase MCP `apply_migration` (name `update_functions_for_platform_audit_logs`) — can be done as one combined call.

- [ ] **Step 3: Verify — this is the most important step, do not skip or rush it**

For every one of the 24 functions, confirm:
```sql
select proname, prosrc ilike '%actor_id, organization_id, resort_id, action%' as insert_still_old
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in (/* all 24 names */);
```
Expected: `insert_still_old = false` for all 24 rows. (Note: `create_purchase_request`'s column list differs slightly — `actor_id, organization_id, resort_id, action, entity_type, entity_id` with no `safe_change_summary` — and `decide_purchase_request`/`submit_journal_entry_for_review` also have slightly different trailing columns; verify each function's ACTUAL column list from its own fetched body rather than assuming they're all identical, and write a verification query that matches each one's real shape.)

Additionally, for each function, confirm no OTHER table's `resort_id` reference was accidentally touched — spot-check at least `create_cashbox`, `open_cashier_session`, `record_expense`, `post_supplier_invoice`, `record_supplier_payment` (all of which reference a second resort_id-bearing table in the same body) by re-fetching their full bodies and confirming e.g. `insert into public.cashboxes (organization_id, resort_id, ...)` (or `cashier_sessions`/`expenses`/`supplier_invoices`/`supplier_payments`) still says `resort_id`, unchanged.

- [ ] **Step 4: Write the migration file and commit**

```bash
git add supabase/migrations/20260820000002_update_functions_for_platform_audit_logs.sql
git commit -m "feat: update 24 functions for platform_audit_logs property_id rename"
```

---

### Task 3: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (10th `it()` block)

- [ ] **Step 1: Write a test proving the rename end-to-end**

As the 10th test: create an org, call a representative RPC that inserts into `platform_audit_logs` under a real signed-in session where required by the function's own permission checks (e.g. `create_resort` via a `TENANT_OWNER` session, matching the pattern from tests 7/8/9), then read the resulting `platform_audit_logs` row directly via `admin.from("platform_audit_logs").select("id, property_id, action").eq(...)` and assert `property_id` matches the expected resort id and `action` matches the expected audit action string (e.g. `'resort.created'`). This single call proves both: (a) the function's INSERT succeeded against the renamed column (would otherwise error `column resort_id does not exist`), and (b) the value landed correctly. Clean up per the established FK-safe pattern (delete dependent rows before `deleteUser` if a real user was created, assert the delete's error is null) and archive the org at the end.

- [ ] **Step 2: Run and verify**

Run: `npx vitest run tests/pgtap.integration.test.ts`
Expected: all 10 tests pass.

- [ ] **Step 3: Commit**

```bash
git commit tests/pgtap.integration.test.ts -m "test: verify platform_audit_logs property_id rename end-to-end"
```

---

## Self-Review

**Spec coverage:** Task 1 covers the column rename. Task 2 covers all 24 functions with a precisely-scoped, unambiguous transformation rule (verified against 17 of the 24 live bodies during planning, confirming the rule holds even when a function also references a different resort_id-bearing table in the same body). Task 3 proves it end-to-end via a real RPC call and direct row inspection.

**Placeholder scan:** Task 2's migration content isn't pre-written in this plan document (unlike smaller clusters) because retyping 24 large function bodies by hand in a planning document would itself be exactly the "hand-typed from memory" risk this whole effort has been avoiding — instead, the plan specifies an exact, mechanical, verifiable transformation RULE and requires fresh live fetches at implementation time. This is a deliberate deviation from the "no placeholders" norm, justified by the scale, not a shortcut.

**Risk note:** this is the largest single-migration function count in this rename effort so far. Task 2 Step 3's verification is unusually important — a single missed function would surface as a live `column resort_id does not exist` error the next time any audit-logged action (resort CRUD, journal posting, purchasing, cashier operations, payments) is attempted, which is a wide blast radius. Do not shortcut the verification step.
