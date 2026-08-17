-- Phase 2 of the /finance/accounts security review:
-- 1) chart_of_accounts triggers now raise stable, bare error codes instead
--    of hardcoded English sentences, so the application layer (not SQL)
--    owns translation via formErrorMessage() -- consistent with every other
--    RPC exception in this schema.
-- 2) An AFTER INSERT/UPDATE trigger writes an atomic audit entry to
--    platform_audit_logs for every committed chart_of_accounts write. Using
--    an AFTER trigger (rather than logging from the Server Action) means a
--    write that gets rejected by trg_coa_no_loop or trg_coa_lock_after_use
--    never reaches this trigger at all -- Postgres aborts the whole
--    statement before AFTER triggers run, so rejected writes are never
--    logged as if they succeeded.

create or replace function public.check_coa_no_loop()
returns trigger
language plpgsql
as $$
declare
  v_ancestor uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  v_ancestor := new.parent_id;
  while v_ancestor is not null loop
    if v_ancestor = new.id then
      raise exception 'COA_LOOP_DETECTED' using errcode = '22023';
    end if;
    select parent_id into v_ancestor from public.chart_of_accounts where id = v_ancestor;
  end loop;
  return new;
end;
$$;

create or replace function public.lock_coa_after_use()
returns trigger
language plpgsql
as $$
begin
  if old.is_used then
    if new.category is distinct from old.category or new.is_group is distinct from old.is_group then
      raise exception 'COA_USED_TYPE_LOCKED' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_delete_used_coa()
returns trigger
language plpgsql
as $$
begin
  if old.is_used then
    raise exception 'COA_USED_DELETE_FORBIDDEN' using errcode = '22023';
  end if;
  return old;
end;
$$;

create or replace function public.log_coa_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_changed_fields text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
    values (
      auth.uid(),
      new.organization_id,
      'coa.created',
      'chart_of_account',
      new.id,
      jsonb_build_object(
        'new', jsonb_build_object(
          'code', new.code, 'name_ar', new.name_ar, 'name_en', new.name_en,
          'parent_id', new.parent_id, 'category', new.category,
          'normal_balance', new.normal_balance, 'is_group', new.is_group, 'is_active', new.is_active
        )
      )
    );
    return new;
  end if;

  if new.code is distinct from old.code then v_changed_fields := array_append(v_changed_fields, 'code'); end if;
  if new.name_ar is distinct from old.name_ar then v_changed_fields := array_append(v_changed_fields, 'name_ar'); end if;
  if new.name_en is distinct from old.name_en then v_changed_fields := array_append(v_changed_fields, 'name_en'); end if;
  if new.parent_id is distinct from old.parent_id then v_changed_fields := array_append(v_changed_fields, 'parent_id'); end if;
  if new.category is distinct from old.category then v_changed_fields := array_append(v_changed_fields, 'category'); end if;
  if new.normal_balance is distinct from old.normal_balance then v_changed_fields := array_append(v_changed_fields, 'normal_balance'); end if;
  if new.is_group is distinct from old.is_group then v_changed_fields := array_append(v_changed_fields, 'is_group'); end if;
  if new.is_active is distinct from old.is_active then v_changed_fields := array_append(v_changed_fields, 'is_active'); end if;

  -- Nothing tracked actually changed (e.g. only updated_at moved) -- skip.
  if array_length(v_changed_fields, 1) is null then
    return new;
  end if;

  if v_changed_fields = array['is_active'] then
    v_action := case when new.is_active then 'coa.activated' else 'coa.deactivated' end;
  else
    v_action := 'coa.updated';
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (
    auth.uid(),
    new.organization_id,
    v_action,
    'chart_of_account',
    new.id,
    jsonb_build_object(
      'changed_fields', to_jsonb(v_changed_fields),
      'old', jsonb_build_object(
        'code', old.code, 'name_ar', old.name_ar, 'name_en', old.name_en,
        'parent_id', old.parent_id, 'category', old.category,
        'normal_balance', old.normal_balance, 'is_group', old.is_group, 'is_active', old.is_active
      ),
      'new', jsonb_build_object(
        'code', new.code, 'name_ar', new.name_ar, 'name_en', new.name_en,
        'parent_id', new.parent_id, 'category', new.category,
        'normal_balance', new.normal_balance, 'is_group', new.is_group, 'is_active', new.is_active
      )
    )
  );

  return new;
end;
$$;

create trigger trg_coa_audit_log
  after insert or update on public.chart_of_accounts
  for each row execute function public.log_coa_change();
