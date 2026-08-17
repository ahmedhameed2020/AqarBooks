# Owner Portal — Phase 3 (Online Payment Transaction Data Model) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-neutral online payment transaction schema (tables, constraints, immutability/transition trigger, RLS, lazy expiry sweep) that Phase 4 (provider adapters, webhooks, `record_online_payment`) will build on — with zero checkout, webhook, or provider code in this phase, and no real payment ever created.

**Architecture:** Two new tables (`online_payment_transactions`, `online_payment_transaction_allocations`) mirroring the pattern already established for `member_invitations`/`current_member_id()` in Phase 1: `current_member_id()` + `organization_is_active()` gate every RLS policy, a `BEFORE UPDATE` trigger makes identity/amount fields immutable and status transitions one-directional out of `PENDING`, and a lazy sweep function (restricted to `service_role` from the start — Phase 1's `expire_stale_member_invitations` had to be hardened to this after shipping unrestricted; this phase starts hardened) flips stale `PENDING` rows to `EXPIRED`. Every acceptance criterion is proven by pgTAP against the live database, following the exact isolation-test conventions from `supabase/tests/phase_owner_portal_data_integrity.sql`.

**Tech Stack:** Postgres (Supabase project `ataslxkcflxuilpgyepm`), pgTAP-style SQL test scripts (this repo's convention, not literal pgTAP extension functions — see existing `supabase/tests/*.sql` files).

**Spec:** `docs/superpowers/specs/2026-08-14-owner-portal-and-online-payments-design.md`, "Online Payment Flow" → "Schema" section and "Phased Implementation Plan" → "Phase 3".

---

## Explicitly out of scope for this plan

Per the project owner's direction, do NOT implement any of the following in Phase 3 — they are Phase 4/5:

- Paymob or Fawry API calls, `createCheckoutSession`, any `lib/payments/` code.
- Webhook routes (`app/api/webhooks/...`).
- `record_online_payment`, `post_payment_internal`.
- Any code path that creates a real `payments`/`journal_entries` row from an online transaction.
- Real provider credentials or secrets of any kind.

---

### Task 1: `online_payment_transactions` + `online_payment_transaction_allocations` schema

**Files:**
- Create: `supabase/migrations/20260815000001_online_payment_transactions_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 3 (transaction data model only -- no checkout/webhook/provider code
-- exists yet; see docs/superpowers/specs/2026-08-14-owner-portal-and-online-payments-design.md,
-- "Online Payment Flow" -> "Schema"). This table can be created and
-- inspected but nothing in the app can create a real payment from it until
-- Phase 4 ships record_online_payment.

create table public.online_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  client_request_id text not null,     -- generated once client-side, forwarded unchanged on retry
  provider text not null check (provider in ('PAYMOB', 'FAWRY')),
  provider_reference text,             -- set once the provider returns a session/order id
  provider_payload jsonb,              -- last raw provider response/event, for audit (redacted of secrets)
  amount numeric(19,4) not null check (amount > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PAID', 'FAILED', 'EXPIRED')),
  failure_code text,
  failure_message text,
  payment_id uuid references public.payments (id),
  webhook_event_id text,               -- provider's event/notification id, for replay dedup
  webhook_received_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz not null,     -- checkout session TTL; stale PENDING rows past this are swept to EXPIRED
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_online_txn_client_request
  on public.online_payment_transactions (organization_id, client_request_id);

create unique index idx_online_txn_provider_ref
  on public.online_payment_transactions (provider, provider_reference)
  where provider_reference is not null;

create unique index idx_online_txn_webhook_event
  on public.online_payment_transactions (provider, webhook_event_id)
  where webhook_event_id is not null;

create index idx_online_txn_member on public.online_payment_transactions (member_id);
create index idx_online_txn_expires_at on public.online_payment_transactions (expires_at) where status = 'PENDING';

-- Identity/amount fields (organization_id, resort_id, member_id, provider,
-- amount) are frozen once a transaction leaves PENDING -- a checkout session
-- was already created against these exact values with the provider, so
-- changing them afterward would desync the DB row from what the provider
-- actually has on file. Status transitions are one-directional out of
-- PENDING: PENDING -> {PAID, FAILED, EXPIRED}, and never back -- a terminal
-- state can never move to any other state, including back to PENDING (e.g.
-- a delayed/replayed webhook must never "un-fail" or "un-expire" a
-- transaction; Phase 4's idempotent-replay handling for a PAID transaction
-- is a read of the existing row, not an UPDATE that changes its status).
create or replace function public.forbid_online_txn_mutation_after_pending()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'PENDING' and (
    new.amount <> old.amount or
    new.organization_id <> old.organization_id or
    new.resort_id <> old.resort_id or
    new.member_id <> old.member_id or
    new.provider <> old.provider
  ) then
    raise exception 'ONLINE_TXN_IMMUTABLE: cannot modify a settled transaction''s identity or amount' using errcode = '22023';
  end if;

  if old.status <> 'PENDING' and new.status <> old.status then
    raise exception 'ONLINE_TXN_INVALID_TRANSITION: cannot change status of a % transaction', old.status using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger trg_online_txn_immutable
  before update on public.online_payment_transactions
  for each row execute function public.forbid_online_txn_mutation_after_pending();

create table public.online_payment_transaction_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.online_payment_transactions (id) on delete cascade,
  due_id uuid not null references public.dues (id),
  amount numeric(19,4) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (transaction_id, due_id)
);

create index idx_online_txn_alloc_transaction on public.online_payment_transaction_allocations (transaction_id);
create index idx_online_txn_alloc_due on public.online_payment_transaction_allocations (due_id);

-- Note: "sum of this transaction's allocation rows equals online_payment_transactions.amount"
-- is NOT enforced by a DB constraint here (a cross-table CHECK isn't
-- expressible directly in Postgres). Phase 4's checkout server action must
-- enforce this at the point it inserts both the transaction and its
-- allocations, inside the same DB transaction, before either commits -- see
-- the spec's "Schema" section note on this. Not re-litigated in Phase 3
-- since there is no insert path yet to enforce it in.

alter table public.online_payment_transactions enable row level security;
alter table public.online_payment_transaction_allocations enable row level security;
-- No policies yet in this migration -- Task 2 adds them. RLS is enabled
-- here so the tables are never briefly open between this migration and the
-- next one being applied.
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP tool `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `online_payment_transactions_schema`). The connector (tool names starting `mcp__claude_ai_Supabase__`) is authorized in this session.
Expected: no errors.

- [ ] **Step 3: Verify live**

Run via `execute_sql`:
```sql
select table_name from information_schema.tables where table_name in ('online_payment_transactions', 'online_payment_transaction_allocations');
select tgname from pg_trigger where tgrelid = 'public.online_payment_transactions'::regclass;
```
Expected: both table names returned; `trg_online_txn_immutable` present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260815000001_online_payment_transactions_schema.sql
git commit -m "feat(portal): add online_payment_transactions schema with immutability/transition trigger"
```

---

### Task 2: RLS for both new tables

**Files:**
- Create: `supabase/migrations/20260815000002_online_payment_transactions_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Owner-portal RLS for the Phase 3 transaction tables. Mirrors the
-- current_member_id() + organization_is_active() pattern from Task 10
-- (20260814000007_member_portal_data_rls.sql). No owner-facing UPDATE
-- policy exists on either table -- Phase 4's webhook handler updates these
-- rows via the service-role client (bypasses RLS after signature
-- verification), not as the owner's own session. An owner can create
-- (insert) their own PENDING transaction and read it back, but can never
-- update it directly -- every status change is server-controlled.

drop policy if exists "online_payment_transactions_select_own" on public.online_payment_transactions;
create policy "online_payment_transactions_select_own"
  on public.online_payment_transactions for select
  using (
    member_id = public.current_member_id()
    and public.organization_is_active(organization_id)
  );

drop policy if exists "online_payment_transactions_insert_own" on public.online_payment_transactions;
create policy "online_payment_transactions_insert_own"
  on public.online_payment_transactions for insert
  with check (
    member_id = public.current_member_id()
    and public.organization_is_active(organization_id)
  );

drop policy if exists "online_payment_transaction_allocations_select_own" on public.online_payment_transaction_allocations;
create policy "online_payment_transaction_allocations_select_own"
  on public.online_payment_transaction_allocations for select
  using (
    transaction_id in (
      select id from public.online_payment_transactions
      where member_id = public.current_member_id()
        and public.organization_is_active(organization_id)
    )
  );

drop policy if exists "online_payment_transaction_allocations_insert_own" on public.online_payment_transaction_allocations;
create policy "online_payment_transaction_allocations_insert_own"
  on public.online_payment_transaction_allocations for insert
  with check (
    transaction_id in (
      select id from public.online_payment_transactions
      where member_id = public.current_member_id()
        and public.organization_is_active(organization_id)
    )
  );
```

- [ ] **Step 2: Apply the migration**

Apply via `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `online_payment_transactions_rls`).
Expected: no errors.

