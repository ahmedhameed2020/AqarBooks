# Phase 2g Group 3: due_schedules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id` → `property_id` on `due_schedules`, and update the RLS policy, index, and 2 functions that reference it.

**Architecture:** Single self-contained table (no cross-cluster entanglement). Same methodology as every prior phase: live research first, DDL rename with immediate verification, surgical function-body/policy edits verified by exact occurrence-count queries, integration test, two-stage + final holistic review. Notably: **zero app-code changes required** — no UI or `lib/actions/*` file references `due_schedules` or any of its 3 functions, and the table isn't represented in `lib/supabase/types.ts`.

**Tech Stack:** Supabase/Postgres (live project `ataslxkcflxuilpgyepm`), Vitest integration tests against the live project.

---

## Pre-flight research (completed live, 2026-08-17)

- Columns: `id, organization_id, resort_id, name, description_ar, description_en, due_type_id, receivable_account_id, amount, amount_by_unit_type, frequency, day_of_month, month_of_year, scope, due_offset_days, is_active, created_by, created_at, updated_at`.
- FKs: `organization_id → organizations(id)`, `resort_id → properties(id)`, `due_type_id → due_types(id)`, `receivable_account_id → chart_of_accounts(id)`, `created_by → auth.users(id)`. No cross-cluster entanglement.
- No triggers.
- 1 index needs updating: `idx_due_schedules_resort` on `(resort_id)`.
- **2 RLS policies**, one of which genuinely needs editing — the first RLS policy edit in this entire rename effort (every prior phase's policies never referenced `resort_id` directly):
  - `due_schedules_select_permission` (SELECT) — only checks `has_permission(...)`, doesn't reference `resort_id`. No change.
  - `due_schedules_manage` (ALL) — its `WITH CHECK` clause directly references `due_schedules.resort_id`: `... AND (EXISTS (SELECT 1 FROM properties r WHERE r.id = due_schedules.resort_id AND r.organization_id = due_schedules.organization_id))`. Must become `r.id = due_schedules.property_id`. Its `USING` clause has no `resort_id` reference (only the `WITH CHECK` does).
- **3 functions confirmed to touch this table** via a broad, unbiased live scan (`pg_get_functiondef(...) ilike '%public.due_schedules%'`) — matches exactly the 3 functions already known from prior tracking (no surprises this time, unlike the payment_provider_settings scan):
  - `generate_recurring_dues(p_organization_id, p_schedule_id, p_period, p_generated_by, p_override_issue_date, p_ip_address, p_user_agent)` — declares `v_schedule record` (untyped, inferred from `SELECT * INTO v_schedule FROM public.due_schedules ...`). 8 `resort_id`-substring occurrences total; confirmed exactly 6 are genuine (5× `v_schedule.resort_id` field access, 1× the `INSERT INTO public.dues (organization_id, resort_id, ...)` column list). The other 2 occurrences are `append_financial_audit_event`'s own `p_resort_id` named-argument parameter (confirmed live — that function's parameter is still `p_resort_id`, since it belongs to the still-deferred `financial_audit_logs` cluster) — stays unchanged, matching the Issue #15 convention. The `units` table lookup (`u.property_id = v_schedule.resort_id`) already uses `u.property_id` correctly (units was renamed in an earlier phase) — only the `v_schedule.resort_id` side of that comparison changes.
  - `preview_generate_recurring_dues(p_organization_id, p_schedule_id, p_period)` — same `v_schedule record` pattern. 2 occurrences, both genuine `v_schedule.resort_id` (the `has_financial_permission` call and the `units` lookup) — both become `v_schedule.property_id`.
  - `run_due_schedules()` — confirmed 0 `resort_id` occurrences (its `v_schedule` field accesses are only `.frequency`, `.day_of_month`, `.month_of_year`, `.organization_id`, `.id`). Touches the table (`SELECT * FROM public.due_schedules WHERE is_active = true AND ...`) but needs **zero edits** — listed explicitly so nothing is silently skipped.
- App code: zero references anywhere to `due_schedules`, `generate_recurring_dues`, `preview_generate_recurring_dues`, or `run_due_schedules` (confirmed via repo-wide grep — not wired into any UI yet).
- Not present in `lib/supabase/types.ts` (RPC-only table so far, matching the `payment_provider_settings`/`organization_finance_settings` precedent).

---

## Task 1: Rename the column (DDL)

**Files:**
- Create: `supabase/migrations/20260828000001_rename_resort_id_due_schedules_cluster.sql`

- [ ] **Step 1: Apply the rename migration live**

```sql
alter table public.due_schedules rename column resort_id to property_id;
```

- [ ] **Step 2: Verify live via `information_schema.columns`** — `due_schedules` must show `property_id`, zero rows show `resort_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260828000001_rename_resort_id_due_schedules_cluster.sql
git commit -m "feat: rename resort_id to property_id on due_schedules"
```

## Task 2: Update the index, RLS policy, and 2 functions

**Files:**
- Create: `supabase/migrations/20260828000002_update_functions_for_due_schedules_cluster.sql`

- [ ] **Step 1: Rebuild `idx_due_schedules_resort`**

```sql
drop index if exists public.idx_due_schedules_resort;
create index idx_due_schedules_resort on public.due_schedules using btree (property_id);
```

