# Resort→Property Rename: Phase 2d (Purchasing Cluster) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `resort_id`→`property_id` on the purchasing cluster tables — `purchase_orders`, `purchase_requests`, `supplier_invoices`, `supplier_payments` — and surgically update every function reference that actually touches the renamed column. Third cluster in the agreed order (treasury → **purchasing** → payments/dues, saving the biggest/most interconnected cluster for last).

**Architecture:** One migration renames all 4 columns in a single `ALTER TABLE` batch (auto-cascades FKs to `properties(id)`; confirmed live that no index exists on any of the 4 tables' `resort_id`, no triggers reference it, and no RLS policy references it by name — all 4 tables' policies gate purely on `has_permission(auth.uid(), organization_id, 'finance.suppliers.read')`). A second migration surgically updates 9 functions using the same two edit shapes established in Phase 2c (treasury):

1. **Direct INSERT column-list edits**: `create_purchase_order` (→ `purchase_orders`), `create_purchase_request` (→ `purchase_requests`), `post_supplier_invoice` (→ `supplier_invoices`), `record_supplier_payment` (→ `supplier_payments`).
2. **Row-typed-variable field-access edits**: `approve_purchase_order` and `set_purchase_order_status` (`v_order public.purchase_orders`, reading `v_order.resort_id` once each as a value passed into `platform_audit_logs`); `decide_purchase_request` (`v_request public.purchase_requests`, same pattern, once); `cancel_supplier_invoice` and `void_supplier_payment` (`v_invoice public.supplier_invoices` / `v_payment public.supplier_payments`, reading `.resort_id` **three times each** — once as an argument to `has_financial_permission(...)`, once as an argument to `create_journal_entry_internal(...)`, once as a value into `platform_audit_logs` — all three occurrences in each function are the same substitution and must all change together).

Unlike Phase 2c (treasury), **all 9 of the 9 candidate functions found by an initial text search turn out to need real changes** — there are no false positives in this cluster. This was confirmed by reading every candidate function's full live body in full, not by regex alone: e.g. `post_supplier_invoice` declares `v_po public.purchase_orders` but never reads `.resort_id` off it (only `.id`, `.organization_id`, `.supplier_id`, `.status`, `.amount`), so that variable needs no edit — but the function still needs one edit for its own `supplier_invoices` INSERT column list. Similarly `record_supplier_payment` declares `v_invoice public.supplier_invoices` and `void_supplier_payment` declares `v_invoice public.supplier_invoices` too, and neither ever reads `.resort_id` off that particular variable — but `record_supplier_payment` still needs its own `supplier_payments` INSERT edit, and `void_supplier_payment` still needs its `v_payment.resort_id` (×3) edit on the OTHER row-typed variable it declares.

**Confirmed safe (verified live 2026-08-16):**
- No RLS policy on any of the 4 tables references `resort_id` by name.
- The only FK constraints referencing `resort_id` on these tables (`purchase_orders_resort_id_fkey`, `purchase_requests_resort_id_fkey`, `supplier_invoices_resort_id_fkey`, `supplier_payments_resort_id_fkey`) all point at `properties(id)` and auto-update on column rename.
- No index exists on `resort_id` for any of the 4 tables.
- The two triggers on `supplier_invoices`/`supplier_payments` (`trg_prevent_uncancel_supplier_invoice`, `trg_prevent_unreverse_supplier_payment`) only check `status`/`reversed_at` transitions — zero `resort_id` reference, confirmed via their live trigger function bodies.
- Zero TypeScript/TSX app-code impact: `lib/actions/purchasing.ts` and the one page that queries these tables (`app/[locale]/(app)/finance/suppliers/page.tsx`) only ever pass `resort_id` as an RPC parameter (`p_resort_id: ...`), never as a direct table `.insert()`/`.select()` column reference — confirmed via full-file greps of `app/` and `lib/`. `lib/supabase/types.ts` still needs updating (generated-type accuracy, not app logic).

