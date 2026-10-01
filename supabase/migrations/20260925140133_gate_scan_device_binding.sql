create or replace function public.process_visitor_gate_scan(
  p_device_id uuid,
  p_device_credential text,
  p_gate_id uuid,
  p_invitation_id uuid,
  p_raw_secret text,
  p_direction text,
  p_client_scan_id uuid
) returns table (
  decision text,
  reason_code text,
  event_id uuid,
  guest_name text,
  invitation_no text,
  unit_id uuid,
  invitation_id uuid,
  usage_policy text,
  valid_until timestamptz,
  is_inside boolean,
  gate_id uuid,
  property_id uuid,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_credential text := nullif(pg_catalog.btrim(p_device_credential), '');
  v_credential_hash text;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_device_id is null or v_credential is null or p_gate_id is null then
    raise exception 'INVALID_GATE_SCAN_INPUT' using errcode = '22023';
  end if;

  v_credential_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_credential, 'UTF8'), 'sha256'),
    'hex'
  );

  if public.verify_gate_device_binding(
    p_device_id,
    v_credential_hash,
    p_gate_id,
    p_direction
  ) is not true then
    raise exception 'DEVICE_BINDING_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return query
    select scan.*
    from public.process_visitor_gate_scan(
      p_gate_id,
      p_invitation_id,
      p_raw_secret,
      p_direction,
      p_client_scan_id
    ) as scan;
end;
$$;

revoke all on function public.process_visitor_gate_scan(uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.process_visitor_gate_scan(uuid, text, uuid, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.process_visitor_gate_scan(uuid, text, uuid, uuid, text, text, uuid)
  to authenticated, service_role;
