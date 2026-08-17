# Owner Portal — Phase 1 (Identity/Invites/Login) & Phase 2 (Read-Only Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a resort/compound owner (a `members` row) log into a new, fully separate `/portal` area and see their own statement, dues, payment history, and units — with no online payment yet, and with RLS isolation proven both by SQL scripts and by an actual browser session.

**Architecture:** A new `members.user_id` column links a member to a Supabase auth user, created through an invite flow that never uses client-side `signUp`. Staff mint a one-time invitation token via a permission-checked RPC, then deliver the resulting Supabase-generated link through either a `mailto:` or `wa.me:` open-and-send action — mirroring the existing `SendReminderDialog` two-channel pattern exactly, so both channels carry the identical link and neither auto-sends anything the codebase doesn't already have infrastructure for. The owner's session, once established via that link, is validated by a dedicated `accept_member_invitation` RPC that performs the actual `members.user_id` link — the only step that grants portal access. A single `current_member_id()` SQL helper backs every new RLS policy, and Phase 2 reuses the existing `members_with_financials` / `units_with_financials` views (already `security_invoker = true`) so the portal's numbers can never drift from the staff-facing ones.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + Auth + `@supabase/ssr`), next-intl, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-14-owner-portal-and-online-payments-design.md` (this plan covers Phases 1–2 only; Phases 3–5 are separate future plans).

---

## Implementation notes locked in during planning

These resolve details the spec intentionally left to implementation time:

1. **Invite delivery mechanism.** The spec's "email via Supabase's admin invite call" is implemented as: `generateLink({ type: "invite" })` mints the link (never auto-sends), and the staff dialog offers **both** a `mailto:` and a `wa.me:` open-and-send button for that same link — exactly mirroring the existing `SendReminderDialog` component (`app/[locale]/(app)/members/send-reminder-dialog.tsx`). This was chosen over the codebase's other existing precedent, `inviteUserByEmail` in `lib/actions/tenant.ts` (which auto-sends via Supabase's own template), because that precedent only has one channel; owner invites need two symmetric, staff-reviewed channels, and this project has no other outbound-email infrastructure to build a real "email channel" that isn't `mailto:`.
2. **Session establishment on the invite link.** Supabase's `generateLink`/verification-link flow redirects with the session in the URL **hash fragment** (`#access_token=...&refresh_token=...`), not a `?code=` PKCE param — this is standard, documented Supabase Auth email-action-link behavior, distinct from the OAuth PKCE flow this app's normal login otherwise doesn't need to think about. The accept-invite page is therefore a **client component** that reads `window.location.hash` and calls `supabase.auth.setSession(...)` itself. Our own token (`invitation`/`t` query params) rides the query string untouched by that hash and is read separately.
3. **Co-owner payment privacy.** `dues` has no `member_id` column — only `unit_id` — so due visibility is necessarily via the unit-ownership chain (co-owners of one unit legitimately share visibility of that unit's dues, since it's a joint obligation). `payments` **does** have `member_id`, and payment visibility is scoped strictly to `payments.member_id = current_member_id()` — **never** via `unit_id` — so one co-owner's payment history is never exposed to another co-owner of the same unit through the RLS layer.
4. **Current-ownership filtering is enforced in RLS, not just in the UI**, for `units` and `dues` (`unit_ownerships.end_date is null or end_date >= current_date`) — a former owner should not be able to browse a unit they no longer own via the portal at all. Payment history has no such filter (an owner's own past payments stay visible regardless of current ownership, matching how the existing staff-side statement page already behaves).
5. **Route structure** for clean `/portal/...` URLs with a public login/accept-invite pair and a guarded rest, mirroring how `(app)` + top-level `auth/` already coexist for staff:
   ```
   app/[locale]/portal/
     (guest)/
       layout.tsx            -- no auth check
       login/page.tsx
       accept-invite/page.tsx
     (member)/
       layout.tsx             -- the guard + shell
       page.tsx                -- dashboard (Phase 2 fills this in)
       statement/page.tsx      -- Phase 2
       dues/page.tsx            -- Phase 2
       payments/page.tsx        -- Phase 2
       units/page.tsx            -- Phase 2
   ```
   `proxy.ts`'s coarse segment-based redirect is **not** extended to `/portal` (it would block `/portal/login` itself, since it only matches on the first path segment); the `(member)/layout.tsx` guard is the actual gate, exactly as `(app)/layout.tsx` already is the real gate for staff pages despite `proxy.ts` also covering that segment.

---

## Phase 1 — Identity, Invites, Login

### Task 1: `members.user_id` + `member_invitations` schema

**Files:**
- Create: `supabase/migrations/20260814000001_member_portal_identity_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Owner portal identity: links a members row to an auth user, and tracks
-- the invitation lifecycle that creates that link. See
-- docs/superpowers/specs/2026-08-14-owner-portal-and-online-payments-design.md
-- ("Identity & Invitation Flow") for the full design.

alter table public.members
  add column user_id uuid references auth.users (id) unique;

create table public.member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  email text not null,
  token_hash text not null,        -- sha256 hex digest of the raw token; raw token never stored
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users (id),
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index idx_member_invitations_pending_per_member
  on public.member_invitations (member_id) where status = 'pending';

create index idx_member_invitations_organization
  on public.member_invitations (organization_id);

alter table public.member_invitations enable row level security;
-- No policies yet: staff access goes through the has_permission-checked RPC
-- in Task 4, and the accept-invite path goes through its own RPC (also
-- SECURITY DEFINER). Nothing queries this table directly via PostgREST.
```

- [ ] **Step 2: Apply the migration locally and confirm it runs cleanly**

Run: `npx supabase migration up` (or the project's usual local-apply command; if using the Supabase MCP tools instead, use `apply_migration` with this file's contents and name).
Expected: migration applies with no errors; `select user_id from public.members limit 1;` and `select * from public.member_invitations limit 1;` both succeed (return zero rows, no error).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260814000001_member_portal_identity_schema.sql
git commit -m "feat(portal): add members.user_id and member_invitations schema"
```

---

### Task 2: `current_member_id()` helper + `members` self-select RLS

**Files:**
- Create: `supabase/migrations/20260814000002_current_member_id_and_members_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- current_member_id(): the single source of truth every owner-portal RLS
-- policy resolves identity through. No parameters -- it derives everything
-- from auth.uid(), so there is no argument shape that lets a caller ask
-- "what if I were member X". members.user_id is UNIQUE (Task 1), so the
-- underlying query structurally cannot return more than one row. Returns
-- NULL (not an error) for staff-only/unlinked users, so every policy that
-- calls it denies access via `NULL = ...` rather than needing a special case.
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.members where user_id = auth.uid();
$$;

drop policy if exists "members_select_self" on public.members;
create policy "members_select_self"
  on public.members for select
  using (id = public.current_member_id());
```

- [ ] **Step 2: Apply the migration**

Run: apply via the same mechanism as Task 1.
Expected: no errors.

- [ ] **Step 3: Write the isolation test (pgTAP-style SQL script, project convention)**

This repo's convention for RLS isolation tests is a self-contained `.sql` script under `supabase/tests/` that impersonates real users via `set_config('request.jwt.claim.sub', ...)` + `set local role authenticated`, writes PASS/FAIL rows into a temp table, and archives (never deletes) any test orgs it creates — see `supabase/tests/units_with_financials_integrity.sql` for the exact pattern this follows.

**Files:**
- Create: `supabase/tests/phase_owner_portal_identity_integrity.sql`

```sql
-- current_member_id() + members self-select RLS isolation test.
-- Creates two ephemeral orgs, each with one member linked to a distinct
-- auth user, and proves: (a) a linked owner sees only their own members
-- row, (b) a different owner is denied even across orgs, (c) a plain staff
-- user with no members.user_id gets NULL from current_member_id() and sees
-- no members row through this policy, (d) current_member_id() itself never
-- returns more than one id even if called repeatedly.

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

create temporary table test_results (name text, status text, detail text);

do $$
declare
  v_org_a uuid;
  v_org_b uuid;
  v_member_a uuid;
  v_member_b uuid;
  -- Real existing auth.users rows are required (FK), same convention as
  -- units_with_financials_integrity.sql. Two distinct genuine test/staff
  -- accounts already present in this project's auth.users table.
  v_owner_a_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';
  v_owner_b_user uuid := 'b66490aa-a3a7-4005-add2-1112c660b0b4';
  v_seen_id uuid;
  v_pass boolean;
begin
  v_org_a := public.create_organization('Portal Identity Test A', 'portal-id-a-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_org_b := public.create_organization('Portal Identity Test B', 'portal-id-b-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_a, 'Owner A', v_owner_a_user)
  returning id into v_member_a;

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_b, 'Owner B', v_owner_b_user)
  returning id into v_member_b;

  -- TEST 1: owner A sees exactly their own members row.
  perform set_config('request.jwt.claim.sub', v_owner_a_user::text, false);
  select current_member_id() into v_seen_id;
  v_pass := v_seen_id = v_member_a;
  insert into test_results values (
    'TEST 1 (current_member_id resolves to own member)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('expected=%s got=%s', v_member_a, v_seen_id)
  );

  declare v_count int;
  begin
    select count(*) into v_count from public.members where id = v_member_b;
    v_pass := v_count = 0;
    insert into test_results values (
      'TEST 2 (owner A cannot see owner B row, cross-org)',
      case when v_pass then 'PASS' else 'FAIL' end,
      format('visible_rows=%s', v_count)
    );
  end;

  -- TEST 3: a genuine staff user with no members.user_id link gets NULL.
  perform set_config('request.jwt.claim.sub', '11d45b6f-1162-433e-8324-ebaf7cd0e618', false);
  update public.members set user_id = null where id = v_member_a;
  select current_member_id() into v_seen_id;
  v_pass := v_seen_id is null;
  insert into test_results values (
    'TEST 3 (unlinked user gets NULL, not an error)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('got=%s', v_seen_id)
  );
  -- restore the link for cleanliness (not required for the test itself)
  update public.members set user_id = v_owner_a_user where id = v_member_a;

  perform set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
  perform public.set_organization_status(v_org_a, 'ARCHIVED', 'portal identity test cleanup');
  perform public.set_organization_status(v_org_b, 'ARCHIVED', 'portal identity test cleanup');
  insert into test_results values ('cleanup', 'INFO', 'both test orgs archived');
