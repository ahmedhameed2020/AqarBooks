-- Adds address/governorate/contact details to resorts (so the Sites page can
-- show more than just a name/code/timezone), plus update/delete RPCs
-- mirroring the existing create_resort permission-checked + audited pattern.

alter table public.resorts
  add column if not exists address text,
  add column if not exists governorate text,
  add column if not exists phone text,
  add column if not exists email text;

alter table public.resorts
  drop constraint if exists resorts_governorate_check;

alter table public.resorts
  add constraint resorts_governorate_check
    check (governorate is null or governorate in (
      'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحر الأحمر',
      'البحيرة', 'الفيوم', 'الغربية', 'الإسماعيلية', 'المنوفية',
      'المنيا', 'القليوبية', 'الوادي الجديد', 'السويس', 'أسوان',
      'أسيوط', 'بني سويف', 'بورسعيد', 'دمياط', 'الشرقية',
      'جنوب سيناء', 'كفر الشيخ', 'مطروح', 'الأقصر', 'قنا',
      'شمال سيناء', 'سوهاج'
    ));

create or replace function public.create_resort(
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_timezone text,
  p_address text default null,
  p_governorate text default null,
  p_phone text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'tenant.settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  insert into public.resorts (organization_id, name, code, timezone, address, governorate, phone, email, created_by, updated_by)
  values (p_organization_id, p_name, p_code, coalesce(p_timezone, 'Africa/Cairo'), p_address, p_governorate, p_phone, p_email, auth.uid(), auth.uid())
  returning id into v_resort_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'resort.created', 'resort', v_resort_id,
    jsonb_build_object('name', p_name, 'code', p_code));

  return v_resort_id;
end;
$$;

create or replace function public.update_resort(
  p_resort_id uuid,
  p_name text,
  p_code text,
  p_timezone text,
  p_address text default null,
  p_governorate text default null,
  p_phone text default null,
  p_email text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.resorts where id = p_resort_id;
  if v_organization_id is null then
    raise exception 'resort not found';
  end if;

  if not public.has_permission(auth.uid(), v_organization_id, 'tenant.settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.resorts
  set name = p_name,
      code = p_code,
      timezone = coalesce(p_timezone, 'Africa/Cairo'),
      address = p_address,
      governorate = p_governorate,
      phone = p_phone,
      email = p_email,
      updated_by = auth.uid()
  where id = p_resort_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_organization_id, p_resort_id, 'resort.updated', 'resort', p_resort_id,
    jsonb_build_object('name', p_name, 'code', p_code));
end;
$$;

create or replace function public.delete_resort(p_resort_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

  select count(*) into v_unit_count from public.units where resort_id = p_resort_id;
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
$$;
