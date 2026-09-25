-- Non-decision evidence for scanner requests that could not be verified online.
-- This table intentionally has no invitation or raw-payload column. The one-way
-- fingerprint supports operational correlation without retaining QR material.

create table public.gate_connectivity_incidents (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  gate_id uuid not null,
  device_id uuid not null references public.gate_devices(id) on delete cascade,
  direction text not null,
  client_scan_id uuid not null,
  occurred_at timestamptz not null,
  payload_fingerprint text not null,
  error_code text not null,
  primary key (organization_id, client_scan_id),
  constraint gate_connectivity_incidents_gate_fkey
    foreign key (organization_id, gate_id)
    references public.gates (organization_id, id)
    on delete cascade,
  constraint gate_connectivity_incidents_direction_check
    check (direction in ('ENTRY', 'EXIT')),
  constraint gate_connectivity_incidents_fingerprint_check
    check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint gate_connectivity_incidents_error_code_check
    check (error_code ~ '^[A-Z][A-Z0-9_]{1,63}$')
);

create index idx_gate_connectivity_incidents_device_occurred
  on public.gate_connectivity_incidents (organization_id, device_id, occurred_at desc);

create index idx_gate_connectivity_incidents_gate_occurred
  on public.gate_connectivity_incidents (organization_id, gate_id, occurred_at desc);

create or replace function public.record_gate_connectivity_incident(
  p_device_id uuid,
  p_device_credential text,
  p_gate_id uuid,
  p_direction text,
  p_client_scan_id uuid,
  p_occurred_at timestamptz,
  p_payload_fingerprint text,
  p_error_code text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential text := nullif(pg_catalog.btrim(p_device_credential), '');
  v_credential_hash text;
  v_direction text := pg_catalog.upper(nullif(pg_catalog.btrim(p_direction), ''));
  v_fingerprint text := pg_catalog.lower(nullif(pg_catalog.btrim(p_payload_fingerprint), ''));
  v_error_code text := pg_catalog.upper(nullif(pg_catalog.btrim(p_error_code), ''));
  v_device public.gate_devices;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_device_id is null
     or v_credential is null
     or p_gate_id is null
     or v_direction not in ('ENTRY', 'EXIT')
     or p_client_scan_id is null
     or p_occurred_at is null
     or p_occurred_at < pg_catalog.clock_timestamp() - interval '24 hours'
     or p_occurred_at > pg_catalog.clock_timestamp() + interval '5 minutes'
     or v_fingerprint is null
     or v_fingerprint !~ '^[0-9a-f]{64}$'
     or v_error_code is null
     or v_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$' then
    raise exception 'INVALID_GATE_CONNECTIVITY_INCIDENT' using errcode = '22023';
  end if;

  v_credential_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_credential, 'UTF8'), 'sha256'),
    'hex'
  );

  if public.verify_gate_device_binding(
    p_device_id,
    v_credential_hash,
    p_gate_id,
    v_direction
  ) is not true then
    raise exception 'GATE_CONNECTIVITY_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select d.* into v_device
  from public.gate_devices d
  where d.id = p_device_id
    and d.gate_id = p_gate_id;

  if v_device.id is null then
    raise exception 'GATE_CONNECTIVITY_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  insert into public.gate_connectivity_incidents (
    organization_id,
    gate_id,
    device_id,
    direction,
    client_scan_id,
    occurred_at,
    payload_fingerprint,
    error_code
  ) values (
    v_device.organization_id,
    v_device.gate_id,
    v_device.id,
    v_direction,
    p_client_scan_id,
    p_occurred_at,
    v_fingerprint,
    v_error_code
  )
  on conflict (organization_id, client_scan_id) do nothing;
end;
$$;

alter table public.gate_connectivity_incidents enable row level security;

revoke all privileges on table public.gate_connectivity_incidents
  from public, anon, authenticated;
grant all privileges on table public.gate_connectivity_incidents to service_role;

revoke all on function public.record_gate_connectivity_incident(uuid, text, uuid, text, uuid, timestamptz, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_gate_connectivity_incident(uuid, text, uuid, text, uuid, timestamptz, text, text)
  to authenticated, service_role;
