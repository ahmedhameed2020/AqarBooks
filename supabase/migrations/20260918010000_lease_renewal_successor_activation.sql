-- PR9.3: atomically activate one successor lease when an authorized renewal
-- request is approved. Rent dues remain owned by the existing scheduled,
-- idempotent lease-rent generator and are never issued by this decision RPC.

alter table public.unit_leases
  add column renewed_from_lease_id uuid
    references public.unit_leases(id) on delete restrict;

alter table public.unit_leases
  add constraint unit_leases_one_successor_per_source
    unique (renewed_from_lease_id);

alter table public.lease_renewal_requests
  add column successor_lease_id uuid
    references public.unit_leases(id) on delete restrict;

alter table public.lease_renewal_requests
  add constraint lease_renewal_requests_successor_unique
    unique (successor_lease_id);

-- Existing PR9.1 rows predate successor activation. Keep the constraint
-- unvalidated so a historical approved row cannot block this forward migration,
-- while all new and subsequently updated rows must satisfy the invariant.
alter table public.lease_renewal_requests
  add constraint lease_renewal_requests_successor_consistent check (
    (status = 'APPROVED' and successor_lease_id is not null)
    or (status in ('REQUESTED', 'REJECTED') and successor_lease_id is null)
  ) not valid;

create index unit_leases_renewed_from_idx
  on public.unit_leases (renewed_from_lease_id)
  where renewed_from_lease_id is not null;

create or replace function public.decide_lease_renewal(
  p_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.lease_renewal_requests;
  v_source_lease public.unit_leases;
  v_decision text := upper(btrim(coalesce(p_decision, '')));
  v_successor_lease_id uuid;
begin
  if auth.uid() is null or v_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'LEASE_RENEWAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  select r.* into v_request
  from public.lease_renewal_requests r
  where r.id = p_request_id
    and public.lease_renewal_staff_can_manage(r.organization_id, r.property_id)
  for update;

  if v_request.id is null then
    raise exception 'LEASE_RENEWAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_request.status = v_decision then
    if v_decision = 'APPROVED' and v_request.successor_lease_id is null then
      raise exception 'LEASE_RENEWAL_INVALID_STATE' using errcode = '22023';
    end if;
    return v_request.id;
  end if;
  if v_request.status <> 'REQUESTED' then
    raise exception 'LEASE_RENEWAL_INVALID_STATE' using errcode = '22023';
  end if;
  if v_decision = 'REJECTED' and nullif(btrim(p_reason), '') is null then
    raise exception 'LEASE_RENEWAL_DECISION_REASON_REQUIRED' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lease_renewal:' || v_request.lease_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lease_unit:' || v_request.unit_id::text, 0)
  );

  if v_decision = 'APPROVED' then
    select l.* into v_source_lease
    from public.unit_leases l
    where l.id = v_request.lease_id
      and l.organization_id = v_request.organization_id
      and l.property_id = v_request.property_id
      and l.unit_id = v_request.unit_id
      and l.tenant_member_id = v_request.tenant_member_id
      and l.status = 'ACTIVE'
      and public.organization_is_active(l.organization_id)
      and public.lease_lifecycle_enabled(l.organization_id)
    for update;

    if v_source_lease.id is null
       or v_source_lease.ends_on is null
       or v_request.proposed_starts_on <= v_source_lease.ends_on
       or (v_request.proposed_ends_on is not null
           and v_request.proposed_ends_on < v_request.proposed_starts_on) then
      raise exception 'LEASE_RENEWAL_INVALID_STATE' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.unit_leases l
      where l.renewed_from_lease_id = v_source_lease.id
    ) then
      raise exception 'LEASE_RENEWAL_INVALID_STATE' using errcode = '22023';
    end if;

    begin
      insert into public.unit_leases (
        organization_id, property_id, unit_id, tenant_member_id, status,
        starts_on, ends_on, rent_amount, rent_frequency,
        security_deposit_amount, billing_recipient, created_by,
        due_type_id, receivable_account_id, renewed_from_lease_id
      ) values (
        v_source_lease.organization_id, v_source_lease.property_id,
        v_source_lease.unit_id, v_source_lease.tenant_member_id, 'ACTIVE',
        v_request.proposed_starts_on, v_request.proposed_ends_on,
        v_request.proposed_rent_amount, v_request.proposed_rent_frequency,
        v_source_lease.security_deposit_amount,
        v_source_lease.billing_recipient, auth.uid(),
        v_source_lease.due_type_id, v_source_lease.receivable_account_id,
        v_source_lease.id
      ) returning id into v_successor_lease_id;
    exception
      when exclusion_violation or unique_violation then
        raise exception 'LEASE_RENEWAL_INVALID_STATE' using errcode = '22023';
    end;
  end if;

  update public.lease_renewal_requests
  set status = v_decision,
      successor_lease_id = v_successor_lease_id,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_reason = nullif(btrim(p_reason), '')
  where id = v_request.id;

  insert into public.lease_renewal_transitions (
    organization_id, renewal_request_id, from_status, to_status, actor_id, reason
  ) values (
    v_request.organization_id, v_request.id, 'REQUESTED', v_decision,
    auth.uid(), nullif(btrim(p_reason), '')
  );

  return v_request.id;
end;
$$;

revoke all on function public.decide_lease_renewal(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.decide_lease_renewal(uuid, text, text)
  to authenticated, service_role;