(Index name kept as-is — matches the established Issue #15 precedent of not renaming index/constraint names as part of column-rename phases.)

- [ ] **Step 2: Alter the `due_schedules_manage` policy's `WITH CHECK` clause**

Postgres doesn't support `CREATE OR REPLACE POLICY` — use `ALTER POLICY ... WITH CHECK (...)`, re-specifying the full existing `USING` clause unchanged alongside the corrected `WITH CHECK`:

```sql
alter policy due_schedules_manage on public.due_schedules
  using (has_permission(auth.uid(), organization_id, 'finance.schedules.manage'::text) and organization_is_active(organization_id))
  with check (
    has_permission(auth.uid(), organization_id, 'finance.schedules.manage'::text)
    and organization_is_active(organization_id)
    and exists (
      select 1 from public.properties r
      where r.id = due_schedules.property_id and r.organization_id = due_schedules.organization_id
    )
  );
```

`due_schedules_select_permission` is untouched (doesn't reference `resort_id`).

- [ ] **Step 3: `CREATE OR REPLACE FUNCTION public.generate_recurring_dues(...)`**

Same body as live, with exactly 6 substitutions: every `v_schedule.resort_id` → `v_schedule.property_id` (5 occurrences: the `has_financial_permission` call, the `units` lookup, the `RECURRING_DUES_SKIPPED` audit event's `p_resort_id := v_schedule.resort_id` value, the `dues` INSERT `VALUES` list, and the `RECURRING_DUES_GENERATED` audit event's `p_resort_id := v_schedule.resort_id` value), plus the `INSERT INTO public.dues (organization_id, resort_id, ...)` column list → `(organization_id, property_id, ...)`. The `p_resort_id :=` named-argument syntax in both `append_financial_audit_event` calls stays unchanged (that function's own parameter name, deferred per Issue #15).

- [ ] **Step 4: `CREATE OR REPLACE FUNCTION public.preview_generate_recurring_dues(...)`**

Same body, with both `v_schedule.resort_id` occurrences (the `has_financial_permission` call and the `units` lookup) changed to `v_schedule.property_id`.

- [ ] **Step 5: Verify all 4 items live**

Re-fetch the index, the policy (`pg_get_expr(polwithcheck, polrelid)`), and both functions via `pg_get_functiondef`, confirm exact occurrence counts match (6 genuine substitutions in `generate_recurring_dues`, 2 in `preview_generate_recurring_dues`, both `p_resort_id` named-argument occurrences in `generate_recurring_dues` still present and unchanged). Re-verify `run_due_schedules` is still byte-identical to its pre-migration definition (confirms it was correctly left untouched).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260828000002_update_functions_for_due_schedules_cluster.sql
git commit -m "feat: update index/policy/functions for due_schedules property_id rename"
```

## Task 3: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (new `it()` block, numbered "17.")

- [ ] **Step 1:** Write a test that, under a real TENANT_OWNER session (matching test 15/16's setup pattern), proves:
  - `preview_generate_recurring_dues` succeeds and returns the correct unit count/total for a schedule scoped to the test resort (proves its 2 substitutions).
  - `generate_recurring_dues` succeeds, and the resulting `dues` row(s) have the correct `property_id` (not `resort_id`) — this also exercises the `RECURRING_DUES_GENERATED` audit event path.
  - Calling `generate_recurring_dues` again with the same `p_period` hits the idempotent-replay path (`RECURRING_DUES_SKIPPED`) and returns `idempotent: true` — proves that branch's substitutions too.
  - The `due_schedules_manage` RLS policy's `WITH CHECK` still enforces org/property consistency correctly: attempt to create (or update) a `due_schedules` row via the authenticated client with a `property_id` belonging to a *different* organization, and confirm it's rejected by RLS (not a hard Postgres column-not-found error — the distinction between "RLS correctly rejects it" and "the rename broke the policy" is exactly what this proves).
  - Include cleanup for every row created (`due_generation_runs`, `dues`, `due_schedules`, `platform_audit_logs` by `organization_id` before deleting the resort — matching test 15/16's precedent since `generate_recurring_dues` writes to `financial_audit_logs` via `append_financial_audit_event`, not `platform_audit_logs`, so verify which audit table actually needs cleanup here specifically).

- [ ] **Step 2:** Run `npx vitest run tests/pgtap.integration.test.ts --testTimeout=30000` — must pass, including all 16 prior tests (no regressions).

- [ ] **Step 3:** Verify live via Supabase MCP that the test run left zero orphaned rows (organizations, due_schedules, dues, financial_audit_logs, auth.users matching the test's slug/email prefix).

- [ ] **Step 4: Commit**

```bash
git add tests/pgtap.integration.test.ts
git commit -m "test: verify due_schedules property_id rename end-to-end"
```

## Self-Review

- **Spec coverage:** DDL rename (Task 1), index/RLS policy/both functions with genuine refs (Task 2), integration proof including the RLS policy specifically (Task 3) — every pre-flight finding above is covered by a task. No app-code task needed (confirmed zero references).
- **Placeholder scan:** none — every step shows the actual before/after SQL or the exact substitution.
- **Type consistency:** `property_id` used consistently; `p_resort_id` (the `append_financial_audit_event` parameter) deliberately left unchanged, consistently, matching the Issue #15 convention.