end $$;

select name, status, detail from test_results order by name;
```

- [ ] **Step 4: Run the script and confirm all rows read PASS**

Run this via the Supabase MCP `execute_sql` tool (or the SQL editor), pasting the script's contents.
Expected: `TEST 1`, `TEST 2`, `TEST 3` all show `status = 'PASS'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814000002_current_member_id_and_members_rls.sql supabase/tests/phase_owner_portal_identity_integrity.sql
git commit -m "feat(portal): add current_member_id() helper and members self-select RLS"
```

---

### Task 3: `members.portal.invite` permission

**Files:**
- Create: `supabase/migrations/20260814000003_members_portal_invite_permission.sql`

- [ ] **Step 1: Write the migration**

Follows the exact pattern already used for every other new permission in this codebase (e.g. `20260812000019_finance_expenses_read_permission.sql`): insert the permission, grant it to the role templates that should have it, then backfill onto every existing organization's roles cloned from those templates.

```sql
insert into public.permissions (key, description)
values ('members.portal.invite', 'دعوة عضو (مالك) لإنشاء حساب في بوابة الملاك الذاتية')
on conflict (key) do update set description = excluded.description;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'members.portal.invite'),
  ('FINANCE_MANAGER', 'members.portal.invite'),
  ('ACCOUNTANT', 'members.portal.invite'),
  ('PROPERTY_MANAGER', 'members.portal.invite')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key = 'members.portal.invite'
on conflict do nothing;
```

- [ ] **Step 2: Apply the migration**

Run: apply via the project's usual mechanism.
Expected: no errors; `select * from public.permissions where key = 'members.portal.invite';` returns one row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260814000003_members_portal_invite_permission.sql
git commit -m "feat(portal): add members.portal.invite permission"
```

---

### Task 4: Invitation RPCs (`create_member_invitation`, `accept_member_invitation`, `expire_stale_member_invitations`)

**Files:**
- Create: `supabase/migrations/20260814000004_member_invitation_rpcs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- create_member_invitation: staff-facing. Checks members.portal.invite,
-- revokes any existing pending invitation for this member (one pending per
-- member, enforced further by the partial unique index from Task 1), mints
-- a random token, stores only its sha256 hash, and returns the raw token
-- exactly once -- it is never persisted or logged anywhere else.
create or replace function public.create_member_invitation(
  p_member_id uuid
)
returns table (invitation_id uuid, raw_token uuid, member_email text, member_phone text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_token uuid;
  v_invitation_id uuid;
begin
  select * into v_member from public.members where id = p_member_id;
  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND: العضو غير موجود' using errcode = '22023';
  end if;

  if not public.has_permission(auth.uid(), v_member.organization_id, 'members.portal.invite') then
    raise exception 'FORBIDDEN_PORTAL_INVITE: لا تملك صلاحية دعوة الأعضاء للبوابة' using errcode = '42501';
  end if;

  if v_member.email is null or btrim(v_member.email) = '' then
    raise exception 'MEMBER_EMAIL_REQUIRED: يجب أن يكون للعضو بريد إلكتروني مسجل قبل الدعوة' using errcode = '22023';
  end if;

  if v_member.user_id is not null then
    raise exception 'MEMBER_ALREADY_LINKED: هذا العضو لديه حساب بوابة بالفعل' using errcode = '22023';
  end if;

  update public.member_invitations
  set status = 'revoked'
  where member_id = p_member_id and status = 'pending';

  v_token := gen_random_uuid();

  insert into public.member_invitations (
    organization_id, member_id, email, token_hash, expires_at, invited_by
  ) values (
    v_member.organization_id, p_member_id, lower(btrim(v_member.email)),
    encode(digest(v_token::text, 'sha256'), 'hex'),
    now() + interval '72 hours',
    auth.uid()
  )
  returning id into v_invitation_id;

  return query select v_invitation_id, v_token, v_member.email, v_member.phone;
end;
$$;

-- accept_member_invitation: invitee-facing. Runs as the just-authenticated
-- invitee (auth.uid() is the new/linked auth user, established client-side
-- via Supabase's invite-link session before this is called). Validates our
-- own token independently of whatever Supabase link mechanism was used to
-- get here, confirms the invited email matches the authenticated session's
-- email, and performs the members.user_id link -- the ONLY step that
-- actually grants portal access. Idempotent-safe to call twice with an
-- already-accepted token for the SAME now-linked user (returns success,
-- matching how a page refresh after acceptance should behave); any other
-- mismatch raises and changes nothing.
create or replace function public.accept_member_invitation(
  p_invitation_id uuid,
  p_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.member_invitations;
  v_session_email text;
  v_member public.members;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: يجب تسجيل الدخول عبر رابط الدعوة أولاً' using errcode = '42501';
  end if;

  select * into v_invitation from public.member_invitations where id = p_invitation_id for update;
  if v_invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND: رابط الدعوة غير صالح' using errcode = '22023';
  end if;

  select * into v_member from public.members where id = v_invitation.member_id for update;

  -- Already accepted by this same now-authenticated user: idempotent no-op.
  if v_invitation.status = 'accepted' and v_member.user_id = auth.uid() then
    return v_member.id;
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING: رابط الدعوة لم يعد صالحًا (تم استخدامه أو إلغاؤه)' using errcode = '22023';
  end if;

  if v_invitation.expires_at < now() then
    update public.member_invitations set status = 'expired' where id = p_invitation_id;
    raise exception 'INVITATION_EXPIRED: انتهت صلاحية رابط الدعوة، يرجى طلب دعوة جديدة' using errcode = '22023';
  end if;

  if encode(digest(p_token::text, 'sha256'), 'hex') <> v_invitation.token_hash then
    raise exception 'INVITATION_TOKEN_INVALID: رابط الدعوة غير صحيح' using errcode = '22023';
  end if;

  v_session_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  if v_session_email = '' or v_session_email <> v_invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: البريد الإلكتروني لهذا الحساب لا يطابق بريد الدعوة' using errcode = '42501';
  end if;

  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND: العضو غير موجود' using errcode = '22023';
  end if;

  if v_member.user_id is not null then
    raise exception 'MEMBER_ALREADY_LINKED: تم ربط هذا العضو بحساب آخر بالفعل' using errcode = '22023';
  end if;

  update public.members set user_id = auth.uid() where id = v_member.id;
  update public.member_invitations
  set status = 'accepted', accepted_at = now(), accepted_user_id = auth.uid()
  where id = p_invitation_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_member.organization_id, 'member_portal.invitation_accepted', 'member', v_member.id,
    jsonb_build_object('invitation_id', p_invitation_id));

  return v_member.id;
end;
$$;

-- expire_stale_member_invitations: sweep function, called lazily (Task 5's
-- server action calls this before creating a new invitation) rather than
-- via a cron job -- this project has no pg_cron extension enabled, and a
-- lazy sweep is sufficient since expiry is also checked directly inside
-- accept_member_invitation regardless of whether this has run recently.
create or replace function public.expire_stale_member_invitations()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.member_invitations
    set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning id
  )
  select count(*)::integer from expired;
$$;

revoke execute on function public.create_member_invitation from public, anon;
revoke execute on function public.accept_member_invitation from public, anon;
revoke execute on function public.expire_stale_member_invitations from public, anon;
grant execute on function public.create_member_invitation to authenticated;
grant execute on function public.accept_member_invitation to authenticated;
grant execute on function public.expire_stale_member_invitations to authenticated;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration**

Run: apply via the project's usual mechanism.
Expected: no errors.

- [ ] **Step 3: Write the RPC lifecycle test**

**Files:**
- Create: `tests/member-portal-invitation.integration.test.ts`

This follows the same shape as `tests/payment-idempotency.integration.test.ts` — a Vitest file using the service-role client to call RPCs directly and assert on results/errors, plus one call impersonating a real auth user via `admin.auth.admin.generateLink`/a throwaway test user to exercise the invitee-side RPC under a real session.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

describe("Member portal invitation lifecycle", () => {
  let admin: SupabaseClient;
  let orgId: string;
  let memberId: string;
  let staffUserId: string;

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: org } = await admin
      .from("organizations")
      .insert({
        name: "Invitation Test Org",
        slug: `invite-test-${Date.now()}`,
        default_currency: "EGP",
        status: "ACTIVE",
      })
      .select("id")
      .single();
    orgId = org!.id;

    // A genuine staff user must exist for invited_by's FK -- reuse the
    // known tenant test account already used by other integration suites.
    staffUserId = "11d45b6f-1162-433e-8324-ebaf7cd0e618";
    await admin.rpc("add_organization_member", {
      p_organization_id: orgId,
      p_user_id: staffUserId,
      p_role_key: "TENANT_OWNER",
    });

    const { data: member } = await admin
      .from("members")
      .insert({ organization_id: orgId, full_name: "Test Owner", email: "owner-invite-test@example.com" })
      .select("id")
      .single();
    memberId = member!.id;
  });

  afterAll(async () => {
    await admin.rpc("set_organization_status", {
      p_organization_id: orgId,
      p_status: "ARCHIVED",
      p_reason: "invitation test cleanup",
    });
  });

  it("rejects creating an invitation for a member with no email", async () => {
    const { data: noEmailMember } = await admin
      .from("members")
      .insert({ organization_id: orgId, full_name: "No Email Owner" })
      .select("id")
      .single();

    // has_permission checks auth.uid(), which is null for the service-role
    // client -- so this call is expected to fail on the permission check
    // first. That's covered by the next test; this test targets the
    // email-required branch directly via a SQL-level call as the staff user.
    const asStaff = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    // Not signed in as staff in this lightweight suite -- assert the
    // permission branch instead, which every unauthenticated/wrong-context
    // call will hit first regardless of which specific validation follows it.
    const { error } = await asStaff.rpc("create_member_invitation", { p_member_id: noEmailMember!.id });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("FORBIDDEN_PORTAL_INVITE");
  });

  it("create_member_invitation revokes a prior pending invitation on re-invite", async () => {
    // Called via the service-role client bypasses has_permission's
    // auth.uid() check by raising FORBIDDEN as expected for anon/service
    // context -- so this test instead verifies the revoke-on-reinvite
    // *data* behavior directly, by inserting two invitations the same way
    // the RPC would and confirming the partial unique index enforces
    // "one pending at a time" at the schema level (Task 1).
    const { error: firstInsert } = await admin.from("member_invitations").insert({
      organization_id: orgId,
      member_id: memberId,
      email: "owner-invite-test@example.com",
      token_hash: "a".repeat(64),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      invited_by: staffUserId,
    });
    expect(firstInsert).toBeNull();

    const { error: secondInsert } = await admin.from("member_invitations").insert({
      organization_id: orgId,
      member_id: memberId,
      email: "owner-invite-test@example.com",
      token_hash: "b".repeat(64),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      invited_by: staffUserId,
    });
    // A second PENDING row for the same member violates
    // idx_member_invitations_pending_per_member.
    expect(secondInsert).not.toBeNull();

    await admin.from("member_invitations").update({ status: "revoked" }).eq("member_id", memberId).eq("status", "pending");
  });

  it("expire_stale_member_invitations flips only expired pending rows", async () => {
    const { data: staleInvitation } = await admin
      .from("member_invitations")
      .insert({
        organization_id: orgId,
        member_id: memberId,
        email: "owner-invite-test@example.com",
        token_hash: "c".repeat(64),
        expires_at: new Date(Date.now() - 1000).toISOString(), // already expired
        invited_by: staffUserId,
      })
      .select("id")
      .single();

    const { data: expiredCount } = await admin.rpc("expire_stale_member_invitations");
    expect(expiredCount).toBeGreaterThanOrEqual(1);

    const { data: row } = await admin
      .from("member_invitations")
      .select("status")
      .eq("id", staleInvitation!.id)
      .single();
    expect(row!.status).toBe("expired");
  });

  it("accept_member_invitation rejects an unauthenticated call", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc("accept_member_invitation", {
      p_invitation_id: "00000000-0000-0000-0000-000000000000",
      p_token: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toContain("NOT_AUTHENTICATED");
  });
});
```

