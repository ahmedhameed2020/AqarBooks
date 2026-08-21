-- Rent-due generation engine. Phase 4 of
-- docs/superpowers/plans/2026-08-17-unit-rental-occupancy-implementation-plan.md.
--
-- Idempotency is run-level (lease_rent_generation_runs unique(lease_id,
-- period) + pg_advisory_xact_lock), matching due_generation_runs/
-- generate_recurring_dues exactly -- a second call for the same
-- (lease_id, period) is a guaranteed no-op, not a per-due existence check.
--
-- Invocation: this codebase has no pg_cron (confirmed during the plan's
-- pre-Phase-4 spike). The established workaround here is the lazy-sweep
-- pattern already used twice (expire_stale_member_invitations,
-- expire_stale_online_payment_transactions) -- called inline by a relevant
-- page load rather than on a schedule. run_lease_rent_generation() is
-- built the same way and is wired into finance/dues/page.tsx's load in
-- Phase 5, not scheduled externally.

-- 'YYYY-MM' for MONTHLY, 'YYYY-Qn' for QUARTERLY, 'YYYY' for YEARLY --
-- deliberately simpler than due_schedules' day_of_month/month_of_year
-- anchor concept, since a lazy sweep has no fixed invocation time to
-- anchor against: "generate the current period's due if not generated yet,
-- whenever this happens to run" is the whole model.
create or replace function public.lease_rent_period_key(p_frequency text, p_date date)
returns text
language sql immutable
as $$
  select case p_frequency
    when 'MONTHLY' then to_char(p_date, 'YYYY-MM')
    when 'QUARTERLY' then to_char(p_date, 'YYYY') || '-Q' || to_char(p_date, 'Q')
    when 'YEARLY' then to_char(p_date, 'YYYY')
  end;
$$;

create or replace function public.lease_rent_period_range(p_frequency text, p_period text)
returns daterange
language plpgsql immutable
as $$
declare
  v_year int;
  v_month int;
  v_quarter int;
  v_start date;
  v_end date;
begin
  if p_frequency = 'MONTHLY' then
    v_start := to_date(p_period || '-01', 'YYYY-MM-DD');
    v_end := (v_start + interval '1 month' - interval '1 day')::date;
  elsif p_frequency = 'QUARTERLY' then
    v_year := split_part(p_period, '-Q', 1)::int;
    v_quarter := split_part(p_period, '-Q', 2)::int;
    v_start := make_date(v_year, (v_quarter - 1) * 3 + 1, 1);
    v_end := (v_start + interval '3 months' - interval '1 day')::date;
  elsif p_frequency = 'YEARLY' then
    v_start := make_date(p_period::int, 1, 1);
    v_end := (v_start + interval '1 year' - interval '1 day')::date;
  else
    raise exception 'unknown rent_frequency: %', p_frequency;
  end if;
  return daterange(v_start, v_end, '[]');
end;
$$;

create table public.lease_rent_generation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lease_id uuid not null references public.unit_leases (id) on delete cascade,
  period text not null,
  due_id uuid references public.dues (id),
  generated_by uuid references auth.users (id),
  generated_at timestamptz not null default now(),
  unique (lease_id, period)
);

create index idx_lease_rent_generation_runs_lease on public.lease_rent_generation_runs (lease_id);

