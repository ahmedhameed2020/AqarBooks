-- Read-only dry-run for the "Generate Now" button: mirrors the exact unit
-- selection and per-unit-type amount logic of generate_recurring_dues (see
-- 20260811000004_phase11_audit_integrations.sql) so the preview the user
-- confirms is guaranteed to match what actually gets charged -- computing
-- the preview from client-side data alone (as the manual-issuance preview
-- does for plain unit listing) isn't safe here because schedule amounts,
-- scope, and per-unit-type overrides are server-side state the client
-- shouldn't be trusted to recompute for a bulk financial action.
create or replace function public.preview_generate_recurring_dues(
  p_organization_id uuid,
  p_schedule_id uuid,
  p_period text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_schedule record;
  v_building_ids jsonb;
  v_zone_ids jsonb;
  v_unit_types jsonb;
  v_issue_date date;
  v_due_date date;
  v_existing_run record;
  v_unit_count int := 0;
  v_total_amount numeric(19, 4) := 0;
  v_by_unit_type jsonb := '{}'::jsonb;
  v_sample_units jsonb := '[]'::jsonb;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_type_entry jsonb;
begin
  select * into v_schedule
  from public.due_schedules
  where id = p_schedule_id and organization_id = p_organization_id;

  if v_schedule.id is null then
    raise exception 'جدول الرسوم الدوري غير موجود' using errcode = '22023';
  end if;

  -- Same permission the real generate action requires -- if you can't
  -- generate, you shouldn't get a preview of what generating would do.
  if not public.has_financial_permission(p_organization_id, 'finance.schedules.generate', v_schedule.resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بمعاينة توليد الرسوم الدورية' using errcode = '42501';
  end if;

  if not v_schedule.is_active then
    raise exception 'جدول الرسوم الدوري موقوف' using errcode = '22023';
  end if;

  select id, generated_units_count, total_amount, generated_at
    into v_existing_run
  from public.due_generation_runs
  where schedule_id = p_schedule_id and period = p_period;

  if v_existing_run.id is not null then
    return jsonb_build_object(
      'schedule_name', v_schedule.name,
      'period', p_period,
      'idempotent', true,
      'existing_run', jsonb_build_object(
        'generated_units_count', v_existing_run.generated_units_count,
        'total_amount', v_existing_run.total_amount,
        'generated_at', v_existing_run.generated_at
      )
    );
  end if;

  if v_schedule.frequency = 'MONTHLY' then
    v_issue_date := to_date(p_period || '-01', 'YYYY-MM-DD');
  else
    v_issue_date := to_date(p_period || '-01-01', 'YYYY-MM-DD');
  end if;
  v_due_date := v_issue_date + (v_schedule.due_offset_days || ' days')::interval;

  v_building_ids := v_schedule.scope->'building_ids';
  v_zone_ids := v_schedule.scope->'zone_ids';
  v_unit_types := v_schedule.scope->'unit_types';

  for v_unit_record in
    select u.id, u.code, u.unit_type
    from public.units u
    where u.organization_id = p_organization_id
      and u.resort_id = v_schedule.resort_id
      and (
        (v_schedule.scope->>'all')::boolean = true
        or (v_building_ids is not null and v_building_ids ? u.building_id::text)
        or (v_zone_ids is not null and v_zone_ids ? u.zone_id::text)
        or (v_unit_types is not null and v_unit_types ? u.unit_type)
      )
    order by u.code
  loop
    if v_schedule.amount_by_unit_type is not null and v_schedule.amount_by_unit_type ? v_unit_record.unit_type then
      v_unit_amount := (v_schedule.amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    else
      v_unit_amount := v_schedule.amount;
    end if;

    v_unit_count := v_unit_count + 1;
    v_total_amount := v_total_amount + v_unit_amount;

    v_type_entry := coalesce(v_by_unit_type->v_unit_record.unit_type, jsonb_build_object('count', 0, 'total', 0));
    v_by_unit_type := jsonb_set(
      v_by_unit_type,
      array[v_unit_record.unit_type],
      jsonb_build_object(
        'count', (v_type_entry->>'count')::int + 1,
        'total', (v_type_entry->>'total')::numeric(19, 4) + v_unit_amount
      )
    );

    if v_unit_count <= 10 then
      v_sample_units := v_sample_units || jsonb_build_object(
        'id', v_unit_record.id,
        'code', v_unit_record.code,
        'unitType', v_unit_record.unit_type,
        'calculatedAmount', v_unit_amount
      );
    end if;
  end loop;

  return jsonb_build_object(
    'schedule_name', v_schedule.name,
    'period', p_period,
    'idempotent', false,
    'issue_date', v_issue_date,
    'due_date', v_due_date,
    'unit_count', v_unit_count,
    'total_amount', v_total_amount,
    'by_unit_type', v_by_unit_type,
    'sample_units', v_sample_units
  );
end;
$$;