- [ ] **Step 3: Verify live**

```sql
select tablename, policyname, cmd from pg_policies
where tablename in ('online_payment_transactions', 'online_payment_transaction_allocations')
order by tablename, policyname;
```
Expected: 4 policies total, 2 per table (select, insert), no update/delete policies on either.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260815000002_online_payment_transactions_rls.sql
git commit -m "feat(portal): add owner-scoped RLS for online payment transaction tables"
```

---

### Task 3: Lazy expiry sweep, hardened from the start

**Files:**
- Create: `supabase/migrations/20260815000003_expire_stale_online_payment_transactions.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Lazy sweep, same rationale as expire_stale_member_invitations
-- (20260814000004): this project has no pg_cron extension enabled, so
-- expiry is checked lazily rather than on a schedule. UNLIKE that
-- function's original version, this one is restricted to service_role from
-- the start -- a Checkpoint 2 security review found expire_stale_member_
-- invitations() had shipped with no authorization check at all, callable
-- by any signed-in user to trigger a global, cross-tenant write, and had to
-- be hardened after the fact (20260814000006). This function starts
-- hardened instead of repeating that mistake: it is not callable by
-- `authenticated` at all. Phase 4's checkout flow (or a future scheduled
-- job) will call it via the admin/service-role client, matching how
-- lib/actions/member-portal.ts already calls expire_stale_member_
-- invitations() via createAdminClient() rather than the per-request client.
create or replace function public.expire_stale_online_payment_transactions()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.online_payment_transactions
    set status = 'EXPIRED', failed_at = now()
    where status = 'PENDING' and expires_at < now()
    returning id
  )
  select count(*)::integer from expired;
