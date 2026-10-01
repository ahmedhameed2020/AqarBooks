-- PostgREST caps SETOF responses independently of an RPC's SQL LIMIT.
-- A scalar JSON result preserves the explicit export cap and total metadata.
drop function public.export_gate_current_visitors(uuid,uuid,uuid,text,integer,integer);

create function public.export_gate_current_visitors(
  p_organization_id uuid,p_property_id uuid default null,p_gate_id uuid default null,
  p_query text default null,p_offset integer default 0,p_limit integer default 5000
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_snapshot jsonb;
begin
  if auth.uid() is null or p_organization_id is null
    or not public.organization_is_active(p_organization_id)
    or not public.gate_operations_enabled(p_organization_id)
    or not public.has_permission(auth.uid(),p_organization_id,'operations.access_events.view') then
    raise exception 'GATE_EVIDENCE_NOT_AUTHORIZED' using errcode='42501';
  end if;
  if p_offset is distinct from 0 or p_limit is null or p_limit not between 1 and 5000 then
    raise exception 'INVALID_GATE_EVIDENCE_FILTERS' using errcode='22023';
  end if;
  if p_query is not null and char_length(p_query)>120 then
    raise exception 'INVALID_GATE_EVIDENCE_FILTERS' using errcode='22023';
  end if;
  -- Bound the safe projection to the page plus one sentinel. Count is an
  -- explicit lower bound, never a fabricated exact total above the cap.
  with bounded_state as materialized (
    select s.* from public.visitor_access_state s
    where s.organization_id=p_organization_id and s.is_inside
      and (p_property_id is null or s.property_id=p_property_id)
      and (p_gate_id is null or s.last_gate_id=p_gate_id)
      and (p_query is null or btrim(p_query)='' or exists (
        select 1 from public.visitor_invitations candidate
        where candidate.id=s.visitor_invitation_id and candidate.organization_id=s.organization_id
          and (candidate.guest_name ilike '%'||btrim(p_query)||'%' or candidate.invitation_no ilike '%'||btrim(p_query)||'%')
      ))
    order by s.last_entry_at asc nulls last,s.visitor_invitation_id limit p_limit+1
  ), eligible as materialized (
    select i.id,i.invitation_no,i.guest_name,p.name property_name,u.code unit_code,
      g.code gate_code,s.last_entry_at entered_at,i.valid_until
    from bounded_state s
    join public.visitor_invitations i on i.id=s.visitor_invitation_id and i.organization_id=s.organization_id
    join public.properties p on p.id=s.property_id and p.organization_id=s.organization_id
    join public.units u on u.id=s.unit_id and u.organization_id=s.organization_id
    left join public.gates g on g.id=s.last_gate_id and g.organization_id=s.organization_id
  ), page as (
    select * from eligible order by entered_at asc nulls last,id limit p_limit
  ) select jsonb_build_object(
    'totalCountLowerBound',(select count(*) from eligible),
    'truncated',(select count(*)>p_limit from eligible),
    'rows',coalesce((select jsonb_agg(jsonb_build_object(
      'invitation_no',invitation_no,'guest_name',guest_name,'property_name',property_name,
      'unit_code',unit_code,'gate_code',gate_code,'entered_at',entered_at,'valid_until',valid_until
    ) order by entered_at asc nulls last,id) from page),'[]'::jsonb)
  ) into v_snapshot;
  return v_snapshot;
end;
$$;
revoke all on function public.export_gate_current_visitors(uuid,uuid,uuid,text,integer,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.export_gate_current_visitors(uuid,uuid,uuid,text,integer,integer) to authenticated;

-- Terminal commands are not queued, including NOOP's NOT_CONFIGURED result.
do $$
declare v_definition text; v_old text := 'where c.organization_id=v_org and c.access_event_id=v_scan.event_id)';
begin
  select pg_get_functiondef('public.process_visitor_gate_scan(uuid,text,uuid,uuid,text,text,uuid,text)'::regprocedure) into v_definition;
  if position(v_old in v_definition)=0 then raise exception 'HARDWARE_STATUS_DEFINITION_CHANGED'; end if;
  execute replace(v_definition,v_old,
    'where c.organization_id=v_org and c.access_event_id=v_scan.event_id and c.status in (''PENDING'',''DISPATCHING'',''FAILED''))');
end;
$$;
