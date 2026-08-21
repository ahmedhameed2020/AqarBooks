-- Phase 2b-1 (continued): surgical updates to the 8 functions that
-- reference resort_id on the units/zones/buildings/property_import_logs
-- cluster renamed in 20260818000001. Each function's LIVE definition
-- (fetched via pg_get_functiondef, not retyped from memory) is reproduced
-- here with ONLY the lines referencing resort_id on this cluster's tables
-- changed to property_id. Every other resort_id reference in these same
-- bodies -- on due_schedules, dues, platform_audit_logs, resorts -- is
-- left completely untouched, since those tables are not part of this
-- migration; they'll be updated in their own future migrations.

create or replace function public.archive_unit(p_organization_id uuid, p_unit_id uuid, p_reason text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_resort_id uuid;
  v_active_owners int;
  v_open_dues int;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بأرشفة الوحدة' using errcode = '42501';
  end if;

  select property_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  select count(*) into v_active_owners
  from public.unit_ownerships
  where unit_id = p_unit_id and (end_date is null or end_date >= current_date);
  if v_active_owners > 0 then
    raise exception 'UNIT_HAS_ACTIVE_OWNERSHIP: لا يمكن أرشفة وحدة عليها ملكية نشطة — أنهِ الملكية أولًا' using errcode = '22023';
  end if;

  select count(*) into v_open_dues
  from public.dues
  where unit_id = p_unit_id and status in ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE');
  if v_open_dues > 0 then
    raise exception 'UNIT_HAS_OPEN_DUES: لا يمكن أرشفة وحدة عليها مستحقات مفتوحة غير مسددة' using errcode = '22023';
  end if;

  update public.units
  set is_active = false,
      archived_at = now(),
      archived_by = auth.uid()
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.archived', 'unit', p_unit_id, p_reason, '{}'::jsonb);
end;
$function$;

create or replace function public.restore_unit(p_organization_id uuid, p_unit_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك باستعادة الوحدة' using errcode = '42501';
  end if;

  select property_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  update public.units
  set is_active = true,
      archived_at = null,
      archived_by = null
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.restored', 'unit', p_unit_id, '{}'::jsonb);
end;
$function$;

create or replace function public.delete_resort(p_resort_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_organization_id uuid;
  v_unit_count int;
begin
  select organization_id into v_organization_id from public.resorts where id = p_resort_id;
  if v_organization_id is null then
    raise exception 'resort not found';
  end if;

  if not public.has_permission(auth.uid(), v_organization_id, 'tenant.settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*) into v_unit_count from public.units where property_id = p_resort_id;
  if v_unit_count > 0 then
    raise exception 'resort_has_units';
  end if;

  -- resort_id left null here (not p_resort_id): the row below survives the
  -- delete on the next line, and platform_audit_logs.resort_id has a plain
  -- (non-cascading) FK to resorts, so it would otherwise block the delete.
  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_organization_id, 'resort.deleted', 'resort', p_resort_id, '{}'::jsonb);

  delete from public.resorts where id = p_resort_id;
end;
$function$;

create or replace function public.update_unit(p_organization_id uuid, p_unit_id uuid, p_code text, p_unit_type text, p_custom_type_label text DEFAULT NULL::text, p_building_id uuid DEFAULT NULL::uuid, p_zone_id uuid DEFAULT NULL::uuid, p_floor_number integer DEFAULT NULL::integer, p_area numeric DEFAULT NULL::numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بتعديل بيانات الوحدة' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط';
  end if;

  -- resort_id is deliberately not a parameter: a unit never moves resorts
  -- from an edit form, only building/zone within its own resort.
  select property_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if p_building_id is not null and not exists (
    select 1 from public.buildings where id = p_building_id and property_id = v_resort_id
  ) then
    raise exception 'INVALID_BUILDING: المبنى المحدد لا ينتمي لموقع هذه الوحدة' using errcode = '22023';
  end if;

  if p_zone_id is not null and not exists (
    select 1 from public.zones where id = p_zone_id and property_id = v_resort_id
  ) then
    raise exception 'INVALID_ZONE: المنطقة المحددة لا تنتمي لموقع هذه الوحدة' using errcode = '22023';
  end if;

  update public.units
  set code = p_code,
      unit_type = p_unit_type,
      custom_type_label = case when p_unit_type = 'OTHER' then p_custom_type_label else null end,
      building_id = p_building_id,
      zone_id = p_zone_id,
      floor_number = p_floor_number,
      area = p_area
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.updated', 'unit', p_unit_id,
    jsonb_build_object('code', p_code, 'unit_type', p_unit_type));
exception
  when unique_violation then
    raise exception 'DUPLICATE_CODE: رمز الوحدة ده مستخدم بالفعل في نفس الموقع' using errcode = '23505';
end;
$function$;

create or replace function public.import_property_csv(p_organization_id uuid, p_import_kind text, p_rows jsonb, p_resort_id uuid DEFAULT NULL::uuid, p_allow_partial boolean DEFAULT false)
 returns jsonb
 language plpgsql
as $function$
declare
  v_row jsonb;
  v_index int := 0;
  v_imported int := 0;
  v_skipped int := 0;
  v_failures jsonb := '[]'::jsonb;
  v_unit_id uuid;
  v_member_id uuid;
  v_owner_id uuid;
  v_new_member_id uuid;
  v_email text;
  v_phone text;
  v_full_name text;
  v_is_company boolean;
  v_code text;
  v_unit_type text;
  v_custom_type_label text;
  v_floor_number int;
  v_area numeric(10,2);
  v_share_percentage numeric(5,2);
  v_start_date date;
  v_building_id uuid;
  v_zone_id uuid;
  v_owner_full_name text;
  v_owner_email text;
  v_owner_phone text;
  v_existing_ownership_id uuid;
  v_created_by uuid := auth.uid();
begin
  if p_import_kind not in ('units', 'members') then
    raise exception 'invalid import kind';
  end if;

  if p_import_kind = 'members' then
    if not public.has_permission(auth.uid(), p_organization_id, 'property.members.manage') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  else
    if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage')
      or not public.has_permission(auth.uid(), p_organization_id, 'property.members.manage') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    if p_resort_id is null then
      raise exception 'resort id is required for unit import';
    end if;
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    begin
      if p_import_kind = 'members' then
        v_full_name := trim(coalesce(v_row->>'full_name', ''));
        v_email := nullif(trim(coalesce(v_row->>'email', '')), '');
        v_phone := nullif(trim(coalesce(v_row->>'phone', '')), '');
        v_is_company := coalesce((v_row->>'is_company')::boolean, false);

        if v_full_name = '' then
          raise exception 'full_name is required';
        end if;

        v_member_id := null;
        if v_email is not null then
          select id into v_member_id from public.members m
          where m.organization_id = p_organization_id
            and lower(m.email) = lower(v_email)
          limit 1;
        end if;
        if v_member_id is null and v_phone is not null then
          select id into v_member_id from public.members m
          where m.organization_id = p_organization_id
            and lower(m.phone) = lower(v_phone)
          limit 1;
        end if;

        if v_member_id is not null then
          raise exception 'duplicate_member: matches an existing member by email or phone';
        end if;

        insert into public.members (organization_id, full_name, email, phone, is_company, created_by)
        values (p_organization_id, v_full_name, v_email, v_phone, v_is_company, v_created_by)
        returning id into v_member_id;
        v_imported := v_imported + 1;
      else
        v_code := trim(coalesce(v_row->>'code', ''));
        if v_code = '' then
          raise exception 'code is required';
        end if;

        v_unit_type := upper(trim(coalesce(v_row->>'unit_type', '')));
        if v_unit_type not in ('VILLA', 'CHALET', 'APARTMENT', 'SHOP', 'OFFICE', 'SERVICE', 'OTHER') then
          raise exception 'invalid unit_type';
        end if;

        v_custom_type_label := nullif(trim(coalesce(v_row->>'custom_type_label', '')), '');
        if v_unit_type = 'OTHER' and v_custom_type_label is null then
          raise exception 'custom_type_label is required for OTHER unit_type';
        end if;

        v_floor_number := nullif(trim(coalesce(v_row->>'floor_number', '')), '')::int;
        v_area := nullif(trim(coalesce(v_row->>'area', '')), '')::numeric(10,2);
        if v_area is not null and v_area <= 0 then
          raise exception 'area must be positive';
        end if;

        v_building_id := nullif(trim(coalesce(v_row->>'building_id', '')), '')::uuid;
        if v_building_id is not null then
          if not exists (
            select 1 from public.buildings b
            where b.id = v_building_id
              and b.organization_id = p_organization_id
              and b.property_id = p_resort_id
          ) then
            raise exception 'building does not belong to selected resort';
          end if;
        end if;

        v_zone_id := nullif(trim(coalesce(v_row->>'zone_id', '')), '')::uuid;
        if v_zone_id is not null then
          if not exists (
            select 1 from public.zones z
            where z.id = v_zone_id
              and z.organization_id = p_organization_id
              and z.property_id = p_resort_id
          ) then
            raise exception 'zone does not belong to selected resort';
          end if;
        end if;

        v_owner_id := null;
        v_owner_email := nullif(trim(coalesce(v_row->>'owner_email', '')), '');
        v_owner_phone := nullif(trim(coalesce(v_row->>'owner_phone', '')), '');
        v_owner_full_name := nullif(trim(coalesce(v_row->>'owner_full_name', '')), '');
        if nullif(trim(coalesce(v_row->>'owner_id', '')), '') is not null then
          v_owner_id := (v_row->>'owner_id')::uuid;
          if not exists (
            select 1 from public.members m
            where m.id = v_owner_id
              and m.organization_id = p_organization_id
          ) then
            raise exception 'owner_id does not belong to this organization';
          end if;
        elsif v_owner_email is not null or v_owner_phone is not null then
          if v_owner_email is not null then
            select id into v_owner_id from public.members m
            where m.organization_id = p_organization_id
              and lower(m.email) = lower(v_owner_email)
            limit 1;
          end if;
          if v_owner_id is null and v_owner_phone is not null then
            select id into v_owner_id from public.members m
            where m.organization_id = p_organization_id
              and lower(m.phone) = lower(v_owner_phone)
            limit 1;
          end if;
          if v_owner_id is null then
            if v_owner_full_name is null then
              raise exception 'owner_full_name is required when owner_email or owner_phone does not match an existing member';
            end if;
            insert into public.members (organization_id, full_name, email, phone, is_company, created_by)
            values (p_organization_id, v_owner_full_name, v_owner_email, v_owner_phone, false, v_created_by)
            returning id into v_owner_id;
          end if;
        end if;

        v_share_percentage := coalesce(nullif(trim(coalesce(v_row->>'share_percentage', '')), '')::numeric(5,2), 100);
        if v_share_percentage <= 0 or v_share_percentage > 100 then
          raise exception 'share_percentage must be between 0 and 100';
        end if;

        v_start_date := nullif(trim(coalesce(v_row->>'start_date', '')), '')::date;

        select id into v_unit_id from public.units u
        where u.organization_id = p_organization_id
          and u.property_id = p_resort_id
          and u.code = v_code;

        if v_unit_id is not null then
          update public.units set
            building_id = v_building_id,
            zone_id = v_zone_id,
            unit_type = v_unit_type,
            custom_type_label = v_custom_type_label,
            floor_number = v_floor_number,
            area = v_area
          where id = v_unit_id;
        else
          insert into public.units (
            organization_id,
            property_id,
            building_id,
            zone_id,
            code,
            unit_type,
            custom_type_label,
            floor_number,
            area,
            created_by
          ) values (
            p_organization_id,
            p_resort_id,
            v_building_id,
            v_zone_id,
            v_code,
            v_unit_type,
            v_custom_type_label,
            v_floor_number,
            v_area,
            v_created_by
          ) returning id into v_unit_id;
        end if;

        if v_owner_id is not null then
          select id into v_existing_ownership_id from public.unit_ownerships
          where unit_id = v_unit_id
            and member_id = v_owner_id
            and (end_date is null or end_date >= current_date);

          if v_existing_ownership_id is not null then
            update public.unit_ownerships set
              share_percentage = v_share_percentage,
              start_date = coalesce(v_start_date, start_date)
            where id = v_existing_ownership_id;
          else
            insert into public.unit_ownerships (
              organization_id,
              unit_id,
              member_id,
              share_percentage,
              start_date,
              created_by
            ) values (
              p_organization_id,
              v_unit_id,
              v_owner_id,
              v_share_percentage,
              coalesce(v_start_date, current_date),
              v_created_by
            );
          end if;
        end if;

        v_imported := v_imported + 1;
      end if;
    exception when others then
      v_skipped := v_skipped + 1;
      if not p_allow_partial then
        raise;
      end if;
      v_failures := v_failures || jsonb_build_object('row', v_index, 'error', substring(sqlerrm for 512));
    end;
  end loop;

  insert into public.property_import_logs (
    organization_id,
    property_id,
    import_kind,
    imported_rows,
    skipped_rows,
    allow_partial,
    failures,
    created_by
  ) values (
    p_organization_id,
    p_resort_id,
    p_import_kind,
    v_imported,
    v_skipped,
    p_allow_partial,
    v_failures,
    v_created_by
  );

  return jsonb_build_object(
    'imported_rows', v_imported,
    'skipped_rows', v_skipped,
    'failures', v_failures
  );
end;
$function$;

create or replace function public.generate_recurring_dues(p_organization_id uuid, p_schedule_id uuid, p_period text, p_generated_by uuid DEFAULT NULL::uuid, p_override_issue_date date DEFAULT NULL::date, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
    IF NOT public.has_financial_permission(p_organization_id, 'finance.schedules.generate', v_schedule.resort_id) THEN
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
        p_resort_id := v_schedule.resort_id,
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
      AND u.property_id = v_schedule.resort_id
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
      resort_id,
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
      v_schedule.resort_id,
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
    p_resort_id := v_schedule.resort_id,
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

create or replace function public.issue_dues(p_organization_id uuid, p_resort_id uuid, p_unit_ids uuid[], p_due_type_id uuid, p_receivable_account_id uuid, p_amount numeric, p_amount_by_unit_type jsonb DEFAULT NULL::jsonb, p_issue_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT (CURRENT_DATE + '15 days'::interval), p_description text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_user_id uuid;
  v_unit_id uuid;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_issued_count integer := 0;
  v_skipped_count integer := 0;
  v_total_amount numeric(19, 4) := 0;
  v_skipped_unit_ids uuid[] := ARRAY[]::uuid[];
  v_action text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_financial_permission(p_organization_id, 'finance.dues.issue', p_resort_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار المستحقات' USING ERRCODE = '42501';
  END IF;

  IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
    RAISE EXCEPTION 'يرجى تحديد وحدة واحدة على الأقل لإصدار المستحق' USING ERRCODE = '22023';
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ المستحق لا يمكن أن يكون سالباً' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('issue_dues_' || p_organization_id::text));

  FOREACH v_unit_id IN ARRAY p_unit_ids
  LOOP
    SELECT id, unit_type INTO v_unit_record
    FROM public.units
    WHERE id = v_unit_id AND organization_id = p_organization_id AND property_id = p_resort_id;

    IF v_unit_record.id IS NULL THEN
      RAISE EXCEPTION 'الوحدة المحددة (%) غير موجودة أو لا تنتمي لهذه المنظمة والمنتجع', v_unit_id USING ERRCODE = '22023';
    END IF;

    IF p_amount_by_unit_type IS NOT NULL AND p_amount_by_unit_type ? v_unit_record.unit_type THEN
      v_unit_amount := (p_amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    ELSE
      v_unit_amount := p_amount;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.dues
      WHERE unit_id = v_unit_id
        AND due_type_id = p_due_type_id
        AND issue_date = p_issue_date
        AND COALESCE(description, '') = COALESCE(p_description, '')
        AND status <> 'VOID'
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      v_skipped_unit_ids := array_append(v_skipped_unit_ids, v_unit_id);
    ELSE
      INSERT INTO public.dues (
        organization_id,
        resort_id,
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
        p_resort_id,
        v_unit_id,
        p_due_type_id,
        p_receivable_account_id,
        v_unit_amount,
        p_issue_date,
        p_due_date,
        p_description,
        'ISSUED',
        v_user_id
      );

      v_issued_count := v_issued_count + 1;
      v_total_amount := v_total_amount + v_unit_amount;
    END IF;
  END LOOP;

  v_action := CASE WHEN array_length(p_unit_ids, 1) = 1 THEN 'DUE_ISSUED' ELSE 'DUE_BATCH_ISSUED' END;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := v_action,
    p_entity_type := 'DUE',
    p_resort_id := p_resort_id,
    p_entity_id := NULL,
    p_request_id := NULL,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'target_units_count', array_length(p_unit_ids, 1),
      'issued_count', v_issued_count,
      'skipped_count', v_skipped_count,
      'total_amount', v_total_amount,
      'due_type_id', p_due_type_id,
      'issue_date', p_issue_date,
      'due_date', p_due_date
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'issued_count', v_issued_count,
    'skipped_count', v_skipped_count,
    'skipped_unit_ids', to_jsonb(v_skipped_unit_ids),
    'total_amount', v_total_amount
  );
END;
$function$;

create or replace function public.preview_generate_recurring_dues(p_organization_id uuid, p_schedule_id uuid, p_period text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
      and u.property_id = v_schedule.resort_id
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