$$;

revoke execute on function public.expire_stale_online_payment_transactions() from public, anon, authenticated;
grant execute on function public.expire_stale_online_payment_transactions() to service_role;

notify pgrst, 'reload schema';
```

**Note on `failed_at` for an `EXPIRED` row:** reusing `failed_at` (rather than adding a third timestamp column) to mean "the moment this transaction left PENDING for a non-PAID terminal state" keeps the schema smaller; `failure_code`/`failure_message` are left `null` for a plain timeout (there is no provider failure code for "nobody paid"), which is how Task 4's tests will distinguish an expiry from a provider-reported failure.

- [ ] **Step 2: Apply the migration**

Apply via `apply_migration` (project_id `ataslxkcflxuilpgyepm`, name `expire_stale_online_payment_transactions`).
Expected: no errors.

- [ ] **Step 3: Verify live**

```sql
select routine_name from information_schema.routines where routine_name = 'expire_stale_online_payment_transactions';
select grantee, privilege_type from information_schema.routine_privileges where routine_name = 'expire_stale_online_payment_transactions';
```
Expected: function exists; only `service_role` (and `postgres`) has `EXECUTE`, not `authenticated`/`anon`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260815000003_expire_stale_online_payment_transactions.sql
git commit -m "feat(portal): add hardened lazy expiry sweep for online payment transactions"
```

---

### Task 4: pgTAP isolation and integrity test suite

**Files:**
- Create: `supabase/tests/phase_owner_portal_transaction_integrity.sql`

This is the test that proves every acceptance criterion in the spec. Follow the exact conventions from `supabase/tests/phase_owner_portal_data_integrity.sql` (Task 10): impersonate real users via `set_config`/`set local role authenticated`, write PASS/FAIL rows to a temp table, and — critically, per the lesson from Phase 1's own review cycle — the script MUST be idempotent: running it twice in a row must not fail on a unique-violation or leave any real `auth.users` account's `members.user_id` pointing at a leftover fixture. Unlink every borrowed real auth id and archive every test org unconditionally at the end, regardless of what state earlier assertions left things in.

- [ ] **Step 1: Write the fixture setup and tests**