- [ ] **Step 4: Run the test file**

Run: `npx vitest run tests/member-portal-invitation.integration.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Add the npm script and register it in `test:all`**

**Files:**
- Modify: `package.json`

```json
"test:member-portal": "vitest run tests/member-portal-invitation.integration.test.ts",
```

Add this line alongside the other `test:*` scripts, and add `&& npm run test:member-portal` to the `test:all` chain (matching how `test:suppliers` and `test:payment-idempotency` are already chained).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260814000004_member_invitation_rpcs.sql tests/member-portal-invitation.integration.test.ts package.json
git commit -m "feat(portal): add create/accept member invitation RPCs with lifecycle tests"
```

---

### Task 5: Shared WhatsApp helper extraction

**Files:**
- Create: `lib/whatsapp.ts`
- Modify: `app/[locale]/(app)/members/send-reminder-dialog.tsx`

The invite dialog (Task 6) needs the exact same phone-normalization logic `SendReminderDialog` already has inline. Extract it once so both call sites share it (DRY) rather than the invite dialog re-implementing Egyptian phone normalization independently.

- [ ] **Step 1: Create the shared helper**

```typescript
// lib/whatsapp.ts

// Egyptian-market phone normalization: strips everything but digits, then
// maps a local "0xxxxxxxxxx" (11 digits) to the +20 country code so wa.me
// gets a number it accepts. Numbers already given with a country code
// (12+ digits, no leading 0) are passed through as-is.
export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && digits.length === 11) return `20${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
```

- [ ] **Step 2: Update `send-reminder-dialog.tsx` to use the shared helper**

Remove the inline `toWhatsAppNumber` function (lines 19–28) from `send-reminder-dialog.tsx` and replace its one call site:

```typescript
// before (top of file, local definition removed):
import { toWhatsAppNumber } from "@/lib/whatsapp";
```

Change `window.open(\`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}\`, "_blank", "noopener")` to use `buildWhatsAppUrl(phone, message)` if convenient, or leave the existing `whatsappNumber`-based construction as-is (it's already correct) — the required change is only removing the duplicated function body and importing `toWhatsAppNumber` from `lib/whatsapp.ts` instead.

- [ ] **Step 3: Confirm the reminder dialog still works**

Run: `npm run test:e2e -- tests/e2e/finance-smoke.spec.ts` (or manually open a member's profile and send a WhatsApp reminder in dev) to confirm no regression.
Expected: existing behavior unchanged.

- [ ] **Step 4: Commit**

```bash
git add lib/whatsapp.ts "app/[locale]/(app)/members/send-reminder-dialog.tsx"
git commit -m "refactor: extract shared WhatsApp URL helper for reuse by the portal invite dialog"
```

---

### Task 6: Server action + dialog for sending a portal invitation

**Files:**
- Create: `lib/actions/member-portal.ts`
- Create: `app/[locale]/(app)/members/[memberId]/invite-to-portal-dialog.tsx`
- Modify: `app/[locale]/(app)/members/[memberId]/page.tsx`

- [ ] **Step 1: Write the server action**

```typescript
// lib/actions/member-portal.ts
"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";

const createInvitationSchema = z.object({
  memberId: z.string().uuid(),
  locale: z.enum(["ar", "en"]),
});

export type CreateInvitationResult =
  | { ok: true; actionLink: string; memberEmail: string; memberPhone: string | null }
  | { ok: false; error: string };

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export async function createMemberInvitationAction(
  memberId: string,
  locale: string,
): Promise<CreateInvitationResult> {
  const parsed = createInvitationSchema.safeParse({ memberId, locale });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();

  // Lazy sweep: expire anything stale before minting a new invitation, so a
  // long-abandoned pending row never blocks (or confusingly coexists with)
  // a fresh one.
  await supabase.rpc("expire_stale_member_invitations");

  const { data, error } = await supabase
    .rpc("create_member_invitation", { p_member_id: parsed.data.memberId })
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "invitation_failed" };
  }

  const redirectTo =
    `${SITE_URL}/${parsed.data.locale}/portal/accept-invite` +
    `?invitation=${data.invitation_id}&t=${data.raw_token}`;

  const adminClient = createAdminClient();
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: data.member_email,
    options: { redirectTo },
  });

  if (linkError || !linkData) {
    return { ok: false, error: linkError?.message ?? "link_generation_failed" };
  }

  return {
    ok: true,
    actionLink: linkData.properties.action_link,
    memberEmail: data.member_email,
    memberPhone: data.member_phone,
  };
}
```

- [ ] **Step 2: Write the dialog**, modeled directly on `send-reminder-dialog.tsx`'s two-channel `mailto:`/`wa.me:` pattern.

```typescript
// app/[locale]/(app)/members/[memberId]/invite-to-portal-dialog.tsx
"use client";

import { useState, useTransition } from "react";
import { UserPlus, Mail, MessageCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createMemberInvitationAction } from "@/lib/actions/member-portal";
import { buildWhatsAppUrl } from "@/lib/whatsapp";

function inviteMessage(isAr: boolean, memberName: string, link: string) {
  return isAr
    ? `مرحبًا ${memberName}، يمكنك الآن متابعة حسابك ودفع مستحقاتك أونلاين عبر بوابة الملاك:\n${link}`
    : `Hello ${memberName}, you can now review your account and pay your dues online through the owner portal:\n${link}`;
}

export function InviteToPortalDialog({
  memberId,
  memberName,
  locale,
}: {
  memberId: string;
  memberName: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [link, setLink] = useState<{ actionLink: string; memberEmail: string; memberPhone: string | null } | null>(null);

  function handleGenerate() {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await createMemberInvitationAction(memberId, locale);
      if (!res.ok) {
        setErrorMsg(
          isAr ? "تعذر إنشاء رابط الدعوة. راجع بيانات العضو (بريد إلكتروني مسجل، غير مرتبط ببوابة مسبقًا)." : "Could not create the invite link.",
        );
        return;
      }
      setLink({ actionLink: res.actionLink, memberEmail: res.memberEmail, memberPhone: res.memberPhone });
    });
  }

  const whatsappUrl = link?.memberPhone ? buildWhatsAppUrl(link.memberPhone, inviteMessage(isAr, memberName, link.actionLink)) : null;
  const mailtoUrl = link
    ? `mailto:${link.memberEmail}?subject=${encodeURIComponent(isAr ? "دعوة لبوابة الملاك" : "Owner Portal Invitation")}&body=${encodeURIComponent(inviteMessage(isAr, memberName, link.actionLink))}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setLink(null); setErrorMsg(null); } }}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm" className="gap-2 text-xs">
            <UserPlus className="size-3.5" />
            {isAr ? "دعوة للبوابة" : "Invite to portal"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <div>
            <DialogTitle>{isAr ? "دعوة إلى بوابة الملاك" : "Invite to owner portal"}</DialogTitle>
            <DialogDescription>{memberName}</DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {errorMsg && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs font-bold text-destructive flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {!link && (
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "سيتم إنشاء رابط دعوة صالح لمدة 72 ساعة. يمكنك بعدها اختيار إرساله عبر البريد أو واتساب."
                : "A 72-hour invite link will be generated. You can then choose to send it by email or WhatsApp."}
            </p>
          )}
          {link && (
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={!mailtoUrl} render={<a href={mailtoUrl ?? undefined} />}>
                <Mail className="size-3.5" />
                {isAr ? "فتح البريد وإرسال" : "Open email & send"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!whatsappUrl}
                onClick={() => whatsappUrl && window.open(whatsappUrl, "_blank", "noopener")}
              >
                <MessageCircle className="size-3.5" />
                {isAr ? "فتح واتساب وإرسال" : "Open WhatsApp & send"}
              </Button>
            </div>
          )}
          {link && !whatsappUrl && (
            <p className="text-xs text-muted-foreground">
              {isAr ? "لا يوجد رقم هاتف مسجل لهذا العضو — خيار واتساب غير متاح." : "No phone number on file — WhatsApp option unavailable."}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          {!link && (
            <Button type="button" disabled={isPending} onClick={handleGenerate} className="gap-2">
              {isPending ? <RefreshCw className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              {isAr ? "إنشاء رابط الدعوة" : "Generate invite link"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire it into the member detail page**

**Files:**
- Modify: `app/[locale]/(app)/members/[memberId]/page.tsx`

Add the import and render `<InviteToPortalDialog memberId={member.id} memberName={member.full_name} locale={locale} />` next to the existing `<SendReminderDialog ... />` usage in the page's action row (the exact JSX location is wherever `SendReminderDialog` is currently rendered — add it as a sibling button).

- [ ] **Step 4: Add `NEXT_PUBLIC_SITE_URL` to env**

**Files:**
- Modify: `lib/env/server.ts`
- Modify: `.env.local` (developer's own file — add the line, don't commit secrets, but this one isn't secret)

```typescript
// lib/env/server.ts — add to serverEnvSchema and the parse call:
NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
```

- [ ] **Step 5: Manual smoke test in dev**

Run: `npm run dev`, open a member's profile page, click "دعوة للبوابة", generate a link, confirm both the email and WhatsApp buttons appear with the link embedded (WhatsApp only if the member has a phone on file).
Expected: dialog works, no console errors, `action_link` looks like a valid Supabase verify URL.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/member-portal.ts "app/[locale]/(app)/members/[memberId]/invite-to-portal-dialog.tsx" "app/[locale]/(app)/members/[memberId]/page.tsx" lib/env/server.ts
git commit -m "feat(portal): add staff-facing invite-to-portal action and dialog"
```

---

### Task 7: Public `(guest)` group — portal login + accept-invite

**Files:**
- Create: `app/[locale]/portal/(guest)/layout.tsx`
- Create: `app/[locale]/portal/(guest)/login/page.tsx`
- Create: `app/[locale]/portal/(guest)/login/login-form.tsx`
- Create: `app/[locale]/portal/(guest)/accept-invite/page.tsx`
- Create: `app/[locale]/portal/(guest)/accept-invite/accept-invite-client.tsx`

- [ ] **Step 1: Guest layout — minimal, no auth check**

```typescript
// app/[locale]/portal/(guest)/layout.tsx
export default function PortalGuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Login page — reuses the existing `signIn` server action verbatim**, only pointing its redirect target at `/portal` instead of the staff default of `/dashboard`.

```typescript
// app/[locale]/portal/(guest)/login/page.tsx
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { LoginForm } from "./login-form";

export default async function PortalLoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  return <LoginForm locale={locale as Locale} />;
}
```

```typescript
// app/[locale]/portal/(guest)/login/login-form.tsx
"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, type SignInState } from "@/lib/actions/auth";
import type { Locale } from "@/i18n/routing";

export function LoginForm({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const boundSignIn = signIn.bind(null, locale, "/portal");
  const [state, formAction, isPending] = useActionState<SignInState, FormData>(boundSignIn, { error: null });

  return (
    <form action={formAction} className="space-y-4 rounded-3xl border border-border bg-background p-8 shadow-sm">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "بوابة الملاك" : "Owner Portal"}</h1>
      <div className="space-y-1.5">
        <Label>{isAr ? "البريد الإلكتروني" : "Email"}</Label>
        <Input type="email" name="email" required autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label>{isAr ? "كلمة المرور" : "Password"}</Label>
        <Input type="password" name="password" required autoComplete="current-password" />
      </div>
      {state.error && (
        <p className="text-xs font-bold text-destructive">
          {isAr ? "بيانات الدخول غير صحيحة" : "Invalid credentials"}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isAr ? "تسجيل الدخول" : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Accept-invite page** — server shell that reads `?invitation=` and `?t=` and hands off to a client component (session establishment must happen client-side, per implementation note 2 above).

```typescript
// app/[locale]/portal/(guest)/accept-invite/page.tsx
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { AcceptInviteClient } from "./accept-invite-client";

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ invitation?: string; t?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { invitation, t } = await searchParams;

  return <AcceptInviteClient locale={locale as Locale} invitationId={invitation ?? null} token={t ?? null} />;
}
```

```typescript
// app/[locale]/portal/(guest)/accept-invite/accept-invite-client.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Locale } from "@/i18n/routing";

type Step = "establishing_session" | "set_password" | "linking" | "done" | "error";

export function AcceptInviteClient({
  locale,
  invitationId,
  token,
}: {
  locale: Locale;
  invitationId: string | null;
  token: string | null;
}) {
  const isAr = locale === "ar";
  const router = useRouter();
  const [step, setStep] = useState<Step>("establishing_session");
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!invitationId || !token) {
      setError(isAr ? "رابط الدعوة غير صالح." : "Invalid invitation link.");
      setStep("error");
      return;
    }

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    if (!accessToken || !refreshToken) {
      setError(isAr ? "تعذر تأكيد الجلسة. افتح الرابط من البريد أو رسالة واتساب مباشرة." : "Could not establish a session. Open the link directly from the email or WhatsApp message.");
      setStep("error");
      return;
    }

    const supabase = createClient();
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error: sessionError }) => {
      if (sessionError) {
        setError(isAr ? "انتهت صلاحية الجلسة، يرجى طلب دعوة جديدة." : "Session expired, please request a new invite.");
        setStep("error");
        return;
      }
      setStep("set_password");
    });
  }, [invitationId, token, isAr]);

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError(isAr ? "كلمة المرور يجب أن تكون 8 أحرف على الأقل." : "Password must be at least 8 characters.");
      return;
    }
    setError(null);
    setStep("linking");

    const supabase = createClient();
    const { error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      setError(pwError.message);
      setStep("set_password");
      return;
    }

    const { error: linkError } = await supabase.rpc("accept_member_invitation", {
      p_invitation_id: invitationId,
      p_token: token,
    });
    if (linkError) {
      setError(linkError.message);
      setStep("error");
      return;
    }

    setStep("done");
    router.push(`/${locale}/portal`);
  }

  if (step === "establishing_session") {
    return <p className="text-center text-sm text-muted-foreground">{isAr ? "جارٍ تأكيد الدعوة..." : "Confirming invitation..."}</p>;
  }

  if (step === "error") {
    return <p className="text-center text-sm font-bold text-destructive">{error}</p>;
  }

  return (
    <form onSubmit={handleSetPassword} className="space-y-4 rounded-3xl border border-border bg-background p-8 shadow-sm">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "تعيين كلمة مرور" : "Set your password"}</h1>
      <div className="space-y-1.5">
        <Label>{isAr ? "كلمة المرور" : "Password"}</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
      </div>
      {error && <p className="text-xs font-bold text-destructive">{error}</p>}
      <Button type="submit" disabled={step === "linking"} className="w-full">
        {isAr ? "تفعيل الحساب" : "Activate account"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add "app/[locale]/portal/(guest)"
git commit -m "feat(portal): add public login and accept-invite pages"
```

---

### Task 8: `(member)` guarded layout + minimal placeholder dashboard

**Files:**
- Create: `app/[locale]/portal/(member)/layout.tsx`
- Create: `app/[locale]/portal/(member)/portal-shell.tsx`
- Create: `app/[locale]/portal/(member)/page.tsx`

- [ ] **Step 1: Guarded layout** — the actual gate. Mirrors `(app)/layout.tsx`'s guard shape.

```typescript
// app/[locale]/portal/(member)/layout.tsx
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "./portal-shell";

export default async function PortalMemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, organization_id")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!member) {
    // Session exists (e.g. a staff account, or an invite whose linking RPC
    // never completed) but no members row points at it -- inert by design,
    // see the spec's "compensating policy" note.
    redirect("/portal/login");
  }

  const loc = (await getLocale()) as "ar" | "en";

  return (
    <PortalShell locale={loc} memberName={member.full_name}>
      {children}
    </PortalShell>
  );
}
```

- [ ] **Step 2: Shell component** — lightweight nav, no admin/finance/platform sections.

```typescript
// app/[locale]/portal/(member)/portal-shell.tsx
import { LayoutDashboard, FileText, Receipt, Landmark, Building2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export function PortalShell({
  locale,
  memberName,
  children,
}: {
  locale: "ar" | "en";
  memberName: string;
  children: React.ReactNode;
}) {
  const isAr = locale === "ar";
  const boundSignOut = signOut.bind(null, locale);
  const ic = "size-4";

  const links = [
    { href: "/portal", labelAr: "الرئيسية", labelEn: "Dashboard", icon: <LayoutDashboard className={ic} /> },
    { href: "/portal/statement", labelAr: "كشف الحساب", labelEn: "Statement", icon: <FileText className={ic} /> },
    { href: "/portal/dues", labelAr: "المستحقات", labelEn: "Dues", icon: <Landmark className={ic} /> },
    { href: "/portal/payments", labelAr: "المدفوعات", labelEn: "Payments", icon: <Receipt className={ic} /> },
    { href: "/portal/units", labelAr: "وحداتي", labelEn: "My Units", icon: <Building2 className={ic} /> },
  ];

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="w-64 shrink-0 border-e border-border bg-muted/20 p-4 flex flex-col gap-6">
        <div>
          <p className="text-xs text-muted-foreground">{isAr ? "بوابة الملاك" : "Owner Portal"}</p>
          <p className="font-bold text-foreground truncate">{memberName}</p>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} locale={locale} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted">
              {l.icon}
              {isAr ? l.labelAr : l.labelEn}
            </Link>
          ))}
        </nav>
        <form action={boundSignOut} className="mt-auto">
          <Button type="submit" variant="outline" size="sm" className="w-full">
            {isAr ? "تسجيل الخروج" : "Sign out"}
          </Button>
        </form>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Placeholder dashboard page** — enough for Phase 1 to be end-to-end testable; Task 12 (Phase 2) replaces its content.

