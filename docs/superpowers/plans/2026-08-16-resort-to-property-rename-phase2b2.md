# Resort→Property Rename: Phase 2b-2 (resort_memberships/document_sequences/cost_centers/projects) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id`→`property_id` on `resort_memberships`, `document_sequences`, `cost_centers`, `projects`. This cluster was chosen (via the same FK-dependency search method as Phase 2b-1, not business-domain assumption) because it's the smallest, most isolated remaining cluster: only 2 functions reference these 4 tables' `resort_id` at all (`is_resort_member` → `resort_memberships`, `next_sequence_value` → `document_sequences`), `cost_centers` and `projects` have **zero** function references (confirmed via full-text search across all 88 functions), and a full TS/TSX app-code search found **zero** references to `resort_id` on any of these 4 tables. This is a DB-only migration — no app code changes needed.

**Architecture:** Same pattern as Phase 2b-1: `ALTER TABLE ... RENAME COLUMN resort_id TO property_id` on all 4 tables (auto-cascades to RLS/constraints/indexes), then surgical `CREATE OR REPLACE FUNCTION` for the 2 affected functions with only their `resort_id`-on-these-tables lines changed.

**Confirmed safe to proceed without app-code changes:** `grep -rn "resort_id" --include="*.ts" --include="*.tsx" app lib | grep -v p_resort_id | grep -iE '"cost_centers"|"projects"|"resort_memberships"|"document_sequences"'` returns zero matches (checked 2026-08-16). RLS policies on all 4 tables use only `organization_id`-based checks (`is_org_member`/`has_permission`), no textual `resort_id` reference — confirmed via `pg_policies`.

**Tech Stack:** Postgres/Supabase migration (applied live via Supabase MCP `apply_migration`), Vitest integration test.