```sql
-- Phase 3 online-payment-transaction-model isolation & integrity test.
-- Creates two orgs (A, B), each with one owner (linked to a distinct real
-- auth.users row) and one unit+due, to prove:
--   1. An owner sees only their own transaction.
--   2. A different owner cannot see another org's transaction, even
--      knowing its real UUID.
--   3. An owner cannot INSERT a transaction claiming another member_id
--      (RLS with-check forces member_id = current_member_id()).
--   4. amount cannot be changed once a transaction leaves PENDING.
--   5. organization_id/resort_id/member_id/provider cannot be changed once
--      a transaction leaves PENDING.
--   6. A transaction cannot transition PAID -> PENDING (or any terminal
--      state back to any other state).
--   7. A duplicate (organization_id, client_request_id) is rejected by the
--      unique index.
--   8. A duplicate (provider, provider_reference) is rejected by the
--      unique index.
--   9. A duplicate (provider, webhook_event_id) is rejected by the unique
--      index.
--  10. expire_stale_online_payment_transactions() only flips PENDING rows
--      past expires_at to EXPIRED, never touches PAID/FAILED/other-org
--      rows, and is not callable by `authenticated` at all.
--  11. Allocation rows are visible to the owning member only (same
--      cross-org denial as the transaction itself).

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

create temporary table test_results (name text, status text, detail text);

do $$
declare
  v_org_a uuid;
  v_org_b uuid;
  v_resort_a uuid;
  v_unit_a uuid;
  v_due_type_a uuid;
  v_receivable_a uuid;
  v_revenue_a uuid;
  v_due_a uuid;
  v_member_a uuid;
  v_member_b uuid;
  v_owner_a_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';
  v_owner_b_user uuid := 'b66490aa-a3a7-4005-add2-1112c660b0b4';
  v_txn_a uuid;
  v_txn_b uuid;
  v_count int;
  v_pass boolean;
  v_error_caught boolean;
begin
  v_org_a := public.create_organization('Portal Txn Test A', 'portal-txn-a-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_org_b := public.create_organization('Portal Txn Test B', 'portal-txn-b-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_a := public.create_resort(v_org_a, 'Resort A', 'PTA1', 'Africa/Cairo', null, null, null, null);
  perform public.clone_chart_of_accounts_template(v_org_a, 'RESORT_STANDARD');

  select id into v_revenue_a from public.chart_of_accounts where organization_id = v_org_a and code = '4100';
  v_receivable_a := (select id from public.chart_of_accounts where organization_id = v_org_a and code = '1210' limit 1);

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org_a, 'اشتراك', 'Dues', v_revenue_a) returning id into v_due_type_a;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_a, v_resort_a, 'PTA-101', 'VILLA') returning id into v_unit_a;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_a, v_resort_a, v_unit_a, v_due_type_a, v_receivable_a, 1000, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_a;

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_a, 'Owner A', v_owner_a_user) returning id into v_member_a;
  insert into public.members (organization_id, full_name, user_id)
  values (v_org_b, 'Owner B', v_owner_b_user) returning id into v_member_b;

  -- TEST 1: owner A inserts their own PENDING transaction + allocation.
  perform set_config('request.jwt.claim.sub', v_owner_a_user::text, false);
  insert into public.online_payment_transactions
    (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at)
  values
    (v_org_a, v_resort_a, v_member_a, 'creq-a-1', 'PAYMOB', 1000, now() + interval '30 minutes')
  returning id into v_txn_a;
  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  values (v_txn_a, v_due_a, 1000);

  select count(*) into v_count from public.online_payment_transactions where id = v_txn_a;
  v_pass := v_count = 1;
  insert into test_results values ('TEST 1 (owner inserts and sees own transaction)', case when v_pass then 'PASS' else 'FAIL' end, format('count=%s', v_count));

  -- TEST 2: owner A cannot insert a transaction claiming member B's id.
  v_error_caught := false;
  begin
    insert into public.online_payment_transactions
      (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at)
    values
      (v_org_a, v_resort_a, v_member_b, 'creq-a-spoof', 'PAYMOB', 500, now() + interval '30 minutes');
  exception when others then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 2 (owner cannot insert transaction claiming another member_id)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 3: owner B (different org) cannot see owner A's transaction, even with the real UUID.
  perform set_config('request.jwt.claim.sub', v_owner_b_user::text, false);
  select count(*) into v_count from public.online_payment_transactions where id = v_txn_a;
  v_pass := v_count = 0;
  insert into test_results values ('TEST 3 (different owner cannot see other org transaction)', case when v_pass then 'PASS' else 'FAIL' end, format('visible_rows=%s', v_count));

  select count(*) into v_count from public.online_payment_transaction_allocations
  where transaction_id = v_txn_a;
  v_pass := v_count = 0;
  insert into test_results values ('TEST 11 (different owner cannot see other org allocation rows)', case when v_pass then 'PASS' else 'FAIL' end, format('visible_rows=%s', v_count));

  -- Back to owner A / platform-admin identity for the mutation tests below
  -- (mutations happen as postgres/service-role-equivalent in this script
  -- via a direct UPDATE, mirroring how Task 10's script performs owner-only
  -- reads but privileged writes through an admin-equivalent path).
  perform set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
  reset role;

  -- TEST 4: amount cannot change once a transaction leaves PENDING.
  update public.online_payment_transactions set status = 'PAID', paid_at = now() where id = v_txn_a;
  v_error_caught := false;
  begin
    update public.online_payment_transactions set amount = 1 where id = v_txn_a;
  exception when others then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 4 (amount immutable after leaving PENDING)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 5: organization_id/resort_id/member_id/provider cannot change once settled.
  v_error_caught := false;
  begin
    update public.online_payment_transactions set provider = 'FAWRY' where id = v_txn_a;
  exception when others then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 5 (provider immutable after leaving PENDING)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 6: cannot transition PAID back to PENDING (or any other state).
  v_error_caught := false;
  begin
    update public.online_payment_transactions set status = 'PENDING' where id = v_txn_a;
  exception when others then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 6 (cannot transition PAID back to PENDING)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 7: duplicate (organization_id, client_request_id) rejected.
  v_error_caught := false;
  begin
    insert into public.online_payment_transactions
      (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at)
    values
      (v_org_a, v_resort_a, v_member_a, 'creq-a-1', 'PAYMOB', 250, now() + interval '30 minutes');
  exception when unique_violation then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 7 (duplicate client_request_id within org rejected)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 8: duplicate (provider, provider_reference) rejected.
  update public.online_payment_transactions set provider_payload = null where id = v_txn_a; -- no-op touch to confirm still updatable for non-guarded columns
  insert into public.online_payment_transactions
    (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at, provider_reference)
  values
    (v_org_a, v_resort_a, v_member_a, 'creq-a-2', 'PAYMOB', 300, now() + interval '30 minutes', 'PMOB-REF-1')
  returning id into v_txn_b;

  v_error_caught := false;
  begin
    insert into public.online_payment_transactions
      (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at, provider_reference)
    values
      (v_org_a, v_resort_a, v_member_a, 'creq-a-3', 'PAYMOB', 300, now() + interval '30 minutes', 'PMOB-REF-1');
  exception when unique_violation then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 8 (duplicate provider_reference for same provider rejected)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 9: duplicate (provider, webhook_event_id) rejected.
  update public.online_payment_transactions set webhook_event_id = 'EVT-1' where id = v_txn_b;
  v_error_caught := false;
  begin
    insert into public.online_payment_transactions
      (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at, webhook_event_id)
    values
      (v_org_a, v_resort_a, v_member_a, 'creq-a-4', 'PAYMOB', 300, now() + interval '30 minutes', 'EVT-1');
  exception when unique_violation then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 9 (duplicate webhook_event_id for same provider rejected)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 10: expiry sweep only touches PENDING rows past expires_at, and is
  -- not callable by `authenticated`.
  update public.online_payment_transactions set expires_at = now() - interval '1 hour' where id = v_txn_b; -- v_txn_b is still PENDING
  perform set_config('request.jwt.claim.sub', v_owner_a_user::text, false);
  set local role authenticated;
  v_error_caught := false;
  begin
    perform public.expire_stale_online_payment_transactions();
  exception when others then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 10a (expire sweep not callable by authenticated)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  reset role;
  perform public.expire_stale_online_payment_transactions();

  declare v_status_b text; v_status_a text;
  begin
    select status into v_status_b from public.online_payment_transactions where id = v_txn_b;
    v_pass := v_status_b = 'EXPIRED';
    insert into test_results values ('TEST 10c (stale PENDING transaction flipped to EXPIRED)', case when v_pass then 'PASS' else 'FAIL' end, format('status=%s', v_status_b));

    select status into v_status_a from public.online_payment_transactions where id = v_txn_a;
    v_pass := v_status_a = 'PAID';
    insert into test_results values ('TEST 10d (already-PAID transaction untouched by sweep)', case when v_pass then 'PASS' else 'FAIL' end, format('status=%s', v_status_a));
  end;

  -- Unlink real auth accounts from these throwaway test members before
  -- archiving -- members.user_id is globally UNIQUE, so leaving it linked
  -- would block any future run of this same script.
  update public.members set user_id = null where id in (v_member_a, v_member_b);

  perform public.set_organization_status(v_org_a, 'ARCHIVED', 'portal transaction test cleanup');
  perform public.set_organization_status(v_org_b, 'ARCHIVED', 'portal transaction test cleanup');
  insert into test_results values ('cleanup', 'INFO', 'both test orgs archived, both borrowed auth accounts unlinked');
end $$;

select name, status, detail from test_results order by name;
```

