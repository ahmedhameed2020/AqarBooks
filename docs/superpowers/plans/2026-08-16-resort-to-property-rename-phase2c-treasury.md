# Resort→Property Rename: Phase 2c (Treasury Cluster) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id`→`property_id` on the treasury cluster tables — `bank_accounts`, `cashboxes`, `cashier_sessions`, `cheques` — and surgically update every function/app-code reference that actually touches the renamed column, per the order agreed with the user (treasury → purchasing → payments/dues, saving the biggest/most interconnected cluster for last).

**Architecture:** One migration renames all 4 columns in a single `ALTER TABLE` batch (auto-cascades FKs to `properties(id)`, the one index on `cashboxes`, and RLS policies — none of which reference `resort_id` by name, confirmed live). A second migration surgically updates exactly 6 functions. Unlike Phase 2b-3 (platform_audit_logs), this cluster has **two distinct edit shapes**, both confirmed by reading all 10 candidate functions' live bodies in full:

1. **Direct INSERT/SELECT column-list edits** against the 4 tables (e.g. `insert into public.cashboxes (organization_id, resort_id, ...)`).
2. **Row-typed variable field-access edits**: several functions declare a variable as `public.cashier_sessions` or `public.cheques` (e.g. `v_session public.cashier_sessions;`) and later read `.resort_id` off it (e.g. `v_session.resort_id`, used as a value passed elsewhere). Since that variable's type is one of the 4 renamed tables, `.resort_id` becomes `.property_id` on it too — even though the surrounding statement (e.g. an INSERT into `platform_audit_logs`) has nothing to do with treasury.

Critically, **4 of the 10 candidate functions need zero changes**: `post_payment_internal`, `record_expense`, `record_supplier_payment`, and `set_cheque_status` all declare a `public.cashier_sessions` or `public.cheques` row variable but never actually read `.resort_id` off it anywhere in the body (verified by reading each body in full, not by regex alone — a naive `\y(cashboxes|cashier_sessions|bank_accounts|cheques)\y` text search over-matches these 4 as false positives). Do not touch these 4 functions.

Also unlike Phase 2b-3, this cluster has real TypeScript impact: `lib/actions/treasury.ts` has two direct Supabase `.insert()` calls (on `cashboxes` and `bank_accounts`) that pass a `resort_id` key literally — those two call sites must be updated to `property_id`, or the insert will fail post-migration (`column "resort_id" of relation "cashboxes" does not exist`). RPC calls in the same file (e.g. `p_resort_id: ...`) are untouched — those are function parameter names, never renamed in any phase of this effort.

**Confirmed safe (verified live 2026-08-16):**
- No RLS policy on any of the 4 tables references `resort_id` by name — all gate on `organization_id`/`auth.uid()` via `has_permission`/`is_org_member`.
- The only FK constraints referencing `resort_id` on these tables (`cashboxes_resort_id_fkey`, `cashier_sessions_resort_id_fkey`, `bank_accounts_resort_id_fkey`, `cheques_resort_id_fkey`) all point at `properties(id)` and auto-update their definition text on column rename (Postgres tracks FK targets by attnum, not by name).
- The only index referencing `resort_id` (`idx_cashboxes_resort` on `cashboxes`) auto-updates the same way.
- No triggers exist on any of the 4 tables.
- `financial_audit_logs` (a separate hash-chained audit table, distinct from `platform_audit_logs`) is written only by `append_financial_audit_event`/`verify_financial_audit_chain`, neither of which appears in the 10-function candidate list — confirmed zero interaction with this cluster.

**Tech Stack:** Postgres/Supabase migration (applied live via Supabase MCP `apply_migration`), two `.ts` edits, Vitest integration test.

---

### Task 1: Migration — rename `resort_id` to `property_id` on the 4 treasury tables

**Files:**
- Create: `supabase/migrations/20260821000001_rename_resort_id_treasury_cluster.sql`

- [ ] **Step 1: Write and apply**

