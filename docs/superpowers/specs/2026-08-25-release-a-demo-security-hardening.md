# Release A — demo read-only hardening, provisioning closure, demo-session architecture

Status: **PREPARED, NOT APPLIED.** Nothing in this document has been executed against
any database. Release A remains stopped until the migration below is applied and the
capability sweep in `tests/demo-principal-capability.integration.test.ts` is green.

Verified against the live project `ResortOS` (`ataslxkcflxuilpgyepm`) on 2026-08-25 using
read-only `SELECT`s. No mutating statement was issued at any point.

---

## 1. What the sweep found

Demo principal: the user holding the **Auditor** role in the organization flagged
`organizations.is_demo = true` ("AqarBooks Demo Holdings"). Deliberately described by
role and flag, never by email or UUID.

### Already safe (verified, no change needed)

| Surface | Result |
|---|---|
| RBAC permissions | All 25 Auditor keys are `.read` / `.view` / `.export` / `.verify`. A mutation-keyword probe returned empty. |
| Financial posting RPCs | Gated on permissions the Auditor lacks. `post_supplier_invoice` requires `finance.entries.create`; `post_supplier_invoice_in_currency` has no guard of its own but delegates to it, so it is transitively safe. |
| Write RLS policies gated on a permission the Auditor *holds* | Probe returned **empty** — no such policy exists. |
| Mutating `SECURITY DEFINER` RPCs gated on a permission the Auditor *holds* | Probe returned **empty**. |
| Storage | `member-documents` INSERT and DELETE both require `property.members.manage` (Auditor lacks it). No UPDATE policy exists at all. SELECT is membership-scoped. |
| Platform admin | Demo principal is not a platform admin. |
| `run_lease_rent_generation` direct call | Not executable by `anon` or `authenticated`; `service_role` only. |

### Defects this migration closes

**D1 — `property_import_logs` INSERT gated on mere membership.**
Policy `property_import_logs_insert_member` checks only
`is_org_member(auth.uid(), organization_id)`. The demo principal is a member, so it can
insert rows into the demo tenant. No application code writes this table (only
`lib/supabase/types.ts` and `lib/backup/table-classification.ts` reference it), and the
import screen already gates on `property.units.manage`
(`app/[locale]/(app)/import/page.tsx:52`), so tightening the policy to that key restores
the intended posture without changing any working flow.

**D2 — `alert_dismissals` permits persistent mutation.**
Policy `alert_dismissals_own` is `FOR ALL` on `user_id = auth.uid() AND is_org_member(...)`.
The demo principal can insert, update and delete dismissals, and they persist.

**D3 — the shared demo principal can mutate its own profile.**
`profiles_insert_own` / `profiles_update_own` gate on `id = auth.uid()` only.

D1–D3 share an amplifier: **every visitor shares one demo account**, so any write persists
for all subsequent visitors. None reaches the ledger, but all three violate the read-only
requirement.

**D4 — unrestricted tenant provisioning is open at the database layer.**
`create_organization_onboarding(text,text,text,text,text,text,text)` is `SECURITY DEFINER`
and `authenticated` holds EXECUTE (verified: `anon`=false, `authenticated`=**true**,
`service_role`=true). Any authenticated user without a membership can
`POST /rest/v1/rpc/create_organization_onboarding` and self-provision an `ACTIVE`
organization with no UI involved. Removing the wizard route does not close this.

**D5 — the frozen demo ledger is scheduled to mutate itself.**
`app/[locale]/(app)/finance/dues/page.tsx:70,83` calls
`createAdminClient().rpc("run_lease_rent_generation")` — with the **service-role** key — on
every render. That function loops **every ACTIVE lease in every organization** (no org
filter) and inserts rent dues. Of the 49 leases that currently qualify, **all 49 belong to
the demo tenant** (demo 49 / global 49).

It is idempotent per `(organization, lease, period)`, which is why today's figures still tie
out exactly. At the next period boundary the first visitor to load that page will generate
49 rent dues into the frozen tenant and move `billed` off 3,619,300.00. This is a
guaranteed future breach of the demo-immutability requirement, not a hypothetical.