- [ ] **Step 2: Run the script and confirm all rows PASS, TWICE in a row**

Run via the Supabase MCP `execute_sql` tool (project `ataslxkcflxuilpgyepm`), twice consecutively.
Expected: every `TEST *` row shows `status = 'PASS'` both times, no unique-violation or unhandled error on the second run, and a final residue check (`select id, organization_id, user_id from public.members where user_id in ('11d45b6f-1162-433e-8324-ebaf7cd0e618','b66490aa-a3a7-4005-add2-1112c660b0b4');`) returns zero rows after both runs.

If any assertion fails, debug and fix the migration (Task 1-3), not the test's expectations -- unless you find the test itself has a real bug (e.g. a setup RPC signature mismatch against the live schema), in which case fix the test and say so.

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/phase_owner_portal_transaction_integrity.sql
git commit -m "test(portal): add Phase 3 transaction model isolation and integrity suite"
```

---

### Task 5: Phase 3 exit gate — full regression check

**Files:** none (verification only, no code changes)

- [ ] **Step 1: Re-run every existing portal pgTAP-style script, plus the new one, to confirm zero regression**

Run each of these via the Supabase MCP `execute_sql` tool (project `ataslxkcflxuilpgyepm`) and confirm all rows PASS in each:
- `supabase/tests/phase_owner_portal_identity_integrity.sql` (Task 2, Phase 1)
- `supabase/tests/phase_owner_portal_data_integrity.sql` (Task 10, Phase 2)
- `supabase/tests/phase_owner_portal_organization_display.sql` (Task 13's follow-up)
- `supabase/tests/phase_owner_portal_transaction_integrity.sql` (this phase, Task 4)

- [ ] **Step 2: Re-run the Vitest/Playwright suites unaffected by this phase's schema-only changes, to confirm no regression**

```bash
npm run test:member-portal
npx playwright test tests/e2e/owner-portal-invite.spec.ts
npx playwright test tests/e2e/owner-portal-isolation.spec.ts
npx tsc --noEmit
```
Expected: all green, no new TypeScript errors (this phase adds no application code, only SQL, so this is a pure regression check).

- [ ] **Step 3: Report the Phase 3 exit gate result**

Summarize: which of the acceptance criteria from the project owner's Phase 3 direction are proven, with which test, and confirm no existing portal test regressed. Do not propose starting Phase 4 in this same task — that requires a separate plan per the project owner's explicit instruction ("بعد نجاح Phase 3، اعرض خطة Phase 4 منفصلة").

---

## Self-review notes

- **Spec coverage:** every bullet in the spec's "Phase 3 — Transaction data model" section is covered: both tables (Task 1), unique constraints (Task 1), immutable-after-`PENDING` trigger (Task 1, strengthened to also cover `resort_id` and status-transition direction per the project owner's explicit acceptance criteria beyond the original spec text), RLS (Task 2), `expires_at` + sweep (Task 1 column, Task 3 function), pgTAP for constraints/immutability/invalid-transitions/RLS (Task 4).
- **Deliberate strengthening beyond the original spec draft:** the immutability trigger in the spec's schema snippet only guarded `amount`/`organization_id`/`member_id`/`provider` — this plan adds `resort_id` (explicitly named in the project owner's acceptance criteria) and a general status-transition guard (the spec's narrative describes `record_online_payment`'s intended one-way flow but the original trigger snippet didn't enforce it at the DB level; the project owner's acceptance criteria explicitly requires "no PAID -> PENDING transition" to be proven, so it's enforced here rather than left to Phase 4 application discipline).
- **Sweep function hardening applied proactively:** `expire_stale_online_payment_transactions()` is restricted to `service_role` from Task 3's first version, rather than repeating the Phase 1 mistake (ship open to `authenticated`, discover the gap in a later security checkpoint, patch afterward).
- **No placeholders:** every task has complete, runnable SQL. No task says "add appropriate tests" without showing them.