```sql
-- Phase 2c of the resort -> property domain rename. Treasury cluster:
-- bank_accounts, cashboxes, cashier_sessions, cheques. Second cluster in
-- the agreed order (treasury -> purchasing -> payments/dues), chosen for
-- being interlinked but smaller in scope than accounting/receivables.

alter table public.bank_accounts rename column resort_id to property_id;
alter table public.cashboxes rename column resort_id to property_id;
alter table public.cashier_sessions rename column resort_id to property_id;
alter table public.cheques rename column resort_id to property_id;
```

Apply via Supabase MCP `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `rename_resort_id_treasury_cluster`).

- [ ] **Step 2: Verify**

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('bank_accounts', 'cashboxes', 'cashier_sessions', 'cheques')
  and column_name in ('resort_id', 'property_id')
order by table_name;
```

Expected: 4 rows, each `property_id`, no `resort_id` rows.

Also re-run the FK/index checks to confirm they auto-updated:

```sql
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid in ('public.bank_accounts'::regclass, 'public.cashboxes'::regclass, 'public.cashier_sessions'::regclass, 'public.cheques'::regclass)
  and pg_get_constraintdef(oid) ilike '%property_id%';
```

Expected: 4 rows, each `FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260821000001_rename_resort_id_treasury_cluster.sql
git commit -m "feat: rename resort_id to property_id on treasury cluster (bank_accounts/cashboxes/cashier_sessions/cheques)"
```

---

### Task 2: Surgically update the 6 affected functions

**Files:**
- Create: `supabase/migrations/20260821000002_update_functions_for_treasury_cluster.sql`

**Method (mandatory, do not deviate):** For EACH of the 6 functions below:
1. Fetch its CURRENT live definition via `pg_get_functiondef` (project_id `ataslxkcflxuilpgyepm`) — do not use any cached/remembered version, fetch fresh, since Task 1 has already renamed the columns.
2. Apply ONLY the exact substitution documented for that function below. Nothing else in the body changes: not parameter names (`p_resort_id` stays `p_resort_id` everywhere), not any `resort_id` reference belonging to an out-of-scope table (`resorts`, `dues`, `payments`, `expenses`, `supplier_invoices`, `supplier_payments`, `platform_audit_logs.property_id`'s own VALUES-list resort-adjacent expressions that don't originate from one of the 4 treasury tables, etc.).
3. Reassemble as a `CREATE OR REPLACE FUNCTION` statement using the function's full live definition (matched header verbatim) with only the documented substitution(s) applied.

**Do NOT touch** `post_payment_internal`, `record_expense`, `record_supplier_payment`, `set_cheque_status` — confirmed via full-body read that none of them access `.resort_id` on any treasury-table-typed variable.

**Function 1: `clear_incoming_cheque`** — one substitution: the `v_cheque.resort_id` reference (passed as the 2nd positional argument to `public.record_payment(...)`) becomes `v_cheque.property_id`, because `v_cheque` is declared `public.cheques` and `cheques.resort_id` no longer exists after Task 1.

Before: `v_cheque.organization_id, v_cheque.resort_id, v_cheque.member_id, null, v_cheque.amount,`
After: `v_cheque.organization_id, v_cheque.property_id, v_cheque.member_id, null, v_cheque.amount,`

