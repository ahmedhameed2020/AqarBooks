-- Phase 2 Task 13: portal-member-facing organization display lookup.
--
-- The portal payments page needs the organization's name and currency to
-- print a receipt, but organizations_select_member RLS
-- (20260810000004_foundation_rls.sql) is gated on is_org_member(), which
-- only checks organization_memberships (the staff table) -- a portal owner
-- (a row in public.members) is never a member of that table, so a plain
-- SELECT against organizations returns nothing for them.
--
-- A blanket SELECT policy on organizations for portal members is NOT the
-- fix: that table also carries address, governorate, city, phone, email,
-- and tax_id -- fields a portal owner has no business reading, even though
-- none of them are used by the receipt today. Instead, this is a narrow
-- SECURITY DEFINER RPC (same pattern as current_member_id(), see
-- 20260814000002_current_member_id_and_members_rls.sql) that returns only
-- the two fields a portal receipt/page actually needs.
--
-- NULL-safe like current_member_id(): returns zero rows (not an error) if
-- the caller isn't authenticated, isn't linked to any members row, or their
-- org is SUSPENDED/ARCHIVED (organization_is_active gate, consistent with
-- the Checkpoint 2 decision in 20260814000006 that a suspended/archived
-- owner must not retain ANY portal access).
create or replace function public.get_own_organization_display()
returns table (name text, default_currency text)
language sql
stable
security definer
set search_path = public
as $$
  select o.name, o.default_currency
  from public.organizations o
  join public.members m on m.organization_id = o.id
  where m.user_id = auth.uid()
    and public.organization_is_active(o.id);
$$;

revoke execute on function public.get_own_organization_display() from public, anon;
grant execute on function public.get_own_organization_display() to authenticated;

notify pgrst, 'reload schema';
