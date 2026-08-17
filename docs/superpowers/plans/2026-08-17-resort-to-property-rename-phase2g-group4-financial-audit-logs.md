# Phase 2g Group 4: financial_audit_logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id` → `property_id` on `financial_audit_logs`, and update the 2 functions that reference it. **This is the final deferred group of the entire `resort_id`→`property_id` rename effort** — after this merges, no table anywhere in the schema has a literal `resort_id` column left.

**Architecture:** Single self-contained table. Same methodology as every prior phase: live research first (with extra care here, since this table is semi-universal/audit-critical, matching the caution level applied to `platform_audit_logs`/`chart_of_accounts` earlier in the effort), DDL rename with immediate verification, surgical function-body edits verified by exact occurrence-count queries, integration test, two-stage + final holistic review.

**Tech Stack:** Supabase/Postgres (live project `ataslxkcflxuilpgyepm`), Vitest integration tests against the live project.

---

## Pre-flight research (completed live, 2026-08-17)

- Columns: `id, organization_id, resort_id (nullable), actor_user_id, action, entity_type, entity_id, request_id, occurred_at, ip_address, user_agent, metadata, previous_hash, event_hash, created_at`. `resort_id` nullable — `NULL` means an organization-wide (not property-scoped) audit event.
- FKs: `organization_id → organizations(id)`, `resort_id → properties(id) ON DELETE SET NULL`, `actor_user_id → auth.users(id) ON DELETE SET NULL`. No cross-cluster entanglement.
- 1 CHECK constraint (`check_audit_action`) — an allow-list of action values, doesn't reference `resort_id`. (This is the same constraint behind Issue #13 — `void_payment`'s `PAYMENT_REVERSED` isn't in the list — unrelated to this rename, not touched here.)
- **RLS: only 1 policy** (`"Admins and managers can read financial audit logs"`, SELECT-only), and it does **not** reference `resort_id` at all — checked explicitly given due_schedules turned out to need its first-ever RLS edit in this effort; this table needs none.
- **4 indexes**, none reference `resort_id`: `financial_audit_logs_pkey`, `idx_fin_audit_org_occurred (organization_id, occurred_at)`, `idx_fin_audit_org_entity (organization_id, entity_type, entity_id)`, `idx_fin_audit_actor_occurred (actor_user_id, occurred_at)`, `idx_fin_audit_action_occurred (action, occurred_at)`. No index changes needed.
- No triggers.
- **2 functions confirmed to touch this table** via a broad, unbiased live scan (`pg_get_functiondef(...) ilike '%public.financial_audit_logs%'`) — matches exactly the 2 already-known functions, no surprises:
  - `append_financial_audit_event(p_organization_id, p_action, p_entity_type, p_resort_id, p_entity_id, p_request_id, p_ip_address, p_user_agent, p_metadata)` — 6 `resort_id`-substring occurrences total; exactly **1** is genuine (the `INSERT INTO public.financial_audit_logs (organization_id, resort_id, ...)` column list). The other 5 are the `p_resort_id` parameter itself (its declaration, an `IS NOT NULL` check, a `public.resorts` compatibility-view lookup matching established precedent, and its use in the SHA-256 hash payload and the INSERT `VALUES` list) — stays unchanged, matching the Issue #15 convention. **This parameter is called from ~35+ other functions across the whole codebase** via `p_resort_id := <value>` named-argument syntax (`generate_recurring_dues`, `record_expense`, `record_online_payment`, etc.) — none of those call sites need any change; they're passing an already-correctly-renamed value into this function's still-parameter-named argument.
  - `verify_financial_audit_chain(p_organization_id)` — 1 occurrence, genuine: `v_rec.resort_id::text` inside the hash-payload reconstruction (`v_rec` is a generic `record` typed from `SELECT * FROM public.financial_audit_logs`). **This is the one substitution that matters most in this whole phase** — see the "Hash chain integrity" section below for why it's safe, and why getting it right is critical.
- App code: zero references anywhere (`financial_audit_logs`, `append_financial_audit_event`, `verify_financial_audit_chain` — no matches outside `tests/pgtap.integration.test.ts`). Not wired into any UI yet.
- Not present in `lib/supabase/types.ts` (RPC-only table, matching every other deferred-group precedent).

## Hash chain integrity — why this rename is safe, and what must be verified

`append_financial_audit_event` computes each row's `event_hash` from a payload built via `concat_ws('|', ..., COALESCE(p_resort_id::text, ''), ...)` — i.e., the **UUID value cast to text**, not anything derived from the column name. Renaming the column doesn't change the stored UUID value in any existing row, and future inserts write the identical value through `property_id` instead of `resort_id`. So the hash payload string is byte-identical before and after this rename, for both old and new rows — **as long as `verify_financial_audit_chain`'s reconstruction correctly reads `v_rec.property_id` post-rename** (get this wrong, e.g. leave it as `v_rec.resort_id`, and the function would simply error at runtime — `v_rec` derives its fields from the live table, so a missing field isn't a silent bug here, it's a hard failure. Still: verify explicitly, not just trust this reasoning).