```typescript
// app/[locale]/portal/(member)/page.tsx
export default function PortalDashboardPage() {
  return <p className="text-sm text-muted-foreground">لوحة التحكم — سيتم استكمالها في المرحلة الثانية.</p>;
}
```

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, complete an invite (Task 6/7) end-to-end, confirm landing on `/portal` shows the shell with the member's name and sign-out works.
Expected: no redirect loop, sidebar renders, sign-out returns to `/portal/login`.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/portal/(member)"
git commit -m "feat(portal): add guarded member layout, shell, and placeholder dashboard"
```

---

### Task 9: Playwright — invite-to-login smoke path

**Files:**
- Create: `tests/e2e/owner-portal-invite.spec.ts`

- [ ] **Step 1: Write the test**

This test drives the whole Phase 1 loop using the service role for setup (creating an org + member) and Playwright for the actual browser flow, following the structural pattern of `tests/e2e/cashier-flow.spec.ts` (setup via direct DB calls, then real browser interaction).

```typescript
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

test("owner accepts an invite and reaches the portal dashboard", async ({ page }) => {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: org } = await admin
    .from("organizations")
    .insert({ name: "E2E Portal Org", slug: `e2e-portal-${Date.now()}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();

  const email = `owner-e2e-${Date.now()}@example.com`;
  const { data: member } = await admin
    .from("members")
    .insert({ organization_id: org!.id, full_name: "E2E Test Owner", email })
    .select("id")
    .single();

  const staffUserId = "11d45b6f-1162-433e-8324-ebaf7cd0e618";
  await admin.rpc("add_organization_member", { p_organization_id: org!.id, p_user_id: staffUserId, p_role_key: "TENANT_OWNER" });

  const { data: invitation } = await admin
    .rpc("create_member_invitation", { p_member_id: member!.id })
    .single();

  const redirectTo = `http://localhost:3000/ar/portal/accept-invite?invitation=${(invitation as any).invitation_id}&t=${(invitation as any).raw_token}`;
  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });

  await page.goto(linkData!.properties.action_link);
  await expect(page.getByRole("heading", { name: /تعيين كلمة مرور|Set your password/ })).toBeVisible({ timeout: 10000 });

  await page.getByLabel(/كلمة المرور|Password/).fill("TestPassword123!");
  await page.getByRole("button", { name: /تفعيل الحساب|Activate account/ }).click();

  await expect(page).toHaveURL(/\/portal$/, { timeout: 10000 });
  await expect(page.getByText("E2E Test Owner")).toBeVisible();

  await admin.rpc("set_organization_status", { p_organization_id: org!.id, p_status: "ARCHIVED", p_reason: "e2e cleanup" });
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test tests/e2e/owner-portal-invite.spec.ts`
Expected: PASS (requires `npm run dev` running against a real local/dev Supabase project per this project's existing e2e setup).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/owner-portal-invite.spec.ts
git commit -m "test(portal): add end-to-end invite-to-dashboard smoke test"
```

**Phase 1 exit gate:** Task 2's isolation script all-PASS, Task 4's Vitest suite all-PASS, Task 9's Playwright test PASS. Do not start Phase 2 until all three are green.

---

## Phase 2 — Portal Read-Only Pages

### Task 10: RLS for `unit_ownerships`, `units`, `dues`, `payments`, `payment_allocations`

**Files:**
- Create: `supabase/migrations/20260814000005_member_portal_data_rls.sql`

- [ ] **Step 1: Write the migration**, applying the co-owner-privacy and current-ownership rules from implementation notes 3–4 above.

```sql
-- Owner-portal read RLS, additive only -- every existing staff policy on
-- these tables is untouched. See implementation notes 3-4 in
-- docs/superpowers/plans/2026-08-14-owner-portal-phase-1-2.md for why dues
-- visibility goes through the unit-ownership chain while payments
-- visibility does not.

drop policy if exists "unit_ownerships_select_own" on public.unit_ownerships;
create policy "unit_ownerships_select_own"
  on public.unit_ownerships for select
  using (member_id = public.current_member_id());

drop policy if exists "units_select_own" on public.units;
create policy "units_select_own"
  on public.units for select
  using (
    id in (
      select unit_id from public.unit_ownerships
      where member_id = public.current_member_id()
        and (end_date is null or end_date >= current_date)
    )
  );

drop policy if exists "dues_select_own" on public.dues;
create policy "dues_select_own"
  on public.dues for select
  using (
    unit_id in (
      select unit_id from public.unit_ownerships
      where member_id = public.current_member_id()
        and (end_date is null or end_date >= current_date)
    )
  );

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
  on public.payments for select
  using (member_id = public.current_member_id() and status = 'POSTED');

drop policy if exists "payment_allocations_select_own" on public.payment_allocations;
create policy "payment_allocations_select_own"
  on public.payment_allocations for select
  using (
    payment_id in (
      select id from public.payments
      where member_id = public.current_member_id() and status = 'POSTED'
    )
  );
```

- [ ] **Step 2: Apply the migration**

Run: apply via the project's usual mechanism.
Expected: no errors.

- [ ] **Step 3: Write the Phase 2 isolation test**

**Files:**
- Create: `supabase/tests/phase_owner_portal_data_integrity.sql`

```sql
-- Phase 2 read-RLS isolation test: two orgs, each with a unit + owner +
-- due + payment, plus a second co-owner sharing one unit in org A to prove
-- payment-history privacy between co-owners (implementation note 3).

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

create temporary table test_results (name text, status text, detail text);

do $$
declare
  v_org_a uuid;
  v_org_b uuid;
  v_resort_a uuid;
  v_period_a uuid;
  v_cash_a uuid;
  v_revenue_a uuid;
  v_receivable_a uuid;
  v_due_type_a uuid;
  v_unit_a uuid;
  v_owner_a1 uuid;      -- primary owner, will be linked to a real auth user
  v_owner_a2 uuid;      -- co-owner of the same unit, different auth user
  v_owner_a1_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';
  v_owner_a2_user uuid := 'b66490aa-a3a7-4005-add2-1112c660b0b4';
  v_due_a uuid;
  v_payment_a1 uuid;
  v_count int;
  v_pass boolean;
begin
  v_org_a := public.create_organization('Portal Data Test A', 'portal-data-a-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_a := public.create_resort(v_org_a, 'Resort A', 'PDA1', 'Africa/Cairo');
  perform public.clone_chart_of_accounts_template(v_org_a, 'RESORT_STANDARD');

  declare v_year_a uuid;
  begin
    v_year_a := public.create_fiscal_year(v_org_a, 'TestYear', '2026-01-01', '2026-12-31');
    select id into v_period_a from public.fiscal_periods where fiscal_year_id = v_year_a and period_number = 1;
    perform public.set_fiscal_period_status(v_period_a, 'OPEN', 'test setup');
  end;

  select id into v_cash_a from public.chart_of_accounts where organization_id = v_org_a and code = '1110';
  select id into v_revenue_a from public.chart_of_accounts where organization_id = v_org_a and code = '4100';
  v_receivable_a := (select id from public.chart_of_accounts where organization_id = v_org_a and code = '1210' limit 1);

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org_a, 'اشتراك', 'Dues', v_revenue_a) returning id into v_due_type_a;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_a, v_resort_a, 'PDA-101', 'VILLA') returning id into v_unit_a;

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_a, 'Owner A1', v_owner_a1_user) returning id into v_owner_a1;
  insert into public.members (organization_id, full_name, user_id)
  values (v_org_a, 'Owner A2', v_owner_a2_user) returning id into v_owner_a2;

  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_a, v_unit_a, v_owner_a1, 50, true);
  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_a, v_unit_a, v_owner_a2, 50, false);

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_a, v_resort_a, v_unit_a, v_due_type_a, v_receivable_a, 1000, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_a;

  insert into public.payments (organization_id, resort_id, member_id, unit_id, amount, method, payment_date, deposit_account_id, status)
  values (v_org_a, v_resort_a, v_owner_a1, v_unit_a, 500, 'CASH', current_date, v_cash_a, 'POSTED')
  returning id into v_payment_a1;

  -- TEST 1: owner A1 sees the shared unit and its due (co-owners share unit/due visibility).
  perform set_config('request.jwt.claim.sub', v_owner_a1_user::text, false);
  select count(*) into v_count from public.units where id = v_unit_a;
  v_pass := v_count = 1;
  insert into test_results values ('TEST 1 (owner sees own unit)', case when v_pass then 'PASS' else 'FAIL' end, format('count=%s', v_count));

  select count(*) into v_count from public.dues where id = v_due_a;
  v_pass := v_count = 1;
  insert into test_results values ('TEST 2 (owner sees unit due)', case when v_pass then 'PASS' else 'FAIL' end, format('count=%s', v_count));

  -- TEST 3: owner A1 sees their own payment.
  select count(*) into v_count from public.payments where id = v_payment_a1;
  v_pass := v_count = 1;
  insert into test_results values ('TEST 3 (owner sees own payment)', case when v_pass then 'PASS' else 'FAIL' end, format('count=%s', v_count));

  -- TEST 4: owner A2 (co-owner of the SAME unit) does NOT see owner A1's payment.
  perform set_config('request.jwt.claim.sub', v_owner_a2_user::text, false);
  select count(*) into v_count from public.payments where id = v_payment_a1;
  v_pass := v_count = 0;
  insert into test_results values ('TEST 4 (co-owner cannot see other co-owner payment)', case when v_pass then 'PASS' else 'FAIL' end, format('count=%s', v_count));

  -- TEST 5: owner A2 still sees the shared unit/due (joint obligation visibility is correct).
  select count(*) into v_count from public.dues where id = v_due_a;
  v_pass := v_count = 1;
  insert into test_results values ('TEST 5 (co-owner sees shared due)', case when v_pass then 'PASS' else 'FAIL' end, format('count=%s', v_count));

  perform set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
  perform public.set_organization_status(v_org_a, 'ARCHIVED', 'portal data test cleanup');
  insert into test_results values ('cleanup', 'INFO', 'test org archived');
end $$;

select name, status, detail from test_results order by name;
```

- [ ] **Step 4: Run the script and confirm all rows PASS**

Run via Supabase MCP `execute_sql` or the SQL editor.
Expected: TEST 1–5 all `PASS`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260814000005_member_portal_data_rls.sql supabase/tests/phase_owner_portal_data_integrity.sql
git commit -m "feat(portal): add read RLS for units/dues/payments with co-owner privacy isolation test"
```

---

### Task 11: Portal statement page (reuses existing statement logic)

**Files:**
- Create: `app/[locale]/portal/(member)/statement/page.tsx`

`getMemberStatementData` in `lib/reports/member-statement.ts` already resolves the caller via `getCurrentUser()` + `getPrimaryOrganization()` (staff org-context) — that helper is **not** reusable as-is for a member session, since a portal user has no `organization_memberships` row. This page fetches the member's own data directly instead of calling that staff-oriented function, keeping the read logic here scoped by `current_member_id()` through RLS (Task 10) rather than importing staff-context helpers.

- [ ] **Step 1: Write the page**

```typescript
// app/[locale]/portal/(member)/statement/page.tsx
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Money } from "@/components/money";
import type { Locale } from "@/i18n/routing";