### Drift noted, reconciled here

`organizations.is_demo` **already exists in production** (boolean, NOT NULL, default false,
`true` for the demo tenant) but appears **nowhere in the repository** — `grep` for `is_demo`
across the tree returns no matches, and it is absent from the pinned baseline. It was added
out-of-band, like the demo tenant's data itself. The migration re-adds it idempotently so
the repository can describe the database again.

---

## 2. The migration

Smallest change that closes D1–D5. Not yet applied.

At apply time this becomes `supabase/migrations/<version>_demo_readonly_hardening.sql`,
applied via `apply_migration` (which writes the ledger row), with the new file's name, byte
count and sha256 added to `MIGRATION_FILES` in `tests/migration-directory-guard.test.ts` in
the same commit. It is staged here rather than in `supabase/migrations/` so that the guard
suite stays green while the change is unapplied.

```sql
begin;

-- ---------------------------------------------------------------------------
-- 0. Semantic demo marker.
--    Already present in production, added out-of-band and never captured by a
--    migration. Added idempotently so the repository describes the database.
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists is_demo boolean not null default false;

comment on column public.organizations.is_demo is
  'Marks a tenant as a public demo tenant whose data is frozen and read-only. '
  'Demo restrictions key off this flag only -- never off a hardcoded user id or email.';

-- ---------------------------------------------------------------------------
-- 1. Helpers.
--    SECURITY DEFINER so policy evaluation can read organizations and
--    organization_memberships without recursing through their own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_demo_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select o.is_demo from public.organizations o where o.id = p_organization_id),
    false
  );
$$;

create or replace function public.is_demo_principal(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user_id
      and o.is_demo
  );
$$;

revoke execute on function public.is_demo_organization(uuid) from public;
revoke execute on function public.is_demo_principal(uuid) from public;
grant execute on function public.is_demo_organization(uuid) to anon, authenticated, service_role;
grant execute on function public.is_demo_principal(uuid)    to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. D1 -- property_import_logs: require the import permission, not membership.
--    Matches the gate the import screen already enforces.
-- ---------------------------------------------------------------------------
drop policy if exists property_import_logs_insert_member on public.property_import_logs;

create policy property_import_logs_insert_permission
  on public.property_import_logs
  for insert
  with check (
    public.has_permission(auth.uid(), organization_id, 'property.units.manage')
  );

-- ---------------------------------------------------------------------------
-- 3. D2 -- alert_dismissals: reads preserved, persistent writes denied for
--    demo tenants. Split from FOR ALL so a demo visitor can still READ.
-- ---------------------------------------------------------------------------
drop policy if exists alert_dismissals_own on public.alert_dismissals;

create policy alert_dismissals_select_own
  on public.alert_dismissals
  for select
  using (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
  );

create policy alert_dismissals_insert_own
  on public.alert_dismissals
  for insert
  with check (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
    and not public.is_demo_organization(organization_id)
  );

create policy alert_dismissals_update_own
  on public.alert_dismissals
  for update
  using (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
    and not public.is_demo_organization(organization_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
    and not public.is_demo_organization(organization_id)
  );

create policy alert_dismissals_delete_own
  on public.alert_dismissals
  for delete
  using (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
    and not public.is_demo_organization(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 4. D3 -- profiles: the shared demo principal may not mutate its identity.
--    handle_new_user() is SECURITY DEFINER and still creates profiles at signup.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_insert_own
  on public.profiles
  for insert
  with check (
    id = auth.uid()
    and not public.is_demo_principal(auth.uid())
  );

create policy profiles_update_own
  on public.profiles
  for update
  using (
    id = auth.uid()
    and not public.is_demo_principal(auth.uid())
  )
  with check (
    id = auth.uid()
    and not public.is_demo_principal(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. D5 -- never generate rent dues into a frozen demo tenant.
--    Byte-for-byte the production definition, plus the organizations join and
--    the `not o.is_demo` filter. Volatility, language, SECURITY DEFINER and
--    search_path are preserved exactly.
-- ---------------------------------------------------------------------------
create or replace function public.run_lease_rent_generation()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lease record;
  v_period text;
  v_result jsonb;
  v_generated int := 0;
  v_idempotent int := 0;
  v_blocked int := 0;
  v_skipped int := 0;
  v_errored int := 0;
begin
  for v_lease in
    select l.id, l.organization_id, l.rent_frequency
    from public.unit_leases l
    join public.organizations o on o.id = l.organization_id
    where l.status = 'ACTIVE'
      and l.starts_on <= current_date
      and (l.ends_on is null or l.ends_on >= current_date)
      and not o.is_demo
  loop
    v_period := public.lease_rent_period_key(v_lease.rent_frequency, current_date);
    begin
      v_result := public.generate_lease_rent_dues(v_lease.organization_id, v_lease.id, v_period);
      if (v_result ->> 'generated')::boolean is true then
        v_generated := v_generated + 1;
      elsif (v_result ->> 'idempotent')::boolean is true then
        v_idempotent := v_idempotent + 1;
      elsif (v_result ->> 'blocked')::boolean is true then
        v_blocked := v_blocked + 1;
      elsif (v_result ->> 'skipped')::boolean is true then
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_errored := v_errored + 1;
    end;
  end loop;

  return jsonb_build_object(
    'generated', v_generated, 'idempotent', v_idempotent,
    'blocked', v_blocked, 'skipped', v_skipped, 'errored', v_errored
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. D4 -- close unrestricted tenant provisioning.
--    service_role is deliberately retained: Release B's approval-gated
--    provisioner runs server-side under service_role after Super Admin
--    approval, and a future payment confirmation becomes a second authorized
--    producer of that same provisioning event.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.create_organization_onboarding(text, text, text, text, text, text, text)
  from public, anon, authenticated;

commit;
```

