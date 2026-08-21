-- Fix: is_org_member() only granted access to memberships with
-- status = 'active', but add_organization_member() (used by the /admin/users
-- invite flow) always inserts status = 'invited' -- there is no separate
-- "accept invite" step in this codebase (Phase 1 deferred email
-- infrastructure), so a freshly invited user could never actually reach
-- their organization's data despite having a working login. Found while
-- setting up a second real tenant test account.
--
-- Correct behavior per the membership status enum ('active', 'invited',
-- 'suspended'): 'suspended' is the only status that should block access;
-- 'invited' means "added, not yet confirmed their own account" and should
-- still work once they can log in at all (Supabase's invite-email flow
-- already gates that -- they can't authenticate without setting a password).

create or replace function public.is_org_member(p_user_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.user_id = p_user_id
      and om.organization_id = p_organization_id
      and om.status <> 'suspended'
  ) or public.is_platform_admin(p_user_id);
$$;