**Live baseline captured before any change** (Task 0, already done): `verify_financial_audit_chain('34b55762-edc0-4da0-b658-e29ec86ba53d')` (the real, standing `E2E Test Organization (ResortOS)` fixture) returns **418 total rows, 391 valid, 27 invalid**. The 27 invalid rows are a genuine, pre-existing, unrelated bug (filed separately as **Issue #23** — a suspected `ORDER BY occurred_at, id` tie-break ordering mismatch between the writer's true serialized insert order and the reader's reconstruction). Task 2's verification step must re-run this exact query after the migration and confirm **the exact same numbers** (418/391/27) — any change in those numbers (not just "still passes on fresh data") is the real signal that something broke, since a fresh test org alone wouldn't catch a subtle chain-reconstruction regression on rows written under the old column name.

---

## Task 1: Rename the column (DDL)

**Files:**
- Create: `supabase/migrations/20260829000001_rename_resort_id_financial_audit_logs_cluster.sql`

- [ ] **Step 1: Apply the rename migration live**

```sql
alter table public.financial_audit_logs rename column resort_id to property_id;
```

- [ ] **Step 2: Verify live via `information_schema.columns`** — `financial_audit_logs` must show `property_id`, zero rows show `resort_id`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260829000001_rename_resort_id_financial_audit_logs_cluster.sql
git commit -m "feat: rename resort_id to property_id on financial_audit_logs"
```

## Task 2: Update the 2 functions

**Files:**
- Create: `supabase/migrations/20260829000002_update_functions_for_financial_audit_logs_cluster.sql`

- [ ] **Step 1: `CREATE OR REPLACE FUNCTION public.append_financial_audit_event(...)`**

Same body as live, with only the `INSERT INTO public.financial_audit_logs (organization_id, resort_id, ...)` column list changed to `(organization_id, property_id, ...)`. The `p_resort_id` parameter itself, its `IS NOT NULL` check, the `public.resorts` lookup, the hash-payload `COALESCE(p_resort_id::text, '')`, and the INSERT `VALUES` list's `p_resort_id` all stay unchanged.

- [ ] **Step 2: `CREATE OR REPLACE FUNCTION public.verify_financial_audit_chain(...)`**

Same body, with the single `v_rec.resort_id::text` in the hash-payload reconstruction changed to `v_rec.property_id::text`. Nothing else in this function changes.

- [ ] **Step 3: Verify live**

Re-fetch both functions via `pg_get_functiondef`, confirm exact occurrence counts (`append_financial_audit_event` should drop from 6 to 5 remaining `resort_id` substrings — all `p_resort_id`; `verify_financial_audit_chain` should drop from 1 to 0).

**Critical: re-run the hash-chain baseline check** — `select count(*) as total, count(*) filter (where is_valid) as valid, count(*) filter (where not is_valid) as invalid from verify_financial_audit_chain('34b55762-edc0-4da0-b658-e29ec86ba53d')` — must return **exactly 418/391/27**, matching the pre-migration baseline. If these numbers differ, stop and investigate before proceeding — that would mean the rename broke hash-chain reconstruction, not just that pre-existing Issue #23 rows are still present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260829000002_update_functions_for_financial_audit_logs_cluster.sql
git commit -m "feat: update functions for financial_audit_logs property_id rename"
```

## Task 3: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (new `it()` block, numbered "18.")

- [ ] **Step 1:** Write a test that, under a real TENANT_OWNER session (matching test 15/16/17's setup pattern), proves:
  - `append_financial_audit_event` succeeds for both a property-scoped event (`p_resort_id` set) and an org-wide event (`p_resort_id` null), and the resulting `financial_audit_logs` rows show the correct `property_id`/`NULL`.
  - `verify_financial_audit_chain` returns `is_valid: true` for both rows just created — this is the real proof that the hash chain still reconstructs correctly through the renamed column, on rows created after the rename (complementing, not replacing, the live baseline check against pre-existing production rows in Task 2).
  - A second call to `append_financial_audit_event` for the same org correctly chains `previous_hash` to the first event's `event_hash` (proves the chain-continuity check, not just per-row hash correctness).
  - Include cleanup for every row created (`financial_audit_logs` by `organization_id`).

- [ ] **Step 2:** Run `npx vitest run tests/pgtap.integration.test.ts --testTimeout=30000` — must pass, including all 17 prior tests (no regressions).

- [ ] **Step 3:** Verify live via Supabase MCP that the test run left zero orphaned rows, AND re-confirm the production baseline (418/391/27 on the E2E org) is still unchanged after the full test suite ran.

- [ ] **Step 4: Commit**

```bash
git add tests/pgtap.integration.test.ts
git commit -m "test: verify financial_audit_logs property_id rename end-to-end"
```

## Self-Review

- **Spec coverage:** DDL rename (Task 1), both functions with genuine refs (Task 2), integration proof including the hash-chain-specific verification (Task 3) — every pre-flight finding is covered. No RLS/index/app-code task needed (confirmed none apply).
- **Placeholder scan:** none — every step shows the actual before/after or the exact substitution and the exact verification query/expected numbers.
- **Type consistency:** `property_id` used consistently; `p_resort_id` (the `append_financial_audit_event` parameter, called by ~35+ other functions) deliberately left unchanged, consistently, matching the Issue #15 convention.