### Application changes that must land in the same release

Revoking D4 makes `lib/actions/onboarding.ts::completeOnboarding` fail with `42501`. The
public routes must stop offering a path to organization creation rather than surfacing a
raw Postgres error:

- `app/[locale]/onboarding/**` — retire the wizard's provisioning submit.
- `app/[locale]/auth/register/**` — registration must no longer promise a workspace.
- `login-form.tsx:134` — the sole public "Create account" link.
- `tests/onboarding.integration.test.ts` and `tests/e2e/onboarding-wizard.spec.ts` assert the
  current self-service behaviour and will need to assert the closed behaviour instead.

Also required for D5 defence in depth (not a DB change): guard
`app/[locale]/(app)/finance/dues/page.tsx:70,83` so the service-role sweep does not fire on
a demo render. The DB filter above is the authoritative fix; this removes the pointless
cross-tenant write on every dues page view.

---

## 3. Demo-session architecture

### Decision

**Server-held session, no Supabase token in the browser.** Decision 3 said not to rewrite
the app merely to keep the token server-side — so the dependency was measured first, and
the rewrite turns out to be unnecessary:

- **65 of 65** pages under `app/[locale]/(app)/` are React Server Components.
- **Zero** of them import the browser Supabase client.
- **130** files funnel through a single server-side factory, `lib/supabase/server.ts::createClient`.
- The three client `fetch()` call sites target internal Next API routes, not PostgREST.

So the token never needs to reach the browser, and no screen changes to keep it that way.
The browser currently receives one only because `@supabase/ssr` writes a non-`httpOnly`
cookie at two writers (`lib/supabase/server.ts:19-21`, `middleware.ts:36-40`).

Why this beats the alternative: **the seven report RPCs are `SECURITY DEFINER` and gated on
`has_permission(auth.uid(), ...)`**, so a service-role client cannot call them at all
(`auth.uid()` is null → exception). A real demo-user session is therefore the only approach
that reuses the product's own reporting without weakening a single authorization check.

### Shape

1. **Session establishment** — a server-only demo sign-in using new server-only env vars
   (`DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`), added to `lib/env/server.ts` with the same
   lazy-resolve pattern the other secrets use. Never the service-role key. The client is
   constructed with `persistSession: false` and writes no cookies, so the access token
   stays in server memory for the duration of the request.
