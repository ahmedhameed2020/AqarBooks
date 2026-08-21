-- Closes the cross-phase RLS gap flagged in the implementation plan
-- section 2.3: the existing dues_select_own portal policy only covers
-- OWNERS (via unit_ownerships). A TENANT-billed lease-rent due
-- (billing_recipient = 'TENANT') was invisible to that tenant in the
-- portal until now. An OWNER-billed lease-rent due needs no new policy --
-- dues_select_own already covers it via unit_id, regardless of source_type.
create policy "dues_select_own_via_lease" on public.dues for select
  using (
    source_type = 'LEASE_RENT'
    and source_id in (
      select id from public.unit_leases
      where tenant_member_id = public.current_member_id()
    )
  );
