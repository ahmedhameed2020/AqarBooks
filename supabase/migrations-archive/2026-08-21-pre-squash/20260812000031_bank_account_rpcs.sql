-- Moves bank/bank-account creation off raw client-side .insert() calls
-- (which relied solely on RLS, with zero application-level validation that
-- resort_id/bank_id/gl_account_id actually belong to the organization) onto
-- SECURITY DEFINER RPCs, matching the "functions are the only writer"
-- pattern used everywhere else in this schema. Permission key confirmed
-- against the actual permissions table before writing this (not guessed):
-- 'finance.accounts.manage' is the only key that gates banks/bank_accounts
-- anywhere in this codebase (RLS in 20260810000033_treasury_banking_rls.sql
-- uses it exclusively; there is no separate finance.banks.manage or
-- finance.cheques.manage key anywhere in the schema).

create or replace function public.create_bank(
  p_organization_id uuid,
  p_name_ar text,
  p_name_en text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bank_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة البنوك' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if trim(coalesce(p_name_ar, '')) = '' then
    raise exception 'BANK_NAME_REQUIRED: اسم البنك مطلوب' using errcode = '22023';
  end if;

  insert into public.banks (organization_id, name_ar, name_en)
  values (p_organization_id, trim(p_name_ar), coalesce(nullif(trim(p_name_en), ''), trim(p_name_ar)))
  returning id into v_bank_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'bank.created', 'bank', v_bank_id, jsonb_build_object('name_ar', p_name_ar));

  return v_bank_id;
end;
$$;

create or replace function public.create_bank_account(
  p_organization_id uuid,
  p_resort_id uuid,
  p_bank_id uuid,
  p_account_name text,
  p_account_number text,
  p_gl_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_gl_category text;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الحسابات البنكية' using errcode = '42501';
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
  if not exists (
    select 1 from public.banks where id = p_bank_id and organization_id = p_organization_id
  ) then
    raise exception 'BANK_NOT_IN_ORGANIZATION: البنك المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  select category into v_gl_category
  from public.chart_of_accounts
  where id = p_gl_account_id and organization_id = p_organization_id;
  if v_gl_category is null then
    raise exception 'GL_ACCOUNT_NOT_IN_ORGANIZATION: حساب الأستاذ المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if v_gl_category <> 'ASSET' then
    raise exception 'GL_ACCOUNT_NOT_ASSET: يجب اختيار حساب من نوع الأصول لحساب بنكي' using errcode = '22023';
  end if;

  insert into public.bank_accounts (organization_id, resort_id, bank_id, account_name, account_number, gl_account_id)
  values (p_organization_id, p_resort_id, p_bank_id, trim(p_account_name), trim(p_account_number), p_gl_account_id)
  returning id into v_account_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'bank_account.created', 'bank_account', v_account_id,
    jsonb_build_object('account_name', p_account_name, 'account_number', p_account_number));

  return v_account_id;
end;
$$;
