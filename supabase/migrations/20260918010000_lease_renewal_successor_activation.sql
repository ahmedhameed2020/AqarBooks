-- PR9.3: atomically schedule one successor lease when an authorized renewal
-- request is approved, then promote it on its effective date. Rent dues remain
-- owned by the scheduled, idempotent generator and are never issued by the
-- decision RPC.

alter table public.unit_leases
  drop constraint unit_leases_status_check;
alter table public.unit_leases
  add constraint unit_leases_status_check
    check (status in ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ENDED', 'CANCELLED'));

alter table public.unit_leases
  drop constraint unit_leases_no_overlapping_active;
alter table public.unit_leases
  add constraint unit_leases_no_overlapping_active_or_scheduled
    exclude using gist (
      unit_id with =,
      daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') with &&
    ) where (status in ('ACTIVE', 'SCHEDULED'));

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
        v_source_lease.unit_id, v_source_lease.tenant_member_id, 'SCHEDULED',
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

create or replace function public.promote_scheduled_lease_renewals(
  p_as_of_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_successor public.unit_leases;
  v_source public.unit_leases;
  v_promoted integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'FORBIDDEN_LEASE_RENEWAL_PROMOTION' using errcode = '42501';
  end if;

  for v_candidate in
    select l.id
    from public.unit_leases l
    where l.status = 'SCHEDULED'
      and l.starts_on <= p_as_of_date
      and public.organization_is_active(l.organization_id)
      and public.lease_lifecycle_enabled(l.organization_id)
    order by l.starts_on, l.id
    for update skip locked
  loop
    select l.* into v_successor
    from public.unit_leases l
    where l.id = v_candidate.id
    for update;

    if v_successor.id is null or v_successor.status <> 'SCHEDULED'
       or v_successor.starts_on > p_as_of_date then
      continue;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('lease_unit:' || v_successor.unit_id::text, 0)
    );

    select l.* into v_source
    from public.unit_leases l
    where l.id = v_successor.renewed_from_lease_id
      and l.organization_id = v_successor.organization_id
      and l.property_id = v_successor.property_id
      and l.unit_id = v_successor.unit_id
      and l.tenant_member_id = v_successor.tenant_member_id
    for update;

    if v_source.id is null
       or v_source.status not in ('ACTIVE', 'ENDED')
       or v_source.ends_on is null
       or v_source.ends_on >= v_successor.starts_on then
      raise exception 'LEASE_RENEWAL_INVALID_STATE' using errcode = '22023';
    end if;

    if v_source.status = 'ACTIVE' then
      update public.unit_leases
      set status = 'ENDED',
          ended_by = v_successor.created_by,
          ended_at = now(),
          end_reason = 'RENEWED'
      where id = v_source.id;
    end if;

    update public.unit_leases
    set status = 'ACTIVE'
    where id = v_successor.id
      and status = 'SCHEDULED';

    if found then
      v_promoted := v_promoted + 1;
    end if;
  end loop;

  return jsonb_build_object('promoted', v_promoted);
end;
$$;

revoke all on function public.promote_scheduled_lease_renewals(date)
  from public, anon, authenticated, service_role;
grant execute on function public.promote_scheduled_lease_renewals(date)
  to service_role;

create or replace function public.generate_lease_rent_dues(
  p_organization_id uuid,
  p_lease_id uuid,
  p_period text,
  p_issue_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_lease public.unit_leases;
  v_range daterange;
  v_has_owner boolean;
  v_due_id uuid;
  v_description text;
begin
  perform pg_advisory_xact_lock(hashtext('lease_rent_' || p_lease_id::text));

  select * into v_lease
  from public.unit_leases
  where id = p_lease_id and organization_id = p_organization_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;

  v_user_id := auth.uid();
  if v_user_id is null then
    if auth.role() is distinct from 'service_role' then
      raise exception 'FORBIDDEN_FINANCE_PERMISSION: unauthenticated rent generation'
        using errcode = '42501';
    end if;
  elsif not public.has_financial_permission(
    p_organization_id, 'finance.schedules.generate', v_lease.property_id
  ) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: not authorized to generate lease rent dues'
      using errcode = '42501';
  end if;

  v_range := public.lease_rent_period_range(v_lease.rent_frequency, p_period);

  if current_date < v_lease.starts_on then
    raise exception 'LEASE_RENT_NOT_STARTED' using errcode = '22023';
  end if;
  if lower(v_range) < v_lease.starts_on
     or coalesce(v_lease.ends_on, 'infinity'::date) < (upper(v_range) - 1) then
    raise exception 'LEASE_RENT_PERIOD_OUTSIDE_LEASE' using errcode = '22023';
  end if;
  if v_lease.status <> 'ACTIVE' then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'not_active');
  end if;

  if v_lease.billing_recipient = 'OWNER' then
    select exists (
      select 1 from public.unit_ownerships
      where unit_id = v_lease.unit_id
        and start_date <= current_date
        and (end_date is null or end_date >= current_date)
    ) into v_has_owner;
    if not v_has_owner then
      perform public.append_financial_audit_event(
        p_organization_id, 'OPERATION_REJECTED', 'unit_lease',
        v_lease.property_id, p_lease_id, null, null, null,
        jsonb_build_object('reason', 'no_current_owner_for_owner_billed_lease', 'period', p_period)
      );
      return jsonb_build_object('success', false, 'blocked', true, 'reason', 'no_current_owner');
    end if;
  end if;

  begin
    insert into public.lease_rent_generation_runs (
      organization_id, lease_id, period, generated_by
    ) values (
      p_organization_id, p_lease_id, p_period, auth.uid()
    );
  exception when unique_violation then
    return jsonb_build_object('success', true, 'idempotent', true);
  end;

  v_description := 'إيجار ' || p_period;
  insert into public.dues (
    organization_id, property_id, unit_id, due_type_id,
    receivable_account_id, amount, issue_date, due_date,
    description, status, source_type, source_id
  ) values (
    p_organization_id, v_lease.property_id, v_lease.unit_id,
    v_lease.due_type_id, v_lease.receivable_account_id,
    v_lease.rent_amount, coalesce(p_issue_date, lower(v_range)),
    lower(v_range), v_description, 'ISSUED', 'LEASE_RENT', p_lease_id
  ) returning id into v_due_id;

  update public.lease_rent_generation_runs
  set due_id = v_due_id
  where lease_id = p_lease_id and period = p_period;

  perform public.append_financial_audit_event(
    p_organization_id, 'LEASE_RENT_DUE_GENERATED', 'due',
    v_lease.property_id, v_due_id, null, null, null,
    jsonb_build_object('lease_id', p_lease_id, 'period', p_period, 'amount', v_lease.rent_amount)
  );

  return jsonb_build_object('success', true, 'generated', true, 'due_id', v_due_id);
end;
$$;

create or replace function public.run_lease_rent_generation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease record;
  v_period text;
  v_result jsonb;
  v_promotion jsonb;
  v_generated integer := 0;
  v_idempotent integer := 0;
  v_blocked integer := 0;
  v_skipped integer := 0;
  v_errored integer := 0;
begin
  v_promotion := public.promote_scheduled_lease_renewals(current_date);

  for v_lease in
    select l.id, l.organization_id, l.rent_frequency
    from public.unit_leases l
    join public.organizations o on o.id = l.organization_id
    where l.status = 'ACTIVE'
      and l.starts_on <= current_date
      and (l.ends_on is null or l.ends_on > current_date)
      and not o.is_demo
  loop
    v_period := public.lease_rent_period_key(v_lease.rent_frequency, current_date);
    begin
      v_result := public.generate_lease_rent_dues(
        v_lease.organization_id, v_lease.id, v_period
      );
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
    'promoted', coalesce((v_promotion ->> 'promoted')::integer, 0),
    'generated', v_generated, 'idempotent', v_idempotent,
    'blocked', v_blocked, 'skipped', v_skipped, 'errored', v_errored
  );
end;
$$;

create or replace function public.enforce_opening_balance_current_unit_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source_type = 'OPENING_BALANCE'
     and not exists (
       select 1 from public.unit_ownerships uo
       where uo.unit_id = new.unit_id
         and uo.member_id = new.source_id
         and uo.start_date <= current_date
         and (uo.end_date is null or uo.end_date >= current_date)
     )
     and not exists (
       select 1 from public.unit_leases ul
       where ul.unit_id = new.unit_id
         and ul.tenant_member_id = new.source_id
         and ul.status = 'ACTIVE'
         and ul.starts_on <= current_date
         and (ul.ends_on is null or ul.ends_on > current_date)
     ) then
    raise exception 'MEMBER_NOT_LINKED_TO_UNIT: العميل غير مرتبط حاليًا بالوحدة'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger dues_opening_balance_current_unit_link
before insert on public.dues
for each row execute function public.enforce_opening_balance_current_unit_link();

revoke all on function public.enforce_opening_balance_current_unit_link()
  from public, anon, authenticated, service_role;