**What this plan does NOT do:** rename `resort_id` on any other table (`payments`, `dues`, `platform_audit_logs`, `chart_of_accounts`, etc. — future clusters, each requiring the same search-first approach since domain assumptions have twice now proven wrong). Rename `is_resort_member` itself (function name stays, per the Phase 2a decision — only its body's column reference changes).

---

### Task 1: Migration — rename `resort_id` to `property_id` on the 4 tables

**Files:**
- Create: `supabase/migrations/20260819000001_rename_resort_id_membership_misc_cluster.sql`

- [ ] **Step 1: Write and apply**

```sql
-- Phase 2b-2 of the resort -> property domain rename. Smallest remaining
-- cluster: only 2 functions (is_resort_member, next_sequence_value)
-- reference resort_id on these 4 tables at all; cost_centers and projects
-- have zero function references. Zero TS/TSX app code references resort_id
-- on any of these 4 tables (full-text search, 2026-08-16) -- this is a
-- DB-only migration.

alter table public.resort_memberships rename column resort_id to property_id;
alter table public.document_sequences rename column resort_id to property_id;
alter table public.cost_centers rename column resort_id to property_id;
alter table public.projects rename column resort_id to property_id;
```

Apply via Supabase MCP `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `rename_resort_id_membership_misc_cluster`).

- [ ] **Step 2: Verify**

```sql
select table_name, column_name from information_schema.columns
where table_schema = 'public' and table_name in ('resort_memberships', 'document_sequences', 'cost_centers', 'projects')
  and column_name in ('resort_id', 'property_id')
order by table_name, column_name;
```

Expected: every row shows `property_id`, zero rows show `resort_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260819000001_rename_resort_id_membership_misc_cluster.sql
git commit -m "feat: rename resort_id to property_id on resort_memberships/document_sequences/cost_centers/projects"
```

---

### Task 2: Surgically update the 2 affected functions

**Files:**
- Create: `supabase/migrations/20260819000002_update_functions_for_membership_misc_cluster.sql`

- [ ] **Step 1: `is_resort_member`**

Current live body (fetched via `pg_get_functiondef`, do not retype from memory):

```sql
CREATE OR REPLACE FUNCTION public.is_resort_member(p_user_id uuid, p_resort_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.resort_memberships rm
    where rm.user_id = p_user_id
      and rm.resort_id = p_resort_id
  ) or public.is_platform_admin(p_user_id);
$function$;
```

Change `rm.resort_id = p_resort_id` to `rm.property_id = p_resort_id` (the function's own parameter name `p_resort_id` stays unchanged, matching the Phase 2b-1 convention — only the column it's compared against changes).

- [ ] **Step 2: `next_sequence_value`**

Current live body:

```sql
CREATE OR REPLACE FUNCTION public.next_sequence_value(p_organization_id uuid, p_resort_id uuid, p_sequence_type text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value bigint;
begin
  insert into public.document_sequences (organization_id, resort_id, sequence_type, next_value)
  values (p_organization_id, p_resort_id, p_sequence_type, 1)
  on conflict (organization_id, resort_id, sequence_type) do nothing;

  update public.document_sequences
  set next_value = next_value + 1
  where organization_id = p_organization_id
    and (resort_id = p_resort_id or (resort_id is null and p_resort_id is null))
    and sequence_type = p_sequence_type
  returning next_value - 1 into v_value;

  return v_value;
end;
$function$;
```

Change all 3 occurrences of the bare `resort_id` column name (in the `INSERT` column list, the `ON CONFLICT` target column list, and the `UPDATE ... WHERE` clause) to `property_id`. The `p_resort_id` parameter name and its usages as a VALUE stay unchanged. Resulting body:

```sql
CREATE OR REPLACE FUNCTION public.next_sequence_value(p_organization_id uuid, p_resort_id uuid, p_sequence_type text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_value bigint;
begin
  insert into public.document_sequences (organization_id, property_id, sequence_type, next_value)
  values (p_organization_id, p_resort_id, p_sequence_type, 1)
  on conflict (organization_id, property_id, sequence_type) do nothing;

  update public.document_sequences
  set next_value = next_value + 1
  where organization_id = p_organization_id
    and (property_id = p_resort_id or (property_id is null and p_resort_id is null))
    and sequence_type = p_sequence_type
  returning next_value - 1 into v_value;

  return v_value;
end;
$function$;
```

**Important:** the `ON CONFLICT (organization_id, resort_id, sequence_type)` clause targets a unique constraint/index by column list, not by name — check via `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.document_sequences'::regclass;` that the underlying unique constraint's column list also got auto-updated by Task 1's `RENAME COLUMN` (it should — Postgres tracks constraints by column OID, not name, so this should already reference the renamed column internally). Verify this explicitly before applying — if the constraint's definition still shows `resort_id` in its printed form after Task 1, STOP and investigate before proceeding with Task 2's `ON CONFLICT` clause, since a mismatch here would make every future `next_sequence_value` call fail.

- [ ] **Step 3: Apply and verify**

Apply both `CREATE OR REPLACE FUNCTION` statements via Supabase MCP `apply_migration` (name `update_functions_for_membership_misc_cluster`). Then verify:

```sql
select proname, prosrc ilike '%rm.resort_id%' as is_resort_member_still_old
from pg_proc where proname = 'is_resort_member' and pronamespace = 'public'::regnamespace;

select proname,
  prosrc ilike '%organization_id, resort_id, sequence_type%' as insert_still_old,
  prosrc ilike '%resort_id = p_resort_id or%' as where_still_old
from pg_proc where proname = 'next_sequence_value' and pronamespace = 'public'::regnamespace;
```

Expected: all `false`.

- [ ] **Step 4: Smoke-test `next_sequence_value` live** (this function is used by document-numbering across the app — a mistake here would silently break sequence generation)

```sql
select public.next_sequence_value(
  (select id from public.organizations limit 1),
  null,
  '__phase2b2_smoke_test__'
);
```

Expected: returns `1` (first value for a brand-new sequence_type). Run it again — expected: returns `2`. This proves the `ON CONFLICT`/`UPDATE` logic still works correctly end-to-end against the renamed column.

- [ ] **Step 5: Write the migration file and commit**

```bash
git add supabase/migrations/20260819000002_update_functions_for_membership_misc_cluster.sql
git commit -m "feat: update is_resort_member and next_sequence_value for property_id rename"
```

---

### Task 3: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (9th `it()` block)

- [ ] **Step 1: Write a test proving the rename end-to-end**

As the 9th test: create an org, insert a `resort_memberships` row directly via `admin.from("resort_memberships").insert({ property_id: ..., organization_id: ..., user_id: ... })` (using a real or dummy-but-valid user id — reuse the pattern from prior tests that create a real auth user, since `resort_memberships.user_id` likely has no FK to `auth.users` requiring a real row — check the live schema/constraint first rather than assuming), then call `is_resort_member` via RPC and assert `true` for that user/resort pair and `false` for an unrelated resort id. Also call `next_sequence_value` twice with a unique `sequence_type` (e.g. `Date.now()`-suffixed) and assert it returns `1` then `2`. Insert a `cost_centers` and a `projects` row directly using `property_id` as the column, confirming the insert succeeds and the value round-trips on select. Clean up (archive the org) at the end, and delete any real auth user created, following the exact FK-safe cleanup pattern established in Phase 2b-1 (delete dependent `platform_audit_logs`/`user_role_assignments`/`organization_memberships` rows before `deleteUser`, and assert the delete's error is null) if a real user is created for this test.

- [ ] **Step 2: Run and verify**

Run: `npx vitest run tests/pgtap.integration.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git commit tests/pgtap.integration.test.ts -m "test: verify resort_memberships/document_sequences/cost_centers/projects property_id rename"
```

---

## Self-Review

**Spec coverage:** Task 1 covers all 4 column renames. Task 2 covers both functions that reference them, with exact live-fetched bodies and precise diffs (including the important `ON CONFLICT` verification step, since that's the one place a Postgres auto-cascade assumption needs explicit confirmation rather than blind trust). Task 3 proves the whole chain plus the two zero-function tables (`cost_centers`/`projects`) via direct insert/select.

**Placeholder scan:** No TBD/TODO. Task 3's test isn't fully pre-written (same reasoning as Phase 2b-1 Task 4 — depends on live schema details like whether `resort_memberships.user_id` needs a real auth user, confirmed at implementation time) but gives complete, concrete instructions.

**Type consistency:** No TS types file changes needed (confirmed zero app-code usage) — first cluster where that's true, explicitly noted so no implementer wastes time searching for a non-existent gap.