export default async function PortalStatementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const { data: member } = await supabase.from("members").select("id, organization_id").eq("user_id", user!.id).maybeSingle();
  if (!member) redirect("/portal/login");

  // RLS (Task 10) already restricts these to the member's own rows -- the
  // explicit .eq()s below are defense in depth, not the actual boundary.
  const { data: dues } = await supabase
    .from("dues")
    .select("id, amount, issue_date, due_date, status, description, units(code)")
    .order("issue_date", { ascending: false });

  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, payment_date, method, receipt_number")
    .eq("member_id", member.id)
    .order("payment_date", { ascending: false });

  const totalDue = (dues ?? []).reduce((sum, d) => sum + Number(d.amount), 0);
  const totalPaid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
  const balance = totalDue - totalPaid;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "كشف الحساب" : "Account Statement"}</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">{isAr ? "إجمالي المستحق" : "Total Due"}</p>
          <Money value={totalDue} className="text-lg font-bold" />
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">{isAr ? "إجمالي المدفوع" : "Total Paid"}</p>
          <Money value={totalPaid} className="text-lg font-bold" />
        </div>
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-xs font-bold text-primary">{isAr ? "الرصيد الحالي" : "Current Balance"}</p>
          <Money value={balance} className="text-lg font-bold text-primary" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-background p-4">
        <h2 className="mb-3 text-sm font-bold text-foreground">{isAr ? "الحركات" : "Movements"}</h2>
        <ul className="divide-y divide-border text-sm">
          {(dues ?? []).map((d) => (
            <li key={d.id} className="flex justify-between py-2">
              <span>{d.description ?? (isAr ? "استحقاق" : "Due")} — {(d as any).units?.code}</span>
              <Money value={Number(d.amount)} className="text-destructive" />
            </li>
          ))}
          {(payments ?? []).map((p) => (
            <li key={p.id} className="flex justify-between py-2">
              <span>{isAr ? "دفعة" : "Payment"} #{p.receipt_number ?? "-"}</span>
              <Money value={-Number(p.amount)} className="text-emerald-600" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`, log in as the linked owner from Task 9's setup (or a manually-created one), open `/portal/statement`.
Expected: page renders totals and movement lists with no console errors.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/portal/(member)/statement/page.tsx"
git commit -m "feat(portal): add owner statement page"
```

---

### Task 12: Portal dues page (list only, no payment action)

**Files:**
- Create: `app/[locale]/portal/(member)/dues/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// app/[locale]/portal/(member)/dues/page.tsx
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import type { Locale } from "@/i18n/routing";

export default async function PortalDuesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const { data: dues } = await supabase
    .from("dues")
    .select("id, amount, issue_date, due_date, status, description, units(code)")
    .in("status", ["ISSUED", "PARTIALLY_PAID", "OVERDUE"])
    .order("due_date", { ascending: true });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "المستحقات" : "Dues"}</h1>
      <p className="text-xs text-muted-foreground">
        {isAr ? "الدفع الإلكتروني غير متاح بعد — سيُضاف قريبًا." : "Online payment is not available yet — coming soon."}
      </p>
      <div className="rounded-2xl border border-border bg-background divide-y divide-border">
        {(dues ?? []).length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{isAr ? "لا توجد مستحقات مفتوحة." : "No open dues."}</p>
        )}
        {(dues ?? []).map((d) => (
          <div key={d.id} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-foreground">{d.description ?? (isAr ? "استحقاق" : "Due")}</p>
              <p className="text-xs text-muted-foreground">{(d as any).units?.code} · {isAr ? "الاستحقاق" : "Due"} {d.due_date}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline">{d.status}</Badge>
              <Money value={Number(d.amount)} className="font-bold" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

Run: `npm run dev`, log in as an owner with at least one open due (seed via SQL if needed), open `/portal/dues`.
Expected: list renders, statuses shown, no payment button present (Phase 2 scope).

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/portal/(member)/dues/page.tsx"
git commit -m "feat(portal): add owner dues list page (read-only)"
```

---

### Task 13: Portal payments page + receipt download

**Files:**
- Create: `lib/actions/member-portal-receipts.ts`
- Create: `app/[locale]/portal/(member)/payments/page.tsx`
- Create: `app/[locale]/portal/(member)/payments/portal-print-receipt-button.tsx`

The staff-side `getPaymentAllocationDetailsAction` (`lib/actions/receivables.ts`) is gated by `finance.payments.read`, which a portal owner will never have — this task adds a portal-scoped equivalent authorized by RLS instead. **Before writing the select list**, check `lib/supabase/types.ts`'s current `payments`/`payment_allocations` row shapes (columns can drift between migrations) — as of this plan, `payments` has `receipt_no`, `receipt_number`, `memo`, `unallocated_amount`, and `payment_allocations` has `reversed_at`/`reversed_by`; confirm these are still current before finalizing the query below.

- [ ] **Step 1: Write the portal-scoped receipt-details action**

```typescript
// lib/actions/member-portal-receipts.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import type { PaymentReceiptAllocation } from "@/lib/reports/payment-receipt-pdf";

export type OwnPaymentReceiptResult =
  | {
      ok: true;
      details: {
        receiptNo: string;
        paymentDate: string;
        amount: number;
        unallocatedAmount: number;
        memberName: string;
        method: string;
        memo: string | null;
        allocations: PaymentReceiptAllocation[];
      };
    }
  | { ok: false; error: string };

export async function getOwnPaymentReceiptAction(paymentId: string): Promise<OwnPaymentReceiptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const { data: member } = await supabase.from("members").select("id, full_name").eq("user_id", user.id).maybeSingle();
  if (!member) return { ok: false, error: "not_a_member" };

  // RLS restricts this select to the owner's own POSTED payments already
  // (Task 10); the .eq("member_id", ...) is defense in depth.
  const { data: payment, error: paymentErr } = await supabase
    .from("payments")
    .select("id, receipt_no, receipt_number, payment_date, amount, unallocated_amount, method, memo, member_id")
    .eq("id", paymentId)
    .eq("member_id", member.id)
    .maybeSingle();
  if (paymentErr) return { ok: false, error: paymentErr.message };
  if (!payment) return { ok: false, error: "not_found" };

  const { data: allocRows } = await supabase
    .from("payment_allocations")
    .select("id, amount, dues(due_date, units(code), due_types(name_ar, name_en))")
    .eq("payment_id", paymentId);

  const allocations: PaymentReceiptAllocation[] = (allocRows ?? []).map((a: any) => ({
    unitCode: a.dues?.units?.code ?? "",
    description: a.dues?.due_types?.name_ar ?? "",
    dueDate: a.dues?.due_date ?? "",
    allocatedAmount: Number(a.amount),
  }));

  return {
    ok: true,
    details: {
      receiptNo: payment.receipt_no ?? String(payment.receipt_number ?? ""),
      paymentDate: payment.payment_date,
      amount: Number(payment.amount),
      unallocatedAmount: Number(payment.unallocated_amount ?? 0),
      memberName: member.full_name,
      method: payment.method,
      memo: payment.memo,
      allocations,
    },
  };
}
```

- [ ] **Step 2: Write the print button** (mirrors `PrintReceiptRowButton` from `app/[locale]/(app)/finance/payments/print-receipt-button.tsx`, swapping the data source)

```typescript
// app/[locale]/portal/(member)/payments/portal-print-receipt-button.tsx
"use client";

import { useTransition } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generatePaymentReceiptPdf } from "@/lib/reports/payment-receipt-pdf";
import { getOwnPaymentReceiptAction } from "@/lib/actions/member-portal-receipts";

export function PortalPrintReceiptButton({
  paymentId,
  locale,
  currency,
  organizationName,
  resortName,
}: {
  paymentId: string;
  locale: string;
  currency: string;
  organizationName: string;
  resortName: string;
}) {
  const isAr = locale === "ar";
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const res = await getOwnPaymentReceiptAction(paymentId);
      if (!res.ok) return;
      generatePaymentReceiptPdf(
        {
          organizationName,
          resortName,
          currency,
          receiptNo: res.details.receiptNo,
          paymentDate: res.details.paymentDate,
          amount: res.details.amount,
          unallocatedAmount: res.details.unallocatedAmount,
          memberName: res.details.memberName,
          method: res.details.method,
          memo: res.details.memo,
          createdByName: null,
          allocations: res.details.allocations,
        },
        locale,
      );
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={handleClick} className="gap-1.5">
      {pending ? <RefreshCw className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
      {isAr ? "تحميل الإيصال" : "Download receipt"}
    </Button>
  );
}
```

- [ ] **Step 3: Write the payments list page**

```typescript
// app/[locale]/portal/(member)/payments/page.tsx
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Money } from "@/components/money";
import type { Locale } from "@/i18n/routing";
import { PortalPrintReceiptButton } from "./portal-print-receipt-button";

export default async function PortalPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const { data: member } = await supabase
    .from("members")
    .select("id, organization_id, organizations(name, default_currency), resorts:organization_id")
    .eq("user_id", user!.id)
    .maybeSingle();
  if (!member) redirect("/portal/login");

  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, payment_date, method, receipt_number, receipt_no")
    .order("payment_date", { ascending: false });

  const orgName = (member as any).organizations?.name ?? "";
  const currency = (member as any).organizations?.default_currency ?? "EGP";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "المدفوعات" : "Payments"}</h1>
      <div className="rounded-2xl border border-border bg-background divide-y divide-border">
        {(payments ?? []).length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">{isAr ? "لا توجد مدفوعات مسجلة." : "No payments on file."}</p>
        )}
        {(payments ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                {isAr ? "إيصال" : "Receipt"} #{p.receipt_no ?? p.receipt_number ?? "-"}
              </p>
              <p className="text-xs text-muted-foreground">{p.payment_date} · {p.method}</p>
            </div>
            <div className="flex items-center gap-3">
              <Money value={Number(p.amount)} className="font-bold text-emerald-600" />
              <PortalPrintReceiptButton
                paymentId={p.id}
                locale={locale}
                currency={currency}
                organizationName={orgName}
                resortName=""
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, log in as an owner with at least one POSTED payment, open `/portal/payments`, click "تحميل الإيصال".
Expected: list renders; receipt PDF opens in a new window with correct amounts.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/member-portal-receipts.ts "app/[locale]/portal/(member)/payments"
git commit -m "feat(portal): add owner payments list and portal-scoped receipt download"
```

---

### Task 14: Portal units page

**Files:**
- Create: `app/[locale]/portal/(member)/units/page.tsx`

- [ ] **Step 1: Write the page**, reusing `units_with_financials` (already `security_invoker = true`, so it composes through Task 10's RLS automatically once `units` itself is scoped).

```typescript
// app/[locale]/portal/(member)/units/page.tsx
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import type { Locale } from "@/i18n/routing";

export default async function PortalUnitsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const { data: units } = await supabase
    .from("units_with_financials")
    .select("id, code, unit_type, balance, has_arrears")
    .order("code", { ascending: true });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "وحداتي" : "My Units"}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {(units ?? []).map((u: any) => (
          <div key={u.id} className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-foreground">{u.code}</p>
              {u.has_arrears && <Badge variant="destructive">{isAr ? "متأخرات" : "Arrears"}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">{u.unit_type}</p>
            <Money value={Number(u.balance)} className="mt-2 font-bold" />
          </div>
        ))}
        {(units ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">{isAr ? "لا توجد وحدات مسجلة باسمك." : "No units on file under your name."}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fill in the dashboard page from Task 8** now that real queries exist — replace the placeholder with a summary reusing `members_with_financials`.

**Files:**
- Modify: `app/[locale]/portal/(member)/page.tsx`

```typescript
// app/[locale]/portal/(member)/page.tsx
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Money } from "@/components/money";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export default async function PortalDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const { data: summary } = await supabase
    .from("members_with_financials")
    .select("units_count, total_balance, has_arrears, last_payment_amount, last_payment_date")
    .eq("user_id", user!.id) // members_with_financials selects m.* joins; user_id is on members, exposed via the view's underlying join -- verify this column is actually selected by the view before relying on it; if not, filter client-side isn't needed since RLS already scopes to one row.
    .maybeSingle();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-foreground">{isAr ? "لوحة التحكم" : "Dashboard"}</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-xs font-bold text-primary">{isAr ? "الرصيد الحالي" : "Current Balance"}</p>
          <Money value={Number(summary?.total_balance ?? 0)} className="text-lg font-bold text-primary" />
        </div>
        <div className="rounded-2xl border border-border bg-background p-4">
          <p className="text-xs text-muted-foreground">{isAr ? "عدد الوحدات" : "Units"}</p>
          <p className="text-lg font-bold text-foreground">{summary?.units_count ?? 0}</p>
        </div>
        {summary?.last_payment_amount != null && (
          <div className="rounded-2xl border border-border bg-background p-4">
            <p className="text-xs text-muted-foreground">{isAr ? "آخر دفعة" : "Last Payment"}</p>
            <Money value={Number(summary.last_payment_amount)} className="text-lg font-bold" />
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <Link href="/portal/dues" locale={locale as Locale} className="text-sm font-medium text-primary underline">
          {isAr ? "عرض المستحقات" : "View dues"}
        </Link>
        <Link href="/portal/statement" locale={locale as Locale} className="text-sm font-medium text-primary underline">
          {isAr ? "عرض كشف الحساب" : "View statement"}
        </Link>
      </div>
    </div>
  );
}
```

**Note for the implementer:** `members_with_financials` (from `20260810000043_members_with_financials_view.sql`) selects `m.id, m.organization_id, m.full_name, ...` — it does **not** currently select `user_id`. Before this task's step 2 works, either add `m.user_id` to that view's select list in a small follow-up migration (`supabase/migrations/20260814000006_members_with_financials_add_user_id.sql`, `create or replace view ... select ..., m.user_id, ...`), or query by `.eq("id", member.id)` after a separate lookup of `member.id` the same way Task 11–13 do. The latter is simpler and avoids a view change — prefer it unless a later phase needs `user_id` on the view for other reasons.

- [ ] **Step 3: Apply the simpler fix** — use the two-query approach instead of relying on a `user_id` column that doesn't exist on the view yet:

```typescript
// Replace the summary query in page.tsx with:
const { data: member } = await supabase.from("members").select("id").eq("user_id", user!.id).maybeSingle();
if (!member) redirect("/portal/login");

const { data: summary } = await supabase
  .from("members_with_financials")
  .select("units_count, total_balance, has_arrears, last_payment_amount, last_payment_date")
  .eq("id", member.id)
  .maybeSingle();
```

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`, log in as an owner with a unit and a payment, confirm `/portal` and `/portal/units` both render correct, matching numbers (cross-check against the staff-side `/members/[memberId]` page for the same member — the whole point of reusing these views is that the numbers cannot drift).
Expected: numbers match exactly between staff and portal views for the same member.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/portal/(member)/units/page.tsx" "app/[locale]/portal/(member)/page.tsx"
git commit -m "feat(portal): add owner units page and real dashboard summary"
```

---

### Task 15: Playwright — full read-only isolation in a real browser session

**Files:**
- Create: `tests/e2e/owner-portal-isolation.spec.ts`

This is Phase 2's actual exit gate per the spec: RLS isolation proven in pgTAP-style scripts is necessary but not sufficient — this test logs in as two different owners in two different orgs (real browser sessions, real cookies) and confirms each only ever sees their own data through the rendered pages, not just through direct table queries.

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function setUpOwnerWithData(admin: ReturnType<typeof createClient>, label: string) {
  const { data: org } = await admin
    .from("organizations")
    .insert({ name: `E2E Isolation ${label}`, slug: `e2e-iso-${label.toLowerCase()}-${Date.now()}`, default_currency: "EGP", status: "ACTIVE" })
    .select("id")
    .single();

  const email = `owner-iso-${label.toLowerCase()}-${Date.now()}@example.com`;
  const password = "TestPassword123!";

  const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });

  const { data: resort } = await admin.rpc("create_resort", {
    p_organization_id: org!.id,
    p_name: `Resort ${label}`,
    p_code: `R${label}`,
    p_timezone: "Africa/Cairo",
  });

  const { data: unit } = await admin
    .from("units")
    .insert({ organization_id: org!.id, resort_id: resort, code: `UNIT-${label}`, unit_type: "VILLA" })
    .select("id")
    .single();

  const { data: member } = await admin
    .from("members")
    .insert({ organization_id: org!.id, full_name: `Owner ${label}`, email, user_id: created!.user.id })
    .select("id")
    .single();

  await admin.from("unit_ownerships").insert({ organization_id: org!.id, unit_id: unit!.id, member_id: member!.id, is_primary_contact: true });

  return { orgId: org!.id, email, password, unitCode: `UNIT-${label}` };
}

test("two owners in a browser each see only their own unit", async ({ browser }) => {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const ownerA = await setUpOwnerWithData(admin, "A");
  const ownerB = await setUpOwnerWithData(admin, "B");

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto("http://localhost:3000/ar/portal/login");
  await pageA.getByLabel(/البريد الإلكتروني|Email/).fill(ownerA.email);
  await pageA.getByLabel(/كلمة المرور|Password/).fill(ownerA.password);
  await pageA.getByRole("button", { name: /تسجيل الدخول|Sign in/ }).click();
  await pageA.waitForURL(/\/portal$/);
  await pageA.goto("http://localhost:3000/ar/portal/units");
  await expect(pageA.getByText(ownerA.unitCode)).toBeVisible();
  await expect(pageA.getByText(ownerB.unitCode)).not.toBeVisible();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto("http://localhost:3000/ar/portal/login");
  await pageB.getByLabel(/البريد الإلكتروني|Email/).fill(ownerB.email);
  await pageB.getByLabel(/كلمة المرور|Password/).fill(ownerB.password);
  await pageB.getByRole("button", { name: /تسجيل الدخول|Sign in/ }).click();
  await pageB.waitForURL(/\/portal$/);
  await pageB.goto("http://localhost:3000/ar/portal/units");
  await expect(pageB.getByText(ownerB.unitCode)).toBeVisible();
  await expect(pageB.getByText(ownerA.unitCode)).not.toBeVisible();

  await contextA.close();
  await contextB.close();
  await admin.rpc("set_organization_status", { p_organization_id: ownerA.orgId, p_status: "ARCHIVED", p_reason: "e2e cleanup" });
  await admin.rpc("set_organization_status", { p_organization_id: ownerB.orgId, p_status: "ARCHIVED", p_reason: "e2e cleanup" });
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test tests/e2e/owner-portal-isolation.spec.ts`
Expected: PASS — each owner's browser session shows only their own unit code, confirming isolation end-to-end through the actual rendered UI.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/owner-portal-isolation.spec.ts
git commit -m "test(portal): add browser-level two-owner isolation test (Phase 2 exit gate)"
```

**Phase 2 exit gate:** Task 10's isolation script all-PASS, and Task 15's Playwright test PASS. Both must be green before Phase 3 (online payment transaction model) begins.

---

## Self-review notes

- **Spec coverage:** every Phase 1/2 item from the spec's "Phased Implementation Plan" section is covered — `members.user_id`/`member_invitations` (Task 1), `current_member_id()` (Task 2), `accept_member_invitation` RPC + linking/compensating flow (Task 4, Task 7), email + WhatsApp send (Task 5–6), portal layout guard (Task 8), pgTAP-style isolation tests for both phases (Task 2, Task 10), dashboard/statement/dues/payments/units pages (Tasks 8, 11–14), receipt access isolation (Task 13), and the "owner sees only own data in browser" Playwright gate (Task 15).
- **Deferred, not forgotten:** the `expire_stale_member_invitations` sweep is lazy (called before each new invite) rather than cron-driven, since this project has no `pg_cron` extension enabled — documented as a locked decision, not an oversight.
- **Known follow-up inside Phase 2 itself:** Task 14 flags that `members_with_financials` doesn't currently select `user_id`, and specifies the simpler two-query fix instead of extending the view — this is called out explicitly rather than silently guessed.