**Tech Stack:** Postgres/Supabase migration (applied live via Supabase MCP `apply_migration`), one `.ts` types file edit, Vitest integration test.

---

### Task 1: Migration — rename `resort_id` to `property_id` on the 4 purchasing tables

**Files:**
- Create: `supabase/migrations/20260822000001_rename_resort_id_purchasing_cluster.sql`

- [ ] **Step 1: Write and apply**

```sql
-- Phase 2d of the resort -> property domain rename. Purchasing cluster:
-- purchase_orders, purchase_requests, supplier_invoices, supplier_payments.
-- Third cluster in the agreed order (treasury -> purchasing -> payments/
-- dues), chosen for being roughly the same size as treasury and relatively
-- self-contained, ahead of the largest/most interconnected cluster last.

alter table public.purchase_orders rename column resort_id to property_id;
alter table public.purchase_requests rename column resort_id to property_id;
alter table public.supplier_invoices rename column resort_id to property_id;
alter table public.supplier_payments rename column resort_id to property_id;
```

Apply via Supabase MCP `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `rename_resort_id_purchasing_cluster`).

- [ ] **Step 2: Verify**

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('purchase_orders', 'purchase_requests', 'supplier_invoices', 'supplier_payments')
  and column_name in ('resort_id', 'property_id')
order by table_name;
```

