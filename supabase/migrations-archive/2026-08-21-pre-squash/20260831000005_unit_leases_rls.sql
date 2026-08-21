-- RLS for unit_leases and unit_lease_deposit_events. SELECT-only policies
-- here: every write goes through a security-definer RPC (Phase 3), matching
-- the dues/payments convention -- clients never get a direct INSERT/UPDATE/
-- DELETE path to these tables.

-- Staff visibility: gated by the new property.leases.* permissions,
-- mirroring unit_ownerships' policy shape exactly.
create policy "unit_leases_select_staff" on public.unit_leases for select
  using (
    public.has_permission(auth.uid(), organization_id, 'property.leases.view')
    or public.has_permission(auth.uid(), organization_id, 'property.leases.manage')
  );

-- Tenant self-visibility: a member sees only their own lease, mirroring
-- unit_ownerships_select_own verbatim. No active-only filter -- visibility
-- persists after ENDED/CANCELLED so a tenant retains their own lease
-- history (approved default, see the implementation plan section 2.2).
create policy "unit_leases_select_own" on public.unit_leases for select
  using (
    tenant_member_id = public.current_member_id()
    and public.organization_is_active(organization_id)
  );

-- Deposit events: same staff/tenant split, scoped through the parent lease
-- since this table has no organization_id column of its own (mirrors how
-- payment_allocations derives visibility via a payment_id subquery).
create policy "unit_lease_deposit_events_select_staff" on public.unit_lease_deposit_events for select
  using (
    exists (
      select 1 from public.unit_leases l
      where l.id = lease_id
        and (
          public.has_permission(auth.uid(), l.organization_id, 'property.leases.view')
          or public.has_permission(auth.uid(), l.organization_id, 'property.leases.manage')
        )
    )
  );

create policy "unit_lease_deposit_events_select_own" on public.unit_lease_deposit_events for select
  using (
    exists (
      select 1 from public.unit_leases l
      where l.id = lease_id
        and l.tenant_member_id = public.current_member_id()
        and public.organization_is_active(l.organization_id)
    )
  );