-- Internal engine function -- not exposed to staff via UI as a manual
-- trigger in v1 (unlike issue_due/issue_dues, which are explicit staff
-- actions). Runs as a background sweep, so no has_permission() gate: it's
-- not a user action, it's automated bookkeeping tied to an already-active
-- lease's own terms. Callable directly (not just via run_lease_rent_
-- generation) so a specific historical period can be backfilled if needed.
-- issue_date/due_date both default to the period's start date, not
-- current_date: dues.due_date >= issue_date is a hard CHECK constraint, and
-- a lazy sweep can run on any day of the period (even the last day), so
-- anchoring both to "today" would intermittently violate it. Rent for a
-- period is issued and due as of that period's first day regardless of
-- which day the sweep actually happens to run.
create or replace function public.generate_lease_rent_dues(
  p_organization_id uuid,
  p_lease_id uuid,
  p_period text,
  p_issue_date date default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_lease public.unit_leases;
  v_range daterange;
  v_has_owner boolean;
  v_due_id uuid;
  v_description text;
begin
  perform pg_advisory_xact_lock(hashtext('lease_rent_' || p_lease_id::text));

  select * into v_lease from public.unit_leases where id = p_lease_id and organization_id = p_organization_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;

  if v_lease.status <> 'ACTIVE' then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'not_active');
  end if;

  v_range := public.lease_rent_period_range(v_lease.rent_frequency, p_period);
  if lower(v_range) > coalesce(v_lease.ends_on, 'infinity'::date) or upper(v_range) < v_lease.starts_on then
    return jsonb_build_object('success', true, 'skipped', true, 'reason', 'period_outside_lease_range');
  end if;

  if v_lease.billing_recipient = 'OWNER' then
    select exists (
      select 1 from public.unit_ownerships
      where unit_id = v_lease.unit_id and (end_date is null or end_date >= current_date)
    ) into v_has_owner;
    if not v_has_owner then
      -- Deliberately does NOT insert a lease_rent_generation_runs row --
      -- this is a transient condition (an owner may be added later), so
      -- the next sweep must retry, not treat this period as permanently
      -- done. Fails loudly via the audit log instead of silently skipping.
      perform public.append_financial_audit_event(
        p_organization_id, 'OPERATION_REJECTED', 'unit_lease', v_lease.property_id, p_lease_id, null, null, null,
        jsonb_build_object('reason', 'no_current_owner_for_owner_billed_lease', 'period', p_period)
      );
      return jsonb_build_object('success', false, 'blocked', true, 'reason', 'no_current_owner');
    end if;
  end if;

  begin
    insert into public.lease_rent_generation_runs (organization_id, lease_id, period, generated_by)
    values (p_organization_id, p_lease_id, p_period, auth.uid());
  exception when unique_violation then
    return jsonb_build_object('success', true, 'idempotent', true);
  end;

  v_description := 'إيجار ' || p_period;

  insert into public.dues (
    organization_id, property_id, unit_id, due_type_id, receivable_account_id,
    amount, issue_date, due_date, description, status, source_type, source_id
  ) values (
    p_organization_id, v_lease.property_id, v_lease.unit_id, v_lease.due_type_id, v_lease.receivable_account_id,
    v_lease.rent_amount, coalesce(p_issue_date, lower(v_range)), lower(v_range), v_description, 'ISSUED', 'LEASE_RENT', p_lease_id
  ) returning id into v_due_id;

  update public.lease_rent_generation_runs set due_id = v_due_id
  where lease_id = p_lease_id and period = p_period;

  perform public.append_financial_audit_event(
    p_organization_id, 'LEASE_RENT_DUE_GENERATED', 'due', v_lease.property_id, v_due_id, null, null, null,
    jsonb_build_object('lease_id', p_lease_id, 'period', p_period, 'amount', v_lease.rent_amount)
  );

  return jsonb_build_object('success', true, 'generated', true, 'due_id', v_due_id);
end;
$$;

-- Lazy-sweep wrapper, scans all ACTIVE leases across all organizations
-- (mirrors run_due_schedules() scanning all is_active schedules), computes
-- each lease's current period from its own rent_frequency, and generates
-- if not already done. Best-effort per lease: one lease's failure doesn't
-- abort the sweep for the rest.
create or replace function public.run_lease_rent_generation()
returns jsonb
language plpgsql security definer set search_path = public
as $$
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
    select id, organization_id, rent_frequency
    from public.unit_leases
    where status = 'ACTIVE'
      and starts_on <= current_date
      and (ends_on is null or ends_on >= current_date)
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
$$;

revoke execute on function public.run_lease_rent_generation() from public, anon, authenticated;
grant execute on function public.run_lease_rent_generation() to service_role;

notify pgrst, 'reload schema';