2. **Tenant resolution** — the org comes from the demo user's own membership via
   `getPrimaryOrganization(user.id)` (`lib/auth/org-context.ts:4-25`). There is no org
   switcher and no org id in any URL, so nothing browser-supplied can influence it.
3. **Enforcement** — unchanged. RLS and `has_permission` evaluate against the demo user's
   Auditor role exactly as for any tenant. No policy is relaxed for the demo anywhere.
4. **Fail-closed** — if the demo credentials are absent or sign-in fails, the demo route
   returns an error state. It must never fall back to an anonymous or service-role client.

Per Decision 3 the migration is still mandatory regardless of token placement: DB/RPC
authorization is the security boundary, and the target is zero persistent mutation.

### Shell suppression (small, localized)

Threaded as a `demo` prop from `app/[locale]/(app)/layout.tsx`:

| Element | Location | Action |
|---|---|---|
| Quick Action dropdown | `components/site-header.tsx:133-199` | suppress |
| Profile card (leaks name/email/role/org) | `components/app-sidebar.tsx:719-755`, title attr `:786` | replace with a demo identity card |
| Account link | `components/app-sidebar.tsx:759-767` | suppress |
| Sign-out forms (×2) | `components/app-sidebar.tsx:767-778`, `:793-804` | replace with "Exit demo" |
| Ask-AqarBooks drawer | `layout.tsx:351` | suppress (per-visitor LLM cost; also gated by AI limiter work) |
| Insights refresh button | `components/ai/executive-financial-insights-card.tsx:23-40` | suppress; card renders from `initialInsight` |

### Screen selection

Zero-change candidates — pure RSC, data-dense, no write UI: the tenant dashboard, the 19
report screens, AR aging, rent roll, cash-flow forecast, PDC register, and bank
reconciliation.

Two constraints found:

- **Six screens render write buttons ungated** (`dues`, `payments`, `expenses`, `suppliers`,
  `credit-notes`, `banks`, plus `journals` and `journals/[id]`): they gate read access but
  pass the client hub no capability flag, so a read-only user sees every write button and
  the click fails at the database with a raw Postgres error. This is a **real product
  defect for read-only staff today**, not demo-only scaffolding. Fix by threading
  `canManage`, mirroring `reconciliation/page.tsx:57-72,230`.
- **Cashier is gated on a write key** (`cashier.transactions.create`,
  `finance/cashier/page.tsx:60`), so an Auditor cannot view it at all. The brief wants the
  reconciled cashier narrative in the demo. Granting a write key would expose all four
  write dialogs. Resolution needed: either a read-only `CashierClient` variant or a new
  `cashier.sessions.read`-style key. **Open product decision.**

Also note the `.view` vs `.read` split in the permission catalog — two parallel namespaces
exist and are distinct rows. Do not assume equivalence when composing a demo role.

---

## 4. Tests

`tests/demo-principal-capability.integration.test.ts` — direct authenticated PostgREST
probes, exactly as Decision 1 and Decision 4 require.

- **Negative probes (demo principal):** `property_import_logs` insert, `alert_dismissals`
  insert/update/delete, own-`profiles` update, `create_organization_onboarding` RPC,
  storage upload, a financial-mutation RPC, and a cross-tenant read.
- **Positive controls (normal authorized principal, ephemeral non-demo tenant):** the same
  `property_import_logs` insert, `alert_dismissals` write cycle and profile update must
  **succeed**, proving the policies deny the demo principal specifically rather than
  denying everyone.
- **Anti-vacuity:** a PostgREST `UPDATE`/`DELETE` filtered out by RLS returns `200` with an
  empty array rather than an error, so every negative write probe additionally re-reads the
  row through the service-role client and asserts the value is **unchanged**. Missing demo
  credentials fail the suite loudly; they never skip.

The suite asserts the **target** state, so it is expected to fail before the migration is
applied — that failure is the proof it detects the defects — and to pass after. It is
deliberately not yet wired into `test:all`.

Still outstanding for Release A beyond this document: the Playwright public-demo suite
(AR/EN, desktop and 375px, RTL/LTR, console errors, no horizontal overflow, CTA flow) and
the AI rate-limiting/org-context work, neither of which is started.
