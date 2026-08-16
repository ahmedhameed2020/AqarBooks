-- Checkpoint 2 security hardening for Owner Portal Phase 1.
--
-- Finding A: current_member_id() (20260814000002) never had its default
-- PUBLIC/anon EXECUTE grant revoked, unlike every other owner-portal RPC
-- (see 20260814000004). Not currently exploitable (auth.uid() is NULL for
-- an unauthenticated caller, so it just returns NULL) but it breaks the
-- established least-privilege pattern. Close it for defense-in-depth.
revoke execute on function public.current_member_id() from public, anon;
grant execute on function public.current_member_id() to authenticated;

-- Finding B: expire_stale_member_invitations() is SECURITY DEFINER, takes
-- no parameters, and was granted to `authenticated` with no authorization
-- check of its own -- verified live that ANY signed-in user (not just
-- staff, not scoped to any org) can call it and it sweeps
-- member_invitations GLOBALLY across every tenant, flipping pending rows
-- past expires_at to 'expired'. Impact is low (can't touch still-valid
-- invitations, can't read content back, returns only a count) but a
-- fully unauthenticated-scope, cross-tenant-write RPC is a real gap.
-- Fix: restrict to service_role -- it's a global maintenance sweep with
-- no session-scoped need, so the one call site (lib/actions/member-portal.ts)
-- is updated in this same checkpoint to use the admin/service-role client.
revoke execute on function public.expire_stale_member_invitations() from public, anon, authenticated;
grant execute on function public.expire_stale_member_invitations() to service_role;

-- Finding C (policy decision final): owners of a SUSPENDED or ARCHIVED
-- organization must not retain portal access, consistent with the rest of
-- the platform's convention (e.g. members_manage already gates on
-- organization_is_active). Verified live: a member of an ARCHIVED test org
-- could still resolve via current_member_id() and read their own members
-- row. organization_is_active(uuid) (20260810000021) returns true only for
-- 'TRIAL' and 'ACTIVE' statuses, so this correctly excludes SUSPENDED and
-- ARCHIVED while leaving TRIAL orgs (the normal state for a brand new org)
-- unaffected.
drop policy if exists "members_select_self" on public.members;
create policy "members_select_self"
  on public.members for select
  using (id = public.current_member_id() and public.organization_is_active(organization_id));

notify pgrst, 'reload schema';