**Function 2: `close_cashier_session`** — one substitution: `v_session.resort_id` (passed as the 3rd value into the `platform_audit_logs` INSERT's `property_id` column — the column name is already correct from Phase 2b-3, only the source expression needs updating) becomes `v_session.property_id`, because `v_session` is declared `public.cashier_sessions`.

Before: `values (auth.uid(), v_session.organization_id, v_session.resort_id, 'cashier_session.closed', 'cashier_session', p_session_id,`
After: `values (auth.uid(), v_session.organization_id, v_session.property_id, 'cashier_session.closed', 'cashier_session', p_session_id,`

**Function 3: `create_cashbox`** — one substitution: the `cashboxes` INSERT column list.

Before: `insert into public.cashboxes (organization_id, resort_id, name, gl_account_id)`
After: `insert into public.cashboxes (organization_id, property_id, name, gl_account_id)`

(The `VALUES (p_organization_id, p_resort_id, ...)` list is unchanged — `p_resort_id` is a parameter name, not a column name, and parameter names are never renamed in this effort.)

**Function 4: `open_cashier_session`** — two substitutions:

(a) The `cashboxes` SELECT column reference:
Before: `select resort_id into v_cashbox_resort_id\n  from public.cashboxes`
After: `select property_id into v_cashbox_resort_id\n  from public.cashboxes`
(`v_cashbox_resort_id` is a scalar local variable name — it is NOT renamed, only the column it's selected from.)

(b) The `cashier_sessions` INSERT column list:
Before: `insert into public.cashier_sessions (organization_id, resort_id, cashbox_id, opened_by, opening_balance)`
After: `insert into public.cashier_sessions (organization_id, property_id, cashbox_id, opened_by, opening_balance)`

**Function 5: `reconcile_cashier_session`** — one substitution: `v_session.resort_id` (passed as the value into `platform_audit_logs`'s already-renamed `property_id` column) becomes `v_session.property_id`.

Before: `values (auth.uid(), v_session.organization_id, v_session.resort_id, 'cashier_session.reconciled', 'cashier_session', p_session_id, p_note);`
After: `values (auth.uid(), v_session.organization_id, v_session.property_id, 'cashier_session.reconciled', 'cashier_session', p_session_id, p_note);`

**Function 6: `record_incoming_cheque`** — one substitution: the `cheques` INSERT column list.

Before: `insert into public.cheques (\r\n    organization_id, resort_id, bank_account_id, direction, cheque_number, amount,`
After: `insert into public.cheques (\r\n    organization_id, property_id, bank_account_id, direction, cheque_number, amount,`

- [ ] **Step 1: Prepare all 6 statements**

Fetch fresh and transform all 6 functions per the method above. Concatenate into one migration file.

- [ ] **Step 2: Apply**

Apply the full set of 6 `CREATE OR REPLACE FUNCTION` statements via Supabase MCP `apply_migration` (name `update_functions_for_treasury_cluster`) as one combined call.

- [ ] **Step 3: Verify — do not skip or rush**

For each function, re-fetch its live body and confirm the exact substitution landed and nothing else changed:

```sql
select proname, prosrc
from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('clear_incoming_cheque','close_cashier_session','create_cashbox','open_cashier_session','reconcile_cashier_session','record_incoming_cheque');
```

For each row, confirm:
- No remaining unqualified `resort_id` token belonging to `bank_accounts`/`cashboxes`/`cashier_sessions`/`cheques` (check via `prosrc ilike '%resort_id%'` per function, then manually inspect each remaining hit — some functions, e.g. none in this set, may legitimately keep `p_resort_id` parameter references, which is fine and expected).
- `create_cashbox`: `insert into public.cashboxes (organization_id, property_id, name, gl_account_id)` present.
- `open_cashier_session`: BOTH `select property_id into v_cashbox_resort_id` AND `insert into public.cashier_sessions (organization_id, property_id, cashbox_id, opened_by, opening_balance)` present.
- `record_incoming_cheque`: `insert into public.cheques (` column list contains `property_id`, not `resort_id`.
- `clear_incoming_cheque`: the `record_payment(...)` call's 2nd argument is `v_cheque.property_id`, not `v_cheque.resort_id`.
- `close_cashier_session` and `reconcile_cashier_session`: the `platform_audit_logs` INSERT's value list uses `v_session.property_id`, not `v_session.resort_id`.

Also spot-check that `post_payment_internal`, `record_expense`, `record_supplier_payment`, `set_cheque_status` were **not modified** (their `prosrc` should be byte-identical to what was fetched during planning — no `CREATE OR REPLACE` was issued for them in this migration, so this should be true by construction, but confirm no accidental extra statement was added to the migration file).

- [ ] **Step 4: Write the migration file and commit**

```bash
git add supabase/migrations/20260821000002_update_functions_for_treasury_cluster.sql
git commit -m "feat: update 6 functions for treasury cluster property_id rename"
```

---

### Task 3: Update app code (`lib/actions/treasury.ts`)

**Files:**
- Modify: `lib/actions/treasury.ts:29-34` (createCashboxAction), `lib/actions/treasury.ts:173-181` (createBankAccountAction)

**Confirmed scope (verified live 2026-08-16):** these are the ONLY two `resort_id`-on-treasury-table references anywhere in `app/` or `lib/` — no `.resort_id` property reads exist anywhere in the codebase for these 4 tables, and all other `resortId`/`p_resort_id` occurrences in `treasury.ts` and the 3 other files that touch these tables (`finance/reports/page.tsx`, `dashboard/tenant-dashboard.tsx`, `finance/banks/page.tsx`, `finance/cashier/page.tsx`) are either RPC parameter names (unaffected) or unrelated `resortId` React props (unaffected, out of scope for this phased rollout).

- [ ] **Step 1: Update `createCashboxAction`**

In `lib/actions/treasury.ts`, change:

```typescript
  const { error } = await supabase.from("cashboxes").insert({
    organization_id: parsed.data.organizationId,
    resort_id: parsed.data.resortId,
    name: parsed.data.name,
    gl_account_id: parsed.data.glAccountId,
  });
```

to:

```typescript
  const { error } = await supabase.from("cashboxes").insert({
    organization_id: parsed.data.organizationId,
    property_id: parsed.data.resortId,
    name: parsed.data.name,
    gl_account_id: parsed.data.glAccountId,
  });
```

(Only the object key changes, `organization_id`→stays, `resort_id`→`property_id`. The `resortId` field on the Zod schema and `parsed.data.resortId` value expression are unchanged — renaming those is out of scope for this phase, matching the precedent set in Phase 2b-1/2b-3 of not renaming unrelated identifiers/props.)

- [ ] **Step 2: Update `createBankAccountAction`**

In `lib/actions/treasury.ts`, change:

```typescript
  const { error } = await supabase.from("bank_accounts").insert({
    organization_id: parsed.data.organizationId,
    resort_id: parsed.data.resortId,
    bank_id: parsed.data.bankId,
    account_name: parsed.data.accountName,
    account_number: parsed.data.accountNumber,
    gl_account_id: parsed.data.glAccountId,
  });
```

to:

```typescript
  const { error } = await supabase.from("bank_accounts").insert({
    organization_id: parsed.data.organizationId,
    property_id: parsed.data.resortId,
    bank_id: parsed.data.bankId,
    account_name: parsed.data.accountName,
    account_number: parsed.data.accountNumber,
    gl_account_id: parsed.data.glAccountId,
  });
```

- [ ] **Step 3: Update `lib/supabase/types.ts`**

Find the `bank_accounts`, `cashboxes`, `cashier_sessions`, and `cheques` table type definitions. In each one's `Row` and `Insert` shapes, rename the `resort_id` field to `property_id` (same mechanical edit as Phase 2b-3's `lib/supabase/types.ts` fix — read the file first to find the exact current shape for each of the 4 tables, since this plan doesn't have live sight of that file's current content for these tables).

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit
```

Expected: no errors.

```bash
git add lib/actions/treasury.ts lib/supabase/types.ts
git commit -m "feat: update app code and TS types for treasury cluster property_id rename"
```

---

### Task 4: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (11th `it()` block, following test 10 from Phase 2b-3)

- [ ] **Step 1: Write a test proving the rename end-to-end**

As test 11, in the same style as tests 7-10 (real org, real signed-in session where a function's own `has_permission`/`has_financial_permission` check demands one): exercise at least the two INSERT-column-list edits (the highest-risk edits, since a miss there is a hard SQL error, not a silent bug) plus one row-typed-variable edit, in one coherent flow:

1. Create an org, a resort (via `create_resort` or direct insert — direct insert into `resorts` is fine here, matching test 9's pattern, since `create_resort` isn't under test), and a chart-of-accounts GL account of category `ASSET` (`create_cashbox` requires one).
2. Call `create_cashbox` (organization owner or whoever holds `finance.accounts.manage` — check the permission and use a real signed-in session if the function enforces `has_permission`/`auth.uid()`; `create_cashbox` uses `public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage')`, so a real session is required). Read back the created `cashboxes` row directly via `admin.from("cashboxes").select("id, property_id").eq("id", cashboxId).single()` and assert `property_id` equals the resort id. This proves `create_cashbox`'s INSERT succeeded against the renamed column.
3. Call `open_cashier_session` with that cashbox (also `has_permission`-gated, `cashier.sessions.open`). Read back the created `cashier_sessions` row and assert `property_id` equals the resort id — this proves both the SELECT-then-compare logic inside `open_cashier_session` (which reads `cashboxes.property_id` to validate a match) and its own INSERT succeeded.
4. Call `close_cashier_session` on that session (`cashier.sessions.close`). Read back the resulting `platform_audit_logs` row for `action = 'cashier_session.closed'` and assert its `property_id` equals the resort id — this specifically proves the `v_session.property_id` row-typed-variable-field-access edit works (if it were still `v_session.resort_id`, this call would fail with a hard SQL error since that column no longer exists on `cashier_sessions`).

Clean up per the established FK-safe pattern (delete `platform_audit_logs`/`cashier_sessions`/`cashboxes`/`chart_of_accounts`/`resorts` rows and any `user_role_assignments`/`organization_memberships` rows referencing the test user before `deleteUser`, asserting each delete's error is `null`), then archive the org.

- [ ] **Step 2: Run and verify**

Run: `npx vitest run tests/pgtap.integration.test.ts`
Expected: all 11 tests pass.

- [ ] **Step 3: Commit**

```bash
git commit tests/pgtap.integration.test.ts -m "test: verify treasury cluster property_id rename end-to-end"
```

---

## Self-Review

**Spec coverage:** Task 1 covers all 4 table renames in one batch (confirmed independent, no ordering dependency between them). Task 2 covers exactly the 6 functions confirmed (via full live-body reads, not regex alone) to actually reference `resort_id` on one of the 4 tables — and explicitly documents the 4 false-positive functions and why they're excluded, mirroring the false-positive handling done in Phase 2b-3's plan. Task 3 covers the two real TS call sites (a first for this rename effort — prior clusters 2b-2/2b-3 had zero or app-code-already-covered TS impact) plus the generated-types file. Task 4 proves the two riskiest edit shapes (INSERT column list, row-typed-variable field access) end-to-end via one coherent multi-step live flow.

**Placeholder scan:** Task 2's substitutions are given as literal before/after snippets rather than full function bodies (unlike Phase 2a/2b-1/2b-2's smaller migrations) because each function's body is 20-100+ lines and retyping all 6 in full here would itself risk the exact transcription error this whole effort avoids by fetching fresh at implementation time — same deliberate, justified deviation as Phase 2b-3's plan, this time scoped even tighter (per-function literal substitution strings, not just a general rule) since the edit shapes vary function-to-function unlike 2b-3's single uniform pattern.

**Risk note:** This cluster's row-typed-variable-field-access edit shape (`v_session.resort_id` → `v_session.property_id`) is new to this rename effort — prior clusters only needed INSERT/SELECT column-list edits. A missed edit of this shape is more dangerous than a missed INSERT edit: passing a stale `.resort_id` reference to a function whose row type no longer has that column raises a hard `record "v_session" has no field "resort_id"` PL/pgSQL compile error the moment the function is next invoked (not merely a silent data bug), so Task 2 Step 3's verification is written to explicitly check for this shape, not just re-run the INSERT-column-list check pattern from Phase 2b-3.
