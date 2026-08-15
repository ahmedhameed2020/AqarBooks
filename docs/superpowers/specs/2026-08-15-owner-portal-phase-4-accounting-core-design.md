# Owner Portal — Phase 4 (Accounting Core) Design — FOR REVIEW, NO CODE YET

**Date:** 2026-08-15
**Status:** Design approved with 4 decisions from project-owner review (below). Task-broken-down implementation plan: `docs/superpowers/plans/2026-08-15-owner-portal-phase-4-accounting-core.md`. **Implementation complete, Task 7 checkpoint passed (2026-08-16) — see "Status: Phase 4 complete" below.**
**Depends on:** Phase 3 (`online_payment_transactions`/`online_payment_transaction_allocations`, complete and verified — see the main spec's Phase 3 status note).

## Status: Phase 4 complete (2026-08-16)

Tasks 1–7 of `docs/superpowers/plans/2026-08-15-owner-portal-phase-4-accounting-core.md` are implemented, committed on `fix/units-excel-export`, and independently re-verified live against the Supabase project (`ataslxkcflxuilpgyepm`) — not just inferred from migration text, per this project's established "re-verify, don't trust the SQL" discipline.

### Migrations applied

- `20260815000004_organization_finance_settings.sql` — the clearing-account config table + config-time validation trigger (Decision 1).
- `20260815000004b_organization_finance_settings_resort_org_check.sql` — code-review follow-up closing the gap where a row's own `resort_id` could belong to a *different* organization than its `organization_id`, even with an otherwise-valid account (covered live by scenario 7 of `phase_owner_portal_finance_settings.sql` below).
- `20260815000005_payments_online_method.sql` — adds `'ONLINE'` to `payments.method`'s CHECK constraint (Decision 3), plus every consumer audited per Task 1 (`METHOD_LABELS`, receipts, reports/filters, generated TS types).
- `20260815000006_post_payment_internal.sql` — extracts `record_payment`'s existing body into the shared `post_payment_internal` core, locked down with no grant to any role.
- `20260815000006b_post_payment_internal_search_path_fix.sql` — code-review follow-up hardening `search_path` and switching the internal call site to named parameters.
- `20260815000007_record_online_payment.sql` — the webhook-facing entry point: locking, idempotent replay, all-or-nothing settlement, `service_role`-only grant.
- `20260815000007b_record_online_payment_lock_ordering_fix.sql` — code-review follow-up: acquires the advisory lock *before* the due-row locks to eliminate a deadlock window against a concurrent `record_payment` call touching the same dues.

### Test results

- `npm run test:financial` — **10/10 passed** (waterfall allocation, idempotency replay, `issue_dues`/`generate_recurring_dues` idempotency, audit hash-chain, RBAC resort/org/permission scoping) — proves the `post_payment_internal` extraction changed nothing observable about `record_payment`.
- `npm run test:sql` (`tests/pgtap.integration.test.ts`) — **5/5 passed**.
- `npm run test:suppliers` — **8/8 passed**.
- `npm run test:payment-idempotency` — **4/4 passed**.
- `npm run test:member-portal` — **5/5 passed**.
- New pgTAP-style suite, `supabase/tests/phase_owner_portal_record_online_payment.sql` (8 labeled scenario blocks — happy path, idempotent replay (2 sequential calls), settlement race all-or-nothing, no-open-fiscal-period, missing-clearing-account, ownership check, cross-org/out-of-scope due, privilege check — 9 scenarios counting both replay calls separately, matching this suite's documented scope) — **all assertions passed**, run live via `mcp__claude_ai_Supabase__execute_sql` with no exception raised (an `assert` failure would have raised and aborted the block; it did not).
- New Vitest concurrency test, `tests/record-online-payment-concurrency.integration.test.ts` (not wired into any `npm run test:*` script — run directly via `npx vitest run tests/record-online-payment-concurrency.integration.test.ts`): two genuinely concurrent `SupabaseClient` calls via `Promise.all` against `record_online_payment` for the same `PENDING` transaction — **1/1 passed**; one call posts, the other blocks on the `FOR UPDATE` lock and returns the identical `payment_id`, never two payments.
- Full regression pass of every existing `supabase/tests/phase_owner_portal_*.sql` script (proving no Phase 4 change silently broke Phase 1–3's guarantees), run live via `mcp__claude_ai_Supabase__execute_sql`:
  - `phase_owner_portal_identity_integrity.sql` — 5/5 PASS.
  - `phase_owner_portal_data_integrity.sql` — 6/6 PASS.
  - `phase_owner_portal_organization_display.sql` — 3/3 PASS.
  - `phase_owner_portal_transaction_integrity.sql` — 13/13 PASS (test rows 1–11 plus 10a/10b/10c; one additional `cleanup` info row, not a pass/fail assertion).
  - `phase_owner_portal_finance_settings.sql` — all 8 assertions PASS (no exception raised).
  - `phase_owner_portal_record_online_payment.sql` — all 9 scenario assertions PASS (no exception raised).

### Live grant verification (Step 1)

```sql
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_name in ('post_payment_internal', 'record_online_payment');
```

Result:

```
[{"routine_name":"post_payment_internal","grantee":"postgres","privilege_type":"EXECUTE"},
 {"routine_name":"post_payment_internal","grantee":"service_role","privilege_type":"EXECUTE"},
 {"routine_name":"record_online_payment","grantee":"postgres","privilege_type":"EXECUTE"},
 {"routine_name":"record_online_payment","grantee":"service_role","privilege_type":"EXECUTE"}]
```

Zero rows for `authenticated`/`anon`/`public` on either function — `postgres` and `service_role` are the owning/schema role and the intended caller respectively, exactly as designed. (`service_role` appears explicitly granted on `post_payment_internal` too, in addition to the "no grant needed, owner-implicit-EXECUTE" mechanism described in §7 — this is a defensive superset, not a contradiction: it does not open the function to `authenticated`/`anon`, which is the actual security boundary under test.)

### Live PostgREST HTTP verification (Step 2)

Using a real `authenticated` session's JWT (a throwaway user provisioned via `admin.auth.admin.createUser` + `signInWithPassword`, then deleted after the probe) and separately with only the `anon` publishable key and no `Authorization` header at all:

```
POST /rest/v1/rpc/record_online_payment  (authenticated JWT)  -> HTTP 403
  {"code":"42501","details":null,"hint":null,"message":"permission denied for function record_online_payment"}

POST /rest/v1/rpc/post_payment_internal  (authenticated JWT, real signature)  -> HTTP 403
  {"code":"42501","details":null,"hint":null,"message":"permission denied for function post_payment_internal"}

POST /rest/v1/rpc/record_online_payment  (anon key, no Authorization header)  -> HTTP 401
  {"code":"42501","details":null,"hint":null,"message":"permission denied for function record_online_payment"}

POST /rest/v1/rpc/post_payment_internal  (anon key, no Authorization header, real signature)  -> HTTP 401
  {"code":"42501","details":null,"hint":null,"message":"permission denied for function post_payment_internal"}
```

All four probes return `42501 permission denied` (403 for the authenticated session, 401 for the fully anonymous request) — never 200, never an unrelated 500. `anon` is independently confirmed locked out, not just `authenticated`, closing the exact gap Task 3 found in an earlier phase (Supabase's default privileges otherwise grant `anon` EXECUTE independently of what's revoked from `authenticated`/`public`). No grant/migration changes were needed — both checks passed on the first live attempt.

### Full regression checkpoint (2026-08-16)

- `npx tsc --noEmit` — **one pre-existing, unrelated error**: `app/[locale]/(app)/members/page.tsx(329,75)`, `MemberDrawer` is passed an `organizationId` prop its type doesn't declare. Confirmed pre-existing and outside Phase 4's scope: `git log` shows Phase 4's commits (`93a940b`..`1de4983`) never touched `members/page.tsx` at all, and the one Phase 4 commit that touched `member-drawer.tsx` only added an `ONLINE` entry to its `METHOD_LABELS` map (`git diff 93a940b^..1de4983 -- "app/[locale]/(app)/members/member-drawer.tsx"` shows exactly one added line, unrelated to props). The mismatched prop belongs to in-progress, uncommitted member-CRM work already present in the working tree before this task started (`member-statement-dialog.tsx`, `member-activity.tsx`, etc. are untracked). **Not fixed as part of Phase 4** — tracked here so it isn't mistaken for a Phase 4 regression in a future run.
- `npm run build` — fails with the identical single error above (same root cause, same evidence of being pre-existing/unrelated), otherwise compiles successfully ("Compiled successfully in 6.7s" before the type-check step).
- `npm run test:e2e` (`npx playwright test`, run on port 3100 per this project's documented workaround for an unrelated local service occupying port 3000, since port 3000 was occupied by an unrelated local process) — **89 passed, 1 failed** (10.7m): `tests/e2e/finance-isolation-and-locale.spec.ts:460:9`, `REG-011 (en): error messages never leak the other locale's text`. This is the same pre-existing, unrelated Playwright strict-mode selector collision documented in the Phase 1–2 status note above (the `ar` variant of the same spec passed cleanly in this run; the `en` variant's flakiness is consistent with the note's original description of a `getByRole` collision in the staff cashier UI, not a new regression) — no code in Phase 4 touches the cashier due-selection UI this test exercises (Phase 4 shipped zero UI code). Not reproduced anywhere in Phase 3/4's own coverage.

All failures above are pre-existing and unrelated to Phase 4's `post_payment_internal`/`record_online_payment`/`organization_finance_settings`/`ONLINE`-method work, which is itself 100% SQL/migration-only (zero `app/`/`lib/` files touched except the one-line `METHOD_LABELS` addition cited above). Phase 4 is closed; Phase 5 (Paymob/Fawry/webhooks) may now be discussed.

**Explicit baseline separation (per project-owner requirement, 2026-08-16):** Phase 4's own changes are type-safe — `npx tsc --noEmit` on the Phase 4 commit range alone (`93a940b`..`1de4983`) introduces zero new type errors. The repository's current baseline carries exactly one pre-existing `tsc`/`build` failure, sourced entirely from in-progress, uncommitted member-CRM work (`app/[locale]/(app)/members/page.tsx` and its untracked siblings) that predates and is unrelated to Phase 4. This distinction is recorded here explicitly so a future `tsc`/`build` run's single failure is never mistaken for a Phase 4 regression, and so it isn't silently "fixed" by editing unrelated CRM code as a side effect of a future phase.

## Finalized decisions (project-owner review, 2026-08-15)

These resolve the four open questions in §"Open questions" below and supersede that section's recommendations wherever they conflict with it. Real schema facts (not assumptions) grounding these decisions:

- `payments.method` CHECK constraint today: `check (method in ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'))` — `supabase/migrations/20260810000024_receivables_tables.sql:58`, never altered since.
- `chart_of_accounts` (`supabase/migrations/20260810000015_accounting_core_tables.sql:68-85`): `category text check (category in ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'))`, `is_group boolean`, `is_active boolean`, `resort_id uuid` **nullable** (an account can be org-wide or resort-specific).
- `dues.resort_id` and `dues.unit_id` are both `not null` — every due always belongs to exactly one resort and one unit. `unit_ownerships` has no `resort_id` column and no uniqueness constraint tying a member to one resort — a member CAN legitimately co-own units across different resorts in the same org.
- `online_payment_transactions.status` CHECK is `('PENDING', 'PAID', 'FAILED', 'EXPIRED')` (Phase 3, `20260815000001...sql:18`) — its immutability trigger only blocks mutation once `status <> 'PENDING'`, so `failure_code`/`failure_message` can already be written while a row stays `PENDING` with zero schema changes.
- No `organization_finance_settings` (or similarly-named) table exists anywhere in the schema — it must be created new.
- The existing permission key for chart-of-accounts/GL configuration RLS across this codebase is `finance.accounts.manage` (used consistently in `20260810000018_accounting_rls.sql`, `20260810000026_property_receivables_rls.sql`, `20260810000033_treasury_banking_rls.sql`) — reused here rather than inventing a new key.

### Decision 1 — Clearing account: `organization_finance_settings`, resort-scoped, explicit config, no fallback

A new table, one row per `(organization_id, resort_id)`:

```sql
create table public.organization_finance_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  online_payments_clearing_account_id uuid not null references public.chart_of_accounts (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, resort_id)
);
```

- Resort-scoped (not org-wide only) because `online_payment_transactions.resort_id` is always present and `dues.resort_id` is always required — every transaction this settings row needs to serve already carries a concrete resort. An organization that wants one shared clearing account for all its resorts simply points every resort's row at the same `chart_of_accounts.id` (which is legal since `chart_of_accounts.resort_id` can be null/org-wide).
- A `BEFORE INSERT OR UPDATE` trigger validates the referenced account at config time: `category = 'ASSET'`, `is_group = false`, `is_active = true`, `organization_id` matches, and `resort_id is null or resort_id = new.resort_id` (the account is either org-wide or matches this exact resort) — reject with a clear error otherwise, so a bad config is caught at admin-setup time, not silently at the first webhook.
- **`record_online_payment` re-validates the same four conditions again at call time** (not just trusting the config-time check), since an account could be deactivated after configuration. If the account fails re-validation, or no `organization_finance_settings` row exists for the transaction's `resort_id`, the transaction is marked `FAILED` (not a retryable state — a missing/broken account config needs an admin fix, not a lazy retry) with `failure_code = 'CLEARING_ACCOUNT_NOT_CONFIGURED'`, and **no payment or journal entry is created.** No fallback to any other account, ever.
- RLS/RPC write access to `organization_finance_settings` reuses `finance.accounts.manage` — the same permission that already gates chart-of-accounts and banking configuration in this codebase — rather than a new permission key.

### Decision 2 — No open fiscal period: stay `PENDING`, retryable, not `FAILED`

Zero schema/migration changes needed — `online_payment_transactions.status` keeps its existing 4-value CHECK. When `record_online_payment` cannot resolve an open fiscal period covering `payment_date` for the transaction's `resort_id`:

```sql
update public.online_payment_transactions
set failure_code = 'OPEN_PERIOD_REQUIRED',
    failure_message = format('No open fiscal period covers %s for resort %s', v_payment_date, v_txn.resort_id)
where id = p_transaction_id;
-- status stays PENDING -- no failed_at, no status change.
return query select 'PENDING'::text, null::uuid, 'OPEN_PERIOD_REQUIRED'::text, v_failure_message;
```

This is legal under the Phase 3 immutability trigger (it only restricts mutation once `status <> 'PENDING'`). Because the row stays `PENDING`, calling `record_online_payment` again later (whenever a period opens, or via the existing lazy-expiry sweep pattern) naturally retries — no new "retry" infrastructure needed in Phase 4. The row remains subject to the existing `expire_stale_online_payment_transactions()` sweep on `expires_at`, so a transaction that never gets a period opened for it still expires normally rather than lingering forever.

### Decision 3 — `ONLINE` payment method, full-usage audit required before the migration

Add `'ONLINE'` to `payments.method`'s CHECK constraint (additive `alter table ... drop constraint ... add constraint ...`, no existing row affected since none currently has this value). Before writing that migration, Task 1 of the implementation plan greps and updates every consumer of this constraint/value — not just the DB:
- `record_payment` (no behavior change needed — `p_method` is passed through opaquely already)
- `lib/portal/row-types.ts`'s `METHOD_LABELS` (Arabic/English label for `ONLINE`)
- Receipt generation (`lib/actions/member-portal-receipts.ts` and any staff-side receipt code) — must render `ONLINE` sensibly, not fall through to an "unknown method" default
- Any report/filter UI that lists or groups by `payments.method` (finance reports, statements)
- Any TypeScript union/type mirroring this constraint (`lib/supabase/types.ts` generated types, and any hand-written `PaymentMethod` type if one exists separately)

No fallback to `'OTHER'` — confirmed, since that would make online payments invisible to method-based reporting/reconciliation.

### Decision 4 — Multiple units allowed in one online transaction, single-resort only, ownership re-verified

No restriction to one unit per checkout. `record_online_payment`'s per-due validation loop (already iterating allocations for the settlement-race check) gains two more conditions per due, checked alongside the existing balance/void check, all part of the same all-or-nothing loop:

```sql
if v_due.organization_id <> v_txn.organization_id or v_due.resort_id <> v_txn.resort_id then
  -- reject whole transaction: FAILED, failure_code = 'DUE_OUT_OF_SCOPE'
end if;

if not exists (
  select 1 from public.unit_ownerships uo
  where uo.unit_id = v_due.unit_id
    and uo.member_id = v_txn.member_id
    and (uo.end_date is null or uo.end_date >= current_date)
) then
  -- reject whole transaction: FAILED, failure_code = 'DUE_NOT_OWNED_BY_MEMBER'
end if;
```

- **No cross-resort mixing in V1**, per instruction — every due in one transaction must share the transaction's single `resort_id` (which itself is single-valued on `online_payment_transactions`, so this is really "every due's `resort_id` must equal the transaction's `resort_id`").
- The ownership re-check exists because `post_payment_internal` itself does no member-authorization (§2 of this doc) — `record_online_payment` is the last checkpoint before money moves, so it must not blindly trust that Phase 5's future checkout flow validated ownership correctly at insert time. The exact ownership predicate (the `end_date` condition above) must be copied verbatim from Phase 2's existing `dues`/`unit_ownerships` RLS policy predicate (`supabase/migrations/20260814000007_member_portal_data_rls.sql`) at implementation time — not re-derived independently — so the two checks can never silently drift apart.

## Revised `record_online_payment` result contract (supersedes §6's earlier sketch)

| Case | `status` | `payment_id` | `failure_code` | Notes |
|---|---|---|---|---|
| Fresh successful post | `PAID` | new uuid | `null` | |
| Idempotent replay (already `PAID`) | `PAID` | existing uuid | `null` | No new writes at all |
| No open fiscal period | `PENDING` | `null` | `OPEN_PERIOD_REQUIRED` | Retryable — status unchanged, transaction row otherwise untouched |
| Clearing account missing/invalid | `FAILED` | `null` | `CLEARING_ACCOUNT_NOT_CONFIGURED` | Not retryable without an admin fixing the config |
| Due settled elsewhere / voided / balance shrank | `FAILED` | `null` | `DUE_ALREADY_SETTLED` | All-or-nothing — zero payment rows created |
| Due outside the transaction's org/resort | `FAILED` | `null` | `DUE_OUT_OF_SCOPE` | Should be unreachable if Phase 5's checkout is correct — defense in depth |
| Due's unit not owned by the transaction's member | `FAILED` | `null` | `DUE_NOT_OWNED_BY_MEMBER` | Same — defense in depth against a future checkout bug |
| Transaction not found / already terminal non-`PAID` (`FAILED`/`EXPIRED`) receiving a call | *(raises exception)* | — | — | Genuinely exceptional — no state to protect from rollback, see §6 |

`FAILED` here is reserved for conditions that need a human/admin action to ever change (bad config, a due truly gone) — never used for a condition that resolves itself with time or a later retry (that's what keeping `status = 'PENDING'` with a `failure_code` is for, per Decision 2).

## Security grant hardening (supersedes §7's phrasing)

§7's ownership-based explanation for why `record_payment`/`record_online_payment` can call `post_payment_internal` without an explicit grant is correct Postgres mechanics, but the actual migration must still be explicit and defensive, not rely on that mechanic being self-evident to a future reader:

```sql
create or replace function public.post_payment_internal(...)
returns table (...)
language plpgsql
security definer
set search_path = public
as $$ ... $$;

revoke all on function public.post_payment_internal(...) from public;
revoke all on function public.post_payment_internal(...) from authenticated;
-- Intentionally no GRANT to any role -- only reachable via a direct
-- in-transaction call from another SECURITY DEFINER function owned by the
-- same role (record_payment, record_online_payment). See design doc §7 for
-- why this works without a grant. Verify after migration:
--   select grantee, privilege_type from information_schema.routine_privileges
--   where routine_name = 'post_payment_internal';
-- must return zero rows for authenticated/anon/public.

create or replace function public.record_online_payment(...)
returns table (...)
language plpgsql
security definer
set search_path = public
as $$ ... $$;

revoke all on function public.record_online_payment(...) from public;
revoke all on function public.record_online_payment(...) from authenticated;
grant execute on function public.record_online_payment(...) to service_role;
```

Both functions must also be confirmed **not reachable via PostgREST** (`GET/POST /rest/v1/rpc/post_payment_internal` or `.../record_online_payment`) even by a caller who knows the exact name and signature — PostgREST's own privilege check goes through the same `information_schema.routine_privileges` grants, so the `revoke ... from authenticated` (PostgREST's role for any signed-in user) and no grant to `anon` already covers this, but it must be verified live with an actual HTTP call using an authenticated session's JWT, not just inferred from the SQL grants — the same "independently re-verify, don't trust the migration text" discipline used throughout every prior phase of this project. `post_payment_internal` additionally must never be called from application code over HTTP/PostgREST at all (only from inside another function's PL/pgSQL body, in the same transaction) — this is enforced by the grants above, not by any additional mechanism, and the plan's task for this must include a live negative-test call proving both functions 404/403 over the REST API.

## Open questions

*(Superseded by "Finalized decisions" above — kept below only as the original reasoning trail.)*


## Scope of this document

Covers exactly what was asked for review: `post_payment_internal`, `record_online_payment`, lock ordering, all-or-nothing settlement, idempotency/webhook-replay handling, `payments`/`payment_allocations` creation, `dues` status updates, audit trail, and rollback behavior on failure.

**Explicitly NOT in this document or in Phase 4's eventual implementation, until separately approved:** Paymob integration, Fawry integration, webhook routes, checkout UI, any real provider credentials. Those remain Phase 5+.

---

## 1. Exact function signatures

### `post_payment_internal` — shared accounting core, not a public API

```sql
create or replace function public.post_payment_internal(
  p_organization_id uuid,
  p_resort_id uuid,
  p_member_id uuid,
  p_unit_id uuid,           -- nullable, see Open Question D
  p_amount numeric(19,4),
  p_method text,
  p_payment_date date,
  p_deposit_account_id uuid,
  p_fiscal_period_id uuid,
  p_allocations jsonb,       -- [{due_id, amount}, ...]
  p_idempotency_key text,
  p_cashier_session_id uuid default null
)
returns table (
  payment_id uuid,
  allocated_amount numeric(19,4),
  unallocated_amount numeric(19,4),
  affected_due_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$ ... $$;

revoke execute on function public.post_payment_internal from public, anon, authenticated;
-- No explicit GRANT to anyone. See §7 for why this is sufficient.
```

This is **`record_payment`'s existing body, extracted almost verbatim** — everything after its `has_permission` check: the idempotency-key pre-check, the advisory lock, due-row locking and remaining-balance validation, journal-entry creation/posting, the `payments` insert, `payment_allocations` inserts, due-status updates, the `cash_transactions` insert (when `p_cashier_session_id` is not null), and the `platform_audit_logs` write. **No new accounting logic is invented here** — this is a refactor of already-shipped, already-tested code into a shared internal function, not a rewrite.

### `record_online_payment` — webhook-facing, atomic, replay-safe

```sql
create or replace function public.record_online_payment(
  p_transaction_id uuid,
  p_webhook_event_id text,
  p_provider_payload jsonb default null
)
returns table (
  status text,              -- 'PAID' or 'FAILED' -- never raises for the expected settlement-race case, see §6
  payment_id uuid,           -- set iff status = 'PAID'
  failure_code text,         -- set iff status = 'FAILED'
  failure_message text
)
language plpgsql
security definer
set search_path = public
as $$ ... $$;

revoke execute on function public.record_online_payment from public, anon, authenticated;
grant execute on function public.record_online_payment to service_role;
```

Note it takes **no `organization_id`/`member_id`/`resort_id` parameters at all** — see §2.

---

## 2. Source of truth for organization/member/resort

`record_online_payment` derives `organization_id`, `resort_id`, and `member_id` **exclusively from the locked `online_payment_transactions` row itself** (`v_txn.organization_id`, `v_txn.resort_id`, `v_txn.member_id`), never from a caller-supplied parameter. This is why the function signature above has no such parameters — there is no argument shape that lets a caller assert "post this against organization X" independent of what the transaction row already says. The transaction row's own values were themselves validated once, at INSERT time, by Phase 3's RLS `with check` (`member_id = current_member_id()`) — by the time `record_online_payment` runs, that row already represents a legitimately-created, owner-initiated transaction; this function's job is to safely turn a *verified-paid* transaction into a *posted* payment, not to re-derive whose transaction it is.

`post_payment_internal` is **not itself a trust boundary** — it takes `organization_id`/`resort_id`/`member_id`/`unit_id` as plain parameters and trusts them completely. Responsibility for those values being legitimate belongs entirely to whichever caller invokes it:
- `record_payment` (existing, unchanged): validates via `has_permission(auth.uid(), p_organization_id, 'receivables.payments.create')` before calling.
- `record_online_payment` (new): validates via the locked transaction row's own columns, as above.

---

## 3. Verifying the transaction is `PENDING`

`record_online_payment` opens with:

```sql
select * into v_txn from public.online_payment_transactions
where id = p_transaction_id for update;

if v_txn.id is null then
  raise exception 'ONLINE_TXN_NOT_FOUND: transaction % not found', p_transaction_id using errcode = '22023';
end if;

if v_txn.status = 'PAID' then
  return query select 'PAID', v_txn.payment_id, null::text, null::text;  -- idempotent replay, §6
end if;

if v_txn.status <> 'PENDING' then
  raise exception 'ONLINE_TXN_NOT_PENDING: cannot post a % transaction', v_txn.status using errcode = '22023';
end if;
```

The `FOR UPDATE` lock is taken **first, before anything else** — it is what serializes two concurrent calls for the *same* `p_transaction_id` (e.g. a genuine duplicate webhook delivery that somehow reached this function despite the webhook handler's own `webhook_event_id` dedup — defense in depth, not the only guard).

---

## 4. Lock ordering: transaction, then dues, in a fixed order

After confirming `PENDING`, the function locks every target due **in a single, deterministic order** (`order by due_id`) before validating any of them:

```sql
for v_alloc in
  select due_id, amount from public.online_payment_transaction_allocations
  where transaction_id = p_transaction_id
  order by due_id
loop
  select * into v_due from public.dues where id = v_alloc.due_id for update;
  ...
end loop;
```

This mirrors `record_payment`'s existing convention exactly (it already locks dues `for update` while iterating allocations) — the fixed `due_id` ordering is what prevents a deadlock if a concurrent `record_payment` call (a staff member manually recording a cash payment against one of the same dues at the same moment as this webhook) happens to touch two overlapping dues in a different order. Locking the transaction row first, then dues in due-id order, gives every caller (staff or webhook) the same total lock order, which is what actually prevents deadlocks — not just "some order," but the *same* order every caller uses.

---

## 5. All-or-nothing settlement: reject the whole transaction if any due no longer fits

For each locked due, re-validate its remaining balance against the allocation amount, exactly as `record_payment` already does:

```sql
select coalesce(sum(pa.amount), 0) into v_paid_so_far
from public.payment_allocations pa
join public.payments p on p.id = pa.payment_id
where pa.due_id = v_due.id and p.status = 'POSTED';

if v_due.id is null or v_due.status = 'VOID' or v_alloc.amount > (v_due.amount - v_paid_so_far) then
  -- settlement race: see §6 for why this does NOT raise
  ...
end if;
```

If **any single allocation** no longer fits (due was settled elsewhere, voided, or its remaining balance shrank below what this transaction reserved), **no payment is created at all** — not a partial one covering only the still-valid allocations. This is the locked-in "Settlement race policy" from the main spec, reconfirmed here: partial settlement was explicitly rejected as a design because it would silently post less than the owner authorized.

---

## 6. Why the settlement-race failure path does NOT `raise exception` (a correctness trap avoided)

**This is the one place this design deliberately diverges from the "just raise on failure" instinct, and it matters.** Consider the naive version:

```sql
-- WRONG -- do not implement this way:
update public.online_payment_transactions
set status = 'FAILED', failure_code = 'DUE_SETTLED_ELSEWHERE'
where id = p_transaction_id;

raise exception 'DUE_SETTLED_ELSEWHERE: ...';
```

In Postgres, an uncaught exception unwinds **everything since the start of the current transaction (or the nearest enclosing `BEGIN...EXCEPTION...END` block, which PL/pgSQL implements as an implicit savepoint)**. If `record_online_payment` is called as a single top-level statement (which it will be, from the webhook handler), a bare `raise exception` after the `UPDATE` **rolls back that very UPDATE** — the `FAILED` status, `failure_code`, and `failure_message` are never actually persisted, even though the function appears to have "recorded" them. The webhook handler would see an exception, but the database would still show the transaction as `PENDING` (or whatever it was before), silently contradicting the failure that was supposedly logged.

**Design decision:** `record_online_payment` **returns a structured result row instead of raising** for this specific, expected failure mode:

```sql
update public.online_payment_transactions
set status = 'FAILED', failed_at = now(),
    failure_code = 'DUE_SETTLED_ELSEWHERE',
    failure_message = format('Due %s is no longer payable for the amount reserved', v_alloc.due_id)
where id = p_transaction_id;

return query select 'FAILED'::text, null::uuid, 'DUE_SETTLED_ELSEWHERE'::text, v_failure_message;
```

Since no exception is raised, the `UPDATE` commits normally as part of the function's successful (from Postgres's point of view) execution. The webhook handler (Phase 5) branches on the returned `status` column, not on a caught exception.

`raise exception` is reserved for genuinely exceptional cases where **nothing needs to survive the call** because no state was changed and none should be: `p_transaction_id` not found at all, or a transaction that's already `FAILED`/`EXPIRED` (terminal, non-`PAID`) receiving a webhook call it shouldn't be getting. In both of those cases there is no `UPDATE` to protect from rollback, so raising is safe and appropriate — it signals "this call itself was invalid," not "the payment failed."

---

## 7. `PUBLIC`/`authenticated` cannot call either internal function

Both functions get:
```sql
revoke execute on function public.post_payment_internal from public, anon, authenticated;
revoke execute on function public.record_online_payment from public, anon, authenticated;
grant execute on function public.record_online_payment to service_role;
-- post_payment_internal gets NO grant to any role at all.
```

**Why `post_payment_internal` needs no grant, and `record_payment`/`record_online_payment` can still call it:** in Postgres, when a `SECURITY DEFINER` function executes, the *effective role* for privilege checks made from inside its body is the function's **owner** (not the original caller) for the duration of that call. `record_payment`, `record_online_payment`, and `post_payment_internal` are all created by the same migration-applying role (the project's schema owner). A function's **owner** always has implicit `EXECUTE` on functions it owns, independent of `GRANT`/`REVOKE` to other roles — ownership is not mediated by the grant system the same way a regular role's access is. So when `record_payment`'s body (running, for that call, *as* the schema owner because it's `SECURITY DEFINER`) calls `post_payment_internal`, the check is "does the schema owner have EXECUTE on `post_payment_internal`" — yes, because the schema owner owns it — regardless of what's `REVOKE`d from `authenticated`/`anon`/`public`. This is the exact same mechanism that already lets `record_payment` reach `create_journal_entry_internal`/`post_journal_entry_internal` today (both already `internal`-style helpers with no direct grant to `authenticated`, per the existing codebase) — Phase 4 reuses a pattern that's already proven correct in this schema, not a new trick.

This must be verified live once implemented (query `information_schema.routine_privileges` for both functions and confirm `authenticated` has no row), the same way Phase 1/3's equivalent claims were independently re-verified rather than taken on faith.

---

## 8. The portal owner is never granted any staff permission

`record_online_payment` **does not call `has_permission()` at all.** Its authorization model is categorically different from `record_payment`'s:

- `record_payment`'s security boundary is a *runtime permission check on the caller* (`has_permission(auth.uid(), org, 'receivables.payments.create')`) — anyone with that grant can call it, at any time, for any payment they construct.
- `record_online_payment`'s security boundary is **"who is allowed to invoke this RPC at all"** (`service_role` only, enforced by `GRANT`/`REVOKE`, not a runtime check on `auth.uid()`) combined with **"the transaction row already represents a legitimately owner-initiated, provider-confirmed checkout"** by the time this function is called. The owner's own Postgres session is never involved in calling `record_online_payment` — Phase 3's RLS already has no owner-facing `UPDATE` policy on `online_payment_transactions` at all, and Phase 5's webhook handler (not yet designed) will call this function via the service-role client only *after* independently verifying the provider's cryptographic signature on the incoming webhook. The owner never receives, needs, or is granted any staff-side permission (`receivables.payments.create` or anything else) at any point in this flow.

---

## 9. Sharing accounting logic with `record_payment` without duplication

```
record_payment(...)                    record_online_payment(p_transaction_id, ...)
  |                                       |
  |-- has_permission() check              |-- lock transaction FOR UPDATE, check PENDING/PAID
  |-- (existing pre-checks unchanged)     |-- lock dues FOR UPDATE (fixed order), settlement-race check
  |                                       |
  '---------------> post_payment_internal(org, resort, member, unit, amount, method, ...) <---------------'
                            |
                            |-- journal entry creation/posting
                            |-- payments insert
                            |-- payment_allocations insert
                            |-- due status updates
                            |-- cash_transactions insert (if cashier session)
                            |-- platform_audit_logs write
                            '-- returns (payment_id, allocated_amount, unallocated_amount, affected_due_ids)
```

`record_payment` is modified **only** to replace its post-permission-check body with a call to `post_payment_internal`, passing through the exact same parameters it already validates today — this is a refactor, not a behavior change, and its existing pgTAP/Vitest coverage (idempotency replay, waterfall allocation, RBAC tests from `tests/financial-suite.ts`) must continue passing unmodified as the acceptance bar for this refactor specifically (see §10).

---

## 10. Testing strategy

### pgTAP (`supabase/tests/phase_owner_portal_record_online_payment.sql` or similar)

- **Idempotent replay:** call `record_online_payment` twice for the same already-`PAID` transaction id (simulating a duplicate webhook past the event-id dedup layer) → both calls return `status='PAID'` with the identical `payment_id`; exactly one `payments` row exists; exactly one journal entry exists.
- **Concurrent replay (the actual race, not just sequential calls):** two genuinely concurrent sessions call `record_online_payment` for the same `PENDING` transaction at the same time (achievable in a pgTAP-style script via two separate connections/advisory-lock timing, or documented as a Vitest-level concurrency test if easier to construct reliably — see below). One must win and post; the other must block on the `FOR UPDATE` lock and then see `PAID` and return the same `payment_id` — never two payments.
- **Settlement race, all-or-nothing:** set up a transaction with two allocations; settle one of the two dues via a separate `record_payment` call *before* calling `record_online_payment`; confirm the online transaction ends up `FAILED` with `failure_code = 'DUE_SETTLED_ELSEWHERE'`, **zero** payment rows were created (not a partial payment for the one still-valid allocation), and — critically — confirm the `FAILED` status actually persisted (proving §6's non-raising design works, not just that the right exception text would have appeared).
- **Rollback on unexpected failure:** force an unrelated failure partway through `post_payment_internal` (e.g. an invalid `p_deposit_account_id`) and confirm the entire attempt rolls back cleanly — no orphaned `payments` row, no orphaned journal entry, the `online_payment_transactions` row is untouched (still `PENDING`, since this is the "genuinely exceptional, nothing should survive" path from §6, not the settlement-race path).
- **Balance invariant:** every journal entry `record_online_payment` produces is balanced (debits = credits) — reuse the existing financial-suite balance assertions already applied to `record_payment`.
- **Privilege checks:** `authenticated` cannot call `record_online_payment` or `post_payment_internal` at all (re-derive independently via `set local role authenticated`, don't just query `information_schema`).
- **`record_payment` regression:** the full existing `tests/financial-suite.ts` RPC suite (waterfall allocation, idempotency, RBAC) must still pass unmodified after the `post_payment_internal` extraction — this is the acceptance bar proving the refactor changed nothing observable about `record_payment`'s behavior.

### Vitest

- If a genuine two-connection concurrent race is awkward to express in a single pgTAP script, model it in a Vitest integration test using two independent `SupabaseClient` instances issuing the `record_online_payment` RPC call at effectively the same time (`Promise.all`) and asserting on the combined outcome (one `PAID`, one payment row, no duplicate).
- Unit-level coverage for any TypeScript-side helper Phase 4 introduces (if any — this phase is close to pure SQL; if no application code is needed yet, this bullet may end up empty, which is fine).

---

## Open questions requiring a decision before task breakdown

These are real design gaps this document surfaced while specifying the exact algorithm — not implementation details to guess at silently:

**A. Deposit account for online payments.** `record_payment`'s existing `p_deposit_account_id` parameter is normally chosen by a staff member (which cashbox or bank account received the money). An online payment has no staff choosing anything. Options: (1) a new per-organization "Online Payments Clearing" GL account, configured once (similar to how cashboxes already map to a GL account), credited/debited through this clearing account until a real bank settlement reconciliation happens later; (2) map directly to an existing bank account the organization already has on file. **Recommend (1)** — it matches standard payment-gateway accounting practice (funds are provider-held before actual bank settlement, so they aren't literally "in" any real bank account yet) and avoids conflating this with Phase 1's future bank-reconciliation work — but this needs your confirmation before it's built.

**B. Fiscal period auto-resolution.** Staff choose `p_fiscal_period_id` explicitly today. `record_online_payment` has no staff involved, so it must resolve the open fiscal period covering `current_date` for the transaction's `resort_id`/`organization_id` automatically. What should happen if no open period covers today (e.g. month-end close is in progress)? Recommend: treat this the same as a settlement-race failure (§6's non-raising pattern) — mark the transaction `FAILED` with a new `failure_code = 'NO_OPEN_FISCAL_PERIOD'`, since it's an expected, recoverable-by-retry-later condition, not a system error.

**C. Payment method value for `PAYMOB`/`FAWRY`.** `payments.method` currently constrains to `CASH`/`BANK_TRANSFER`/`CHEQUE`/`OTHER` (per the existing schema). Neither provider fits. Recommend adding `'ONLINE'` as a new allowed value (one migration, additive, no existing row affected) rather than overloading `'OTHER'` (which would make online payments invisible in existing method-based reports) or adding provider-specific values (which would require every report/filter that lists payment methods to learn about both providers individually). Needs your confirmation.

**D. Can one online payment transaction span dues on multiple units?** `online_payment_transaction_allocations` (Phase 3) has no unit restriction — a member who owns two units could in principle select dues from both in one checkout. `post_payment_internal`/`record_payment`'s existing signature takes a single `p_unit_id`. Need to confirm: does `payments.unit_id` allow `null` today (check the live schema), and if so, is passing `null` when a transaction's allocations span multiple units acceptable, or should Phase 3's `client_request_id`/frontend flow (not yet built) restrict an owner to selecting dues from one unit per checkout instead? **Recommend restricting checkout to single-unit selections** (simpler accounting, matches how the existing dues page already groups by unit) rather than teaching `post_payment_internal` to handle a null/multi-unit case it was never designed for — but this is a UX-adjacent decision as much as an accounting one, so flagging rather than deciding unilaterally.

---

## What happens after this is approved

Once you confirm this design (with decisions on A–D above), the next step is a proper task-broken-down implementation plan (`docs/superpowers/plans/...`) in the same format as Phases 1–3, executed the same way: implementer → spec-compliance review → code-quality review per task, with pgTAP/Vitest proof at each step — still with zero Paymob/Fawry/webhook/checkout code until that's separately scoped.
