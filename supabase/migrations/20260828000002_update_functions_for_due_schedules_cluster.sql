-- Phase 2g Group 3: update the index, due_schedules_manage RLS policy's
-- WITH CHECK clause, and the 2 functions with genuine column references
-- for the due_schedules property_id rename.
--
-- run_due_schedules also touches due_schedules but keys entirely off
-- is_active/frequency/day_of_month/month_of_year/organization_id/id --
-- confirmed live, zero resort_id references, intentionally left
-- unmodified.
--
-- due_schedules_select_permission (the other RLS policy on this table)
-- doesn't reference resort_id at all -- left unmodified.

-- 1) Rebuild the index (column-only change, name kept as-is)
drop index if exists public.idx_due_schedules_resort;
create index idx_due_schedules_resort on public.due_schedules using btree (property_id);

-- 2) due_schedules_manage RLS policy: only the WITH CHECK clause
--    references resort_id (the USING clause never did). ALTER POLICY
--    requires re-specifying USING unchanged alongside the corrected
--    WITH CHECK -- Postgres has no "CREATE OR REPLACE POLICY".
alter policy due_schedules_manage on public.due_schedules
  using (has_permission(auth.uid(), organization_id, 'finance.schedules.manage'::text) and organization_is_active(organization_id))
  with check (
    has_permission(auth.uid(), organization_id, 'finance.schedules.manage'::text)
    and organization_is_active(organization_id)
    and exists (
      select 1 from public.properties r
      where r.id = due_schedules.property_id and r.organization_id = due_schedules.organization_id
    )
  );

-- 3) generate_recurring_dues: every v_schedule.resort_id field access
--    becomes v_schedule.property_id (5 occurrences), plus the dues
--    INSERT column list. append_financial_audit_event's own p_resort_id
--    named-argument parameter is unchanged (that function belongs to the
--    still-deferred financial_audit_logs cluster, per Issue #15).
CREATE OR REPLACE FUNCTION public.generate_recurring_dues(p_organization_id uuid, p_schedule_id uuid, p_period text, p_generated_by uuid DEFAULT NULL::uuid, p_override_issue_date date DEFAULT NULL::date, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_user_id uuid;
  v_schedule record;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_issue_date date;
  v_due_date date;
  v_run_id uuid;
  v_generated_count integer := 0;
  v_total_amount numeric(19, 4) := 0;
  v_building_ids jsonb;
  v_zone_ids jsonb;
  v_unit_types jsonb;
BEGIN
  SELECT * INTO v_schedule
  FROM public.due_schedules
  WHERE id = p_schedule_id AND organization_id = p_organization_id;

  IF v_schedule.id IS NULL THEN
    RAISE EXCEPTION 'جدول الرسوم الدوري غير موجود' USING ERRCODE = '22023';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    IF NOT public.has_financial_permission(p_organization_id, 'finance.schedules.generate', v_schedule.property_id) THEN
      RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتوليد الرسوم الدورية' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT v_schedule.is_active THEN
    RAISE EXCEPTION 'جدول الرسوم الدوري موقوف' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('generate_recurring_' || p_schedule_id::text));

  BEGIN
    INSERT INTO public.due_generation_runs (
      organization_id,
      schedule_id,
      period,
      generated_units_count,
      total_amount,
      generated_by
    ) VALUES (
      p_organization_id,
      p_schedule_id,
      p_period,
      0,
      0,
      COALESCE(p_generated_by, v_user_id)
    )
    RETURNING id INTO v_run_id;
  EXCEPTION
    WHEN unique_violation THEN
      PERFORM public.append_financial_audit_event(
        p_organization_id := p_organization_id,
        p_action := 'RECURRING_DUES_SKIPPED',
        p_entity_type := 'DUE_SCHEDULE',
        p_resort_id := v_schedule.property_id,
        p_entity_id := p_schedule_id,
        p_request_id := NULL,
        p_ip_address := p_ip_address,
        p_user_agent := p_user_agent,
        p_metadata := jsonb_build_object(
          'period', p_period,
          'schedule_name', v_schedule.name,
          'reason', 'idempotent_replay'
        )
      );

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'generated_units_count', 0,
        'total_amount', 0,
        'message', 'الدورة المالية تم توليدها سابقاً وتجاوز التكرار بسلام'
      );
  END;

  IF p_override_issue_date IS NOT NULL THEN
    v_issue_date := p_override_issue_date;
  ELSE
    IF v_schedule.frequency = 'MONTHLY' THEN
      v_issue_date := to_date(p_period || '-01', 'YYYY-MM-DD');
    ELSE
      v_issue_date := to_date(p_period || '-01-01', 'YYYY-MM-DD');
    END IF;
  END IF;

  v_due_date := v_issue_date + (v_schedule.due_offset_days || ' days')::interval;
  v_building_ids := v_schedule.scope->'building_ids';
  v_zone_ids := v_schedule.scope->'zone_ids';
  v_unit_types := v_schedule.scope->'unit_types';

  FOR v_unit_record IN
    SELECT u.id, u.unit_type, u.building_id, u.zone_id
    FROM public.units u
    WHERE u.organization_id = p_organization_id
      AND u.property_id = v_schedule.property_id
      AND (
        (v_schedule.scope->>'all')::boolean = true
        OR (v_building_ids IS NOT NULL AND v_building_ids ? u.building_id::text)
        OR (v_zone_ids IS NOT NULL AND v_zone_ids ? u.zone_id::text)
        OR (v_unit_types IS NOT NULL AND v_unit_types ? u.unit_type)
      )
  LOOP
    IF v_schedule.amount_by_unit_type IS NOT NULL AND v_schedule.amount_by_unit_type ? v_unit_record.unit_type THEN
      v_unit_amount := (v_schedule.amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    ELSE
      v_unit_amount := v_schedule.amount;
    END IF;

    INSERT INTO public.dues (
      organization_id,
      property_id,
      unit_id,
      due_type_id,
      receivable_account_id,
      amount,
      issue_date,
      due_date,
      description,
      status,
      created_by
    ) VALUES (
      p_organization_id,
      v_schedule.property_id,
      v_unit_record.id,
      v_schedule.due_type_id,
      v_schedule.receivable_account_id,
      v_unit_amount,
      v_issue_date,
      v_due_date,
      v_schedule.name || ' (' || p_period || ')',
      'ISSUED',
      COALESCE(p_generated_by, v_user_id)
    );

    v_generated_count := v_generated_count + 1;
    v_total_amount := v_total_amount + v_unit_amount;
  END LOOP;

  UPDATE public.due_generation_runs
  SET generated_units_count = v_generated_count,
      total_amount = v_total_amount
  WHERE id = v_run_id;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := 'RECURRING_DUES_GENERATED',
    p_entity_type := 'DUE_SCHEDULE',
    p_resort_id := v_schedule.property_id,
    p_entity_id := p_schedule_id,
    p_request_id := NULL,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'period', p_period,
      'run_id', v_run_id,
      'generated_units_count', v_generated_count,
      'total_amount', v_total_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'generated_units_count', v_generated_count,
    'total_amount', v_total_amount
  );
END;
$function$;

-- 4) preview_generate_recurring_dues: both v_schedule.resort_id
--    occurrences become v_schedule.property_id.
CREATE OR REPLACE FUNCTION public.preview_generate_recurring_dues(p_organization_id uuid, p_schedule_id uuid, p_period text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  if not public.has_financial_permission(p_organization_id, 'finance.schedules.generate', v_schedule.property_id) then
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
      and u.property_id = v_schedule.property_id
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
$function$;
