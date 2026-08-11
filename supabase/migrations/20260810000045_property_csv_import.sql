-- Property CSV import engine with preview-safe validation, optional partial import,
-- owner auto-linking, and tenant-scoped auditing.

create table public.property_import_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid references public.resorts (id) on delete set null,
  import_kind text not null check (import_kind in ('units', 'members')),
  imported_rows int not null,
  skipped_rows int not null,
  allow_partial boolean not null,
  failures jsonb not null default '[]'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index idx_property_import_logs_organization on public.property_import_logs (organization_id);
create index idx_property_import_logs_resort on public.property_import_logs (resort_id);

alter table public.property_import_logs enable row level security;

create policy "property_import_logs_select_member" on public.property_import_logs for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "property_import_logs_insert_member" on public.property_import_logs for insert
  with check (
    public.is_org_member(auth.uid(), organization_id)
  );

create or replace function public.import_property_csv(
  p_organization_id uuid,
  p_resort_id uuid default null,
  p_import_kind text,
  p_rows jsonb,
  p_allow_partial boolean default false
)
returns jsonb
language plpgsql
as $$
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
              and b.resort_id = p_resort_id
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
              and z.resort_id = p_resort_id
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

        insert into public.units (
          organization_id,
          resort_id,
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

        if v_owner_id is not null then
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
    resort_id,
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
$$;
