-- Phase 2b-2 (continued): surgical updates to the 2 functions that
-- reference resort_id on resort_memberships/document_sequences, renamed
-- in 20260819000001. Live bodies fetched via pg_get_functiondef, not
-- retyped from memory. Parameter names (p_resort_id) stay unchanged --
-- only the column references change.

create or replace function public.is_resort_member(p_user_id uuid, p_resort_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.resort_memberships rm
    where rm.user_id = p_user_id
      and rm.property_id = p_resort_id
  ) or public.is_platform_admin(p_user_id);
$function$;

create or replace function public.next_sequence_value(p_organization_id uuid, p_resort_id uuid, p_sequence_type text)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_value bigint;
begin
  insert into public.document_sequences (organization_id, property_id, sequence_type, next_value)
  values (p_organization_id, p_resort_id, p_sequence_type, 1)
  on conflict (organization_id, property_id, sequence_type) do nothing;

  update public.document_sequences
  set next_value = next_value + 1
  where organization_id = p_organization_id
    and (property_id = p_resort_id or (property_id is null and p_resort_id is null))
    and sequence_type = p_sequence_type
  returning next_value - 1 into v_value;

  return v_value;
end;
$function$;
