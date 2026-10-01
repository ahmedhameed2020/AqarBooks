-- Revoke the browser credential before sign-out clears its local binding.
create function public.release_gate_device(p_device_id uuid,p_credential text) returns void
language plpgsql security definer set search_path='' as $$
declare v_device public.gate_devices;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode='42501'; end if;
  select * into v_device from public.gate_devices where id=p_device_id for update;
  if not found or not public.is_org_member(auth.uid(),v_device.organization_id)
    or v_device.credential_hash is distinct from encode(extensions.digest(convert_to(p_credential,'UTF8'),'sha256'),'hex') then
    raise exception 'DEVICE_BINDING_NOT_AUTHORIZED' using errcode='42501';
  end if;
  if v_device.status='REVOKED' then return; end if;
  update public.gate_devices set status='REVOKED',revoked_at=clock_timestamp(),revoked_by=auth.uid(),revocation_reason='Browser sign-out'
    where id=v_device.id;
  insert into public.platform_audit_logs(actor_id,organization_id,property_id,action,entity_type,entity_id,safe_change_summary)
    values(auth.uid(),v_device.organization_id,v_device.property_id,'gate_device.released','gate_device',v_device.id,jsonb_build_object('reason','SIGN_OUT'));
end;
$$;
revoke all on function public.release_gate_device(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.release_gate_device(uuid,text) to authenticated;

-- Reuse exactly the authorized occupancy projection in one bounded snapshot.
-- Export cap includes one sentinel row so the UI can disclose truncation.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.list_gate_current_visitors(uuid,uuid,uuid,text,integer,integer)'::regprocedure) into v_definition;
  if position('p_limit > 100' in v_definition)=0 then raise exception 'OCCUPANCY_DEFINITION_CHANGED'; end if;
  execute replace(replace(v_definition,'public.list_gate_current_visitors(', 'public.export_gate_current_visitors('),
    'p_limit > 100','p_limit > 25001');
end;
$$;
revoke all on function public.export_gate_current_visitors(uuid,uuid,uuid,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.export_gate_current_visitors(uuid,uuid,uuid,text,integer,integer) to authenticated;

-- Disabled tenants must not monopolize a bounded retry batch. Evidence remains
-- pending without spending retry attempts and resumes after explicit opt-in.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.process_gate_notifications_impl(integer)'::regprocedure) into v_definition;
  execute replace(v_definition,'where status=''PENDING'' and attempts<5',
    'where (type in (''VISITOR_ENTERED'',''VISITOR_EXITED'') or public.gate_completion_enabled(organization_id)) and status=''PENDING'' and attempts<5');
  select pg_get_functiondef('public.process_gate_notifications(integer)'::regprocedure) into v_definition;
  execute replace(v_definition,'where status=''PENDING'' and attempts<5',
    'where (type in (''VISITOR_ENTERED'',''VISITOR_EXITED'') or public.gate_completion_enabled(organization_id)) and status=''PENDING'' and attempts<5');
end;
$$;