Expected: 4 rows, each `property_id`, no `resort_id` rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260822000001_rename_resort_id_purchasing_cluster.sql
git commit -m "feat: rename resort_id to property_id on purchasing cluster (purchase_orders/purchase_requests/supplier_invoices/supplier_payments)"
```

---

### Task 2: Surgically update the 9 affected functions

**Files:**
- Create: `supabase/migrations/20260822000002_update_functions_for_purchasing_cluster.sql`

**Method (mandatory, do not deviate):** For EACH of the 9 functions below, fetch its CURRENT live definition fresh via `pg_get_functiondef` (Task 1 has already renamed the columns), apply ONLY the documented substitution(s), and reassemble as `CREATE OR REPLACE FUNCTION` with the full live header/body verbatim otherwise.

**Function 1: `approve_purchase_order`** — one substitution: `v_order.resort_id` (value into `platform_audit_logs`) → `v_order.property_id`.

**Function 2: `cancel_supplier_invoice`** — the SAME substitution `v_invoice.resort_id` → `v_invoice.property_id` appears in **three places** in this one function body, all must change:
1. `if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_invoice.resort_id) then` → `v_invoice.property_id`
2. `v_entry_id := public.create_journal_entry_internal(\n    p_organization_id, v_invoice.resort_id, p_fiscal_period_id, current_date,` → `v_invoice.property_id`
3. `values (auth.uid(), p_organization_id, v_invoice.resort_id, 'supplier_invoice.cancelled', ...)` → `v_invoice.property_id`

**Function 3: `create_purchase_order`** — one substitution: the `purchase_orders` INSERT column list.
Before: `insert into public.purchase_orders (\r\n    organization_id, resort_id, supplier_id, purchase_request_id, description, amount, order_date, created_by\r\n  )`
After: `organization_id, property_id, supplier_id, purchase_request_id, ...`

**Function 4: `create_purchase_request`** — one substitution: the `purchase_requests` INSERT column list.
Before: `insert into public.purchase_requests (organization_id, resort_id, description, estimated_amount, requested_by)`
After: `insert into public.purchase_requests (organization_id, property_id, description, estimated_amount, requested_by)`

**Function 5: `decide_purchase_request`** — one substitution: `v_request.resort_id` → `v_request.property_id` (value into `platform_audit_logs`).

**Function 6: `post_supplier_invoice`** — one substitution: the `supplier_invoices` INSERT column list (the `v_po public.purchase_orders` variable in this function is NOT edited — it never reads `.resort_id`, only `.id`/`.organization_id`/`.supplier_id`/`.status`/`.amount`).
Before: `insert into public.supplier_invoices (\n    organization_id, resort_id, supplier_id, purchase_order_id, invoice_number,`
After: `organization_id, property_id, supplier_id, purchase_order_id, invoice_number,`

**Function 7: `record_supplier_payment`** — one substitution: the `supplier_payments` INSERT column list (the `v_invoice public.supplier_invoices` variable in this function is NOT edited — it never reads `.resort_id`).
Before: `insert into public.supplier_payments (\n      organization_id, resort_id, supplier_id, amount, method, payment_date,`
After: `organization_id, property_id, supplier_id, amount, method, payment_date,`

**Function 8: `set_purchase_order_status`** — one substitution: `v_order.resort_id` → `v_order.property_id` (value into `platform_audit_logs`).

**Function 9: `void_supplier_payment`** — the SAME substitution `v_payment.resort_id` → `v_payment.property_id` appears in **three places** (the `v_invoice public.supplier_invoices` variable also declared in this function is NOT edited — it never reads `.resort_id`, only `.status`/`.amount`):
1. `if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_payment.resort_id) then` → `v_payment.property_id`
2. `v_entry_id := public.create_journal_entry_internal(\n    p_organization_id, v_payment.resort_id, p_fiscal_period_id, current_date,` → `v_payment.property_id`
3. `values (auth.uid(), p_organization_id, v_payment.resort_id, 'supplier_payment.reversed', ...)` → `v_payment.property_id`

- [ ] **Step 1: Prepare all 9 statements**

Fetch fresh and transform all 9 functions per the method above. Concatenate into one migration file.

- [ ] **Step 2: Apply**

Apply the full set of 9 `CREATE OR REPLACE FUNCTION` statements via Supabase MCP `apply_migration` (name `update_functions_for_purchasing_cluster`) as one combined call.

- [ ] **Step 3: Verify — do not skip or rush**

For each function, re-fetch its live body and confirm:
- `create_purchase_order`, `create_purchase_request`, `post_supplier_invoice`, `record_supplier_payment`: their respective table's INSERT column list now says `property_id`, not `resort_id`.
- `approve_purchase_order`, `decide_purchase_request`, `set_purchase_order_status`: exactly one `.property_id` field access on their row-typed variable, zero remaining `.resort_id` field access on it.
- `cancel_supplier_invoice`, `void_supplier_payment`: exactly **three** `.property_id` field accesses on `v_invoice`/`v_payment` respectively, zero remaining `.resort_id` field accesses on that variable. Use a query like:
  ```sql
  select proname,
    (length(prosrc) - length(replace(prosrc, 'v_invoice.property_id', ''))) / length('v_invoice.property_id') as property_id_count,
    (length(prosrc) - length(replace(prosrc, 'v_invoice.resort_id', ''))) / length('v_invoice.resort_id') as remaining_resort_id_count
  from pg_proc where proname = 'cancel_supplier_invoice' and pronamespace = 'public'::regnamespace;
  ```
  Expected: `property_id_count = 3`, `remaining_resort_id_count = 0`. Same pattern for `void_supplier_payment` with `v_payment.property_id`/`v_payment.resort_id`.
- Confirm no unrelated field on any row-typed variable was accidentally touched (e.g. `v_invoice.organization_id`, `v_invoice.status`, `v_payment.amount` etc. must be byte-identical to their pre-migration values).

- [ ] **Step 4: Write the migration file and commit**

```bash
git add supabase/migrations/20260822000002_update_functions_for_purchasing_cluster.sql
git commit -m "feat: update 9 functions for purchasing cluster property_id rename"
```

---

### Task 3: Update `lib/supabase/types.ts`

**Files:**
- Modify: `lib/supabase/types.ts` — `purchase_orders`, `purchase_requests`, `supplier_invoices`, `supplier_payments` table type sections.

- [ ] **Step 1: Update the 4 table type sections**

Read the file first to find the exact current shape for each of the 4 tables (this plan doesn't have live sight of that file's current content for these tables). Rename `resort_id` to `property_id` in each table's `Row`/`Insert` shapes, matching the mechanical edit pattern from Phase 2b-3/2c's `types.ts` fixes.

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
```

Expected: no errors.

```bash
git add lib/supabase/types.ts
git commit -m "feat: update TS types for purchasing cluster property_id rename"
```

---

### Task 4: Integration test

**Files:**
- Modify: `tests/pgtap.integration.test.ts` (12th `it()` block, following test 11 from Phase 2c)

- [ ] **Step 1: Write a test proving the rename end-to-end**

As test 12, in the same style as tests 9-11: exercise at least one INSERT-column-list edit and one row-typed-variable edit (ideally the 3-occurrence kind, since it's the highest-risk shape in this cluster) in one coherent flow:

1. Create an org, a resort, a supplier (`suppliers` table — check its required columns), and a chart-of-accounts payable/expense GL account as needed by `post_supplier_invoice`'s parameters.
2. Call `create_purchase_request` (requires `purchasing.requests.create` financial permission — check `has_financial_permission`'s signature and use a real signed-in session holding it, matching the TENANT_OWNER pattern from tests 9-11). Read back the created `purchase_requests` row via `admin.from("purchase_requests").select("id, property_id").eq("id", requestId).single()` and assert `property_id` equals the resort id. This proves the INSERT-column-list edit.
3. Call `decide_purchase_request` to approve it (requires `purchasing.orders.approve`, matching TENANT_OWNER). Read back the resulting `platform_audit_logs` row for `action = 'purchase_request.approved'` and assert its `property_id` equals the resort id — this proves the `v_request.property_id` row-typed-variable edit.
4. (Optional, if time/scope allows without overcomplicating the test) Call `create_purchase_order` off that approved request and assert `purchase_orders.property_id`, then `approve_purchase_order` and assert the resulting `platform_audit_logs.property_id` — this would additionally cover the remaining INSERT-list and single-occurrence row-typed-variable shapes. Not required if step 2-3 already give confidence; use judgment on the coherent minimal flow versus full 9-function coverage, matching the precedent set in Phase 2c's test (which covered 3 of 6 edited functions, not all 6).

Clean up per the established FK-safe pattern (delete `platform_audit_logs`/`purchase_orders`/`purchase_requests`/`resorts`/`suppliers`/any GL accounts created/`user_role_assignments`/`organization_memberships` rows referencing the test user before `deleteUser`, asserting each delete's error is `null`), then archive the org.

- [ ] **Step 2: Run and verify**

Run: `npx vitest run tests/pgtap.integration.test.ts`
Expected: all 12 tests pass.

- [ ] **Step 3: Commit**

```bash
git commit tests/pgtap.integration.test.ts -m "test: verify purchasing cluster property_id rename end-to-end"
```

---

## Self-Review

**Spec coverage:** Task 1 covers all 4 table renames. Task 2 covers all 9 candidate functions — unlike Phase 2c, no false positives here, but the plan explicitly documents which row-typed variables in each function DO vs DON'T need edits (e.g. `post_supplier_invoice`'s `v_po` doesn't, `record_supplier_payment`'s `v_invoice` doesn't, `void_supplier_payment`'s `v_invoice` doesn't) so the implementer doesn't over-edit. Task 3 covers the generated-types accuracy (no app-code call sites exist in this cluster, confirmed via full grep). Task 4 proves both edit shapes end-to-end, including the higher-multiplicity 3-occurrence-per-function shape unique to this cluster.

**Placeholder scan:** Task 2's substitutions are given as literal before/after snippets per function (not full bodies), same deliberate, justified deviation as Phase 2c's plan — scoped even more precisely here since two functions need the same substitution applied three times each, which the plan calls out explicitly with a verification query template rather than leaving "apply the substitution" ambiguous about occurrence count.

**Risk note:** This cluster introduces a new risk shape beyond Phase 2c: a *repeated* substitution within one function body (3 occurrences in `cancel_supplier_invoice` and `void_supplier_payment`). The obvious failure mode is fixing only the first occurrence found and missing the other two — Task 2 Step 3's verification query is written specifically to count occurrences, not just check presence/absence, to catch a partial fix.
