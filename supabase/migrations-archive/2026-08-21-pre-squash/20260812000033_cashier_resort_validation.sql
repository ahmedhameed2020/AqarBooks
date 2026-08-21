-- Same class of gap as record_incoming_cheque/record_payment (see
-- 20260812000032): open_cashier_session never validated that p_resort_id
-- belongs to p_organization_id, or that it matches the cashbox's own
-- resort_id (a cashbox is already permanently scoped to one resort at
-- creation -- nothing stopped opening a session against it tagged with a
-- different resort). Same signature as the function being replaced, so
-- CREATE OR REPLACE is a real replacement.
create or replace function public.open_cashier_session(
  p_organization_id uuid,
  p_resort_id uuid,
  p_cashbox_id uuid,
  p_opening_balance numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_cashbox_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'cashier.sessions.open') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  select resort_id into v_cashbox_resort_id
  from public.cashboxes
  where id = p_cashbox_id and organization_id = p_organization_id and is_active;
  if v_cashbox_resort_id is null then
    raise exception 'cashbox does not belong to this organization or is inactive';
  end if;
  if v_cashbox_resort_id <> p_resort_id then
    raise exception 'CASHBOX_RESORT_MISMATCH: الصندوق المحدد يتبع موقعًا مختلفًا عن الموقع المحدد' using errcode = '22023';
  end if;

  if exists (select 1 from public.cashier_sessions where cashbox_id = p_cashbox_id and status = 'OPEN') then
    raise exception 'this cashbox already has an open session';
  end if;

  insert into public.cashier_sessions (organization_id, resort_id, cashbox_id, opened_by, opening_balance)
  values (p_organization_id, p_resort_id, p_cashbox_id, auth.uid(), coalesce(p_opening_balance, 0))
  returning id into v_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashier_session.opened', 'cashier_session', v_session_id,
    jsonb_build_object('opening_balance', p_opening_balance));

  return v_session_id;
end;
$$;

-- create_cashbox: same treatment as create_bank_account -- moves cashbox
-- creation off a raw client-side .insert() (RLS-only, no application-level
-- resort/GL-account validation) onto a SECURITY DEFINER RPC.
create or replace function public.create_cashbox(
  p_organization_id uuid,
  p_resort_id uuid,
  p_name text,
  p_gl_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cashbox_id uuid;
  v_gl_category text;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الصناديق' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  select category into v_gl_category
  from public.chart_of_accounts
  where id = p_gl_account_id and organization_id = p_organization_id;
  if v_gl_category is null then
    raise exception 'GL_ACCOUNT_NOT_IN_ORGANIZATION: حساب الأستاذ المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if v_gl_category <> 'ASSET' then
    raise exception 'GL_ACCOUNT_NOT_ASSET: يجب اختيار حساب من نوع الأصول لصندوق نقدي' using errcode = '22023';
  end if;

  insert into public.cashboxes (organization_id, resort_id, name, gl_account_id)
  values (p_organization_id, p_resort_id, trim(p_name), p_gl_account_id)
  returning id into v_cashbox_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashbox.created', 'cashbox', v_cashbox_id, jsonb_build_object('name', p_name));

  return v_cashbox_id;
end;
$$;
