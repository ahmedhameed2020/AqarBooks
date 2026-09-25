-- Trusted scanner-device enrollment and binding.
-- Raw enrollment codes and device credentials are never persisted. Their
-- SHA-256 hashes remain private to SECURITY DEFINER functions and service-role
-- maintenance; authenticated clients have no table privileges.

create unique index if not exists gates_org_property_id_key
  on public.gates (organization_id, property_id, id);

create table public.gate_device_enrollments (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  gate_id uuid not null,
  direction text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint gate_device_enrollments_direction_check
    check (direction in ('ENTRY', 'EXIT', 'BOTH')),
  constraint gate_device_enrollments_code_hash_check
    check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint gate_device_enrollments_expiry_window_check
    check (expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  constraint gate_device_enrollments_redemption_check
    check ((redeemed_at is null and redeemed_by is null) or (redeemed_at is not null and redeemed_by is not null)),
  constraint gate_device_enrollments_gate_fkey
    foreign key (organization_id, property_id, gate_id)
    references public.gates (organization_id, property_id, id)
    on delete cascade
);

create index idx_gate_device_enrollments_open_expiry
  on public.gate_device_enrollments (organization_id, expires_at)
  where redeemed_at is null;

create index idx_gate_device_enrollments_gate_created
  on public.gate_device_enrollments (organization_id, gate_id, created_at desc);

create table public.gate_devices (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  gate_id uuid not null,
  installation_id_hash text not null,
  credential_hash text not null,
  display_name text not null,
  device_notes text,
  allowed_direction text not null,
  status text not null default 'ACTIVE',
  enrolled_at timestamptz not null default now(),
  last_seen_at timestamptz,
  enrolled_by uuid not null references auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gate_devices_installation_hash_check
    check (installation_id_hash ~ '^[0-9a-f]{64}$'),
  constraint gate_devices_credential_hash_check
    check (credential_hash ~ '^[0-9a-f]{64}$'),
  constraint gate_devices_display_name_check
    check (btrim(display_name) <> '' and char_length(display_name) <= 120),
  constraint gate_devices_notes_length_check
    check (device_notes is null or char_length(device_notes) <= 500),
  constraint gate_devices_allowed_direction_check
    check (allowed_direction in ('ENTRY', 'EXIT', 'BOTH')),
  constraint gate_devices_status_check
    check (status in ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  constraint gate_devices_revocation_state_check check (
    (status = 'REVOKED' and revoked_at is not null and revoked_by is not null and revocation_reason is not null and btrim(revocation_reason) <> '')
    or
    (status in ('ACTIVE', 'SUSPENDED') and revoked_at is null and revoked_by is null and revocation_reason is null)
  ),
  constraint gate_devices_gate_fkey
    foreign key (organization_id, property_id, gate_id)
    references public.gates (organization_id, property_id, id)
    on delete cascade,
  unique (organization_id, installation_id_hash),
  unique (organization_id, credential_hash)
);

create index idx_gate_devices_gate_status
  on public.gate_devices (organization_id, gate_id, status, allowed_direction);

create index idx_gate_devices_last_seen
  on public.gate_devices (organization_id, last_seen_at desc)
  where status = 'ACTIVE';

create trigger trg_gate_devices_updated_at
  before update on public.gate_devices
  for each row execute function public.set_updated_at();

create or replace function public.create_gate_device_enrollment(
  p_gate_id uuid,
  p_direction text,
  p_code_hash text,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_gate public.gates;
  v_direction text := pg_catalog.upper(nullif(pg_catalog.btrim(p_direction), ''));
  v_code_hash text := pg_catalog.lower(nullif(pg_catalog.btrim(p_code_hash), ''));
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_enrollment_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if v_direction not in ('ENTRY', 'EXIT', 'BOTH') then
    raise exception 'INVALID_DEVICE_DIRECTION' using errcode = '22023';
  end if;

  if v_code_hash is null or v_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_ENROLLMENT_CODE_HASH' using errcode = '22023';
  end if;

  if p_expires_at is null or p_expires_at <= v_now or p_expires_at > v_now + interval '15 minutes' then
    raise exception 'INVALID_ENROLLMENT_EXPIRY' using errcode = '22023';
  end if;

  select g.* into v_gate
  from public.gates g
  where g.id = p_gate_id;

  if v_gate.id is null then
    raise exception 'GATE_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_gate.organization_id)
     or not public.gate_operations_enabled(v_gate.organization_id) then
    raise exception 'GATE_OPERATIONS_UNAVAILABLE' using errcode = '42501';
  end if;

  if not public.gate_staff_can_manage(v_gate.organization_id) then
    raise exception 'GATE_DEVICE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if not v_gate.is_active
     or (v_gate.direction_mode <> 'BOTH' and v_direction <> v_gate.direction_mode) then
    raise exception 'INVALID_GATE_DEVICE_BINDING' using errcode = '22023';
  end if;

  insert into public.gate_device_enrollments (
    organization_id,
    property_id,
    gate_id,
    direction,
    code_hash,
    expires_at,
    created_by,
    created_at
  ) values (
    v_gate.organization_id,
    v_gate.property_id,
    v_gate.id,
    v_direction,
    v_code_hash,
    p_expires_at,
    v_user_id,
    v_now
  ) returning id into v_enrollment_id;

  insert into public.platform_audit_logs (
    actor_id,
    organization_id,
    property_id,
    action,
    entity_type,
    entity_id,
    safe_change_summary
  ) values (
    v_user_id,
    v_gate.organization_id,
    v_gate.property_id,
    'gate_device.enrollment_created',
    'gate_device_enrollment',
    v_enrollment_id,
    pg_catalog.jsonb_build_object(
      'gate_id', v_gate.id,
      'direction', v_direction,
      'expires_at', p_expires_at
    )
  );

  return v_enrollment_id;
end;
$$;

create or replace function public.redeem_gate_device_enrollment(
  p_enrollment_id uuid,
  p_code text,
  p_installation_id_hash text,
  p_credential_hash text,
  p_display_name text
) returns public.gate_devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_enrollment public.gate_device_enrollments;
  v_gate public.gates;
  v_installation_hash text := pg_catalog.lower(nullif(pg_catalog.btrim(p_installation_id_hash), ''));
  v_credential_hash text := pg_catalog.lower(nullif(pg_catalog.btrim(p_credential_hash), ''));
  v_display_name text := nullif(pg_catalog.btrim(p_display_name), '');
  v_submitted_code_hash text;
  v_device public.gate_devices;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_code is null or p_code = '' then
    raise exception 'INVALID_ENROLLMENT_CODE' using errcode = '22023';
  end if;

  if v_installation_hash is null or v_installation_hash !~ '^[0-9a-f]{64}$'
     or v_credential_hash is null or v_credential_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_DEVICE_HASH' using errcode = '22023';
  end if;

  if v_display_name is null or pg_catalog.char_length(v_display_name) > 120 then
    raise exception 'INVALID_DEVICE_DISPLAY_NAME' using errcode = '22023';
  end if;

  select e.* into v_enrollment
  from public.gate_device_enrollments e
  where e.id = p_enrollment_id
  for update;

  if v_enrollment.id is null then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.is_org_member(v_user_id, v_enrollment.organization_id) then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = '22023';
  end if;

  if v_enrollment.redeemed_at is not null then
    raise exception 'ENROLLMENT_ALREADY_REDEEMED' using errcode = '22023';
  end if;

  if v_enrollment.expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'ENROLLMENT_EXPIRED' using errcode = '22023';
  end if;

  v_submitted_code_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(p_code, 'UTF8'), 'sha256'),
    'hex'
  );

  if extensions.digest(pg_catalog.convert_to(v_submitted_code_hash, 'UTF8'), 'sha256')
     <> extensions.digest(pg_catalog.convert_to(v_enrollment.code_hash, 'UTF8'), 'sha256') then
    raise exception 'INVALID_ENROLLMENT_CODE' using errcode = '22023';
  end if;

  select g.* into v_gate
  from public.gates g
  where g.id = v_enrollment.gate_id
    and g.organization_id = v_enrollment.organization_id
    and g.property_id = v_enrollment.property_id;

  if v_gate.id is null or not v_gate.is_active
     or not public.organization_is_active(v_gate.organization_id)
     or not public.gate_operations_enabled(v_gate.organization_id)
     or (v_gate.direction_mode <> 'BOTH' and v_enrollment.direction <> v_gate.direction_mode) then
    raise exception 'INVALID_GATE_DEVICE_BINDING' using errcode = '42501';
  end if;

  insert into public.gate_devices (
    organization_id,
    property_id,
    gate_id,
    installation_id_hash,
    credential_hash,
    display_name,
    allowed_direction,
    status,
    enrolled_at,
    enrolled_by
  ) values (
    v_enrollment.organization_id,
    v_enrollment.property_id,
    v_enrollment.gate_id,
    v_installation_hash,
    v_credential_hash,
    v_display_name,
    v_enrollment.direction,
    'ACTIVE',
    pg_catalog.clock_timestamp(),
    v_user_id
  )
  on conflict (organization_id, installation_id_hash) do update
    set property_id = excluded.property_id,
        gate_id = excluded.gate_id,
        credential_hash = excluded.credential_hash,
        display_name = excluded.display_name,
        allowed_direction = excluded.allowed_direction,
        status = 'ACTIVE',
        enrolled_at = excluded.enrolled_at,
        last_seen_at = null,
        enrolled_by = excluded.enrolled_by,
        revoked_at = null,
        revoked_by = null,
        revocation_reason = null
  returning * into v_device;

  update public.gate_device_enrollments
  set redeemed_at = pg_catalog.clock_timestamp(),
      redeemed_by = v_user_id
  where id = v_enrollment.id;

  insert into public.platform_audit_logs (
    actor_id,
    organization_id,
    property_id,
    action,
    entity_type,
    entity_id,
    safe_change_summary
  ) values (
    v_user_id,
    v_device.organization_id,
    v_device.property_id,
    'gate_device.enrolled',
    'gate_device',
    v_device.id,
    pg_catalog.jsonb_build_object(
      'gate_id', v_device.gate_id,
      'allowed_direction', v_device.allowed_direction,
      'display_name', v_device.display_name
    )
  );

  -- The RPC contract returns the device row, but stored credentials remain
  -- private. Composite values are not constrained by the table's NOT NULL
  -- constraint, so the response can safely redact this one field.
  v_device.credential_hash := null;
  v_device.installation_id_hash := null;
  return v_device;
end;
$$;

create or replace function public.revoke_gate_device(
  p_device_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_device public.gate_devices;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select d.* into v_device
  from public.gate_devices d
  where d.id = p_device_id
  for update;

  if v_device.id is null then
    raise exception 'GATE_DEVICE_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_device.organization_id)
     or not public.gate_operations_enabled(v_device.organization_id)
     or not public.gate_staff_can_manage(v_device.organization_id) then
    raise exception 'GATE_DEVICE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_device.status = 'REVOKED' then
    raise exception 'GATE_DEVICE_ALREADY_REVOKED' using errcode = '22023';
  end if;

  if v_reason is null or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'INVALID_REVOCATION_REASON' using errcode = '22023';
  end if;

  update public.gate_devices
  set status = 'REVOKED',
      revoked_at = pg_catalog.clock_timestamp(),
      revoked_by = v_user_id,
      revocation_reason = v_reason
  where id = v_device.id;

  insert into public.platform_audit_logs (
    actor_id,
    organization_id,
    property_id,
    action,
    entity_type,
    entity_id,
    safe_change_summary
  ) values (
    v_user_id,
    v_device.organization_id,
    v_device.property_id,
    'gate_device.revoked',
    'gate_device',
    v_device.id,
    pg_catalog.jsonb_build_object(
      'gate_id', v_device.gate_id,
      'reason', v_reason
    )
  );
end;
$$;

create or replace function public.verify_gate_device_binding(
  p_device_id uuid,
  p_credential_hash text,
  p_gate_id uuid,
  p_direction text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_credential_hash text := pg_catalog.lower(nullif(pg_catalog.btrim(p_credential_hash), ''));
  v_direction text := pg_catalog.upper(nullif(pg_catalog.btrim(p_direction), ''));
  v_device public.gate_devices;
begin
  if v_user_id is null
     or v_credential_hash is null
     or v_credential_hash !~ '^[0-9a-f]{64}$'
     or v_direction not in ('ENTRY', 'EXIT') then
    return false;
  end if;

  select d.* into v_device
  from public.gate_devices d
  where d.id = p_device_id;

  if v_device.id is null
     or not public.is_org_member(v_user_id, v_device.organization_id)
     or v_device.status <> 'ACTIVE'
     or v_device.gate_id <> p_gate_id
     or (v_device.allowed_direction <> 'BOTH' and v_device.allowed_direction <> v_direction)
     or not public.organization_is_active(v_device.organization_id)
     or not public.gate_operations_enabled(v_device.organization_id) then
    return false;
  end if;

  if extensions.digest(pg_catalog.convert_to(v_credential_hash, 'UTF8'), 'sha256')
     <> extensions.digest(pg_catalog.convert_to(v_device.credential_hash, 'UTF8'), 'sha256') then
    return false;
  end if;

  update public.gate_devices
  set last_seen_at = pg_catalog.clock_timestamp()
  where id = v_device.id;

  return true;
end;
$$;

alter table public.gate_device_enrollments enable row level security;
alter table public.gate_devices enable row level security;

revoke all privileges on table public.gate_device_enrollments from public, anon, authenticated;
revoke all privileges on table public.gate_devices from public, anon, authenticated;
grant all privileges on table public.gate_device_enrollments to service_role;
grant all privileges on table public.gate_devices to service_role;

revoke all on function public.create_gate_device_enrollment(uuid, text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.redeem_gate_device_enrollment(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_gate_device(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.verify_gate_device_binding(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.create_gate_device_enrollment(uuid, text, text, timestamptz)
  to authenticated, service_role;
grant execute on function public.redeem_gate_device_enrollment(uuid, text, text, text, text)
  to authenticated, service_role;
grant execute on function public.revoke_gate_device(uuid, text)
  to authenticated, service_role;
grant execute on function public.verify_gate_device_binding(uuid, text, uuid, text)
  to authenticated, service_role;
