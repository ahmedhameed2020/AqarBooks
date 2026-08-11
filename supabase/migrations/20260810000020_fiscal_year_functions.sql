-- Phase 3: create a fiscal year and auto-generate its monthly periods
-- atomically, so a year is never left with a partial period set.

create or replace function public.create_fiscal_year(
  p_organization_id uuid,
  p_name text,
  p_start_date date,
  p_end_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year_id uuid;
  v_period_start date;
  v_period_number int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.periods.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if p_end_date <= p_start_date then
    raise exception 'end date must be after start date';
  end if;

  insert into public.fiscal_years (organization_id, name, start_date, end_date)
  values (p_organization_id, p_name, p_start_date, p_end_date)
  returning id into v_year_id;

  v_period_start := p_start_date;
  while v_period_start <= p_end_date loop
    v_period_number := v_period_number + 1;
    insert into public.fiscal_periods (
      organization_id, fiscal_year_id, period_number, name, start_date, end_date
    ) values (
      p_organization_id,
      v_year_id,
      v_period_number,
      to_char(v_period_start, 'YYYY-MM'),
      v_period_start,
      least((v_period_start + interval '1 month' - interval '1 day')::date, p_end_date)
    );
    v_period_start := (v_period_start + interval '1 month')::date;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'fiscal_year.created', 'fiscal_year', v_year_id,
    jsonb_build_object('name', p_name, 'periods', v_period_number));

  return v_year_id;
end;
$$;

create or replace function public.set_fiscal_period_status(
  p_fiscal_period_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.fiscal_periods;
begin
  select * into v_period from public.fiscal_periods where id = p_fiscal_period_id;
  if v_period.id is null then
    raise exception 'fiscal period not found';
  end if;
  if not public.has_permission(auth.uid(), v_period.organization_id, 'finance.periods.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('PLANNED', 'OPEN', 'CLOSED', 'LOCKED') then
    raise exception 'invalid status: %', p_status;
  end if;
  -- Reopening a closed/locked period is a deliberate, audited exception --
  -- permission-gated the same as any other period change, with the reason
  -- captured below (spec §12: "Reopening requires permission and reason").

  update public.fiscal_periods set status = p_status where id = p_fiscal_period_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), v_period.organization_id, 'fiscal_period.status_changed', 'fiscal_period', p_fiscal_period_id, p_reason,
    jsonb_build_object('new_status', p_status));
end;
$$;
