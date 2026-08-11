-- Phase 4 RLS. Default-deny throughout. dues / payments / payment_allocations
-- get SELECT only -- same "functions are the only writer" pattern as the
-- journal engine (§18 migration comment), so a due's status and a
-- payment's allocations can never be edited out of step with their journal
-- entries.

alter table public.zones enable row level security;
alter table public.buildings enable row level security;
alter table public.units enable row level security;
alter table public.members enable row level security;
alter table public.unit_ownerships enable row level security;
alter table public.due_types enable row level security;
alter table public.dues enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

create policy "zones_select_member" on public.zones for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "zones_manage" on public.zones for all
  using (public.has_permission(auth.uid(), organization_id, 'property.units.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.units.manage') and public.organization_is_active(organization_id));

create policy "buildings_select_member" on public.buildings for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "buildings_manage" on public.buildings for all
  using (public.has_permission(auth.uid(), organization_id, 'property.units.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.units.manage') and public.organization_is_active(organization_id));

create policy "units_select_member" on public.units for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "units_manage" on public.units for all
  using (public.has_permission(auth.uid(), organization_id, 'property.units.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.units.manage') and public.organization_is_active(organization_id));

create policy "members_select_member" on public.members for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "members_manage" on public.members for all
  using (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id));

create policy "unit_ownerships_select_member" on public.unit_ownerships for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "unit_ownerships_manage" on public.unit_ownerships for all
  using (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'property.members.manage') and public.organization_is_active(organization_id));

create policy "due_types_select_member" on public.due_types for select
  using (public.is_org_member(auth.uid(), organization_id));
create policy "due_types_manage" on public.due_types for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.accounts.manage') and public.organization_is_active(organization_id));

create policy "dues_select_member" on public.dues for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "payments_select_member" on public.payments for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "payment_allocations_select_member" on public.payment_allocations for select
  using (
    exists (
      select 1 from public.payments p
      where p.id = payment_id and public.is_org_member(auth.uid(), p.organization_id)
    )
  );
